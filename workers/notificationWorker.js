const { Worker } = require('bullmq');
const { connection } = require('../config/redis');
const logger = require('../utils/logger');
const nodemailer = require('nodemailer');

// Reuse Transporter and Twilio Client exactly as they were in notificationService
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

const notificationWorker = new Worker('notifications', async (job) => {
    logger.info(`[Job:${job.id}] Processing notification job of type: ${job.name}`);

    if (job.name === 'email') {
        const { to, subject, text } = job.data;
        if (!process.env.SMTP_USER || process.env.SMTP_USER.includes('your_email')) {
            logger.info(`[MOCK EMAIL] To: ${to} | Subject: ${subject} | Content: ${text}`);
            return 'Mock email sent';
        }

        const info = await transporter.sendMail({
            from: `"Smart Campus SCRS" <${process.env.SMTP_USER}>`,
            to,
            subject,
            text,
        });
        logger.info(`[Job:${job.id}] Email sent: ${info.messageId}`);
        return info.messageId;
    }

    if (job.name === 'sms') {
        const { to, message } = job.data;
        if (!twilioClient) {
            logger.info(`[MOCK SMS] To: ${to} | Content: ${message}`);
            return 'Mock SMS sent';
        }

        const msg = await twilioClient.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to,
        });
        logger.info(`[Job:${job.id}] SMS sent: ${msg.sid}`);
        return msg.sid;
    }

    throw new Error(`Unknown job type: ${job.name}`);
}, { 
    connection,
    concurrency: 5 // Process 5 notifications concurrently
});

notificationWorker.on('completed', (job) => {
    logger.info(`[Job:${job.id}] Notification completed successfully.`);
});

notificationWorker.on('failed', (job, err) => {
    logger.error(`[Job:${job.id}] Notification failed:`, err);
});

module.exports = notificationWorker;
