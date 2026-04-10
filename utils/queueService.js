const { Queue } = require('bullmq');
const { connection, getIsAvailable } = require('../config/redis');
const logger = require('./logger');

// Ensure Redis is running for production SaaS.
if (!getIsAvailable()) {
    logger.warn('[CRITICAL] Redis is not available! Queues will not process until Redis reconnects.');
}

// Default options for Dead Letter Queue (DLQ) pattern
// Jobs will retry up to 5 times with exponential backoff.
// If they fail 5 times, they go to the 'failed' set (DLQ).
const defaultJobOptions = {
    attempts: 5,
    backoff: {
        type: 'exponential',
        delay: 5000 // 5s, 10s, 20s...
    },
    removeOnComplete: true, // Keep Redis clean
    removeOnFail: false // Keep failed jobs for inspection
};

const notificationQueue = new Queue('notifications', { 
    connection,
    defaultJobOptions 
});

const uploadQueue = new Queue('uploads', { 
    connection,
    defaultJobOptions
});

module.exports = {
    notificationQueue,
    uploadQueue
};
