const { Queue } = require('bullmq');
const { connection } = require('../config/redis');

const { getIsAvailable } = require('../config/redis');

// Initialize Queues only if Redis is available
let notificationQueue = { add: () => Promise.resolve() };
let uploadQueue = { add: () => Promise.resolve() };

if (getIsAvailable()) {
    notificationQueue = new Queue('notifications', { connection });
    uploadQueue = new Queue('uploads', { connection });
}

module.exports = {
    notificationQueue,
    uploadQueue
};
