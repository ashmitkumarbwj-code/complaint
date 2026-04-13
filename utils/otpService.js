/**
 * utils/otpService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * FINAL STABILIZED VERSION: 'Fix Mode ON'
 * ─────────────────────────────────────────────────────────────────────────────
 */

const db     = require('../config/db');
const bcrypt = require('bcryptjs');
const logger = require('./logger');

const MAX_ATTEMPTS   = 3;   
const OTP_TTL_MINS   = 5;   
const RATE_LIMIT_MAX = 3;   
const RATE_LIMIT_WINDOW_MINS = 10;

/**
 * Generate a strict 6-digit numeric OTP
 */
exports.generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Save OTP (hashed) for a specific identifier
 */
exports.saveOTP = async (identifier, otpCode, userId = null) => {
    const expiresAt = new Date(Date.now() + OTP_TTL_MINS * 60 * 1000);
    const hashedOtp = await bcrypt.hash(otpCode, 10);

    // Invalidate existing
    await db.execute('UPDATE otp_verifications SET verified = 1 WHERE identifier = $1 AND verified = 0', [identifier]);

    // Insert new
    await db.execute(
        `INSERT INTO otp_verifications (user_id, identifier, otp_hash, expires_at) 
         VALUES ($1, $2, $3, $4)`,
        [userId, identifier, hashedOtp, expiresAt]
    );

    logger.info(`[OTP Service] OTP enqueued for: ${identifier}`);
};

/**
 * Verify OTP - Strictly matching User's logic requirement
 */
exports.verifyOTP = async (identifier, otpCode) => {
    // 1. Fetch latest
    const [rows] = await db.execute(
        `SELECT * FROM otp_verifications 
         WHERE identifier = $1 AND verified = 0
         ORDER BY created_at DESC LIMIT 1`,
        [identifier]
    );

    if (!rows.length) return 'expired'; // Or not found

    const record = rows[0];

    // 2. Check Expiry
    if (new Date() > new Date(record.expires_at)) return 'expired';

    // 3. Check attempt limit
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

    // Success
    await db.execute('UPDATE otp_verifications SET verified = 1 WHERE id = $1', [record.id]);
    return 'valid';
};

/**
 * Rate limit check: max 3 requests per 10 mins per identifier
 */
exports.checkRateLimit = async (identifier) => {
    const [rows] = await db.execute(
        `SELECT COUNT(*) AS count FROM otp_verifications 
         WHERE identifier = $1 AND created_at > CURRENT_TIMESTAMP - ($2 * INTERVAL '1 minute')`,
        [identifier, RATE_LIMIT_WINDOW_MINS]
    );
    return rows[0].count < RATE_LIMIT_MAX;
};

/**
 * Invalidate residues
 */
exports.clearOTPs = async (identifier) => {
    await db.execute('DELETE FROM otp_verifications WHERE identifier = $1', [identifier]);
};
