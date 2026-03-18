const { Worker } = require('bullmq');
const { connection } = require('../config/redis');
const logger = require('../utils/logger');
const cloudinary = require('../config/cloudinary');
const db = require('../config/db');
const fs = require('fs').promises;

const uploadWorker = new Worker('uploads', async (job) => {
    logger.info(`[Job:${job.id}] Processing upload job: ${job.name}`);

    if (job.name === 'process_image') {
        const { filePath, complaintId } = job.data;

        try {
            // 1. Upload the file from disk to Cloudinary
            const result = await cloudinary.uploader.upload(filePath, {
                folder: 'complaints',
            });

            const mediaUrl = result.secure_url;
            logger.info(`[Job:${job.id}] Uploaded successfully to ${mediaUrl}`);

            // 2. Update the database row with the new media_url
            await db.execute(
                `UPDATE complaints SET media_url = ? WHERE id = ?`,
                [mediaUrl, complaintId]
            );
            logger.info(`[Job:${job.id}] Complaint #${complaintId} media_url updated`);

            // 3. Delete the local temporary file
            await fs.unlink(filePath);
            logger.info(`[Job:${job.id}] Local temp file ${filePath} removed`);

            return mediaUrl;

        } catch (error) {
            logger.error(`[Job:${job.id}] Image upload failed:`, error);

            // Clean up the temp file even on failure to avoid disk bloat
            try {
                await fs.unlink(filePath);
            } catch (unlinkErr) {
                logger.error(`[Job:${job.id}] Failed to delete temp file after error:`, unlinkErr);
            }

            throw error;
        }
    }

    throw new Error(`Unknown job type: ${job.name}`);
}, { 
    connection,
    concurrency: 3 // Up to 3 parallel uploads
});

uploadWorker.on('completed', (job) => {
    logger.info(`[Job:${job.id}] Upload completed successfully.`);
});

uploadWorker.on('failed', (job, err) => {
    logger.error(`[Job:${job.id}] Upload failed:`, err);
});

module.exports = uploadWorker;
