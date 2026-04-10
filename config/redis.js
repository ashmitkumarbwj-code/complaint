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
            maxRetriesPerRequest: null,
            retryStrategy(times) {
                const delay = Math.min(times * 50, 2000);
                return delay;
            }
        });

        connection.on('error', (err) => {
            if (isAvailable) {
                logger.warn(`Redis connection lost: ${err.message}. Retrying...`);
                isAvailable = false;
            }
        });

        connection.on('connect', () => {
            logger.info('Connected to Redis');
            isAvailable = true;
        });

        connection.on('ready', () => {
            isAvailable = true;
        });
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
