const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const { getIsAvailable } = require('../config/redis');
const logger  = require('../utils/logger');
const cloudinary = require('../config/cloudinary');
const requireAuth = require('../middleware/authMiddleware');   // [FIX C4] Added
const checkRole   = require('../middleware/roleMiddleware');   // [FIX C4] Added

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
        cloudinary: 'ok'
    };

    // Lightweight DB ping
    try {
        await db.execute('SELECT 1');
    } catch (err) {
        checks.db = 'error';
        logger.error('[Health] DB ping failed:', err.message);
    }

    // Cloudinary ping
    try {
        await cloudinary.api.ping();
    } catch (err) {
        checks.cloudinary = 'error';
        logger.error('[Health] Cloudinary ping failed:', err.message);
    }

    const mem = process.memoryUsage();
    // Overall status is degraded if DB is down OR if Redis is required but down OR if Cloudinary is down
    const overallStatus = (checks.db === 'error' || checks.cloudinary === 'error' || (isRedisRequired && !redisAvailable)) ? 'degraded' : 'ok';
    const httpStatus    = (overallStatus === 'ok') ? 200 : 503;

    return res.status(httpStatus).json({
        success:   httpStatus === 200,
        status:    overallStatus,
        uptime:    Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        db:        checks.db,
        redis:     checks.redis,
        cloudinary: checks.cloudinary,
        redisRequired: isRedisRequired,
        memory: {
            heapUsedMB:  (mem.heapUsed  / 1024 / 1024).toFixed(2) + ' MB',
            heapTotalMB: (mem.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
            rssMB:       (mem.rss       / 1024 / 1024).toFixed(2) + ' MB',
        }
    });
});

// [FIX C4] Protected: Requires valid JWT + Admin or Principal role.
// Previously public — exposed OTP_MODE, Redis state, and process metadata to anyone.
router.get('/info', requireAuth, checkRole(['admin', 'principal']), async (req, res) => {
    const redisAvailable = getIsAvailable();
    return res.json({
        success: true,
        proof: {
            NODE_ENV: process.env.NODE_ENV,
            OTP_MODE: process.env.OTP_MODE,
            USE_REDIS: process.env.USE_REDIS === 'true',
            REDIS_REALTIME: redisAvailable ? 'CONNECTED' : 'DISCONNECTED',
            FRONTEND_URLS: process.env.FRONTEND_URLS,
            IS_SERVERLESS: process.env.VERCEL === '1',
            ARCHITECTURE: process.env.VERCEL === '1' ? 'Serverless (Vercel)' : 'Persistent (EC2/PM2/Local)',
            PROCESS_ID: process.pid
        }
    });
});

module.exports = router;

