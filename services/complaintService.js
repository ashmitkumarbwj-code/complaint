const db = require('../config/db');

class ComplaintService {
    /**
     * Check if a student has exceeded the complaint limit
     */
    async checkSpam(studentId, tenantId) {
        const MAX_COMPLAINTS_PER_HOUR = 5;
        const [spamRows] = await db.execute(
            'SELECT COUNT(*) as count FROM complaints WHERE student_id = ? AND tenant_id = ? AND created_at > NOW() - INTERVAL 1 HOUR',
            [studentId, tenantId]
        );
        return spamRows[0].count >= MAX_COMPLAINTS_PER_HOUR;
    }

    /**
     * Get auto-routing department for a category
     */
    async getTargetDepartment(category, tenantId) {
        const [rows] = await db.execute(
            'SELECT department_id FROM department_categories WHERE category = ? AND tenant_id = ? LIMIT 1',
            [category, tenantId]
        );
        return rows.length > 0 ? rows[0].department_id : 1; // 1 = College Administration (fallback)
    }

    /**
     * Submit a new complaint
     */
    async submitComplaint(complaintData, tenantId) {
        const { student_id, title, department_id, category, description, location, priority, local_file_path } = complaintData;
        const [result] = await db.tenantExecute({ user: { tenant_id: tenantId } },
            `INSERT INTO complaints (tenant_id, student_id, title, department_id, category, description, location, priority, local_file_path) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [tenantId, student_id, title, department_id, category, description, location, priority, local_file_path || null]
        );
        return result.insertId;
    }

    /**
     * Get complaints with pagination and filters
     * Triple-Lock: Tenant + Role + Ownership/Membership
     */
    async getComplaints(filters, tenantId, user) {
        const { page = 1, limit = 10, status, department_id, student_id } = filters;
        const offset = (page - 1) * limit;
        const { role, staff_id, student_id: sessionStudentId } = user;

        let query = `
            SELECT c.*, d.name as department_name, u.username as student_name
            FROM complaints c
            JOIN departments d ON c.department_id = d.id
            JOIN students s ON c.student_id = s.id
            JOIN users u ON s.user_id = u.id
            WHERE c.tenant_id = ?
        `;
        const params = [tenantId];

        // 1. Ownership/Membership Enforcement (The Lock)
        if (role === 'Student') {
            query += ' AND c.student_id = ?';
            params.push(sessionStudentId);
        } else if (role === 'Staff' || role === 'HOD') {
            // Staff can only see complaints assigned to departments they belong to
            query += ` AND c.department_id IN (
                SELECT department_id FROM department_members WHERE user_id = ?
            )`;
            params.push(user.id);
        }
        // Admin/Principal have no extra filters within the tenant

        // 2. User-applied Filters
        if (status) {
            query += ' AND c.status = ?';
            params.push(status);
        }
        if (department_id) {
            query += ' AND c.department_id = ?';
            params.push(department_id);
        }
        if (student_id && ['Admin', 'Principal'].includes(role)) {
            // Only Admins can filter by OTHER students' IDs
            query += ' AND c.student_id = ?';
            params.push(student_id);
        }

        query += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [rows] = await db.execute(query, params);

        // Anonymity Logic
        const canSeeRealNames = ['Admin', 'Principal', 'HOD'].includes(role);
        const data = rows.map(c => {
            // Only hide names if not Admin/Principal/HOD AND it's not the student's own complaint
            if (!canSeeRealNames && c.student_id !== sessionStudentId) {
                return { ...c, student_name: 'Anonymous Student', student_id: 'HIDDEN' };
            }
            return c;
        });
        
        // Get total count (must apply same filters)
        let countQuery = `
            SELECT COUNT(*) as total FROM complaints c 
            WHERE c.tenant_id = ?
        `;
        const countParams = [tenantId];

        if (role === 'Student') {
            countQuery += ' AND c.student_id = ?';
            countParams.push(sessionStudentId);
        } else if (role === 'Staff' || role === 'HOD') {
            countQuery += ` AND c.department_id IN (
                SELECT department_id FROM department_members WHERE user_id = ?
            )`;
            countParams.push(user.id);
        }

        if (status) { countQuery += ' AND c.status = ?'; countParams.push(status); }
        if (department_id) { countQuery += ' AND c.department_id = ?'; countParams.push(department_id); }
        
        const [countRows] = await db.execute(countQuery, countParams);

        return {
            data: data,
            pagination: {
                total: countRows[0].total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(countRows[0].total / limit)
            }
        };
    }


    /**
     * Update complaint status
     */
    async updateStatus(complaintId, status, tenantId) {
        const [result] = await db.execute(
            'UPDATE complaints SET status = ? WHERE id = ? AND tenant_id = ?',
            [status, complaintId, tenantId]
        );
        return result.affectedRows > 0;
    }
}

module.exports = new ComplaintService();
