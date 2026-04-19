const rateLimit = require('express-rate-limit');

/**
 * Login Rate Limiter (Strict)
 * Blocks brute force by IP and eventually can be extended to account identifiers.
 */
exports.loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts
    skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1',
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
    skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1',
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
/**
 * Activation Request Limiter (Very Strict)
 * Prevents email/SMS abuse for account claims.
 */
exports.activationLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5,
    message: { success: false, message: 'Too many activation attempts. Please try again in 10 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * OTP Verification/Request Limiter (Strict)
 */
exports.otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 10,
    message: { success: false, message: 'Too many OTP attempts. Please try again in 10 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});
