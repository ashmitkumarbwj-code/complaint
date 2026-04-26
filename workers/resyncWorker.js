const db = require('../config/db');
const cloudinary = require('../config/cloudinary');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

/**
 * Resync Worker
 * Handles complaints that failed initial upload due to Cloudinary/Redis outages.
 */
exports.processPendingResyncs = async () => {
    try {
        logger.info('[RESILIENCE] Starting periodic re-sync for failed uploads...');

        // 1. Find all complaints needing re-sync
        const [rows] = await db.execute(`
            SELECT id, tenant_id, local_file_path 
            FROM complaints 
            WHERE processing_status = 'pending_resync' 
            AND local_file_path IS NOT NULL
        `);

        if (rows.length === 0) {
            logger.info('[RESILIENCE] No pending re-syncs found.');
            return;
        }

        logger.info(`[RESILIENCE] Found ${rows.length} files awaiting cloud re-sync.`);

        for (const complaint of rows) {
            const { id, tenant_id, local_file_path } = complaint;
            const fullPath = path.join(__dirname, '../uploads', local_file_path);

            // Check if file still exists on disk
            try {
                await fs.access(fullPath);
            } catch (e) {
                logger.error(`[RESILIENCE] File not found on disk for complaint #${id}: ${fullPath}`);
                await db.execute(
                    "UPDATE complaints SET processing_status = 'failed' WHERE id = $1",
                    [id]
                );
                continue;
            }

            try {
                logger.debug(`[RESILIENCE] Attempting re-sync for #${id}...`);
                
                // 2. Upload to Cloudinary
                const result = await cloudinary.uploader.upload(fullPath, {
                    folder: `smart_campus/complaints/tenant_${tenant_id}`,
                    resource_type: 'auto'
                });

                // 3. Update DB
                await db.execute(
                    `UPDATE complaints 
                     SET media_url = $1, processing_status = 'completed' 
                     WHERE id = $2`,
                    [result.secure_url, id]
                );

                logger.info(`[RESILIENCE] Re-sync successful for complaint #${id}`);

                // 4. Clean up disk
                await fs.unlink(fullPath);

            } catch (uploadErr) {
                logger.warn(`[RESILIENCE] Re-sync failed again for complaint #${id}: ${uploadErr.message}`);
                // Leave as pending_resync for next run
            }
        }

    } catch (err) {
        logger.error('[RESILIENCE] Fatal error in resyncWorker:', err);
    }
};
/**
 * Automated Disk Safety
 * Deletes files in 'uploads/' that are older than 24 hours.
 * This prevents orphan files (from crashes/failures) from filling up disk space.
 */
exports.deleteOldOrphans = async () => {
    const uploadsDir = path.join(__dirname, '../uploads');
    try {
        const files = await fs.readdir(uploadsDir);
        const now = Date.now();
        const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

        logger.info(`[Disk Safety] Checking ${files.length} files in uploads/ for cleanup...`);

        for (const file of files) {
            const filePath = path.join(uploadsDir, file);
            const stats = await fs.stat(filePath);

            if (now - stats.mtimeMs > EXPIRY_MS) {
                await fs.unlink(filePath);
                logger.info(`[Disk Safety] Deleted orphan/old file: ${file}`);
            }
        }
    } catch (err) {
        logger.error('[Disk Safety] Cleanup failed:', err.message);
    }
};
