const logger = require('../utils/logger');
const notificationWorker = require('./notificationWorker');
const uploadWorker = require('./uploadWorker');
const resyncWorker = require('./resyncWorker');

logger.info('Background workers initialized (BullMQ mode).');

// NOTE: Resync cron is handled by server.js for both Redis and no-Redis modes.
// This file only starts BullMQ queue listeners (Redis required).
module.exports = {
    notificationWorker,
    uploadWorker,
    resyncWorker
};
