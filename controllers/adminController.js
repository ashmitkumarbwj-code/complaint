const db = require('../config/db');
const crypto = require('crypto');
const notifier = require('../utils/notificationService');
const socketService = require('../utils/socketService');
const logger = require('../utils/logger');
const studentImportService = require('../services/studentImportService');
const staffImportService = require('../services/staffImportService');

/**
 * Admin Adds Staff Member
 */
exports.addStaff = async (req, res) => {
    const { name, email, mobile, department_id, role } = req.body;
    const tenantId = req.user?.tenant_id || 1;

    try {
        // 1. Check if staff already exists in master or users (Tenant-Scoped)
        const [existingStaff] = await db.tenantExecute(req, 'SELECT * FROM verified_staff WHERE email = $1', [email]);
        if (existingStaff.length > 0) {
            return res.status(400).json({ success: false, message: 'Staff with this email already exists in master verification' });
        }

        const [existingUser] = await db.tenantExecute(req, 'SELECT * FROM users WHERE email = $1', [email]);
        if (existingUser.length > 0) {
            return res.status(400).json({ success: false, message: 'A user with this email already exists' });
        }

        // 2. Insert into verified_staff (Tenant-Scoped)
        await db.tenantExecute(req,
            'INSERT INTO verified_staff (tenant_id, name, email, mobile_number, department_id, role) VALUES ($1, $2, $3, $4, $5, $6)',
            [req.user.tenant_id, name, email, mobile, department_id, role]
        );

        // 3. Send Activation/Welcome Email
        const baseUrl = process.env.BASE_URL || `http://${req.get('host')}`;
        const loginUrl = `${baseUrl}/login.html?role=${role.toLowerCase()}`;
        
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
            ORDER BY sm.name ASC
        `, [], 'sm');
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    try {
        const [countResult] = await db.tenantExecute(req, 'SELECT COUNT(*) as count FROM verified_students');
        const total = parseInt(countResult[0].count);

        const [rows] = await db.tenantExecute(req, 
            'SELECT * FROM verified_students ORDER BY roll_number ASC LIMIT $1 OFFSET $2',
            [limit, offset]
        );

        res.json({ 
            success: true, 
            students: rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('[Admin] getAllStudents error:', error);
        res.status(500).json({ success: false, message: 'Error fetching students registry' });
    }
};

/**
 * Admin Adds Student to Master Registry
 */
exports.addStudent = async (req, res) => {
    const { roll_number, name, department, year, mobile_number, email, id_card_image } = req.body;
    const tenantId = req.user?.tenant_id || 1;

    try {
        const [existing] = await db.tenantExecute(req, 'SELECT * FROM verified_students WHERE roll_number = $1', [roll_number]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Student with this roll number already exists in registry' });
        }

        await db.tenantExecute(req,
            'INSERT INTO verified_students (tenant_id, roll_number, name, department, year, mobile_number, email, id_card_image) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [req.user.tenant_id, roll_number, name, department, year, mobile_number, email, id_card_image || null]
        );

        res.json({ success: true, message: 'Student added to verification registry successfully' });
    } catch (error) {
        logger.error('[Admin] addStudent error:', error);
        res.status(500).json({ success: false, message: 'Server error while adding student' });
    }
};

/**
 * Admin Updates Complaint Status
 * DEPRECATED: Redirects to unified complaintService.updateStatus
 */
exports.updateComplaintStatus = async (req, res) => {
    const complaintController = require('./complaintController');
    // Map params to match complaintController's expectation
    req.body.action_type = 'LEGACY_ADMIN_UPDATE';
    return complaintController.updateStatus(req, res);
};

/**
 * Admin Manually Forwards (Reassigns) a Complaint to a Different Department
 */
exports.forwardComplaint = async (req, res) => {
    const { id } = req.params;
    const { department_id, admin_notes } = req.body;
    
    try {
        const complaintService = require('../services/complaintService');
        const result = await complaintService.updateStatus(req, {
            complaintId: id,
            newStatus: 'FORWARDED',
            reason: admin_notes || `Manual reassignment to Department ${department_id}`,
            targetDeptId: department_id
        });

        if (!result.noOp) {
            const socketService = require('../utils/socketService');
            socketService.emitStatusUpdate(id, 'FORWARDED', null, department_id); // student_id will be handled correctly by clients reading status
        }

        res.json({
            success: true,
            message: `Complaint #${id} forwarded successfully`
        });
    } catch (error) {
        logger.error('[Admin] forwardComplaint error:', error);
        
        const errorMap = {
            'COMPLAINT_NOT_FOUND': { status: 404, msg: 'Complaint not found.' },
            'INVALID_TRANSITION': { status: 400, msg: 'Invalid status transition.' }
        };

        const canned = errorMap[error.message];
        if (canned) {
            return res.status(canned.status).json({ success: false, message: canned.msg });
        }
        res.status(500).json({ success: false, message: 'Server error while forwarding complaint' });
    }
};

/**
 * Bulk Import Students from CSV
 *
 * Expects: multipart/form-data with a file field named "csv"
 *
 * Rules:
 *  - Strict department matching (must exactly match DB value)
 *  - Skip duplicate roll numbers (no overwrite)
 *  - Create Firebase disabled accounts + send activation emails
 *
 * Returns JSON summary:
 *  { total, inserted, duplicates, invalid, emailsQueued, emailsFailed }
 */
/**
 * Bulk Import Students
 * Supports: 
 *  1. multipart/form-data (CSV file named "csv")
 *  2. application/json (body.students = array of student objects)
 */
