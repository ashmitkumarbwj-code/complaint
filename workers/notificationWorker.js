const { Worker } = require('bullmq');
const { connection } = require('../config/redis');
const logger = require('../utils/logger');
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
        logger.info('[Twilio] Worker initialized SMS client.');
    } catch (e) {
        logger.warn('[Twilio] Worker failed to initialize:', e.message);
    }
}

const processNotification = async (job) => {
    const otp_mode = process.env.OTP_MODE || 'mock';
    
    // Extract OTP if present in message/text
    const rawData = job.data.text || job.data.message || '';
    const otpMatch = rawData.match(/\b\d{6}\b/);
    const otp = otpMatch ? otpMatch[0] : 'XXXXXX';
    const identifier = job.data.to || 'UNKNOWN';

    if (otp_mode === 'mock') {
        console.log(`
    ============================
    🔐 MOCK OTP GENERATED
    Identifier: ${identifier}
    OTP: ${otp}
    ============================
        `);
        // If it's an email and we have real credentials, we still send it for convenience 
        // unless it's strictly SMS which is usually the one people want to mock.
        if (job.name === 'email' && process.env.SMTP_USER && !process.env.SMTP_USER.includes('your_email')) {
             await transporter.sendMail({
                from: `"Smart Campus SCRS" <${process.env.SMTP_USER}>`,
                to: job.data.to,
                subject: job.data.subject,
                text: job.data.text,
            });
        }
        return 'Mock handled';
    }

    if (job.name === 'email') {
        const { to, subject, text } = job.data;
        if (!process.env.SMTP_USER || process.env.SMTP_USER.includes('your_email')) return 'Mock Email';
        const info = await transporter.sendMail({
            from: `"Smart Campus SCRS" <${process.env.SMTP_USER}>`,
            to, subject, text,
        });
        return info.messageId;
    }

    if (job.name === 'sms') {
        const { to, message } = job.data;
        if (!twilioClient) {
            logger.warn(`[SMS] Live mode but Twilio Client missing. Mocking fallback.`);
            console.log(`🔐 [FALLBACK MOCK] To: ${to} | OTP: ${otp}`);
            return 'Fallback Mock';
        }
        const msg = await twilioClient.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to,
        });
        return msg.sid;
    }
};

if (connection && process.env.USE_REDIS === 'true') {
    new Worker('notifications', processNotification, { connection, concurrency: 5 });
}

module.exports = { processNotification };
