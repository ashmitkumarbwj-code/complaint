const { notificationQueue } = require('./queueService');
const logger = require('./logger');


/**
 * Send an email notification
 */
exports.sendEmail = async (to, subject, text) => {
    try {
        await notificationQueue.add('email', { to, subject, text }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: true,
            removeOnFail: false
        });
        return true;
    } catch (error) {
        logger.error('Failed to enqueue email job:', error);
        return false;
    }
};



/**
 * Send an SMS notification
 */
exports.sendSMS = async (to, message) => {
    try {
        await notificationQueue.add('sms', { to, message }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: true,
            removeOnFail: false
        });
        return true;
    } catch (error) {
        logger.error('Failed to enqueue SMS job:', error);
        return false;
    }
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
