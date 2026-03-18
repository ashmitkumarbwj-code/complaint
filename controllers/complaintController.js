const db = require('../config/db');
const notifier = require('../utils/notificationService');
const cloudinary = require('../config/cloudinary');
const socketService = require('../utils/socketService');
const logger = require('../utils/logger');
const { uploadQueue } = require('../utils/queueService');

// ── Spam Protection ───────────────────────────────────────────────────────────
const MAX_COMPLAINTS_PER_HOUR = 5; // max submissions a student can make per hour

exports.submitComplaint = async (req, res) => {
    // Note: When using Multer, non-file fields are in req.body
    const { student_id, category, location, description, priority } = req.body;
    let media_url = null;

    try {
        // ── Hourly Spam Check ─────────────────────────────────────────────────
        // Count complaints this student submitted in the last 60 minutes.
        // Uses the DB timestamp so clock skew between client and server is irrelevant.
        const [countRows] = await db.execute(
            `SELECT COUNT(*) AS count,
                    MIN(created_at) AS oldest
             FROM complaints
             WHERE student_id = ?
               AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
            [student_id]
        );

        const recentCount = countRows[0].count;
        if (recentCount >= MAX_COMPLAINTS_PER_HOUR) {
            // Tell the student when the oldest complaint ages out (so they know
            // exactly when they can submit again — better UX than a vague message).
            const oldestAt   = new Date(countRows[0].oldest);
            const retryAfter = Math.ceil((oldestAt.getTime() + 60 * 60 * 1000 - Date.now()) / 1000);

            logger.warn(`[Spam] student_id=${student_id} hit hourly complaint cap (${recentCount}/${MAX_COMPLAINTS_PER_HOUR})`);

            res.set('Retry-After', retryAfter);
            return res.status(429).json({
                success: false,
                message: `You have submitted ${MAX_COMPLAINTS_PER_HOUR} complaints in the last hour. Please wait before submitting another.`,
                retry_after_seconds: retryAfter
            });
        }

        // 1. Smart Routing Logic
        const department_id = await getTargetDepartment(category);

        // 2. Save to Database FIRST (without media_url, worker will add it later)
        const query = `
            INSERT INTO complaints (student_id, department_id, category, description, location, media_url, status, priority)
            VALUES (?, ?, ?, ?, ?, NULL, 'Pending', ?)
        `;
        
        const [result] = await db.execute(query, [
            student_id,
            department_id,
            category,
            description,
            location,
            priority || 'Medium'
        ]);

        const complaintId = result.insertId;

        // 2.1 Audit Logging: Record Initial Assignment
        await db.execute(
            `INSERT INTO complaint_departments (complaint_id, department_id, assigned_by, notes, is_current) 
             VALUES (?, ?, NULL, 'Auto-routed by system based on category', 1)`,
            [complaintId, department_id]
        );

        // 3. Queue File Upload to Cloudinary (if file exists)
        if (req.file) {
            try {
                // Background worker will upload to Cloudinary and UPDATE the DB row
                await uploadQueue.add('process_image', {
                    filePath: req.file.path,
                    complaintId: complaintId
                }, {
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 3000 },
                    removeOnComplete: true,
                    removeOnFail: false // leave failed jobs to debug
                });
                logger.info(`[UploadQueue] Enqueued image for complaint ${complaintId}`);
            } catch (err) {
                logger.error(`[UploadQueue] Failed to enqueue image for ${complaintId}:`, err);
            }
        }

        // 4. Emit Real-time Socket Event
        socketService.emitNewComplaint({
            id: complaintId,
            student_id,
            department_id,
            category,
            location,
            status: 'Pending',
            created_at: new Date()
        });

        try {
            // Fetch student email
            const [studentRows] = await db.execute('SELECT email FROM users JOIN students ON users.id = students.user_id WHERE students.id = ?', [student_id]);
            if (studentRows.length > 0) {
                const email = studentRows[0].email;
                notifier.sendEmail(email, `Complaint #${complaintId} Submitted`, `Your complaint regarding ${category} has been received and routed to the appropriate department.`);
            }

            // Fetch HOD email for the department
            const [deptRows] = await db.execute('SELECT email FROM users JOIN staff ON users.id = staff.user_id WHERE staff.department_name = ? AND users.role = "HOD"', [department_id]);
            if (deptRows.length > 0) {
                notifier.notifyAuthority(deptRows[0].email, complaintId, category);
            }

            // Emergency SMS
            if (priority === 'Emergency') {
                const [adminRows] = await db.execute('SELECT mobile FROM students WHERE id = ?', [student_id]);
                if (adminRows.length > 0 && adminRows[0].mobile) {
                    notifier.sendSMS(adminRows[0].mobile, `EMERGENCY ALERT: Complaint #${complaintId} (${category}) submitted at ${location}.`);
                }
            }
        } catch (notifierErr) {
            console.error('Notification trigger failed:', notifierErr);
        }

        res.json({
            success: true,
            message: 'Complaint submitted and routed successfully',
            complaint_id: complaintId,
            assigned_department: department_id
        });

    } catch (error) {
        console.error('Submission error:', error);
        res.status(500).json({ success: false, message: 'Failed to submit complaint' });
    }
};

async function getTargetDepartment(category) {
    // DB-driven routing: looks up which department handles this category.
    // Admin can now change mappings via the Department Management panel
    // without touching code.
    const [rows] = await db.execute(
        'SELECT department_id FROM department_categories WHERE category = ? LIMIT 1',
        [category]
    );

    if (rows.length > 0) {
        return rows[0].department_id;
    }

    // Fallback: if no mapping found in DB, use General Administration (id=7)
    logger.warn(`[Routing] No DB mapping for category "${category}", falling back to General Administration`);
    return 7;
}

