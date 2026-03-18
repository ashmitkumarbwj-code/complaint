const logger = require('../utils/logger');
const notificationWorker = require('./notificationWorker');
const uploadWorker = require('./uploadWorker');

logger.info('Background workers initialized.');

// This file simply requires the workers so they start listening to their respective queues
module.exports = {
    notificationWorker,
    uploadWorker
};
