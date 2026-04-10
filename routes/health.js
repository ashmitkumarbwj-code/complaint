const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const { getIsAvailable } = require('../config/redis');
const logger  = require('../utils/logger');

/**
 * GET /api/health
 *
 * Public endpoint used by uptime monitors (e.g. UptimeRobot, AWS ALB, PM2 health check).
 * Returns JSON with:
 *   - status        "ok" | "degraded"
 *   - uptime        process uptime in seconds
 *   - timestamp     ISO-8601 UTC string
 *   - db            "ok" | "error"
 *   - redis         "ok" | "unavailable"
 *   - memory        Heap usage in MB
 */
router.get('/', async (req, res) => {
    const isRedisRequired = process.env.USE_REDIS === 'true';
    const redisAvailable = getIsAvailable();
    
    const checks = {
        db: 'ok',
        redis: redisAvailable ? 'ok' : (isRedisRequired ? 'CRITICAL_MISSING' : 'unavailable'),
    };

    // Lightweight DB ping
    try {
        await db.execute('SELECT 1');
    } catch (err) {
        checks.db = 'error';
        logger.error('[Health] DB ping failed:', err.message);
    }

    const mem = process.memoryUsage();
    // Overall status is degraded if DB is down OR if Redis is required but down
    const overallStatus = (checks.db === 'error' || (isRedisRequired && !redisAvailable)) ? 'degraded' : 'ok';
    const httpStatus    = (overallStatus === 'ok') ? 200 : 503;

    return res.status(httpStatus).json({
        success:   httpStatus === 200,
        status:    overallStatus,
        uptime:    Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        db:        checks.db,
        redis:     checks.redis,
        redisRequired: isRedisRequired,
        memory: {
            heapUsedMB:  (mem.heapUsed  / 1024 / 1024).toFixed(2) + ' MB',
            heapTotalMB: (mem.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
            rssMB:       (mem.rss       / 1024 / 1024).toFixed(2) + ' MB',
        }
    });
});

module.exports = router;
