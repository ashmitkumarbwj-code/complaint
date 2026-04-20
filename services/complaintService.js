const db = require('../config/db');

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
     */
    async submitComplaint(complaintData, tenantId) {
        const { user_id, student_id, title, department_id, category, description, location, priority, local_file_path } = complaintData;
        const [rows] = await db.tenantExecute({ user: { tenant_id: tenantId } },
            `INSERT INTO complaints (tenant_id, user_id, student_id, title, department_id, category, description, location, priority, local_file_path) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
            [tenantId, user_id, student_id, title, department_id, category, description, location, priority, local_file_path || null]
        );
        return rows[0].id;
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
            SELECT c.*, d.name as department_name, u.username as student_name,
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

        // 1. Ownership/Membership Enforcement
        if (role === 'student') {
            pCount++;
            query += ` AND c.student_id = $${pCount}`;
            params.push(sessionStudentId);
        } else if (role === 'staff' || role === 'hod') {
            pCount++;
            query += ` AND c.department_id IN (
                SELECT department_id FROM department_members WHERE user_id = $${pCount}
            )`;
            params.push(user.id);
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
        if (student_id && ['admin', 'principal'].includes(role)) {
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
        
        // Total count
        let countQuery = `SELECT COUNT(*) as total FROM complaints c WHERE c.tenant_id = $1`;
        const countParams = [tenantId];
        let cpCount = 1;

        if (role === 'student') {
            cpCount++;
            countQuery += ` AND c.student_id = $${cpCount}`;
            countParams.push(sessionStudentId);
        } else if (role === 'staff' || role === 'hod') {
            cpCount++;
            countQuery += ` AND c.department_id IN (
                SELECT department_id FROM department_members WHERE user_id = $${cpCount}
            )`;
            countParams.push(user.id);
        }

        if (status) { cpCount++; countQuery += ` AND c.status = $${cpCount}`; countParams.push(status); }
        if (department_id) { cpCount++; countQuery += ` AND c.department_id = $${cpCount}`; countParams.push(department_id); }
        
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
     * Hardened Update Status Logic (The Gatekeeper)
     * Handles: Concurrency, Workflow Validation, Re-open Windows, Audit Logs & Transactions.
     */
    async updateStatus(req, { complaintId, newStatus, adminNotes, actionType = 'STATUS_CHANGE' }) {
        const { id: actorId, role: actorRole, tenant_id } = req.user;
        const connection = await db.getTransaction();

        try {
            await connection.beginTransaction();

            const [rows] = await connection.execute(
                'SELECT status, lock_version, student_id, resolved_at, reopened_count, department_id FROM complaints WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
                [complaintId, tenant_id]
            );

            if (rows.length === 0) throw new Error('COMPLAINT_NOT_FOUND');
            const complaint = rows[0];

            if (req.body.lock_version !== undefined && parseInt(req.body.lock_version) !== complaint.lock_version) {
                throw new Error('VERSION_CONFLICT');
            }

            if (actorRole === 'staff' || actorRole === 'hod') {
                const [membership] = await connection.execute(
                    'SELECT 1 FROM department_members WHERE department_id = $1 AND user_id = $2',
                    [complaint.department_id, actorId]
                );
                if (membership.length === 0) throw new Error('DPT_MEMBERSHIP_REQUIRED');
            }

            if (newStatus !== complaint.status) {
                const workflow = require('../utils/workflowEngine');
                if (!workflow.isValidTransition(complaint.status, newStatus, actorRole)) {
                    throw new Error('INVALID_TRANSITION');
                }
                if (newStatus === 'Reopened' || (complaint.status === 'Resolved' && newStatus === 'Pending')) {
                    if (actorRole === 'student') {
                        if (complaint.reopened_count >= 1) throw new Error('MAX_REOPEN_EXCEEDED');
                        if (!workflow.isWithinReopenWindow(complaint.resolved_at)) throw new Error('REOPEN_WINDOW_EXPIRED');
                    }
                }
                if (workflow.isReasonRequired(newStatus) && (!adminNotes || adminNotes.trim().length < 10)) {
                    throw new Error('REASON_REQUIRED');
                }
            } else if (actionType === 'STATUS_CHANGE') {
                if (!adminNotes || adminNotes.trim() === (complaint.admin_notes || '').trim()) {
                    await connection.rollback();
                    return { success: true, message: 'Already in target state', noOp: true };
                }
            }

            let updateSql = 'UPDATE complaints SET status = $1, admin_notes = $2, lock_version = lock_version + 1 ';
            const updateParams = [newStatus, adminNotes || null];
            let upCount = 2;

            if (newStatus === 'Resolved') {
                updateSql += ', resolved_at = CURRENT_TIMESTAMP ';
            }
            if (newStatus === 'Reopened' || (complaint.status === 'Resolved' && newStatus === 'Pending')) {
                updateSql += ', reopened_count = reopened_count + 1 ';
            }

            upCount++;
            updateSql += ` WHERE id = $${upCount}`;
            updateParams.push(complaintId);
            
            upCount++;
            updateSql += ` AND tenant_id = $${upCount}`;
            updateParams.push(tenant_id);

            // Strict Concurrency Lock: Include current lock_version in where clause
            upCount++;
            updateSql += ` AND lock_version = $${upCount}`;
            updateParams.push(complaint.lock_version);

            const updateResult = await connection.execute(updateSql, updateParams);
            
            if (updateResult.rowCount === 0) {
                throw new Error('VERSION_CONFLICT');
            }

            const audit = require('../utils/auditService');
            await audit.logAction(connection, {
                complaint_id: complaintId,
                actor_user_id: actorId,
                actor_role: actorRole,
                action_type: newStatus === complaint.status ? 'COMMENT_ADDED' : actionType,
                from_status: complaint.status,
                to_status: newStatus,
                note: adminNotes,
                visibility: actorRole === 'student' ? 'STUDENT_VISIBLE' : 'STAFF_ONLY',
                metadata: {
                    prev_version: complaint.lock_version,
                    new_version: complaint.lock_version + 1
                },
                req
            });

            await connection.commit();
            return { 
                success: true, 
                data: { 
                    new_status: newStatus, 
                    lock_version: complaint.lock_version + 1,
                    student_id: complaint.student_id,
                    department_id: complaint.department_id 
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

