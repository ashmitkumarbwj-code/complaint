/**
 * departmentController.js
 * Handles full CRUD for Department Management System
 * Smart Campus Complaint & Response System
 */

const db = require('../config/db');
const cacheService = require('../utils/cacheService');
const logger = require('../utils/logger');
const ALL_CATEGORIES = ['Noise','Electricity','Mess','Harassment','Infrastructure','Security','Cleanliness','Technical','Faculty','Other'];

// ── GET /api/departments ──────────────────────────────────────────────────────
// Returns all departments with staff count, complaint counts, and categories
exports.getAllDepartments = async (req, res) => {
    try {
        const cached = await cacheService.get(`deps:all:${req.user.tenant_id}`);
        if (cached) return res.json({ success: true, departments: cached });

        const [rows] = await db.tenantExecute(req, `
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
            WHERE 1=1
            GROUP BY d.id
            ORDER BY d.name ASC
        `);

        // Fetch categories for each department (Refactored for Postgres STRING_AGG)
        const [catRows] = await db.tenantExecute(req, `
            SELECT department_id, STRING_AGG(category, ',' ORDER BY category) AS categories
            FROM department_categories
            WHERE 1=1
            GROUP BY department_id
        `);

        const catMap = {};
        catRows.forEach(r => { catMap[r.department_id] = r.categories ? r.categories.split(',') : []; });

        const departments = rows.map(d => ({
            ...d,
            categories: catMap[d.id] || []
        }));

        await cacheService.set(`deps:all:${req.user.tenant_id}`, departments, 3600); 

        res.json({ success: true, departments });
    } catch (error) {
        logger.error('[Dept] getAllDepartments error:', error);
        res.status(500).json({ success: false, message: 'Error fetching departments' });
    }
};

