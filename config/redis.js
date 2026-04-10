const logger = require('../utils/logger');

const useRedis = process.env.USE_REDIS === 'true';

let connection = null;
let isAvailable = false;

if (useRedis) {
    try {
        const Redis = require('ioredis');

        // Check if a full REDIS_URL is provided (ideal for Upstash Serverless Redis)
        if (process.env.REDIS_URL) {
            connection = new Redis(process.env.REDIS_URL, {
                maxRetriesPerRequest: null,
                retryStrategy(times) {
                    return Math.min(times * 50, 2000);
                }
            });
        } else {
            // Fallback for EC2 specific credentials
            const isUpstash = (process.env.REDIS_HOST || '').includes('upstash.io');
            
            connection = new Redis({
                host: process.env.REDIS_HOST || '127.0.0.1',
                port: process.env.REDIS_PORT || 6379,
                password: process.env.REDIS_PASSWORD || null,
                tls: isUpstash ? {} : undefined, // Force TLS for Upstash
                maxRetriesPerRequest: null,
                retryStrategy(times) {
                    return Math.min(times * 50, 2000);
                }
            });
        }

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
