/**
 * utils/otpService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Free OTP lifecycle management with:
 *   • bcrypt hashing — raw OTP never stored in plaintext
 *   • 5-minute expiry — strictly enforced
 *   • Max 3 attempts — on the 3rd failure the OTP is effectively invalidated
 *   • Rate limit — max 5 OTP requests per email per hour
 * ─────────────────────────────────────────────────────────────────────────────
 */

const db     = require('../config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const logger = require('./logger');

const MAX_ATTEMPTS   = 3;   
const OTP_TTL_MINS   = 5;   
const RATE_LIMIT_MAX = 5;   

/**
 * Generate a secure 6-digit OTP
 */
exports.generateOTP = () => {
    return crypto.randomInt(100000, 999999).toString();
};

/**
 * Save OTP (hashed) for a specific email
 */
exports.saveOTP = async (email, otpCode, userId = null) => {
    const expiresAt = new Date(Date.now() + OTP_TTL_MINS * 60 * 1000);
    const hashedOtp = await bcrypt.hash(otpCode, 10);

    // Invalidate any existing active OTPs for this email to prevent spam/overlap
    await db.execute('UPDATE otp_verifications SET verified = 1 WHERE email = ? AND verified = 0', [email]);

    await db.execute(
        `INSERT INTO otp_verifications (user_id, email, otp_code, expires_at) 
         VALUES (?, ?, ?, ?)`,
        [userId, email, hashedOtp, expiresAt]
    );
};

/**
 * Verify OTP with attempt limits and expiry checks
 */
exports.verifyOTP = async (email, otpCode) => {
    // Fetch latest unverified, non-expired OTP
    const [rows] = await db.execute(
        `SELECT * FROM otp_verifications 
         WHERE email = ? AND verified = 0 AND expires_at > NOW() 
         ORDER BY created_at DESC LIMIT 1`,
        [email]
    );

    if (rows.length === 0) return 'expired';

    const record = rows[0];

    // Check attempt limit
    if (record.attempt_count >= MAX_ATTEMPTS) return 'locked';

    // Compare hash
    const isMatch = await bcrypt.compare(otpCode, record.otp_code);

    if (!isMatch) {
        const newAttempts = record.attempt_count + 1;
        await db.execute(
            'UPDATE otp_verifications SET attempt_count = ? WHERE id = ?',
            [newAttempts, record.id]
        );
        
        if (newAttempts >= MAX_ATTEMPTS) return 'locked';
        return 'invalid';
    }

    // Success - mark as verified
    await db.execute('UPDATE otp_verifications SET verified = 1 WHERE id = ?', [record.id]);
    return 'valid';
};

/**
 * Rate limit check: max 5 requests per hour per email
 */
exports.checkRateLimit = async (email) => {
    const [rows] = await db.execute(
        `SELECT COUNT(*) AS count FROM otp_verifications 
         WHERE email = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
        [email]
    );
    return rows[0].count < RATE_LIMIT_MAX;
};

/**
 * Invalidate all residues (cleanup)
 */
exports.clearOTPs = async (email) => {
    await db.execute('DELETE FROM otp_verifications WHERE email = ?', [email]);
};

