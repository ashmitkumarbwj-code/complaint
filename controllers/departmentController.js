/**
 * departmentController.js
 * Handles full CRUD for Department Management System
 * Smart Campus Complaint & Response System
 */

const db = require('../config/db');
const ALL_CATEGORIES = ['Noise','Electricity','Mess','Harassment','Infrastructure','Security','Cleanliness','Technical','Faculty','Other'];

// ── GET /api/departments ──────────────────────────────────────────────────────
// Returns all departments with staff count, complaint counts, and categories
exports.getAllDepartments = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT
                d.id,
                d.name,
                d.description,
                d.email,
                d.head,
                COUNT(DISTINCT dm.user_id) AS staff_count,
                COUNT(DISTINCT c.id)        AS total_complaints,
                SUM(CASE WHEN c.status = 'Pending'     THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN c.status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress,
                SUM(CASE WHEN c.status = 'Resolved'    THEN 1 ELSE 0 END) AS resolved
            FROM departments d
            LEFT JOIN department_members dm ON d.id = dm.department_id
            LEFT JOIN complaints          c  ON d.id = c.department_id
            GROUP BY d.id
            ORDER BY d.name ASC
        `);

        // Fetch categories for each department
        const [catRows] = await db.execute(`
            SELECT department_id, GROUP_CONCAT(category ORDER BY category SEPARATOR ',') AS categories
            FROM department_categories
            GROUP BY department_id
        `);

        const catMap = {};
        catRows.forEach(r => { catMap[r.department_id] = r.categories ? r.categories.split(',') : []; });

        const departments = rows.map(d => ({
            ...d,
            categories: catMap[d.id] || []
        }));

        res.json({ success: true, departments });
    } catch (error) {
        console.error('[Dept] getAllDepartments error:', error);
        res.status(500).json({ success: false, message: 'Error fetching departments' });
    }
};

// ── GET /api/departments/stats/all ────────────────────────────────────────────
// Rich per-department stats for Principal dashboard
exports.getAllDeptStats = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT
                d.id,
                d.name,
                d.description,
                COUNT(DISTINCT dm.user_id)  AS staff_count,
                COUNT(DISTINCT c.id)         AS total_complaints,
                SUM(CASE WHEN c.status = 'Pending'     THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN c.status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress,
                SUM(CASE WHEN c.status = 'Resolved'    THEN 1 ELSE 0 END) AS resolved,
                SUM(CASE WHEN c.status = 'Rejected'    THEN 1 ELSE 0 END) AS rejected
            FROM departments d
            LEFT JOIN department_members dm ON d.id = dm.department_id
            LEFT JOIN complaints          c  ON d.id = c.department_id
            GROUP BY d.id
            ORDER BY d.name ASC
        `);

        const [catRows] = await db.execute(`
            SELECT department_id, GROUP_CONCAT(category ORDER BY category SEPARATOR ',') AS categories
            FROM department_categories
            GROUP BY department_id
        `);

        const catMap = {};
        catRows.forEach(r => { catMap[r.department_id] = r.categories ? r.categories.split(',') : []; });

        const departments = rows.map(d => {
            const total = d.total_complaints || 0;
            const resolved = d.resolved || 0;
            return {
                ...d,
                categories: catMap[d.id] || [],
                resolution_pct: total > 0 ? Math.round((resolved / total) * 100) : 0
            };
        });

        res.json({ success: true, departments });
    } catch (error) {
        console.error('[Dept] getAllDeptStats error:', error);
        res.status(500).json({ success: false, message: 'Error fetching department stats' });
    }
};

// ── GET /api/departments/:id ──────────────────────────────────────────────────
// Single department with members + categories + stats
exports.getDepartmentById = async (req, res) => {
    const { id } = req.params;
    try {
        const [deptRows] = await db.execute('SELECT * FROM departments WHERE id = ?', [id]);
        if (deptRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Department not found' });
        }

        // Get members
        const [members] = await db.execute(`
            SELECT dm.user_id, dm.role_in_dept, dm.assigned_at, u.username, u.email, u.role
            FROM department_members dm
            JOIN users u ON dm.user_id = u.id
            WHERE dm.department_id = ?
            ORDER BY dm.role_in_dept DESC, u.username ASC
        `, [id]);

        // Get categories
        const [cats] = await db.execute(
            'SELECT category FROM department_categories WHERE department_id = ?', [id]
        );

        // Get complaint stats
        const [stats] = await db.execute(`
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'Pending'     THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress,
                SUM(CASE WHEN status = 'Resolved'    THEN 1 ELSE 0 END) AS resolved
            FROM complaints WHERE department_id = ?
        `, [id]);

        res.json({
            success: true,
            department: {
                ...deptRows[0],
                members,
                categories: cats.map(c => c.category),
                stats: stats[0]
            }
        });
    } catch (error) {
        console.error('[Dept] getDepartmentById error:', error);
        res.status(500).json({ success: false, message: 'Error fetching department' });
    }
};

