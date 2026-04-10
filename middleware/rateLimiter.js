const rateLimit = require('express-rate-limit');

/**
 * Complaint Submission Rate Limiter
 * 
 * Prevents spam by limiting students to 5 complaints per hour.
 * In a real production campus, this is a reasonable limit to ensure 
 * that resources are not overwhelmed by a single user.
 */
exports.complaintLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // Limit each IP to 5 submissions per window
    message: {
        success: false,
        message: 'Too many complaints submitted from this account. Please wait an hour before submitting more.'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * Audit/Admin Action Rate Limiter
 * 
 * Protects sensitive admin routes from brute-force or scripted mass-updates.
 */
exports.adminActionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 50, 
    message: {
        success: false,
        message: 'Too many administrative actions. Please slow down.'
    }
});
