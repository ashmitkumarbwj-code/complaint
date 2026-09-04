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

    const smtpUser = (process.env.SMTP_USER || '').trim();
    const smtpPass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');

    if (!smtpUser || !smtpPass) {
        logger.warn('[NotificationService] SMTP_USER or SMTP_PASS not set — email disabled.');
        return null;
    }
    if (smtpUser.includes('your_email')) {
        logger.warn('[NotificationService] SMTP_USER is a placeholder — email disabled.');
        return null;
    }

    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: smtpPort,
        secure: smtpPort === 465 || process.env.SMTP_SECURE === 'true',
        auth: {
            user: smtpUser,
            pass: smtpPass,
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
    if (!t) {
        logger.warn('[NotificationService] ⚠️ SMTP verification failed - emails may not be sent (transporter not configured)');
        return;
    }
    try {
        await t.verify();
        isSmtpVerified = true;
        logger.info('[NotificationService] ✅ SMTP connection verified');
    } catch (err) {
        isSmtpVerified = false;
        logger.warn(`[NotificationService] ⚠️ SMTP verification failed - emails may not be sent (${err.message || 'unknown error'}, code: ${err.code || 'N/A'})`);
        if (err.message && err.message.includes('535')) {
            logger.error('[NotificationService] CRITICAL: Invalid SMTP Credentials (535). Please check SMTP_USER and SMTP_PASS (App Password) in .env');
        }
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

    // MOCK mode — strictly when OTP_MODE === 'mock'
    if (process.env.OTP_MODE === 'mock') {
        logger.info(`[NotificationService] ${logCtx} MOCK email to ${masked} | Subject: "${subject}"`);
        return { success: true, messageId: 'mock-id', response: 'Mock Success' };
    }

    const t = getTransporter();
    if (!t) {
        logger.error(`[NotificationService] ${logCtx} SMTP transporter not configured — email to ${masked} NOT sent.`);
        return { success: false, error: 'SMTP_CONFIG_ERROR', code: 'SMTP_NOT_CONFIGURED' };
    }

    logger.info(`[NotificationService] ${logCtx} Attempting SMTP delivery to ${masked}`);

    try {
        const info = await t.sendMail({
            from: process.env.EMAIL_FROM || `"Smart Campus SCRS" <${process.env.SMTP_USER}>`,
            to,
            subject,
            text,
        });
        isSmtpVerified = true;
        logger.info(`[NotificationService] ${logCtx} ✅ Email sent successfully to ${masked} | MessageId: ${info.messageId}`);
        return { 
            success: true, 
            messageId: info.messageId, 
            response: info.response 
        };
    } catch (error) {
        logger.error(`[NotificationService] ${logCtx} ❌ SMTP delivery failed to ${masked}: ${error.message} (code: ${error.code || 'N/A'})`);
        if (error.message && error.message.includes('535')) {
            isSmtpVerified = false;
        }
        return { 
            success: false, 
            error: 'SMTP_CONFIG_ERROR',
            code: error.code || 'SMTP_ERROR',
            message: error.message
        };
    }
};

exports.sendEmail = sendEmail;
exports.maskEmail = maskEmail;
exports.getIsSmtpVerified = () => isSmtpVerified;

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

/**
 * Send Forwarded Complaint Notifications (Student + Department Official)
 * Strictly decoupled: Failures are logged and never throw unhandled exceptions.
 * Idempotent: Deduplicated via persistent complaint_status_history records.
 */
exports.sendComplaintForwardedNotifications = async ({ complaintId, targetDeptId, tenantId }) => {
    const db = require('../config/db');
    try {
        // Persistent Deduplication Check: Prevent duplicate forward emails
        const [existing] = await db.execute(`
            SELECT id FROM complaint_status_history 
            WHERE complaint_id = $1 
              AND action_type = 'EMAIL_NOTIFICATION' 
              AND to_status = 'FORWARDED'
            LIMIT 1
        `, [complaintId]);

        if (existing && existing.length > 0) {
            logger.info(`[NotificationService] Forwarded email notification already recorded for Complaint #${complaintId}. Skipping duplicate.`);
            return { success: true, duplicate: true };
        }

        // 1. Fetch complaint & student info
        const [complaints] = await db.execute(`
            SELECT c.id, c.title, c.description, c.category, c.location, c.priority, c.status, c.created_at,
                   d.name as department_name, d.id as department_id,
                   u.email as student_email, u.full_name as student_name, u.username as student_username
            FROM complaints c
            JOIN students s ON c.student_id = s.id
            JOIN users u ON s.user_id = u.id
            JOIN departments d ON c.department_id = d.id
            WHERE c.id = $1 AND c.tenant_id = $2
        `, [complaintId, tenantId]);

        if (complaints.length === 0) {
            logger.warn(`[NotificationService] Complaint #${complaintId} not found for forward notifications.`);
            return { success: false, reason: 'COMPLAINT_NOT_FOUND' };
        }

        const complaint = complaints[0];
        const studentDisplayName = complaint.student_name || complaint.student_username || 'Student';

        // EMAIL #1: Send to Student
        if (complaint.student_email) {
            const studentSubject = `Complaint Forwarded — #${complaint.id}`;
            const studentBody = [
                `Dear ${studentDisplayName},`,
                '',
                `Your grievance (Complaint #${complaint.id}) has been reviewed by the Central Administration and forwarded to the appropriate department for resolution.`,
                '',
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `COMPLAINT DETAILS`,
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `Complaint ID: #${complaint.id}`,
                `Title: ${complaint.title || complaint.category}`,
                `Category: ${complaint.category}`,
                `Location: ${complaint.location || 'Campus'}`,
                `Priority: ${complaint.priority || 'Medium'}`,
                `Forwarded Department: ${complaint.department_name}`,
                `Current Status: FORWARDED`,
                `Submitted On: ${new Date(complaint.created_at).toLocaleString()}`,
                '',
                `Description:`,
                `${complaint.description}`,
                '',
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `NEXT STEPS`,
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `The Head of Department (HOD) of ${complaint.department_name} will verify this complaint and assign a specialist staff member to investigate and resolve the issue.`,
                '',
                `You can track real-time progress and view audit timeline updates directly on your CampusVoice student dashboard.`,
                '',
                `Best regards,`,
                `CampusVoice Administration`,
                `Smart Complaint & Response System`
            ].join('\n');

            await sendEmail(complaint.student_email, studentSubject, studentBody, { role: 'Student' });
        }

        // EMAIL #2: Resolve Department Recipient & Send
        const deptIdToLookup = targetDeptId || complaint.department_id;
        let recipientEmail = null;
        let recipientName = null;

        // Priority 1: Assigned HOD in departments table
        const [hodRows] = await db.execute(`
            SELECT u.email, u.full_name, u.username
            FROM departments d
            JOIN users u ON d.hod_id = u.id
            WHERE d.id = $1 AND u.is_active = true
            LIMIT 1
        `, [deptIdToLookup]);

        if (hodRows.length > 0 && hodRows[0].email) {
            recipientEmail = hodRows[0].email;
            recipientName = hodRows[0].full_name || hodRows[0].username || 'Head of Department';
        }

        // Priority 2: Department member with HOD role
        if (!recipientEmail) {
            const [memberHodRows] = await db.execute(`
                SELECT u.email, u.full_name, u.username
                FROM department_members dm
                JOIN users u ON dm.user_id = u.id
                WHERE dm.department_id = $1 
                  AND (dm.role_in_dept ILIKE '%hod%' OR u.role ILIKE '%hod%')
                  AND u.is_active = true
                LIMIT 1
            `, [deptIdToLookup]);

            if (memberHodRows.length > 0 && memberHodRows[0].email) {
                recipientEmail = memberHodRows[0].email;
                recipientName = memberHodRows[0].full_name || memberHodRows[0].username || 'Head of Department';
            }
        }

        // Priority 3: Department email from departments table
        if (!recipientEmail) {
            const [deptRows] = await db.execute(`
                SELECT email, name FROM departments WHERE id = $1 AND email IS NOT NULL AND email != ''
            `, [deptIdToLookup]);

            if (deptRows.length > 0 && deptRows[0].email) {
                recipientEmail = deptRows[0].email;
                recipientName = `${deptRows[0].name} Office`;
            }
        }

        // Priority 4: Any verified staff in department
        if (!recipientEmail) {
            const [staffRows] = await db.execute(`
                SELECT email, name FROM verified_staff WHERE department_id = $1 AND email IS NOT NULL AND email != '' LIMIT 1
            `, [deptIdToLookup]);

            if (staffRows.length > 0 && staffRows[0].email) {
                recipientEmail = staffRows[0].email;
                recipientName = staffRows[0].name || 'Department Staff';
            }
        }

        if (recipientEmail) {
            const deptSubject = `Action Required: New Complaint #${complaint.id} Assigned to ${complaint.department_name}`;
            const deptBody = [
                `Dear ${recipientName},`,
                '',
                `A student grievance has been reviewed by Central Admin and forwarded to ${complaint.department_name} for departmental verification and action.`,
                '',
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `GRIEVANCE DETAILS`,
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `Complaint ID: #${complaint.id}`,
                `Title: ${complaint.title || complaint.category}`,
                `Category: ${complaint.category}`,
                `Location: ${complaint.location || 'Campus'}`,
                `Priority: ${complaint.priority || 'Medium'}`,
                `Student Reference: ${studentDisplayName}`,
                `Status: FORWARDED`,
                `Timestamp: ${new Date().toLocaleString()}`,
                '',
                `Description:`,
                `${complaint.description}`,
                '',
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `REQUIRED ACTION`,
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `Please log in to the Department Portal to verify the complaint and assign a specialist staff member to resolve it.`,
                '',
                `Smart Complaint & Response System (SCRS)`,
                `CampusVoice Automated Notification`
            ].join('\n');

            await sendEmail(recipientEmail, deptSubject, deptBody, { role: 'Department' });
        } else {
            logger.warn(`[NotificationService] No recipient email found for department #${deptIdToLookup}.`);
        }

        // Record successful dispatch in persistent audit trail to prevent future duplicates
        await db.execute(`
            INSERT INTO complaint_status_history (
                complaint_id, actor_user_id, actor_role, action_type, 
                from_status, to_status, note, visibility, metadata_json
            ) VALUES ($1, NULL, 'Admin', 'EMAIL_NOTIFICATION', 'SUBMITTED', 'FORWARDED', 'Forwarded email notification dispatched', 'STAFF_ONLY', $2)
        `, [complaintId, JSON.stringify({ sent_at: new Date().toISOString(), targetDeptId: deptIdToLookup })]);

        return { success: true };
    } catch (err) {
        logger.error(`[NotificationService] Error sending forward notifications for complaint #${complaintId}:`, err);
        return { success: false, error: err.message };
    }
};

/**
 * Send Final Solved / Closure Notification to Student
 * Strictly invoked ONLY on final transition to CLOSED state.
 * Idempotent: Deduplicated via persistent complaint_status_history records.
 */
exports.sendComplaintResolvedNotification = async ({ complaintId, resolutionNote, tenantId }) => {
    const db = require('../config/db');
    try {
        // Persistent Deduplication Check: Prevent duplicate closed emails
        const [existing] = await db.execute(`
            SELECT id FROM complaint_status_history 
            WHERE complaint_id = $1 
              AND action_type = 'EMAIL_NOTIFICATION' 
              AND to_status = 'CLOSED'
            LIMIT 1
        `, [complaintId]);

        if (existing && existing.length > 0) {
            logger.info(`[NotificationService] Closed email notification already recorded for Complaint #${complaintId}. Skipping duplicate.`);
            return { success: true, duplicate: true };
        }

        const [complaints] = await db.execute(`
            SELECT c.id, c.title, c.description, c.category, c.location, c.status, c.resolved_at,
                   d.name as department_name,
                   u.email as student_email, u.full_name as student_name, u.username as student_username
            FROM complaints c
            JOIN students s ON c.student_id = s.id
            JOIN users u ON s.user_id = u.id
            JOIN departments d ON c.department_id = d.id
            WHERE c.id = $1 AND c.tenant_id = $2
        `, [complaintId, tenantId]);

        if (complaints.length === 0) {
            logger.warn(`[NotificationService] Complaint #${complaintId} not found for closure notification.`);
            return { success: false, reason: 'COMPLAINT_NOT_FOUND' };
        }

        const complaint = complaints[0];
        if (complaint.status !== 'CLOSED') {
            logger.warn(`[NotificationService] Resolved email suppressed: Complaint #${complaintId} status is '${complaint.status}', not 'CLOSED'.`);
            return { success: false, reason: 'STATUS_NOT_CLOSED' };
        }

        const studentDisplayName = complaint.student_name || complaint.student_username || 'Student';

        if (complaint.student_email) {
            const subject = `Complaint Successfully Resolved — #${complaint.id}`;
            const body = [
                `Dear ${studentDisplayName},`,
                '',
                `We are pleased to inform you that your grievance (Complaint #${complaint.id}) has been successfully resolved and officially closed by the administration.`,
                '',
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `RESOLUTION SUMMARY`,
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `Complaint ID: #${complaint.id}`,
                `Title: ${complaint.title || complaint.category}`,
                `Department: ${complaint.department_name}`,
                `Final Status: CLOSED`,
                `Closed On: ${new Date(complaint.resolved_at || Date.now()).toLocaleString()}`,
                '',
                `Resolution Remarks / Notes:`,
                `${resolutionNote || 'The issue has been verified and resolved by the department specialist.'}`,
                '',
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `STUDENT SATISFACTION & REOPEN POLICY`,
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `If you feel the issue was not satisfactorily resolved, you may reopen this complaint once within 7 days directly from your student dashboard.`,
                '',
                `Thank you for helping us maintain a better campus environment.`,
                '',
                `Best regards,`,
                `CampusVoice Administration`,
                `Smart Complaint & Response System`
            ].join('\n');

            await sendEmail(complaint.student_email, subject, body, { role: 'Student' });
        }

        // Record successful dispatch in persistent audit trail
        await db.execute(`
            INSERT INTO complaint_status_history (
                complaint_id, actor_user_id, actor_role, action_type, 
                from_status, to_status, note, visibility, metadata_json
            ) VALUES ($1, NULL, 'Admin', 'EMAIL_NOTIFICATION', 'HOD_APPROVED', 'CLOSED', 'Resolved closure email dispatched to student', 'STAFF_ONLY', $2)
        `, [complaintId, JSON.stringify({ sent_at: new Date().toISOString() })]);

        return { success: true };
    } catch (err) {
        logger.error(`[NotificationService] Error sending resolution notification for complaint #${complaintId}:`, err);
        return { success: false, error: err.message };
    }
};
