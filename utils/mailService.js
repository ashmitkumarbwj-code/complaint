'use strict';

/**
 * utils/mailService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Nodemailer wrapper for all transactional emails.
 * Supports Gmail (SMTP) with env-based config.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const nodemailer = require('nodemailer');
const logger = require('./logger');

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;

    if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
        logger.warn('[MailService] MAIL_USER or MAIL_PASS not set. Email sending disabled.');
        return null;
    }

    transporter = nodemailer.createTransport({
        service: process.env.MAIL_SERVICE || 'gmail',
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS, // Use App Password for Gmail
        },
    });

    return transporter;
}

/**
 * Send a plain transactional email.
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML body
 * @returns {Promise<boolean>} true if sent, false if failed
 */
async function sendMail(to, subject, html) {
    const t = getTransporter();
    if (!t) {
        logger.warn(`[MailService] MOCK: EmailTo="${to}" Subject="${subject}"`);
        return false; // Degraded gracefully
    }

    try {
        await t.sendMail({
            from: `"Smart Campus" <${process.env.MAIL_USER}>`,
            to,
            subject,
            html,
        });
        logger.info(`[MailService] Sent: "${subject}" → ${to}`);
        return true;
    } catch (err) {
        logger.error(`[MailService] Failed to send to ${to}:`, err.message);
        return false;
    }
}

/**
 * Send a student account activation email containing the Firebase action link.
 * @param {object} params
 * @param {string} params.to - Student email
 * @param {string} params.name - Student name or roll number
 * @param {string} params.activationLink - Firebase-generated action link
 * @returns {Promise<boolean>}
 */
async function sendStudentActivationEmail({ to, name, activationLink }) {
    const subject = 'Activate Your Smart Campus Account';
    const html = `
        <div style="font-family: Inter, Arial, sans-serif; max-width:600px; margin:auto; padding:24px; background:#f8f9fa; border-radius:8px;">
            <h2 style="color:#1a1a2e;">Welcome to Smart Campus 🎓</h2>
            <p>Hello <strong>${name}</strong>,</p>
            <p>Your student account has been registered by the Admin. Click the button below to activate your account and set your password.</p>
            <p style="text-align:center; margin:32px 0;">
                <a href="${activationLink}" 
                   style="background:#4f46e5; color:#fff; padding:14px 28px; border-radius:6px; text-decoration:none; font-size:16px; font-weight:600;">
                    Activate My Account
                </a>
            </p>
            <p style="color:#6b7280; font-size:13px;">
                This link expires in 24 hours. If you did not expect this email, please ignore it or contact your campus admin.
            </p>
            <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;" />
            <p style="color:#9ca3af; font-size:12px;">Smart Campus Response System &bull; Do not reply to this email.</p>
        </div>
    `;
    return sendMail(to, subject, html);
}

/**
 * Send a staff welcome and activation email.
 * @param {object} params
 * @param {string} params.to
 * @param {string} params.name
 * @param {string} params.role
 * @param {string} params.activationLink
 * @returns {Promise<boolean>}
 */
async function sendStaffActivationEmail({ to, name, role, activationLink }) {
    const subject = `Your ${role} Account is Ready — Smart Campus`;
    const html = `
        <div style="font-family: Inter, Arial, sans-serif; max-width:600px; margin:auto; padding:24px; background:#f8f9fa; border-radius:8px;">
            <h2 style="color:#1a1a2e;">Welcome, ${name} 👋</h2>
            <p>Your <strong>${role}</strong> account has been authorized. Click below to activate your account and set your password.</p>
            <p style="text-align:center; margin:32px 0;">
                <a href="${activationLink}"
                   style="background:#059669; color:#fff; padding:14px 28px; border-radius:6px; text-decoration:none; font-size:16px; font-weight:600;">
                    Activate ${role} Account
                </a>
            </p>
            <p style="color:#6b7280; font-size:13px;">This link expires in 24 hours.</p>
            <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;" />
            <p style="color:#9ca3af; font-size:12px;">Smart Campus Response System &bull; Do not reply to this email.</p>
        </div>
    `;
    return sendMail(to, subject, html);
}

module.exports = {
    sendMail,
    sendStudentActivationEmail,
    sendStaffActivationEmail,
};
