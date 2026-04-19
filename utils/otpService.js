/**
 * utils/otpService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * HARDENED SECURITY VERSION
 * ─────────────────────────────────────────────────────────────────────────────
 */

const db     = require('../config/db');
const bcrypt = require('bcryptjs');
const logger = require('./logger');

const MAX_ATTEMPTS   = 3;   
const OTP_TTL_MINS   = 5;   

// Rate Limiting Config
const RATE_LIMIT_MAX_PER_USER = 3;  // 3 OTPs per identifier per window
const RATE_LIMIT_MAX_PER_IP   = 10; // 10 OTPs per IP per window (global abuse prevention)
const RATE_LIMIT_WINDOW_MINS  = 10;
const COOLDOWN_SECONDS        = 60; // 60 seconds resend cooldown

/**
 * Generate a strict 6-digit numeric OTP
 */
exports.generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Save OTP (hashed) for a specific identifier with IP auditing
 */
exports.saveOTP = async (identifier, otpCode, userId = null, ip = null) => {
    const expiresAt = new Date(Date.now() + OTP_TTL_MINS * 60 * 1000);
    const hashedOtp = await bcrypt.hash(otpCode, 10);

    // Invalidate existing active OTPs for this identifier
    await db.execute(
        'UPDATE otp_verifications SET verified = true WHERE identifier = $1 AND verified = false', 
        [identifier]
    );

    // Insert new OTP record
    await db.execute(
        `INSERT INTO otp_verifications (user_id, identifier, otp_hash, expires_at) 
         VALUES ($1, $2, $3, $4)`,
        [userId, identifier, hashedOtp, expiresAt]
    );

    logger.info(`[OTP Service] OTP enqueued for: ${identifier} (IP: ${ip || 'unknown'})`);
};

/**
 * Verify OTP - Strictly matching User's logic requirement
 */
exports.verifyOTP = async (identifier, otpCode) => {
    // 1. Fetch latest active OTP
    const [rows] = await db.execute(
        `SELECT * FROM otp_verifications 
         WHERE identifier = $1 AND verified = false
         ORDER BY created_at DESC LIMIT 1`,
        [identifier]
    );

    if (!rows.length) return 'expired';

    const record = rows[0];

    // 2. Check Expiry
    if (new Date() > new Date(record.expires_at)) return 'expired';

    // 3. Check attempt limit (pre-lock)
    if (record.attempt_count >= MAX_ATTEMPTS) return 'locked';

    // 4. Compare hash
    const isValid = await bcrypt.compare(otpCode, record.otp_hash);

    if (!isValid) {
        const newAttempts = (record.attempt_count || 0) + 1;
        await db.execute(
            'UPDATE otp_verifications SET attempt_count = $1 WHERE id = $2',
            [newAttempts, record.id]
        );
        if (newAttempts >= MAX_ATTEMPTS) return 'locked';
        return 'invalid';
    }

    // Success: Mark as verified
    await db.execute('UPDATE otp_verifications SET verified = true WHERE id = $1', [record.id]);
    return 'valid';
};

/**
 * Rate limit check: max N requests per window per identifier
 */
exports.checkRateLimit = async (identifier, ip = null) => {
    // 0. Check Cooldown (Strict 60s)
    const [lastOtp] = await db.execute(
        `SELECT created_at FROM otp_verifications 
         WHERE identifier = $1 
         ORDER BY created_at DESC LIMIT 1`,
        [identifier]
    );

    if (lastOtp.length > 0) {
        const lastCreated = new Date(lastOtp[0].created_at);
        const diffSeconds = (Date.now() - lastCreated.getTime()) / 1000;
        if (diffSeconds < COOLDOWN_SECONDS) {
            logger.warn(`[OTP-SEC] Cooldown violation for identifier: ${identifier}`);
            return 'cooldown';
        }
    }

    // 1. Check Per-Identifier Limit
    const [userRows] = await db.execute(
        `SELECT COUNT(*) AS count FROM otp_verifications 
         WHERE identifier = $1 AND created_at > CURRENT_TIMESTAMP - ($2 * INTERVAL '1 minute')`,
        [identifier, RATE_LIMIT_WINDOW_MINS]
    );
    
    if (parseInt(userRows[0].count) >= RATE_LIMIT_MAX_PER_USER) {
        logger.warn(`[OTP-SEC] Rate limit exceeded for identifier: ${identifier}`);
        return 'limit';
    }

    // 2. Check Per-IP Limit (Disabled due to schema mismatch - ip_address column missing)
    /*
    if (ip) {
        const [ipRows] = await db.execute(
            `SELECT COUNT(*) AS count FROM otp_verifications 
             WHERE ip_address = $1 AND created_at > CURRENT_TIMESTAMP - ($2 * INTERVAL '1 minute')`,
            [ip, RATE_LIMIT_WINDOW_MINS]
        );
        
        if (parseInt(ipRows[0].count) >= RATE_LIMIT_MAX_PER_IP) {
            logger.warn(`[OTP-SEC] Rate limit exceeded for IP: ${ip}`);
            return 'limit';
        }
    }
    */

    return 'ok';
};

/**
 * Invalidate residues
 */
exports.clearOTPs = async (identifier) => {
    await db.execute('DELETE FROM otp_verifications WHERE identifier = $1', [identifier]);
};
