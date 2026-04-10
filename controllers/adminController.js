const db = require('../config/db');
const crypto = require('crypto');
const notifier = require('../utils/notificationService');
const socketService = require('../utils/socketService');
const logger = require('../utils/logger');

/**
 * Admin Adds Staff Member
 */
exports.addStaff = async (req, res) => {
    const { name, email, mobile, department_id, role } = req.body;
    const tenantId = req.user?.tenant_id || 1;

    try {
        // 1. Check if staff already exists in master or users (Tenant-Scoped)
        const [existingStaff] = await db.tenantExecute(req, 'SELECT * FROM verified_staff WHERE email = ?', [email]);
        if (existingStaff.length > 0) {
            return res.status(400).json({ success: false, message: 'Staff with this email already exists in master verification' });
        }

        const [existingUser] = await db.tenantExecute(req, 'SELECT * FROM users WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            return res.status(400).json({ success: false, message: 'A user with this email already exists' });
        }

        // 2. Insert into verified_staff (Tenant-Scoped)
        await db.tenantExecute(req,
            'INSERT INTO verified_staff (tenant_id, name, email, mobile_number, department_id, role) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.tenant_id, name, email, mobile, department_id, role]
        );

        // 3. Send Activation/Welcome Email
        const baseUrl = process.env.BASE_URL || `http://${req.get('host')}`;
        const loginUrl = `${baseUrl}/login.html?role=${role}`;
        
        await notifier.sendEmail(
            email, 
            `Welcome to Smart Campus - Activate your ${role} Portal`, 
            `Hello ${name},\n\nYour ${role} account has been authorized by the Admin.\n\nPlease visit the link below, click "Activate Account", and verify your registered mobile number (${mobile}) via OTP to set your password:\n\n${loginUrl}\n\nWelcome aboard!`
        );

        res.json({ success: true, message: `${role} member added successfully. Verification link sent to ${email}` });
    } catch (error) {
        logger.error('[Admin] addStaff error:', error);
        res.status(500).json({ success: false, message: 'Server error while adding staff' });
    }
};

/**
 * Get All Staff (for Admin Dashboard)
 */
