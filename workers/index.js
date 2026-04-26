const logger = require('../utils/logger');
const notificationWorker = require('./notificationWorker');
const uploadWorker = require('./uploadWorker');
const resyncWorker = require('./resyncWorker');

logger.info('Background workers initialized.');

// Start periodic maintenance (resync & cleanup)
resyncWorker.startMaintenanceInterval();

// This file simply requires the workers so they start listening to their respective queues
module.exports = {
    notificationWorker,
    uploadWorker,
    resyncWorker
};
