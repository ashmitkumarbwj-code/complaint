const logger = require('./logger');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

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
 */
exports.sendEmail = async (to, subject, text) => {
    try {
        if (process.env.OTP_MODE === 'mock') {
            console.log(`[MOCK EMAIL] To: ${to} | Subject: ${subject} | Text: ${text}`);
            return true;
        }

        if (!process.env.SMTP_USER || process.env.SMTP_USER.includes('your_email')) {
             console.log(`[MOCK EMAIL FALLBACK] To: ${to} | Subject: ${subject}`);
             return true;
        }

        await transporter.sendMail({
            from: `"Smart Campus SCRS" <${process.env.SMTP_USER}>`,
            to,
            subject,
            text,
        });
        return true;
    } catch (error) {
        logger.error('Failed to send email:', error);
        return false;
    }
};

/**
 * Send an SMS notification (Roadmap / Currently Disabled)
 */
exports.sendSMS = async (to, message) => {
    logger.info(`[SMS] Skipping SMS to ${to} (Phase 1: Email Only Enabled)`);
    return true; // Return true to avoid breaking flows that call this
};

/**
 * Notify student about complaint status
 */
exports.notifyStudent = async (studentEmail, complaintId, status) => {
    const subject = `Complaint #${complaintId} Update`;
    const text = `Your complaint #${complaintId} has been updated to: ${status}. Log in to the dashboard for details.`;
    return this.sendEmail(studentEmail, subject, text);
};

/**
 * Notify authority about new assignment
 */
exports.notifyAuthority = async (authorityEmail, complaintId, category) => {
    const subject = `New Complaint Assigned: #${complaintId}`;
    const text = `A new complaint regarding "${category}" has been assigned to your department. Please review it in the dashboard.`;
    return this.sendEmail(authorityEmail, subject, text);
};

/**
 * Send OTP via email using the standardized free system format
 */
exports.sendOTPEmail = async (email, otp) => {
    const subject = "Smart Campus Verification Code";
    const text = `Your verification code is: ${otp}\n\nThis code will expire in 5 minutes.\nDo not share this code with anyone.`;
    return this.sendEmail(email, subject, text);
};
