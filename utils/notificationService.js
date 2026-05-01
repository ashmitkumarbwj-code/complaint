const logger = require('./logger');
const nodemailer = require('nodemailer');

// ── Helper: Mask email for safe logging ─────────────────────────────────────
function maskEmail(email) {
    if (!email || !email.includes('@')) return '[invalid]';
    const [local, domain] = email.split('@');
    const masked = local.length <= 2 ? local[0] + '*' : local[0] + '***';
    return `${masked}@${domain}`;
}

// ── Build transporter once at startup ────────────────────────────────────────
let transporter = null;
let isSmtpVerified = false;

function getTransporter() {
    if (transporter) return transporter;

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        logger.warn('[NotificationService] SMTP_USER or SMTP_PASS not set — email disabled.');
        return null;
    }
    if (process.env.SMTP_USER.includes('your_email')) {
        logger.warn('[NotificationService] SMTP_USER is a placeholder — email disabled.');
        return null;
    }

    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',  // false for port 587 (STARTTLS)
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        tls: { rejectUnauthorized: false }  // Prevent cert issues on EC2
    });
    return transporter;
}

// ── SMTP health check at startup (non-blocking) ───────────────────────────────
(async () => {
    if (process.env.OTP_MODE === 'mock') {
        logger.info('[NotificationService] OTP_MODE=mock — skipping SMTP verify.');
        isSmtpVerified = true;
        return;
    }
    const t = getTransporter();
    if (!t) return;
    try {
        await t.verify();
        isSmtpVerified = true;
        logger.info('[NotificationService] ✅ SMTP connection verified successfully.');
    } catch (err) {
        isSmtpVerified = false;
        logger.error(`[NotificationService] ❌ SMTP connection FAILED at startup: ${err.message} (code: ${err.code || 'N/A'})`);
        if (err.message.includes('535')) {
            logger.error('[NotificationService] CRITICAL: Invalid SMTP Credentials (535). Please check SMTP_USER and SMTP_PASS (App Password) in .env');
        }
        logger.error('[NotificationService] Emails will fail until SMTP is fixed. Check SMTP credentials and EC2 port 587.');
    }
})();

let twilioClient = null;
const sid = process.env.TWILIO_ACCOUNT_SID;
if (sid && sid.startsWith('AC')) {
    try {
        const twilio = require('twilio');
        twilioClient = twilio(sid, process.env.TWILIO_AUTH_TOKEN);
        logger.info('[Twilio] Notification service initialized SMS client.');
    } catch (e) {
        logger.warn('[Twilio] Notification service failed to initialize:', e.message);
    }
}

/**
 * Send an email notification (Direct Call - No Queue)
 * Returns true on success, false on failure. NEVER returns true on failure.
 */
const sendEmail = async (to, subject, text, { requestId = null, role = null } = {}) => {
    const masked = maskEmail(to);
    const logCtx = `[rid:${requestId || '-'} role:${role || '-'}]`;

    // MOCK mode — no real send
    if (process.env.OTP_MODE === 'mock') {
        logger.info(`[NotificationService] ${logCtx} MOCK email to ${masked} | Subject: ${subject}`);
        return { success: true, messageId: 'mock-id', response: 'Mock Success' };
    }

    const t = getTransporter();
    if (!t || !isSmtpVerified) {
        const reason = !t ? 'No SMTP transporter' : 'SMTP verification failed (Bad Credentials)';
        logger.error(`[NotificationService] ${logCtx} ${reason} — email to ${masked} NOT sent.`);
        return { success: false, error: 'SMTP_CONFIG_ERROR', code: 'SMTP_OFFLINE' };
    }

    try {
        const info = await t.sendMail({
            from: process.env.EMAIL_FROM || `"Smart Campus SCRS" <${process.env.SMTP_USER}>`,
            to,
            subject,
            text,
        });
        logger.info(`[NotificationService] ${logCtx} ✅ Email sent to ${masked} | Subject: "${subject}" | MessageId: ${info.messageId}`);
        return { 
            success: true, 
            messageId: info.messageId, 
            response: info.response 
        };
    } catch (error) {
        logger.error(`[NotificationService] ${logCtx} ❌ Email to ${masked} FAILED | Code: ${error.code || 'N/A'} | ${error.message}`);
        // If it was a 535 error during send, mark as unverified
        if (error.message.includes('535')) isSmtpVerified = false;
        
        return { 
            success: false, 
            error: error.message,
            code: error.code
        };
    }
};

exports.sendEmail = sendEmail;
exports.maskEmail = maskEmail;

/**
 * Send an SMS notification (Phase 2 — Currently Disabled)
 */
exports.sendSMS = async (to, message) => {
    logger.info(`[NotificationService] SMS skipped for ${to.slice(-4).padStart(to.length, '*')} (Phase 1: Email Only)`);
    return false;  // Explicitly false — SMS is not active
};

/**
 * Notify student about complaint status update
 */
exports.notifyStudent = async (studentEmail, complaintId, status) => {
    const subject = `Complaint #${complaintId} Update`;
    const text = `Your complaint #${complaintId} has been updated to: ${status}. Log in to the dashboard for details.`;
    return sendEmail(studentEmail, subject, text);
};

/**
 * Notify authority about new assignment
 */
exports.notifyAuthority = async (authorityEmail, complaintId, category) => {
    const subject = `New Complaint Assigned: #${complaintId}`;
    const text = `A new complaint regarding "${category}" has been assigned to your department. Please review it in the dashboard.`;
    return sendEmail(authorityEmail, subject, text);
};

/**
 * Send OTP via email.
 * Returns true if email was actually sent, false otherwise.
 * Callers MUST check the return value.
 */
exports.sendOTPEmail = async (email, otp, { requestId = null, role = null } = {}) => {
    const subject = 'Smart Campus Verification Code';
    const text = [
        `Your verification code is: ${otp}`,
        '',
        'This code will expire in 5 minutes.',
        'Do not share this code with anyone.',
        '',
        'Smart Campus Response System'
    ].join('\n');
    return sendEmail(email, subject, text, { requestId, role });
};
