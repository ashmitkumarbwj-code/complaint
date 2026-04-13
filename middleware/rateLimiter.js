const rateLimit = require('express-rate-limit');

/**
 * Login Rate Limiter (Strict)
 * Blocks brute force by IP and eventually can be extended to account identifiers.
 */
exports.loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts
    message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Complaint Submission Rate Limiter (Moderate)
 * Prevents spam: Students 5/hr.
 */
exports.complaintLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: { success: false, message: 'Submission limit reached (5 per hour).' },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Status Update Limiter (Moderate to Strict)
 * Prevents script spam on administrative actions.
 */
exports.statusUpdateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 20, // 20 updates per minute
    message: { success: false, message: 'Too many updates. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Profile/Session Check Limiter (Light)
 */
exports.profileLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, 
    max: 60, // 1/sec
    message: { success: false, message: 'Session check limit reached.' }
});
