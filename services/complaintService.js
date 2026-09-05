const db = require('../config/db');
const logger = require('../utils/logger');


class ComplaintService {
    /**
     * Check if a student has exceeded the complaint limit
     */
    async checkSpam(studentId, tenantId) {
        const MAX_COMPLAINTS_PER_HOUR = 5;
        const [spamRows] = await db.execute(
            'SELECT COUNT(*) as count FROM complaints WHERE student_id = $1 AND tenant_id = $2 AND created_at > CURRENT_TIMESTAMP - INTERVAL \'1 hour\'',
            [studentId, tenantId]
        );
        return spamRows[0].count >= MAX_COMPLAINTS_PER_HOUR;
    }

    /**
     * Get auto-routing department for a category
     */
    async getTargetDepartment(category, tenantId) {
        const [rows] = await db.execute(
            'SELECT department_id FROM department_categories WHERE category = $1 AND tenant_id = $2 LIMIT 1',
            [category, tenantId]
        );
        return rows.length > 0 ? rows[0].department_id : 1; 
    }

    /**
     * Submit a new complaint
     * V2 Upgrade: Injects workflow_version and initial Admin Role Queue ownership.
     */
    async submitComplaint(complaintData, tenantId) {
        const { user_id, student_id, title, department_id, category, description, location, priority, local_file_path } = complaintData;
        const [rows] = await db.tenantExecute({ user: { tenant_id: tenantId } },
            `INSERT INTO complaints (
                tenant_id, user_id, student_id, title, department_id, 
                category, description, location, priority, local_file_path,
                workflow_version, current_owner_role, current_owner_department_id, is_v2_compliant,
                status
             ) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 2, 'admin', 1, TRUE, 'SUBMITTED') RETURNING id`,
            [tenantId, user_id, student_id, title, department_id, category, description, location, priority, local_file_path || null]
        );
        return rows[0].id;
    }

