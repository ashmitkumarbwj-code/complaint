/**
 * utils/constants.js
 * The Law Book of canonical strings.
 */

const STATUS = {
    PENDING: 'Pending',
    IN_PROGRESS: 'In Progress',
    RESOLVED: 'Resolved',
    REJECTED: 'Rejected',
    ESCALATED: 'Escalated',
    ON_HOLD: 'On Hold',
    REOPENED: 'Reopened'
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
    PRIORITY_CHANGED: 'PRIORITY_CHANGED'
};

const VISIBILITY = {
    STUDENT_VISIBLE: 'STUDENT_VISIBLE',
    STAFF_ONLY: 'STAFF_ONLY'
};

module.exports = {
    STATUS,
    ROLE,
    ACTION_TYPE,
    VISIBILITY
};
