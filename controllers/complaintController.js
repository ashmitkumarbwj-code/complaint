const complaintService = require('../services/complaintService');
const notifier = require('../utils/notificationService');
const socketService = require('../utils/socketService');
const logger = require('../utils/logger');
const { uploadQueue } = require('../utils/queueService');
const db = require('../config/db'); // Kept temporarily for remaining unrefactored methods

exports.submitComplaint = async (req, res) => {
    const { title, category, location, description, priority } = req.body;
    const student_id = req.user?.student_id;
    const tenantId = req.user?.tenant_id || 1;

    if (!student_id) {
        return res.status(403).json({ success: false, message: "Forbidden: Only authenticated students can submit complaints." });
    }

    try {
        // 1. Spam Protection from Service
        const isSpam = await complaintService.checkSpam(student_id, tenantId);
        if (isSpam) {
            logger.warn(`[Spam Protection] Student ${student_id} blocked.`);
            return res.status(429).json({ success: false, message: "Too many complaints. Try again later." });
        }

        // 2. Routing
        const department_id = await complaintService.getTargetDepartment(category, tenantId);

        // 3. Save to Database via Service
        const complaintId = await complaintService.submitComplaint({
            student_id, 
            title: title || category, 
            department_id, 
            category, 
            description, 
            location, 
            priority,
            local_file_path: req.file ? req.file.path : null
        }, tenantId);

        // 4. Audit Logging - Using raw pool since it's an internal system action
        await db.pool.execute(
            `INSERT INTO complaint_departments (tenant_id, complaint_id, department_id, assigned_by, notes, is_current) 
             VALUES (?, ?, ?, NULL, 'Auto-routed by system based on category', 1)`,
            [tenantId, complaintId, department_id]
        );

        // 5. Queue File Upload (Zero-Trust Job) with Resilience Fallback
        if (req.file) {
            try {
                await uploadQueue.add('process_image', { 
                    filePath: req.file.path, 
                    complaintId,
                    tenantId: req.user.tenant_id 
                });
                
                // Update status to processing
                await db.pool.execute(
                    'UPDATE complaints SET processing_status = ? WHERE id = ?',
                    ['processing', complaintId]
                );
                
                logger.info(`[UploadQueue] Enqueued image for complaint ${complaintId} (Tenant:${tenantId})`);
            } catch (err) {
                // REDIS DOWN FALLBACK: Mark for re-sync
                logger.error(`[RESILIENCE] Redis down! Marking complaint ${complaintId} for local resync.`, err);
                await db.pool.execute(
                    'UPDATE complaints SET processing_status = ? WHERE id = ?',
                    ['pending_resync', complaintId]
                );
            }
        }

        // 6. Socket & Notifications
        socketService.emitNewComplaint({ id: complaintId, student_id, department_id, category, location, status: 'Pending', created_at: new Date() });

        res.json({ success: true, message: 'Complaint submitted successfully', complaint_id: complaintId, assigned_department: department_id });
    } catch (error) {
        logger.error('[Complaint] submitComplaint error:', error);
        res.status(500).json({ success: false, message: 'Failed to submit complaint' });
    }
};

exports.getStudentComplaints = async (req, res) => {
    const { student_id } = req.params;
    
    try {
        // Service now handles Triple-Lock internally using req.user
        const result = await complaintService.getComplaints({ student_id }, req.user.tenant_id, req.user);
        res.json({ success: true, complaints: result.data, pagination: result.pagination });
    } catch (error) {
        logger.error('Error fetching student complaints:', error);
        res.status(500).json({ success: false, message: 'Error fetching complaints' });
    }
};

exports.updateStatus = async (req, res) => {
    const { complaint_id } = req.params;
    const { status, admin_notes } = req.body;
    const { id: user_id, role, tenant_id } = req.user;

    try {
        // Membership Lock: Only Admins OR Staff assigned to the target department can update status
        const [complaint] = await db.tenantExecute(req, 'SELECT department_id, student_id FROM complaints WHERE id = ?', [complaint_id]);
        if (complaint.length === 0) return res.status(404).json({ success: false, message: 'Complaint not found.' });
        
        const targetDeptId = complaint[0].department_id;
        const targetStudentId = complaint[0].student_id;

        if (role === 'Staff' || role === 'HOD') {
            const [membership] = await db.tenantExecute(req, 
                'SELECT 1 FROM department_members WHERE department_id = ? AND user_id = ?', 
                [targetDeptId, user_id]
            );
            if (membership.length === 0) {
                return res.status(403).json({ success: false, message: 'Access denied: Not assigned to this department.' });
            }
        }

        // Apply Update using tenantExecute (Golden Rule)
        await db.tenantExecute(req,
            'UPDATE complaints SET status = ?, admin_notes = ?, resolved_at = ? WHERE id = ?',
            [status, admin_notes || null, status === 'Resolved' ? new Date() : null, complaint_id]
        );

        socketService.emitStatusUpdate(complaint_id, status, targetStudentId);

        // Notify Student via email
        try {
            const [rows] = await db.tenantExecute(req, `
                SELECT u.email FROM users u
                JOIN students s ON u.id = s.user_id 
                WHERE s.id = ?
            `, [targetStudentId]);
            
            if (rows.length > 0) {
                notifier.notifyStudent(rows[0].email, complaint_id, status);
            }
        } catch (notifierErr) {
            logger.warn('[Complaint] Status notification warning:', notifierErr);
        }

        res.json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
        logger.error('[Complaint] updateStatus error:', error);
        res.status(500).json({ success: false, message: 'Update failed' });
    }
};

exports.getAllComplaints = async (req, res) => {
    try {
        const { page = 1, limit = 50, status, department_id } = req.query;
        
        const result = await complaintService.getComplaints({ 
            page, limit, status, department_id 
        }, req.user.tenant_id, req.user);
        
        res.json({ success: true, complaints: result.data, pagination: result.pagination });
    } catch (error) {
        logger.error('Error fetching all complaints:', error);
        res.status(500).json({ success: false, message: 'Error fetching complaints' });
    }
};

/**
 * 30-Day Auto Delete Media Logic
 * This function finds complaints older than 30 days that still have media_url.
 * It deletes the image from Cloudinary and sets media_url to NULL in DB.
 */
exports.cleanupOldMedia = async () => {
    try {
        logger.info('[Cleanup] Running 30-day media cleanup job...');
        
        // Find complaints older than 30 days with media
        const [rows] = await db.execute(`
            SELECT id, media_url 
            FROM complaints 
            WHERE media_url IS NOT NULL 
            AND created_at < NOW() - INTERVAL 30 DAY
        `);

        if (rows.length === 0) {
            logger.info('[Cleanup] No old media files to clean up.');
            return;
        }

        logger.info(`[Cleanup] Found ${rows.length} old media files to delete.`);

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
                logger.info(`[Cleanup] Deleted media for complaint #${complaint.id}`);
            } catch (err) {
                logger.error(`[Cleanup] Failed to delete media for complaint #${complaint.id}:`, err);
            }
        }
        logger.info('[Cleanup] Media cleanup job completed.');
    } catch (error) {
        logger.error('[Cleanup] Error in cleanupOldMedia job:', error);
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

        const [rows] = await db.tenantExecute(req, `
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
        logger.error('[Complaint] getComplaintHistory error:', error);
        res.status(500).json({ success: false, message: 'Error fetching history' });
    }
};
