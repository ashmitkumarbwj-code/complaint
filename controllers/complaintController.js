const complaintService = require('../services/complaintService');
const notifier = require('../utils/notificationService');
const socketService = require('../utils/socketService');
const logger = require('../utils/logger');
const { uploadQueue } = require('../utils/queueService');
const db = require('../config/db'); // Kept temporarily for remaining unrefactored methods
const priorityEngine = require('../utils/priorityEngine');

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

        // 2. Routing AI & Priority Detection
        const analysis = priorityEngine.analyze(title, description, priority);
        const finalPriority = analysis.priority;
        const targetDeptId = await complaintService.getTargetDepartment(category, tenantId);

        // 3. Save to Database via Service
        const complaintId = await complaintService.submitComplaint({
            student_id, 
            title: title || category, 
            department_id: targetDeptId, 
            category, 
            description, 
            location, 
            priority: finalPriority,
            local_file_path: req.file ? req.file.filename : null
        }, tenantId);

        // 4. Audit Logging - Using raw pool since it's an internal system action
        const auditNote = analysis.isAutoAssigned 
            ? `AI Auto-escalated priority to ${finalPriority}` 
            : 'Auto-routed by system based on category';

        await db.execute(
            `INSERT INTO complaint_departments (tenant_id, complaint_id, department_id, assigned_by, notes, is_current) 
             VALUES ($1, $2, $3, NULL, $4, 1)`,
            [tenantId, complaintId, targetDeptId, auditNote]
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
                await db.execute(
                    'UPDATE complaints SET processing_status = $1 WHERE id = $2',
                    ['processing', complaintId]
                );
                
                logger.info(`[UploadQueue] Enqueued image for complaint ${complaintId} (Tenant:${tenantId})`);
            } catch (err) {
                // REDIS DOWN FALLBACK: Mark for re-sync
                logger.error(`[RESILIENCE] Redis down! Marking complaint ${complaintId} for local resync.`, err);
                await db.execute(
                    'UPDATE complaints SET processing_status = $1 WHERE id = $2',
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
    const { status, admin_notes, action_type } = req.body;

    try {
        const result = await complaintService.updateStatus(req, {
            complaintId: complaint_id,
            newStatus: status,
            adminNotes: admin_notes,
            actionType: action_type || 'STATUS_CHANGE'
        });

        // Socket & Notifications are now partially handled or triggered from here
        // (Service handles DB, Controller handles UI side-effects)
        if (!result.noOp) {
            socketService.emitStatusUpdate(complaint_id, status, null); // targetStudentId can be added in service data return
        }

        res.json({ 
            success: true, 
            message: result.message || 'Update successful',
            data: result.data 
        });

    } catch (error) {
        logger.error('[Complaint] updateStatus error:', error.message);

        // Security / Workflow Mapping to structured API responses
        const errorMap = {
            'COMPLAINT_NOT_FOUND': { status: 404, code: 'NOT_FOUND', msg: 'Complaint not found.' },
            'VERSION_CONFLICT': { status: 409, code: 'CONCURRENCY_CONFLICT', msg: 'Data has changed. Please refresh and try again.' },
            'INVALID_TRANSITION': { status: 400, code: 'BAD_WORKFLOW', msg: 'Invalid status transition for your role.' },
            'REASON_REQUIRED': { status: 422, code: 'VALIDATION_ERROR', msg: 'A detailed reason/note is required for this action.' },
            'MAX_REOPEN_EXCEEDED': { status: 403, code: 'LIMIT_EXCEEDED', msg: 'Complaint has already been reopened once.' },
            'REOPEN_WINDOW_EXPIRED': { status: 403, code: 'WINDOW_EXPIRED', msg: 'Reopening window has passed (7 days max).' },
            'DPT_MEMBERSHIP_REQUIRED': { status: 403, code: 'FORBIDDEN', msg: 'You are not assigned to this department.' }
        };

        const canned = errorMap[error.message];
        if (canned) {
            return res.status(canned.status).json({
                success: false,
                code: canned.code,
                message: canned.msg
            });
        }

        res.status(500).json({ success: false, message: 'Internal server error during update.' });
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
            AND created_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
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
                await db.execute('UPDATE complaints SET media_url = NULL WHERE id = $1', [complaint.id]);
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
            const [complaint] = await db.execute('SELECT department_id FROM complaints WHERE id = $1', [id]);
            if (complaint.length === 0) return res.status(404).json({ success: false, message: 'Complaint not found' });
            
            const [membership] = await db.execute(
                'SELECT 1 FROM department_members WHERE department_id = $1 AND user_id = $2',
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
            WHERE cd.complaint_id = $1
            ORDER BY cd.assigned_at DESC
        `, [id]);

        res.json({ success: true, history: rows });
    } catch (error) {
        logger.error('[Complaint] getComplaintHistory error:', error);
        res.status(500).json({ success: false, message: 'Error fetching history' });
    }
};
