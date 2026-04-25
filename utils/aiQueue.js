const aiService = require('../services/aiComplaintVerifier');
const db = require('../config/db');
const logger = require('../utils/logger');

/**
 * In-Process Background Queue for AI Analysis
 * Used when Redis is unavailable.
 */

class AIQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.maxRetries = 2;
    }

    /**
     * Add a complaint for AI analysis
     * @param {number} complaintId 
     * @param {object} data - { title, description, category, imageUrl, localPath }
     */
    async add(complaintId, data) {
        // 🛡️ Phase 2: Feature Flag Control
        const { FEATURES } = require('../utils/constants');
        if (!FEATURES.AI_PROCESSING_ENABLED) {
            logger.info(`[AI Queue] Skipping analysis for #${complaintId} (AI_PROCESSING_ENABLED is false)`);
            return;
        }

        // 🛡️ Phase 2: Content Threshold Check
        const description = data.description || '';
        if (description.length < 20) {
            logger.info(`[AI Queue] Skipping analysis for #${complaintId} (Description too short: ${description.length} chars)`);
            await db.execute('UPDATE complaints SET ai_status = $1 WHERE id = $2', ['skipped', complaintId]);
            return;
        }

        // Set queued timestamp
        await db.execute('UPDATE complaints SET ai_status = $1, ai_queued_at = NOW() WHERE id = $2', ['pending', complaintId]);
        
        this.queue.push({ complaintId, data, attempts: 0 });
        logger.info(`[AI Queue] Enqueued complaint #${complaintId}. Queue depth: ${this.queue.length}`);
        
        if (!this.isProcessing) {
            this.processNext();
        }
    }

    /**
     * Recovery logic on server startup
     * Scans for 'pending' or 'processing' (stale) jobs and requeues them.
     */
    async recover() {
        logger.info('[AI Recovery] Scanning for stuck AI analysis jobs...');
        try {
            // Find jobs that are:
            // 1. ai_status = 'pending'
            // 2. ai_status = 'processing' but started more than 10 minutes ago
            const [rows] = await db.execute(`
                SELECT id, title, description, category, media_url, ai_retry_count 
                FROM complaints 
                WHERE (ai_status = 'pending' AND ai_queued_at IS NOT NULL)
                   OR (ai_status = 'processing' AND ai_started_at < NOW() - INTERVAL '10 minutes')
                LIMIT 100
            `);

            if (rows.length === 0) {
                logger.info('[AI Recovery] No stuck jobs found.');
                return;
            }

            logger.info(`[AI Recovery] Found ${rows.length} jobs to recover.`);

            for (const row of rows) {
                const data = {
                    title: row.title,
                    description: row.description,
                    category: row.category,
                    imageUrl: row.media_url,
                    localPath: null 
                };
                
                this.queue.push({ 
                    complaintId: row.id, 
                    data, 
                    attempts: row.ai_retry_count || 0 
                });
            }

            if (!this.isProcessing && this.queue.length > 0) {
                this.processNext();
            }
        } catch (err) {
            logger.error('[AI Recovery] Error during recovery scan:', err);
        }
    }

    async processNext() {
        if (this.queue.length === 0) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;
        const job = this.queue.shift();

        try {
            await this.handleJob(job);
        } catch (err) {
            logger.error(`[AI Queue] Job failed for #${job.complaintId}:`, err.message);
            
            if (job.attempts < this.maxRetries) {
                job.attempts++;
                this.queue.push(job);
                logger.info(`[AI Queue] Retrying #${job.complaintId} (Attempt ${job.attempts})`);
                
                // Update retry count in DB
                await db.execute('UPDATE complaints SET ai_retry_count = $1 WHERE id = $2', [job.attempts, job.complaintId]);
            } else {
                await db.execute('UPDATE complaints SET ai_status = $1, ai_failed_at = NOW() WHERE id = $2', ['failed', job.complaintId]);
            }
        }

        // Process next job with a small delay
        setTimeout(() => this.processNext(), 1500);
    }

    async handleJob(job) {
        const { complaintId, data } = job;

        // 1. Update status and start time
        await db.execute('UPDATE complaints SET ai_status = $1, ai_started_at = NOW() WHERE id = $2', ['processing', complaintId]);

        // 2. Call AI Service
        const analysis = await aiService.analyze(data);

        // 3. Store Result
        await db.execute(`
            INSERT INTO complaint_ai_analysis 
            (complaint_id, provider, is_relevant_evidence, evidence_match_score, suggested_category, suggested_priority, is_emergency, spam_risk, requires_manual_review, reasoning_summary, raw_response)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (complaint_id) DO UPDATE SET
                provider = EXCLUDED.provider,
                is_relevant_evidence = EXCLUDED.is_relevant_evidence,
                evidence_match_score = EXCLUDED.evidence_match_score,
                suggested_category = EXCLUDED.suggested_category,
                suggested_priority = EXCLUDED.suggested_priority,
                is_emergency = EXCLUDED.is_emergency,
                spam_risk = EXCLUDED.spam_risk,
                requires_manual_review = EXCLUDED.requires_manual_review,
                reasoning_summary = EXCLUDED.reasoning_summary,
                raw_response = EXCLUDED.raw_response,
                processed_at = NOW()
        `, [
            complaintId,
            process.env.AI_PROVIDER || 'gemini',
            analysis.is_relevant_evidence,
            analysis.evidence_match_score || 0,
            analysis.suggested_category,
            analysis.suggested_priority,
            analysis.is_emergency || false,
            analysis.spam_risk || 'low',
            analysis.requires_manual_review || false,
            analysis.reasoning_summary,
            JSON.stringify(analysis)
        ]);

        // 4. Update Complaint metadata with processed timestamp
        await db.execute('UPDATE complaints SET ai_status = $1, ai_processed_at = NOW() WHERE id = $2', ['completed', complaintId]);

        // 5. 🚨 Phase 2: Suggestion-Only Enforcement
        // We no longer call routeComplaint to auto-update DB.
        logger.info(`[AI Analysis] Completed for #${complaintId}. Result: ${analysis.suggested_priority} (Confidence: ${analysis.evidence_match_score})`);
    }

    // routeComplaint is deprecated in Phase 2 in favor of manual adoption
    async routeComplaint(complaintId, analysis) {
        logger.warn(`[AI Queue] routeComplaint called but disabled in Phase 2 Suggestion-Only mode.`);
    }
}

module.exports = new AIQueue();