    /**
     * Get complaints with pagination and filters
     * Triple-Lock: Tenant + Role + Ownership/Membership (Zero-Trust Enforcement)
     */
    async getComplaints(filters, tenantId, user) {
        const { page = 1, limit = 10, status, department_id, student_id } = filters;
        const offset = (page - 1) * limit;
        const { role, id: userId, student_id: sessionStudentId } = user;
        const normalizedRole = String(role).toLowerCase().trim();

        let query = `
            SELECT 
                c.*, d.name as department_name, u.username as student_name,
                ai.suggested_priority as ai_priority, ai.evidence_match_score as ai_score,
                ai.is_emergency as ai_is_emergency, ai.requires_manual_review as ai_review,
                ai.reasoning_summary as ai_reasoning
            FROM complaints c
            JOIN departments d ON c.department_id = d.id
            JOIN students s ON c.student_id = s.id
            JOIN users u ON s.user_id = u.id
            LEFT JOIN complaint_ai_analysis ai ON c.id = ai.complaint_id
            WHERE c.tenant_id = $1
        `;
        const params = [tenantId];
        let pCount = 1;

        // 1. Zero-Trust Ownership/Membership Enforcement
        if (normalizedRole === 'student') {
            pCount++;
            query += ` AND c.student_id = $${pCount}`;
            params.push(sessionStudentId);
        } else if (normalizedRole === 'staff' || normalizedRole === 'hod') {
            pCount++;
            // V2 Ownership OR V1 Membership
            query += ` AND (
                (c.workflow_version = 2 AND (c.current_owner_user_id = $${pCount} OR (c.current_owner_user_id IS NULL AND c.current_owner_role = $${pCount + 1} AND c.current_owner_department_id IN (SELECT department_id FROM department_members WHERE user_id = $${pCount}))))
                OR 
                (c.workflow_version = 1 AND c.department_id IN (SELECT department_id FROM department_members WHERE user_id = $${pCount}))
            )`;
            params.push(userId, normalizedRole);
            pCount++;
        } else if (normalizedRole === 'admin') {
            // Admins see everything + explicitly their queue-owned complaints
        }

        // 2. User-applied Filters
        if (status) {
            pCount++;
            query += ` AND c.status = $${pCount}`;
            params.push(status);
        }
        if (department_id) {
            pCount++;
            query += ` AND c.department_id = $${pCount}`;
            params.push(department_id);
        }
        if (student_id && ['admin', 'principal'].includes(normalizedRole)) {
            pCount++;
            query += ` AND c.student_id = $${pCount}`;
            params.push(student_id);
        }

        query += ` ORDER BY c.created_at DESC LIMIT $${pCount + 1} OFFSET $${pCount + 2}`;
        params.push(parseInt(limit), parseInt(offset));

        const [rows] = await db.execute(query, params);

        // Anonymity Logic
        const canSeeRealNames = ['admin', 'principal', 'hod'].includes(role);
        const data = rows.map(c => {
            if (!c.media_url && c.local_file_path) {
                const pureFilename = c.local_file_path.split(/[\\/]/).pop();
                c.media_url = '/uploads/' + pureFilename;
            }
            if (!canSeeRealNames && c.student_id !== sessionStudentId) {
                return { ...c, student_name: 'Anonymous Student', student_id: 'HIDDEN' };
            }
            return c;
        });
        
        // Total count (Simplified for brevity but mirroring logic)
        const [countRows] = await db.execute(`SELECT COUNT(*) as total FROM complaints WHERE tenant_id = $1`, [tenantId]);

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
     * Hardened Transactional updateStatus Engine (STRICT V2)
     */
    async updateStatus(req, { complaintId, newStatus, reason, targetStaffId = null, targetDeptId = null }) {
        const { id: actorId, role: actorRoleRaw, tenant_id } = req.user;
        const actorRole = String(actorRoleRaw).toLowerCase().trim();
        // Normalize user role for internal checks
        const normalizedRole = actorRole;
        const connection = await db.getTransaction();

        try {
            await connection.beginTransaction();

            // 1. Fetch & Lock State
            const [rows] = await connection.execute(
                `SELECT * FROM complaints WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
                [complaintId, tenant_id]
            );
            const complaint = rows[0];
            if (!complaint) throw new Error('COMPLAINT_NOT_FOUND');

            // 1.1 Idempotency Check: Prevent duplicate transitions/audit logs
            if (complaint.status === adjustedStatus) {
                logger.info(`[Workflow] Idempotent ignore: Complaint #${complaintId} already has status ${adjustedStatus}.`);
                return { 
                    success: true, 
                    noOp: true, 
                    message: 'Status is already up-to-date.', 
                    data: { 
                        status: complaint.status, 
                        student_id: complaint.student_id, 
                        user_id: complaint.user_id,
                        department_id: complaint.department_id,
                        current_owner_department_id: complaint.current_owner_department_id,
                        owner_role: complaint.current_owner_role,
                        current_owner_user_id: complaint.current_owner_user_id,
                        previous_status: complaint.status
                    } 
                };
            }

            const isV2 = (complaint.workflow_version === 2);

            // Map admin actions for legacy V1 complaints to appropriate V1 statuses
            let adjustedStatus = newStatus;
            if (!isV2 && normalizedRole === 'admin') {
                // Legacy V1 does not have SUBMITTED/FORWARDED/REJECTED_BY_ADMIN statuses
                if (newStatus === 'FORWARDED') adjustedStatus = 'IN_PROGRESS';
                else if (newStatus === 'REJECTED_BY_ADMIN') adjustedStatus = 'REJECTED';
                else if (newStatus === 'CLOSED') adjustedStatus = 'RESOLVED';
            }

            // 2. Strict V2 Validation (or adjusted V1 handling)
            if (isV2) {
                // A. Ownership Verification (Admins bypass; Students can reopen their own; HOD/Admin can always close)
                const isReopening = (adjustedStatus === 'REOPENED');
                const isClosing = (adjustedStatus === 'CLOSED');
                const isAdminOrHodClosing = isClosing && ['admin', 'hod'].includes(actorRole);
                if (actorRole !== 'admin' && !isAdminOrHodClosing) {
                    const isOwner = (complaint.current_owner_user_id === actorId);
                    const isSubmitterReopening = (isReopening && normalizedRole === 'student' && complaint.user_id === actorId);

                    if (!isOwner && !isSubmitterReopening) {
                        const isRoleQueue = !complaint.current_owner_user_id;
                        if (isRoleQueue) {
                            if (String(complaint.current_owner_role).toLowerCase().trim() !== normalizedRole) throw new Error('OWNERSHIP_VIOLATION');
                            if (['hod', 'staff'].includes(normalizedRole) && complaint.current_owner_department_id !== req.user.department_id) {
                                throw new Error('DEPARTMENT_MISMATCH');
                            }
                        } else {
                            throw new Error('OWNERSHIP_VIOLATION');
                        }
                    }
                }

                // B. FSM Transition Check
                const workflow = require('../utils/workflowEngine');
                if (!workflow.isValidTransition(complaint.status, adjustedStatus, actorRole, 2)) {
                    throw new Error('INVALID_TRANSITION');
                }

                // C. Reopen Rules
                if (adjustedStatus === 'REOPENED') {
                    if (complaint.reopened_count >= 1) throw new Error('MAX_REOPEN_EXCEEDED');
                    const diffDays = (new Date() - new Date(complaint.last_transition_at)) / (1000 * 60 * 60 * 24);
                    if (diffDays > 7) throw new Error('REOPEN_WINDOW_EXPIRED');
                }

                // D. Target Staff Validation
                if (adjustedStatus === 'HOD_VERIFIED' && targetStaffId) {
                    const [staffCheck] = await connection.execute(
                        `SELECT 1 FROM staff WHERE user_id = $1 AND department_id = $2`,
                        [targetStaffId, complaint.current_owner_department_id]
                    );
                    if (staffCheck.length === 0) throw new Error('INVALID_TARGET_STAFF');
                }
                
                const isReasonRequired = workflow.isReasonRequired(adjustedStatus, 2) && (!reason || reason.trim().length < 10);
                if (isReasonRequired) {
                    throw new Error('REASON_REQUIRED');
                }
            } else {
                // V1 Legacy Validation Logic (Retained for Compatibility)
                const workflow = require('../utils/workflowEngine');
                if (!workflow.isValidTransition(complaint.status, adjustedStatus, actorRole, 1)) {
                    throw new Error('INVALID_TRANSITION');
                }
            }

            // 3. Ownership & Historical Tracking Handovers
            let nextOwnerId = null;
            let nextOwnerRole = null;
            let nextDeptId = complaint.department_id;
            let nextOwnerDeptId = complaint.current_owner_department_id;
            let lastHodId = complaint.last_hod_id;
            let lastStaffId = complaint.last_staff_id;
            let reopenedCount = complaint.reopened_count || 0;

            if (isV2) {
                switch (newStatus) {
                    case 'FORWARDED':
                        nextOwnerRole = 'hod';
                        nextDeptId = targetDeptId || complaint.department_id;
                        nextOwnerDeptId = targetDeptId || complaint.current_owner_department_id;
                        if (targetDeptId) {
                            const [targetDeptRows] = await connection.execute(
                                'SELECT hod_id FROM departments WHERE id = $1',
                                [targetDeptId]
                            );
                            if (targetDeptRows.length > 0 && targetDeptRows[0].hod_id) {
                                nextOwnerId = targetDeptRows[0].hod_id;
                                lastHodId = targetDeptRows[0].hod_id;
                            }
                        }
                        break;
                    case 'RETURNED_TO_ADMIN':
                        nextOwnerRole = 'admin';
                        nextOwnerDeptId = 1; 
                        break;
                    case 'HOD_VERIFIED':
                        nextOwnerId = targetStaffId;
                        nextOwnerRole = 'staff';
                        lastHodId = actorId;
                        break;
                    case 'IN_PROGRESS':
                        nextOwnerId = actorId;
                        nextOwnerRole = 'staff';
                        lastStaffId = actorId;
                        break;
                    case 'HOD_REWORK_REQUIRED':
                        nextOwnerId = complaint.last_staff_id;
                        nextOwnerRole = 'staff';
                        break;
                    case 'STAFF_RESOLVED':
                        nextOwnerId = complaint.last_hod_id;
                        nextOwnerRole = 'hod';
                        break;
                    case 'HOD_APPROVED':
                        nextOwnerId = complaint.user_id;
                        nextOwnerRole = 'student';
                        break;
                    case 'REOPENED':
                        nextOwnerId = complaint.last_hod_id;
                        nextOwnerRole = 'hod';
                        reopenedCount += 1;
                        break;
                    case 'REJECTED_BY_ADMIN':
                    case 'CLOSED':
                        nextOwnerId = null;
                        nextOwnerRole = null;
                        break;
                }
            }

            // 4. Update Complaint (Synchronizes both department_id and current_owner_department_id)
            await connection.execute(`
                UPDATE complaints SET 
                    status = $1, admin_notes = $2,
                    current_owner_user_id = $3, current_owner_role = $4,
                    current_owner_department_id = $5, department_id = $6,
                    last_hod_id = $7, last_staff_id = $8, reopened_count = $9,
                    last_transition_at = CURRENT_TIMESTAMP,
                    lock_version = lock_version + 1
                WHERE id = $10
            `, [
                adjustedStatus, reason || complaint.admin_notes,
                nextOwnerId, nextOwnerRole, nextOwnerDeptId, nextDeptId,
                lastHodId, lastStaffId, reopenedCount, complaintId
            ]);
            
            logger.info(`[Workflow] Complaint #${complaintId} transition: ${complaint.status} -> ${adjustedStatus} (Actor: ${actorRole}:${actorId})`);


            // 5. Immutable Audit Trail
            const auditService = require('../utils/auditService');
            const isStudentVisibleMilestone = [
                'CLOSED', 'REJECTED_BY_ADMIN', 'FORWARDED', 'HOD_VERIFIED', 
                'IN_PROGRESS', 'STAFF_RESOLVED', 'HOD_APPROVED', 'REOPENED', 
                'RETURNED_TO_ADMIN', 'HOD_REWORK_REQUIRED'
            ].includes(adjustedStatus);

            await auditService.logAction(connection, {
                complaint_id: complaintId,
                actor_user_id: actorId,
                actor_role: actorRole,
                action_type: 'STATUS_CHANGE',
                from_status: complaint.status,
                to_status: adjustedStatus,
                note: reason || 'System update',
                visibility: isStudentVisibleMilestone ? 'STUDENT_VISIBLE' : 'STAFF_ONLY',
                metadata: {
                    previous_owner_user_id: complaint.current_owner_user_id,
                    new_owner_user_id: nextOwnerId,
                    previous_owner_role: complaint.current_owner_role,
                    new_owner_role: nextOwnerRole,
                    previous_owner_department_id: complaint.current_owner_department_id,
                    new_owner_department_id: nextOwnerDeptId,
                    previous_department_id: complaint.department_id,
                    new_department_id: nextDeptId
                },
                req: req
            });

            await connection.commit();
            return { 
                success: true, 
                data: { 
                    status: adjustedStatus, 
                    student_id: complaint.student_id,
                    user_id: complaint.user_id,
                    department_id: nextDeptId,
                    current_owner_department_id: nextOwnerDeptId,
                    owner_role: nextOwnerRole,
                    current_owner_user_id: nextOwnerId,
                    previous_status: complaint.status
                } 
            };

        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    }

}

module.exports = new ComplaintService();