exports.bulkImportStudents = async (req, res) => {
    const isDryRun = req.body.isDryRun === true;
    const filename = req.body.filename || (req.file ? req.file.originalname : 'manual_json_upload.json');
    const adminId = req.user.id;
    const tenantId = req.user.tenant_id || 1;

    try {
        let summary;
        
        // 1. Check for JSON payload first (from new UI)
        if (req.body.students && Array.isArray(req.body.students)) {
            summary = await studentImportService.bulkImportStudents(req.body.students, req, true, isDryRun);
        } 
        // 2. Fallback to CSV Upload (Legacy/Direct)
        else if (req.file && req.file.buffer) {
            summary = await studentImportService.bulkImportStudents(req.file.buffer, req, false, isDryRun);
        } else {
            return res.status(400).json({ success: false, message: 'No data provided. Upload a .csv file or send a JSON array.' });
        }

        // 🛡️ Audit Log Persistence
        try {
            await db.tenantExecute(req,
                `INSERT INTO bulk_import_logs 
                (admin_id, import_type, total_rows, inserted_count, duplicate_count, error_count, original_filename, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    adminId, 'students', 
                    summary.total, summary.inserted, summary.duplicates, summary.invalid,
                    filename, isDryRun ? 'dry_run' : 'completed'
                ]
            );
        } catch (logErr) {
            logger.error('[Admin] Bulk logging failed:', logErr.message);
            // Non-blocking: Audit failure shouldn't crash the user response
        }

        return res.json({
            success: true,
            message: isDryRun ? 'Validation complete.' : `Import complete. ${summary.inserted} student(s) processed.`,
            summary
        });

    } catch (err) {
        logger.error('[Admin] bulkImportStudents error:', err);
        res.status(500).json({ success: false, message: err.message || 'Server error during bulk import.' });
    }
};

/**
 * Bulk Import Staff
 * Expects: application/json (body.staff = array of staff objects)
 */
exports.bulkImportStaff = async (req, res) => {
    const isDryRun = req.body.isDryRun === true;
    const filename = req.body.filename || 'staff_json_upload.json';
    const adminId = req.user.id;
    const tenantId = req.user.tenant_id || 1;

    try {
        if (!req.body.staff || !Array.isArray(req.body.staff)) {
            return res.status(400).json({ success: false, message: 'No staff data provided. Expecting "staff" array.' });
        }

        const summary = await staffImportService.bulkImportStaff(req.body.staff, req, isDryRun);

        // 🛡️ Audit Log Persistence
        try {
            await db.tenantExecute(req,
                `INSERT INTO bulk_import_logs 
                (admin_id, import_type, total_rows, inserted_count, duplicate_count, error_count, original_filename, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    adminId, 'staff', 
                    summary.total, summary.inserted, summary.duplicates, summary.invalid,
                    filename, isDryRun ? 'dry_run' : 'completed'
                ]
            );
        } catch (logErr) {
            logger.error('[Admin] Bulk logging failed:', logErr.message);
        }

        res.json({
            success: true,
            message: isDryRun ? 'Validation complete.' : `Staff import complete. ${summary.inserted} members processed.`,
            summary
        });
    } catch (err) {
        logger.error('[Admin] bulkImportStaff error:', err);
        res.status(500).json({ success: false, message: err.message || 'Server error during staff bulk import.' });
    }
};
/**
 * Safe Read-Only Database Audit (Admin Only)
 */
exports.dbAudit = async (req, res) => {
    try {
        // 1. Fetch tables
        const [tableRows] = await db.execute(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
        `);
        const tables = tableRows.map(r => r.table_name);

        const auditData = [];
        const importantTables = [
            'users', 'students', 'staff', 'complaints', 
            'otp_verifications', 'homepage_slides', 
            'dynamic_homepage_slides', 'gallery_images', 'department_members'
        ];

        const sensitiveFields = [
            'password_hash', 'otp_code', 'token', 'secret', 
            'api_key', 'api_secret', 'password', 'jwt_secret',
            'smtp_pass', 'smtp_user', 'mobile_number'
        ];

        for (const table of tables) {
            const isImportant = importantTables.includes(table);
            
            // Get count
            const [countRes] = await db.execute(`SELECT COUNT(*) FROM ${table}`);
            const count = parseInt(countRes[0].count);

            // Get samples (limit 5)
            let samples = [];
            if (count > 0) {
                const [sampleRows] = await db.execute(`SELECT * FROM ${table} LIMIT 5`);
                
                // Mask sensitive fields
                samples = sampleRows.map(row => {
                    const maskedRow = { ...row };
                    for (const key in maskedRow) {
                        const lowKey = key.toLowerCase();
                        if (sensitiveFields.some(f => lowKey.includes(f))) {
                            maskedRow[key] = '[MASKED]';
                        }
                    }
                    return maskedRow;
                });
            }

            // Generate warnings
            const warnings = [];
            if (isImportant && count === 0) warnings.push('Table is empty');
            
            if (table === 'users') {
                const [testData] = await db.execute("SELECT COUNT(*) FROM users WHERE username LIKE 'test_%'");
                if (parseInt(testData[0].count) > 0) warnings.push(`Found ${testData[0].count} test accounts`);
                
                const [mixedRoles] = await db.execute("SELECT DISTINCT role FROM users");
                const roles = mixedRoles.map(r => r.role);
                const hasMixedCasing = roles.some(r => r && r !== r.toLowerCase());
                if (hasMixedCasing) warnings.push('Mixed role casing detected (e.g. Admin vs admin)');
            }

            auditData.push({
                table,
                count,
                samples,
                isImportant,
                warnings
            });
        }

        res.json({
            success: true,
            audit: auditData,
            timestamp: new Date(),
            server_info: {
                engine: 'PostgreSQL',
                mode: 'READ-ONLY AUDIT'
            }
        });
    } catch (error) {
        logger.error('[Admin] dbAudit error:', error);
        res.status(500).json({ success: false, message: 'Audit failed' });
    }
};
