const Redis = require('ioredis');
const logger = require('./logger');

class CacheService {
    constructor() {
        this.client = null;
        this.isConnected = false;
        
        // Only connect when both USE_REDIS=true AND REDIS_HOST/URL is configured.
        // This prevents local dev from crashing if Redis is not installed.
        const useRedis = process.env.USE_REDIS === 'true';

        if (useRedis && (process.env.REDIS_URL || process.env.REDIS_HOST)) {
            this.client = new Redis(process.env.REDIS_URL || {
                host: process.env.REDIS_HOST || '127.0.0.1',
                port: process.env.REDIS_PORT || 6379,
                password: process.env.REDIS_PASSWORD || null
            });

            this.client.on('connect', () => {
                logger.info('[Redis] Cache Service connected');
                this.isConnected = true;
            });

            this.client.on('error', (err) => {
                logger.error('[Redis] Cache Service connection error:', err);
                this.isConnected = false;
            });
        } else {
            logger.warn('[Redis] Caching disabled (USE_REDIS != true). All cache ops are no-ops.');
        }
    }

    /**
     * Get a value from cache
     * @param {string} key 
     * @returns {any} parsed JSON object or null
     */
    async get(key) {
        if (!this.isConnected || !this.client) return null;
        try {
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (err) {
            logger.error(`[Redis] Error getting key ${key}:`, err);
            return null;
        }
    }

    /**
     * Set a value in cache
     * @param {string} key 
     * @param {any} value 
     * @param {number} ttlSeconds Expiration time in seconds (default: 1 hour)
     */
    async set(key, value, ttlSeconds = 3600) {
        if (!this.isConnected || !this.client) return;
        try {
            await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        } catch (err) {
            logger.error(`[Redis] Error setting key ${key}:`, err);
        }
    }

    /**
     * Invalidate a specific key or keys by pattern
     * @param {string} pattern E.g. "dept:*" or "departments_all"
     */
    async invalidate(pattern) {
        if (!this.isConnected || !this.client) return;
        try {
            if (pattern.includes('*')) {
                const keys = await this.client.keys(pattern);
                if (keys.length > 0) {
                    await this.client.del(keys);
                }
            } else {
                await this.client.del(pattern);
            }
        } catch (err) {
            logger.error(`[Redis] Error invalidating ${pattern}:`, err);
        }
    }
}

module.exports = new CacheService();
