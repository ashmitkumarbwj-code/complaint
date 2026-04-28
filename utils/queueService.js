'use strict';

const { connection, getIsAvailable } = require('../config/redis');
const logger = require('./logger');

const useRedis = process.env.USE_REDIS === 'true';

// ─── Synchronous Queue Stub (For Vercel / Local Dev) ────────────────────────
let notificationQueue;
let uploadQueue;

if (process.env.VERCEL === '1' || !useRedis) {
    const { processNotification } = require('../workers/notificationWorker');
    const { handleUpload } = require('../workers/uploadWorker');

    notificationQueue = {
        add: async (name, data) => {
            logger.info(`[Vercel Sync] Executing natively: ${name}`);
            await processNotification({ name, data, id: 'sync-stub' });
        },
        on: () => {} // stub
    };

    uploadQueue = {
        add: async (name, data) => {
            logger.info(`[Vercel Sync] Executing natively: ${name}`);
            await handleUpload(data, 'sync-stub');
        },
        on: () => {} // stub
    };
}

if (useRedis && connection) {
    // Only boot real BullMQ queues when Redis is available
    const { Queue } = require('bullmq');

    if (!getIsAvailable()) {
        logger.warn('[Queue] Redis not yet ready — queues will connect when Redis comes online.');
    }

    // Default options for Dead Letter Queue (DLQ) pattern
    // Jobs will retry up to 5 times with exponential backoff.
    const defaultJobOptions = {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false
    };

    notificationQueue = new Queue('notifications', { connection, defaultJobOptions });
    uploadQueue       = new Queue('uploads',       { connection, defaultJobOptions });

    logger.info('[Queue] BullMQ queues initialized (notifications, uploads).');
} else {
    logger.warn('[Queue] USE_REDIS=false — BullMQ queues are disabled. Jobs will be silently dropped.');
}

module.exports = { notificationQueue, uploadQueue };
