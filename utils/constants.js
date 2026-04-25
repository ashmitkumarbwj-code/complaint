/**
 * utils/constants.js
 * The Law Book of canonical strings.
 */

const STATUS = {
    PENDING: 'PENDING',
    IN_PROGRESS: 'IN_PROGRESS',
    RESOLVED: 'RESOLVED',
    REJECTED: 'REJECTED',
    ESCALATED: 'ESCALATED',
    ON_HOLD: 'ON_HOLD',
    REOPENED: 'REOPENED',

    // V2 STATUSES
    SUBMITTED: 'SUBMITTED',
    FORWARDED: 'FORWARDED',
    HOD_VERIFIED: 'HOD_VERIFIED',
    STAFF_RESOLVED: 'STAFF_RESOLVED',
    HOD_APPROVED: 'HOD_APPROVED',
    CLOSED: 'CLOSED',
    REJECTED_BY_ADMIN: 'REJECTED_BY_ADMIN',
    RETURNED_TO_ADMIN: 'RETURNED_TO_ADMIN',
    HOD_REWORK_REQUIRED: 'HOD_REWORK_REQUIRED'

};

const ROLE = {
    STUDENT: 'student',
    STAFF: 'staff',
    HOD: 'hod',
    PRINCIPAL: 'principal',
    ADMIN: 'admin'
};

const ACTION_TYPE = {
    STATUS_CHANGE: 'STATUS_CHANGE',
    COMMENT_ADDED: 'COMMENT_ADDED',
    REOPENED: 'REOPENED',
    REJECTED: 'REJECTED',
    ESCALATED: 'ESCALATED',
    FORWARDED: 'FORWARDED',
    PRIORITY_CHANGED: 'PRIORITY_CHANGED',
    AI_SUGGESTION_APPLIED: 'AI_SUGGESTION_APPLIED'
};

const VISIBILITY = {
    STUDENT_VISIBLE: 'STUDENT_VISIBLE',
    STAFF_ONLY: 'STAFF_ONLY'
};

const FEATURES = {
    AI_PROCESSING_ENABLED: process.env.AI_PROCESSING_ENABLED === 'true', // Master switch for background AI processing
    AI_UI_ENABLED:         process.env.AI_UI_ENABLED === 'true',         // Controls if the frontend shows the AI suggestion panel
    AI_APPLY_ENABLED:      process.env.AI_APPLY_ENABLED === 'true'       // Controls if the backend allows applying AI suggestions
};

module.exports = {
    STATUS,
    ROLE,
    ACTION_TYPE,
    VISIBILITY,
    FEATURES,
    ADMIN_DEPT_ID: 1 // Centralized Admin Queue ID
};
