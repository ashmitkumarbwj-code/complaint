const logger = require('../utils/logger');

const useRedis = process.env.USE_REDIS === 'true';

let connection = null;
let isAvailable = false;

if (useRedis) {
    try {
        const Redis = require('ioredis');
        connection = new Redis({
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD || null,
            maxRetriesPerRequest: null
        });

        connection.on('error', (err) => {
            logger.warn('Redis connection error. Background jobs will be skipped.');
            isAvailable = false;
        });

        connection.on('connect', () => {
            logger.info('Connected to Redis');
            isAvailable = true;
        });
        
        isAvailable = true; // Assume available until error
    } catch (e) {
        logger.warn('Failed to initialize Redis:', e.message);
    }
} else {
    logger.info('Redis is disabled (USE_REDIS=false).');
}

module.exports = { 
    connection, 
    getIsAvailable: () => isAvailable,
    redisConfig: {} // mock config
};