exports.getStudentComplaints = async (req, res) => {
    const { student_id } = req.params;
    try {
        const [rows] = await db.execute(`
            SELECT c.*, d.name as department_name 
            FROM complaints c 
            JOIN departments d ON c.department_id = d.id 
            WHERE c.student_id = ? 
            ORDER BY c.created_at DESC
        `, [student_id]);
        res.json({ success: true, complaints: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching complaints' });
    }
};

exports.updateStatus = async (req, res) => {
    const { complaint_id } = req.params;
    const { status, admin_notes } = req.body;

    try {
        let sql = 'UPDATE complaints SET status = ?, admin_notes = ?';
        const params = [status, admin_notes || null];

        if (status === 'Resolved') {
            sql += ', resolved_at = NOW()';
        } else {
            sql += ', resolved_at = NULL';
        }

        sql += ' WHERE id = ?';
        params.push(complaint_id);

        await db.execute(sql, params);

        // Fetch student_id to notify specifically via socket
        const [compRows] = await db.execute('SELECT student_id FROM complaints WHERE id = ?', [complaint_id]);
        if (compRows.length > 0) {
            socketService.emitStatusUpdate(complaint_id, status, compRows[0].student_id);
        }

        // Notify Student about update via email
        try {
            const [rows] = await db.execute(`
                SELECT email FROM users 
                JOIN students ON users.id = students.user_id 
                JOIN complaints ON students.id = complaints.student_id 
                WHERE complaints.id = ?
            `, [complaint_id]);
            
            if (rows.length > 0) {
                notifier.notifyStudent(rows[0].email, complaint_id, status);
            }
        } catch (notifierErr) {
             console.error('Status notification failed:', notifierErr);
        }

        res.json({ success: true, message: 'Status updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Update failed' });
    }
};

exports.getAllComplaints = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT c.*, d.name as department_name, u.username as student_name
            FROM complaints c
            JOIN departments d ON c.department_id = d.id
            JOIN students s ON c.student_id = s.id
            JOIN users u ON s.user_id = u.id
            ORDER BY c.created_at DESC
        `);

        // Anonymity Logic: Admins and Principals see the real name/id
        const canSeeRealNames = req.user && (req.user.role === 'Admin' || req.user.role === 'Principal');
        
        const complaints = rows.map(c => {
            if (!canSeeRealNames) {
                return {
                    ...c,
                    student_name: 'Anonymous Student',
                    student_id: 'HIDDEN'
                };
            }
            return c;
        });

        res.json({ success: true, complaints: complaints });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching all complaints' });
    }
};

/**
 * 30-Day Auto Delete Media Logic
 * This function finds complaints older than 30 days that still have media_url.
 * It deletes the image from Cloudinary and sets media_url to NULL in DB.
 */
exports.cleanupOldMedia = async () => {
    try {
        console.log('Running 30-day media cleanup job...');
        
        // Find complaints older than 30 days with media
        const [rows] = await db.execute(`
            SELECT id, media_url 
            FROM complaints 
            WHERE media_url IS NOT NULL 
            AND created_at < NOW() - INTERVAL 30 DAY
        `);

        if (rows.length === 0) {
            console.log('No old media files to clean up.');
            return;
        }

        console.log(`Found ${rows.length} old media files to delete.`);

        for (const complaint of rows) {
            // Extract public_id from Cloudinary URL
            // Example: https://res.cloudinary.com/dpv2q0v13/image/upload/v1700000000/smart_campus/complaints/abcd123.jpg
            const urlParts = complaint.media_url.split('/');
            const filename = urlParts[urlParts.length - 1];
            const publicId = `smart_campus/complaints/${filename.split('.')[0]}`;

            try {
                // Destroy from Cloudinary
                await cloudinary.uploader.destroy(publicId);
                
                // Remove reference from database
                await db.execute('UPDATE complaints SET media_url = NULL WHERE id = ?', [complaint.id]);
                
                console.log(`Deleted media for complaint #${complaint.id}`);
            } catch (err) {
                console.error(`Failed to delete media for complaint #${complaint.id}:`, err);
            }
        }
        console.log('Media cleanup job completed.');
    } catch (error) {
        console.error('Error in cleanupOldMedia job:', error);
    }
};

/**
 * GET /api/complaints/:id/history
 * Returns the audit trail of department assignments for a complaint
 */
exports.getComplaintHistory = async (req, res) => {
    const { id } = req.params;
    const { id: user_id, role } = req.user;

    try {
        // Senior Security Verification
        if (role === 'Staff' || role === 'HOD') {
            const [complaint] = await db.execute('SELECT department_id FROM complaints WHERE id = ?', [id]);
            if (complaint.length === 0) return res.status(404).json({ success: false, message: 'Complaint not found' });
            
            const [membership] = await db.execute(
                'SELECT 1 FROM department_members WHERE department_id = ? AND user_id = ?',
                [complaint[0].department_id, user_id]
            );
            if (membership.length === 0) {
                return res.status(403).json({ success: false, message: 'Access denied: You can only view history for complaints assigned to your department.' });
            }
        }

        const [rows] = await db.execute(`
            SELECT 
                cd.assigned_at,
                cd.notes,
                cd.is_current,
                d.name as department_name,
                u.username as assigned_by_name
            FROM complaint_departments cd
            JOIN departments d ON cd.department_id = d.id
            LEFT JOIN users u ON cd.assigned_by = u.id
            WHERE cd.complaint_id = ?
            ORDER BY cd.assigned_at DESC
        `, [id]);

        res.json({ success: true, history: rows });
    } catch (error) {
        console.error('Error fetching complaint history:', error);
        res.status(500).json({ success: false, message: 'Error fetching history' });
    }
};
