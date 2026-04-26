/**
 * utils/auditService.js
 * The Footprint Layer: Ensures every sensitive action is traceable.
 */
const { VISIBILITY, ACTION_TYPE } = require('./constants');

/**
 * Maps a normalized lowercase role string to the DB user_role enum value.
 * The user_role enum stores: Admin, HOD, Staff, Student, Principal, StudentHead
 */
function toDbRoleEnum(role) {
    const map = {
        admin: 'Admin',
        hod: 'HOD',
        staff: 'Staff',
        student: 'Student',
        principal: 'Principal',
        studenthead: 'StudentHead',
    };
    const normalized = String(role || '').toLowerCase().trim();
    return map[normalized] || role; // Fallback: pass as-is (handles already-Title-Case input)
}

class AuditService {
    /**
     * Logs an action to the complaint_status_history table.
     * Supports Transactions: Pass an active 'connection' to ensure atomic execution.
     */
    async logAction(connection, {
        complaint_id,
        actor_user_id,
        actor_role,
        action_type = ACTION_TYPE.STATUS_CHANGE,
        from_status = null,
        to_status = null,
        note = null,
        visibility = VISIBILITY.STAFF_ONLY,
        metadata = {},
        req = null // If provided, extracts IP and User Agent
    }) {
        const ip_address = req ? (req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || req.ip) : null;
        const user_agent = req ? req.headers?.['user-agent'] : null;

        const query = `
            INSERT INTO complaint_status_history (
                complaint_id, actor_user_id, actor_role, action_type, 
                from_status, to_status, note, visibility, 
                metadata_json, ip_address, user_agent
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;

        const params = [
            complaint_id,
            actor_user_id,
            toDbRoleEnum(actor_role),  // Normalize to DB enum casing (Admin, HOD, Staff…)
            action_type,
            from_status,
            to_status,
            note,
            visibility,
            JSON.stringify(metadata),
            ip_address,
            user_agent
        ];

        const db = require('../config/db');
        const executor = connection || db;
        return await executor.execute(query, params);
    }
}

module.exports = new AuditService();