// ── POST /api/departments ─────────────────────────────────────────────────────
// Admin creates a new department
exports.createDepartment = async (req, res) => {
    const { name, description, email, head, categories } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Department name is required' });
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [result] = await conn.execute(
            'INSERT INTO departments (name, description, email, head) VALUES (?, ?, ?, ?)',
            [name.trim(), description || null, email || null, head || null]
        );
        const deptId = result.insertId;

        // Insert category mappings
        if (Array.isArray(categories) && categories.length > 0) {
            const validCats = categories.filter(c => ALL_CATEGORIES.includes(c));
            if (validCats.length > 0) {
                const placeholders = validCats.map(() => '(?, ?)').join(', ');
                const vals = validCats.flatMap(c => [deptId, c]);
                await conn.execute(
                    `INSERT IGNORE INTO department_categories (department_id, category) VALUES ${placeholders}`,
                    vals
                );
            }
        }

        await conn.commit();
        res.status(201).json({ success: true, message: `Department "${name}" created successfully`, department_id: deptId });
    } catch (error) {
        await conn.rollback();
        console.error('[Dept] createDepartment error:', error);
        res.status(500).json({ success: false, message: 'Error creating department' });
    } finally {
        conn.release();
    }
};

// ── PUT /api/departments/:id ──────────────────────────────────────────────────
// Admin edits department details + replaces categories
exports.updateDepartment = async (req, res) => {
    const { id } = req.params;
    const { name, description, email, head, categories } = req.body;

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Update basic fields
        await conn.execute(
            'UPDATE departments SET name = ?, description = ?, email = ?, head = ? WHERE id = ?',
            [name, description || null, email || null, head || null, id]
        );

        // Replace categories
        if (Array.isArray(categories)) {
            await conn.execute('DELETE FROM department_categories WHERE department_id = ?', [id]);
            const validCats = categories.filter(c => ALL_CATEGORIES.includes(c));
            if (validCats.length > 0) {
                const placeholders = validCats.map(() => '(?, ?)').join(', ');
                const vals = validCats.flatMap(c => [id, c]);
                await conn.execute(
                    `INSERT IGNORE INTO department_categories (department_id, category) VALUES ${placeholders}`,
                    vals
                );
            }
        }

        await conn.commit();
        res.json({ success: true, message: 'Department updated successfully' });
    } catch (error) {
        await conn.rollback();
        console.error('[Dept] updateDepartment error:', error);
        res.status(500).json({ success: false, message: 'Error updating department' });
    } finally {
        conn.release();
    }
};

// ── POST /api/departments/:id/members ─────────────────────────────────────────
// Admin assigns a staff member to a department
exports.addMember = async (req, res) => {
    const { id } = req.params;
    const { user_id, role_in_dept } = req.body;

    if (!user_id) {
        return res.status(400).json({ success: false, message: 'user_id is required' });
    }

    try {
        // Verify user exists and is Staff/HOD
        const [userRows] = await db.execute(
            "SELECT id, username, role FROM users WHERE id = ? AND role IN ('Staff','HOD')",
            [user_id]
        );
        if (userRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Staff user not found' });
        }

        await db.execute(
            'INSERT INTO department_members (department_id, user_id, role_in_dept) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role_in_dept = VALUES(role_in_dept)',
            [id, user_id, role_in_dept || 'Staff']
        );

        res.json({ success: true, message: `${userRows[0].username} added to department` });
    } catch (error) {
        console.error('[Dept] addMember error:', error);
        res.status(500).json({ success: false, message: 'Error adding member' });
    }
};

// ── DELETE /api/departments/:id/members/:user_id ──────────────────────────────
// Admin removes a staff member from a department
exports.removeMember = async (req, res) => {
    const { id, user_id } = req.params;
    try {
        const [result] = await db.execute(
            'DELETE FROM department_members WHERE department_id = ? AND user_id = ?',
            [id, user_id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Member not found in this department' });
        }
        res.json({ success: true, message: 'Member removed from department' });
    } catch (error) {
        console.error('[Dept] removeMember error:', error);
        res.status(500).json({ success: false, message: 'Error removing member' });
    }
};

// ── GET /api/departments/available-staff ─────────────────────────────────────
// Returns all Staff/HOD users for the member-add dropdown
exports.getAvailableStaff = async (req, res) => {
    try {
        const [rows] = await db.execute(
            "SELECT id, username, email, role FROM users WHERE role IN ('Staff','HOD') AND is_verified = 1 ORDER BY username ASC"
        );
        res.json({ success: true, staff: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching staff' });
    }
};
