const { Worker } = require('bullmq');
const { connection } = require('../config/redis');
const logger = require('../utils/logger');
const cloudinary = require('../config/cloudinary');
const db = require('../config/db');
const fs = require('fs').promises;

const processUpload = async (job) => {
    logger.info(`[Job:${job.id}] Processing upload job: ${job.name}`);

    if (job.name === 'process_image') {
        const { filePath, complaintId, tenantId } = job.data;

        if (!tenantId) {
            logger.error(`[Job:${job.id}] CRITICAL: No tenantId in upload payload! Aborting to prevent data corruption.`);
            throw new Error('Missing tenantId in job payload');
        }

        try {
            // 1. Upload the file from disk to Cloudinary
            const result = await cloudinary.uploader.upload(filePath, {
                folder: `smart_campus/complaints/tenant_${tenantId}`,
                resource_type: 'auto'
            });

            const mediaUrl = result.secure_url;
            logger.info(`[Job:${job.id}] [Tenant:${tenantId}] Uploaded successfully to ${mediaUrl}`);

            // 2. Update the database row (Zero-Trust Lock)
            await db.execute(
                `UPDATE complaints SET media_url = ?, processing_status = 'completed' WHERE id = ? AND tenant_id = ?`,
                [mediaUrl, complaintId, tenantId]
            );
            logger.info(`[Job:${job.id}] [Tenant:${tenantId}] Complaint #${complaintId} media_url updated`);

            // 3. Delete the local temporary file
            await fs.unlink(filePath);
            return mediaUrl;

        } catch (error) {
            logger.error(`[RESILIENCE] [Job:${job.id}] Cloudinary upload failed. Marking #${complaintId} for resync.`, error);
            
            // Mark for resync in DB
            await db.execute(
                `UPDATE complaints SET processing_status = 'pending_resync' WHERE id = ? AND tenant_id = ?`,
                [complaintId, tenantId]
            );

            // DO NOT delete the local file here! We need it for resync.
            throw error;
        }
    }

    throw new Error(`Unknown job type: ${job.name}`);
};

const uploadWorker = new Worker('uploads', processUpload, { 
    connection,
    concurrency: 3 // Up to 3 parallel uploads
});

uploadWorker.on('completed', (job) => {
    logger.info(`[Job:${job.id}] Upload completed successfully.`);
});

uploadWorker.on('failed', (job, err) => {
    logger.error(`[Job:${job.id}] Upload failed:`, err);
});

module.exports = { uploadWorker, processUpload };
