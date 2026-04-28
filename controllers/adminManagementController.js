'use strict';
const db = require('../config/db');

/**
 * Audit Log Helper
 */
async function logAction(adminId, action, targetType, targetId, details) {
    try {
        await db.execute(
            'INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)',
            [adminId, action, targetType, targetId, JSON.stringify(details)]
        );
    } catch (e) {
        console.error('[AUDIT ERROR]', e.message);
    }
}

/**
 * List all users with filtering and sorting
 */
exports.listUsers = async (req, res) => {
    try {
        const { role, department_id, search, sortField, sortOrder } = req.query;
        const tenantId = db.getTenantId(req) || 1;

        let students = [];
        let staff = [];

        // 1. Fetch Students
        if (!role || role.toLowerCase() === 'student') {
            let q = "SELECT id, roll_number as identifier, full_name as name, email, mobile, department as dept_name, 'Student' as role, is_active FROM verified_students WHERE tenant_id = $1";
            const params = [tenantId];
            if (search) {
                q += ' AND (full_name ILIKE $2 OR roll_number ILIKE $2 OR mobile ILIKE $2)';
                params.push(`%${search}%`);
            }
            const [rows] = await db.execute(q, params);
            students = rows.map(r => ({ ...r, type: 'student' }));
        }

        // 2. Fetch Staff
        if (!role || role.toLowerCase() !== 'student') {
            let q = `
                SELECT s.id, s.email as identifier, s.name, s.email, s.mobile, d.name as dept_name, s.role, s.is_active, s.department_id
                FROM verified_staff s
                LEFT JOIN departments d ON s.department_id = d.id
                WHERE s.tenant_id = $1
            `;
            const params = [tenantId];
            if (role) {
                q += ' AND LOWER(s.role::text) = $2';
                params.push(role.toLowerCase());
            }
            if (department_id) {
                q += ` AND s.department_id = $${params.length + 1}`;
                params.push(department_id);
            }
            if (search) {
                q += ` AND (s.name ILIKE $${params.length + 1} OR s.email ILIKE $${params.length + 1} OR s.mobile ILIKE $${params.length + 1})`;
                params.push(`%${search}%`);
            }
            const [rows] = await db.execute(q, params);
            staff = rows.map(r => ({ ...r, type: 'staff' }));
        }

        let allUsers = [...students, ...staff];

        // 3. Sorting
        const field = sortField || 'name';
        const order = sortOrder === 'desc' ? -1 : 1;
        allUsers.sort((a, b) => {
            const valA = (a[field] || '').toString().toLowerCase();
            const valB = (b[field] || '').toString().toLowerCase();
            if (valA < valB) return -1 * order;
            if (valA > valB) return 1 * order;
            return 0;
        });

        res.json({ success: true, count: allUsers.length, users: allUsers });
    } catch (error) {
        console.error('listUsers error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
};

/**
 * Add a new user to registry
 */
exports.addUser = async (req, res) => {
    const { name, mobile, email, role, department_id, roll_number, dept_name } = req.body;
    const adminId = req.user.id;
    const tenantId = db.getTenantId(req) || 1;

    try {
        if (role.toLowerCase() === 'student') {
            const [resRows] = await db.execute(
                'INSERT INTO verified_students (tenant_id, roll_number, full_name, email, mobile, department) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                [tenantId, roll_number, name, email, mobile, dept_name]
            );
            const newId = resRows[0].id;
            await logAction(adminId, 'ADD_USER', 'verified_students', newId, req.body);
            return res.json({ success: true, message: 'Student added to registry', id: newId });
        } else {
            if (!department_id) {
                return res.status(400).json({ success: false, message: 'Assign department before activation' });
            }
            const [resRows] = await db.execute(
                'INSERT INTO verified_staff (tenant_id, name, email, mobile, role, department_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                [tenantId, name, email, mobile, role, department_id]
            );
            const newId = resRows[0].id;
            await logAction(adminId, 'ADD_USER', 'verified_staff', newId, req.body);
            return res.json({ success: true, message: 'Staff added to registry', id: newId });
        }
    } catch (error) {
        console.error('addUser error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to add user' });
    }
};

/**
 * Update user in registry
 */
exports.updateUser = async (req, res) => {
    const { id, type } = req.params;
    const { name, mobile, email, role, department_id, is_active } = req.body;
    const adminId = req.user.id;

    try {
        const table = type === 'student' ? 'verified_students' : 'verified_staff';
        const fields = [];
        const params = [];

        if (name) { 
            const nameField = type === 'student' ? 'full_name' : 'name';
            fields.push(`${nameField} = $${fields.length + 1}`); 
            params.push(name); 
        }
        if (mobile) { fields.push(`mobile = $${fields.length + 1}`); params.push(mobile); }
        if (email) { fields.push(`email = $${fields.length + 1}`); params.push(email); }
        if (role) { fields.push(`role = $${fields.length + 1}`); params.push(role); }
        if (department_id !== undefined) { fields.push(`department_id = $${fields.length + 1}`); params.push(department_id); }
        if (is_active !== undefined) { fields.push(`is_active = $${fields.length + 1}`); params.push(is_active); }

        if (fields.length === 0) return res.status(400).json({ success: false, message: 'No fields to update' });

        params.push(id);
        const q = `UPDATE ${table} SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING id`;
        
        const [rows] = await db.execute(q, params);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

        await logAction(adminId, 'UPDATE_USER', table, id, req.body);
        res.json({ success: true, message: 'User updated successfully' });
    } catch (error) {
        console.error('updateUser error:', error);
        res.status(500).json({ success: false, message: 'Failed to update user' });
    }
};

/**
 * Soft delete (Deactivate)
 */
exports.deleteUser = async (req, res) => {
    const { id, type } = req.params;
    const adminId = req.user.id;

    try {
        const table = type === 'student' ? 'verified_students' : 'verified_staff';
        await db.execute(`UPDATE ${table} SET is_active = FALSE WHERE id = $1`, [id]);
        await logAction(adminId, 'SOFT_DELETE', table, id, { is_active: false });
        res.json({ success: true, message: 'User deactivated successfully' });
    } catch (error) {
        console.error('deleteUser error:', error);
        res.status(500).json({ success: false, message: 'Failed to deactivate user' });
    }
};

/**
 * Get Audit Logs
 */
exports.getAuditLogs = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT a.*, u.full_name as admin_name 
            FROM admin_audit_logs a
            JOIN users u ON a.admin_id = u.id
            ORDER BY a.created_at DESC
            LIMIT 100
        `);
        res.json({ success: true, logs: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch logs' });
    }
};