// ── GET /api/departments/stats/all ────────────────────────────────────────────
// Rich per-department stats for Principal dashboard
exports.getAllDeptStats = async (req, res) => {
    try {
        const cached = await cacheService.get(`deps:stats:${req.user.tenant_id}`);
        if (cached) return res.json({ success: true, departments: cached });

        const [rows] = await db.tenantExecute(req, `
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
            WHERE 1=1
            GROUP BY d.id
            ORDER BY d.name ASC
        `);

        const [catRows] = await db.tenantExecute(req, `
            SELECT department_id, STRING_AGG(category, ',' ORDER BY category) AS categories
            FROM department_categories
            WHERE 1=1
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

        await cacheService.set(`deps:stats:${req.user.tenant_id}`, departments, 300); 

        res.json({ success: true, departments });
    } catch (error) {
        logger.error('[Dept] getAllDeptStats error:', error);
        res.status(500).json({ success: false, message: 'Error fetching department stats' });
    }
};

// ── GET /api/departments/:id ──────────────────────────────────────────────────
// Single department with members + categories + stats
exports.getDepartmentById = async (req, res) => {
    const { id } = req.params;
    try {
        const cached = await cacheService.get(`deps:${id}:${req.user.tenant_id}`);
        if (cached) return res.json({ success: true, department: cached });

        const [deptRows] = await db.tenantExecute(req, 'SELECT * FROM departments WHERE id = $1', [id]);
        if (deptRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Department not found' });
        }

        // Get members
        const [members] = await db.tenantExecute(req, `
            SELECT dm.user_id, dm.role_in_dept, dm.assigned_at, u.username, u.email, u.role
            FROM department_members dm
            JOIN users u ON dm.user_id = u.id
            WHERE dm.department_id = $1
            ORDER BY dm.role_in_dept DESC, u.username ASC
        `, [id]);

        // Get categories
        const [cats] = await db.tenantExecute(req, 
            'SELECT category FROM department_categories WHERE department_id = $1', [id]
        );

        // Get complaint stats
        const [stats] = await db.tenantExecute(req, `
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'Pending'     THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress,
                SUM(CASE WHEN status = 'Resolved'    THEN 1 ELSE 0 END) AS resolved
            FROM complaints WHERE department_id = $1
        `, [id]);

        const deptData = {
            ...deptRows[0],
            members,
            categories: cats.map(c => c.category),
            stats: stats[0]
        };

        await cacheService.set(`deps:${id}:${req.user.tenant_id}`, deptData, 600); 

        res.json({ success: true, department: deptData });
    } catch (error) {
        logger.error('[Dept] getDepartmentById error:', error);
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

    const conn = await db.getTransaction();
    try {
        await conn.beginTransaction();

        const [result] = await conn.execute(
            'INSERT INTO departments (tenant_id, name, description, email, head) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [req.user.tenant_id, name.trim(), description || null, email || null, head || null]
        );
        const deptId = result.rows[0].id;

        // Insert category mappings (Refactored for Postgres ON CONFLICT)
        if (Array.isArray(categories) && categories.length > 0) {
            const validCats = categories.filter(c => ALL_CATEGORIES.includes(c));
            if (validCats.length > 0) {
                const placeholders = validCats.map((_, i) => `($1, $2, $${i + 3})`).join(', ');
                const vals = [req.user.tenant_id, deptId, ...validCats];
                await conn.execute(
                    `INSERT INTO department_categories (tenant_id, department_id, category) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
                    vals
                );
            }
        }

        await conn.commit();
        
        await cacheService.invalidate('deps:all');
        await cacheService.invalidate('deps:stats');
        
        res.status(201).json({ success: true, message: `Department "${name}" created successfully`, department_id: deptId });
    } catch (error) {
        await conn.rollback();
        logger.error('[Dept] createDepartment error:', error);
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

    const conn = await db.getTransaction();
    try {
        await conn.beginTransaction();

        // Update basic fields
        await conn.execute(
            'UPDATE departments SET name = $1, description = $2, email = $3, head = $4 WHERE id = $5 AND tenant_id = $6',
            [name, description || null, email || null, head || null, id, req.user.tenant_id]
        );

        // Replace categories
        if (Array.isArray(categories)) {
            await conn.execute('DELETE FROM department_categories WHERE department_id = $1 AND tenant_id = $2', [id, req.user.tenant_id]);
            const validCats = categories.filter(c => ALL_CATEGORIES.includes(c));
            if (validCats.length > 0) {
                const placeholders = validCats.map((_, i) => `($1, $2, $${i + 3})`).join(', ');
                const vals = [req.user.tenant_id, id, ...validCats];
                await conn.execute(
                    `INSERT INTO department_categories (tenant_id, department_id, category) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
                    vals
                );
            }
        }

        await conn.commit();

        await cacheService.invalidate('deps:all');
        await cacheService.invalidate('deps:stats');
        await cacheService.invalidate(`deps:${id}`);

        res.json({ success: true, message: 'Department updated successfully' });
    } catch (error) {
        await conn.rollback();
        logger.error('[Dept] updateDepartment error:', error);
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
        const [userRows] = await db.tenantExecute(req, 
            "SELECT id, username, role FROM users WHERE id = $1 AND role IN ('Staff','HOD')",
            [user_id]
        );
        if (userRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Staff user not found' });
        }

        // Refactored for Postgres UPSERT
        await db.tenantExecute(req, 
            'INSERT INTO department_members (tenant_id, department_id, user_id, role_in_dept) VALUES ($1, $2, $3, $4) ON CONFLICT (tenant_id, department_id, user_id) DO UPDATE SET role_in_dept = EXCLUDED.role_in_dept',
            [req.user.tenant_id, id, user_id, role_in_dept || 'Staff']
        );

        await cacheService.invalidate('deps:all');
        await cacheService.invalidate('deps:stats');
        await cacheService.invalidate(`deps:${id}`);

        res.json({ success: true, message: `${userRows[0].username} added to department` });
    } catch (error) {
        logger.error('[Dept] addMember error:', error);
        res.status(500).json({ success: false, message: 'Error adding member' });
    }
};

// ── DELETE /api/departments/:id/members/:user_id ──────────────────────────────
// Admin removes a staff member from a department
exports.removeMember = async (req, res) => {
    const { id, user_id } = req.params;
    try {
        const [dbResult, result] = await db.tenantExecute(req, 
            'DELETE FROM department_members WHERE department_id = $1 AND user_id = $2',
            [id, user_id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Member not found in this department' });
        }
        
        await cacheService.invalidate('deps:all');
        await cacheService.invalidate('deps:stats');
        await cacheService.invalidate(`deps:${id}`);

        res.json({ success: true, message: 'Member removed from department' });
    } catch (error) {
        logger.error('[Dept] removeMember error:', error);
        res.status(500).json({ success: false, message: 'Error removing member' });
    }
};

// ── GET /api/departments/available-staff ─────────────────────────────────────
// Returns all Staff/HOD users for the member-add dropdown
exports.getAvailableStaff = async (req, res) => {
    try {
        const [rows] = await db.tenantExecute(req, 
            "SELECT id, username, email, role FROM users WHERE role IN ('staff','hod') AND is_verified = 1 ORDER BY username ASC"
        );
        res.json({ success: true, staff: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching staff' });
    }
};