exports.getAllStaff = async (req, res) => {
    try {
        const [rows] = await db.tenantExecute(req, `
            SELECT sm.*, d.name as department_name 
            FROM verified_staff sm
            LEFT JOIN departments d ON sm.department_id = d.id
            WHERE 1=1
            ORDER BY sm.created_at DESC
        `);
        res.json({ success: true, staff: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching staff' });
    }
};
/**
 * Get All Departments
 */
exports.getDepartments = async (req, res) => {
    try {
        const [rows] = await db.tenantExecute(req, 'SELECT * FROM departments ORDER BY name ASC');
        res.json({ success: true, departments: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching departments' });
    }
};

/**
 * Get All Verified Students (Master Registry)
 */
exports.getAllStudents = async (req, res) => {
    try {
        const [rows] = await db.tenantExecute(req, 'SELECT * FROM verified_students ORDER BY created_at DESC');
        res.json({ success: true, students: rows });
    } catch (error) {
        logger.error('[Admin] getAllStudents error:', error);
        res.status(500).json({ success: false, message: 'Error fetching students registry' });
    }
};

/**
 * Admin Adds Student to Master Registry
 */
exports.addStudent = async (req, res) => {
    const { roll_number, department, year, mobile_number, email, id_card_image } = req.body;
    const tenantId = req.user?.tenant_id || 1;

    try {
        const [existing] = await db.tenantExecute(req, 'SELECT * FROM verified_students WHERE roll_number = ?', [roll_number]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Student with this roll number already exists in registry' });
        }

        await db.tenantExecute(req,
            'INSERT INTO verified_students (tenant_id, roll_number, department, year, mobile_number, email, id_card_image) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.user.tenant_id, roll_number, department, year, mobile_number, email, id_card_image || null]
        );

        res.json({ success: true, message: 'Student added to verification registry successfully' });
    } catch (error) {
        logger.error('[Admin] addStudent error:', error);
        res.status(500).json({ success: false, message: 'Server error while adding student' });
    }
};

/**
 * Admin Updates Complaint Status
 */
exports.updateComplaintStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const tenantId = req.user?.tenant_id || 1;

    try {
        // 1. Update database
        const query = 'UPDATE complaints SET status = ?, resolved_at = ? WHERE id = ?';
        const resolvedAt = (status === 'Resolved' || status === 'resolved') ? new Date() : null;
        
        const [result] = await db.tenantExecute(req, query, [status, resolvedAt, id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Complaint not found' });
        }

        // 2. Fetch student_id and category for notifications
        const [compRows] = await db.tenantExecute(req, 'SELECT student_id, category FROM complaints WHERE id = ?', [id]);
        if (compRows.length > 0) {
            const { student_id, category } = compRows[0];
            
            // Real-time update via Socket.io
            socketService.emitStatusUpdate(id, status, student_id);

            // Notify Student via email
            try {
                const [userRows] = await db.tenantExecute(req, `
                    SELECT email FROM users 
                    JOIN students ON users.id = students.user_id 
                    WHERE students.id = ?
                `, [student_id]);
                
                if (userRows.length > 0) {
                    notifier.notifyStudent(userRows[0].email, id, status);
                }
            } catch (notifierErr) {
                logger.warn('[Admin] Status notification failed:', notifierErr);
            }
        }

        res.json({ 
            success: true, 
            message: `Complaint ${status} successfully` 
        });
    } catch (error) {
        logger.error('[Admin] updateComplaintStatus error:', error);
        res.status(500).json({ success: false, message: 'Server error while updating complaint status' });
    }
};

/**
 * Admin Manually Forwards (Reassigns) a Complaint to a Different Department
 * Used as a fallback when smart auto-routing picks the wrong department.
 */
exports.forwardComplaint = async (req, res) => {
    const { id } = req.params;
    const { department_id, admin_notes } = req.body;
    const tenantId = req.user?.tenant_id || 1;

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // 1. Verify department exists
        const [deptRows] = await conn.execute('SELECT id, name FROM departments WHERE id = ? AND tenant_id = ?', [department_id, req.user.tenant_id]);
        if (deptRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Department not found' });
        }

        // 2. Verify complaint exists and get current state
        const [compRows] = await conn.execute(
            'SELECT id, student_id, category, department_id FROM complaints WHERE id = ? AND tenant_id = ?', [id, req.user.tenant_id]
        );
        if (compRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Complaint not found' });
        }

        const complaint = compRows[0];

        // 3. Reassign department, reset status, save notes
        await conn.execute(
            `UPDATE complaints 
             SET department_id = ?, status = 'Pending', admin_notes = ?, resolved_at = NULL 
             WHERE id = ? AND tenant_id = ?`,
            [department_id, admin_notes || null, id, req.user.tenant_id]
        );

        // 4. Audit Trail Logic
        await conn.execute(
            'UPDATE complaint_departments SET is_current = 0 WHERE complaint_id = ? AND tenant_id = ?',
            [id, req.user.tenant_id]
        );

        // Insert new assignment record
        await conn.execute(
            `INSERT INTO complaint_departments (tenant_id, complaint_id, department_id, assigned_by, notes, is_current) 
             VALUES (?, ?, ?, ?, ?, 1)`,
            [req.user.tenant_id, id, department_id, req.user.id, admin_notes || 'Manual reassignment by Admin']
        );

        await conn.commit();

        // 5. Emit real-time socket update
        socketService.emitStatusUpdate(id, 'Pending', complaint.student_id);

        // 6. Notify student
        try {
            const [userRows] = await db.execute(
                `SELECT u.email FROM users u
                 JOIN students s ON u.id = s.user_id
                 WHERE s.id = ?`,
                [complaint.student_id]
            );
            if (userRows.length > 0) {
                notifier.sendEmail(
                    userRows[0].email,
                    `Complaint #${id} Forwarded to New Department`,
                    `Your complaint (#${id}) regarding "${complaint.category}" has been manually reviewed and forwarded to the ${deptRows[0].name} department for resolution. We apologise for any inconvenience.`
                );
            }
        } catch (notifierErr) {
            logger.warn('[Admin] Forward notification failed:', notifierErr);
        }

        res.json({
            success: true,
            message: `Complaint #${id} forwarded to ${deptRows[0].name} successfully`
        });
    } catch (error) {
        if (conn) await conn.rollback();
        logger.error('[Admin] forwardComplaint error:', error);
        res.status(500).json({ success: false, message: 'Server error while forwarding complaint' });
    } finally {
        if (conn) conn.release();
    }
};
