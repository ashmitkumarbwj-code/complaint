const { Worker } = require('bullmq');
const { connection } = require('../config/redis');
const logger = require('../utils/logger');
const cloudinary = require('../config/cloudinary');
const db = require('../config/db');
const fs = require('fs').promises;
const path = require('path');

/**
 * Core upload logic
 */
let cloudinaryFailCount = 0;

const handleUpload = async (data, jobId = 'sync') => {
    const { complaintId, tenantId } = data;
    let localPath = data.localPath || data.filePath;
    
    if (!localPath) {
        logger.error(`[Upload:${jobId}] CRITICAL: No file path provided!`, data);
        throw new Error('Missing file path');
    }

    // NORMALIZE PATH
    // 1. Get the filename only
    const fileName = path.basename(localPath);
    // 2. Define the absolute path to the root uploads directory
    const rootUploadsDir = path.resolve(__dirname, '..', 'uploads');
    const fullPath = path.join(rootUploadsDir, fileName);

    logger.info(`[Upload:${jobId}] Processing #${complaintId}`);
    logger.info(`[Upload:${jobId}] Raw Path: ${localPath}`);
    logger.info(`[Upload:${jobId}] Resolved Path: ${fullPath}`);

    try {
        // Verify file exists at resolved path
        try {
            await fs.access(fullPath);
        } catch (e) {
            // Fallback: Check if the raw path is already absolute and valid
            if (path.isAbsolute(localPath)) {
                await fs.access(localPath);
                // If it worked, use localPath as fullPath
                // fullPath = localPath; // This is risky if localPath was wrong but existed elsewhere
            } else {
                throw e; // Rethrow to hit the ENOENT block below
            }
        }
        
        // 1. Upload to Cloudinary
        const result = await cloudinary.uploader.upload(fullPath, {
            folder: `smart_campus/complaints/tenant_${tenantId}`,
            resource_type: 'auto'
        });

        const mediaUrl = result.secure_url;
        logger.info(`[Upload:${jobId}] [Tenant:${tenantId}] Success: ${mediaUrl}`);
        cloudinaryFailCount = 0; // Reset counter on success

        // 2. Update DB
        await db.execute(
            `UPDATE complaints SET media_url = $1, processing_status = 'completed', local_file_path = NULL WHERE id = $2 AND tenant_id = $3`,
            [mediaUrl, complaintId, tenantId]
        );

        // 3. Cleanup local file
        try {
            await fs.unlink(fullPath);
            logger.info(`[Upload:${jobId}] Local file deleted: ${fileName}`);
        } catch (unlinkErr) {
            logger.warn(`[Upload:${jobId}] Cleanup failed: ${unlinkErr.message}`);
        }
        
        return mediaUrl;

    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.warn(`[Upload:${jobId}] File missing on disk at ${fullPath}.`);
            await db.execute(
                `UPDATE complaints SET processing_status = 'failed' WHERE id = $1 AND tenant_id = $2`,
                [complaintId, tenantId]
            );
            return;
        }

        logger.error(`[RESILIENCE] [Upload:${jobId}] Cloudinary failed for #${complaintId}. Error: ${error.message}`);
        
        cloudinaryFailCount++;
        if (cloudinaryFailCount >= 3) {
            logger.error(`[CRITICAL] Cloudinary has failed ${cloudinaryFailCount} times consecutively! Immediate attention required.`);
        }
        
        // Mark for resync, store only the basename for portability
        await db.execute(
            `UPDATE complaints SET processing_status = 'pending_resync', local_file_path = $1 WHERE id = $2 AND tenant_id = $3`,
            [fileName, complaintId, tenantId]
        );

        throw error;
    }
};

const processUpload = async (job) => {
    if (job.name === 'process_image') {
        return await handleUpload(job.data, job.id);
    }
    throw new Error(`Unknown job type: ${job.name}`);
};

let uploadWorkerInstance = null;
if (connection && process.env.USE_REDIS === 'true') {
    uploadWorkerInstance = new Worker('uploads', processUpload, { connection, concurrency: 3 });
}

module.exports = { 
    uploadWorker: uploadWorkerInstance, 
    processUpload,
    handleUpload 
};
