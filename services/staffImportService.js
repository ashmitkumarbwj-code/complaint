'use strict';

/**
 * services/staffImportService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Bulk Staff Import service.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const db = require('../config/db');
const mailService = require('../utils/mailService');
const logger = require('../utils/logger');

// Required fields for staff import
const REQUIRED_FIELDS = ['name', 'email', 'department', 'role'];

/**
 * Approved Department Alias Map (lowercase alias → exact DB name).
 */
const DEPT_ALIASES = {
    'cs':                    'Computer Science',
    'cse':                   'Computer Science',
    'comp sci':              'Computer Science',
    'computer science':      'Computer Science',
    'electronics':           'Electronics',
    'mechanical':            'Mechanical Engineering',
    'civil':                 'Civil Engineering',
    'business':              'Business Administration',
    'bba':                   'Business Administration',
    'mba':                   'Business Administration',
    'admin':                 'General Administration',
    'maintenance':           'Maintenance',
};

/**
 * Validate a single staff row.
 */
function validateRow(row, validDepts) {
    for (const field of REQUIRED_FIELDS) {
        if (!row[field] || String(row[field]).trim() === '') {
            return { error: `Missing required field: ${field}`, resolvedDept: null };
        }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(row.email)) {
        return { error: `Invalid email format: ${row.email}`, resolvedDept: null };
    }

    const deptLower = row.department.trim().toLowerCase();
    let resolvedDept = DEPT_ALIASES[deptLower] || null;

    if (!resolvedDept) {
        if (validDepts.has(deptLower)) {
            resolvedDept = '__EXACT_MATCH__';
        }
    }

    if (!resolvedDept) {
        return {
            error: `Assign department before activation. Unknown: "${row.department}".`,
            resolvedDept: null
        };
    }

    return { error: null, resolvedDept };
}

const MAX_ROWS = 2000;
const CHUNK_SIZE = 200;

/**
 * Main bulk import function for Staff.
 * Accepts a JSON array (parsed from frontend).
 *
 * @param {object[]} rows - parsed data array
 * @param {object} req - Express request
 * @param {boolean} isDryRun - if true, validates but does not commit to DB
 * @returns {Promise<object>} - JSON import summary
 */
async function bulkImportStaff(rows, req, isDryRun = false) {
    const tenantId = req.user?.tenant_id || 1;
    const baseUrl = process.env.BASE_URL || `http://${req.get('host')}`;

    const summary = {
        total: rows.length,
        inserted: 0,
        duplicates: 0,
        invalid: 0,
        failedRows: [],
        emailsSent: 0,
        emailsFailed: 0,
    };

    if (rows.length === 0) return summary;

    // 🛡️ Pro Guard: Row Limit Protection
    if (rows.length > MAX_ROWS) {
        throw new Error(`FILE_TOO_LARGE: Max ${MAX_ROWS} rows allowed per ingestion.`);
    }

    // 1. Fetch valid departments
    const [deptRows] = await db.tenantExecute(req, 'SELECT id, name FROM departments');
    const validDepts = new Set(deptRows.map(d => d.name.toLowerCase()));
    const deptNameMap = Object.fromEntries(deptRows.map(d => [d.name.toLowerCase(), d.name]));
    const deptIdMap   = Object.fromEntries(deptRows.map(d => [d.name, d.id]));

    // 2. Batch/Chunk Processing
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const client = await db.getTransaction();

        try {
            await client.beginTransaction();

            for (const row of chunk) {
                const email    = (row.email || '').trim().toLowerCase();
                const name     = (row.name || '').trim();
                const role     = (row.role || 'Staff').trim();
                const mobile   = (row.mobile_number || row.mobile || '').trim() || '0000000000';

                // 2.1 Validation
                const { error: validationError, resolvedDept } = validateRow({ ...row, email }, validDepts);
                if (validationError) {
                    summary.invalid++;
                    summary.failedRows.push({ ...row, error_reason: validationError });
                    continue;
                }

                const canonicalDept = resolvedDept === '__EXACT_MATCH__'
                    ? deptNameMap[row.department.trim().toLowerCase()]
                    : resolvedDept;
                
                const department_id = deptIdMap[canonicalDept];

                // 2.2 Duplicate Check
                const [existing] = await client.execute(
                    'SELECT 1 FROM verified_staff WHERE email = $1 AND tenant_id = $2',
                    [email, tenantId]
                );

                if (existing.length > 0) {
                    summary.duplicates++;
                    summary.failedRows.push({ ...row, error_reason: 'Email already in master registry' });
                    continue;
                }

                if (isDryRun) {
                    summary.inserted++;
                    continue;
                }

                // 2.3 Insertion
                await client.execute(
                    `INSERT INTO verified_staff (tenant_id, name, email, mobile_number, department_id, role)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [tenantId, name, email, mobile, department_id, role]
                );

                summary.inserted++;

                // 2.4 Invite Email
                const loginUrl = `${baseUrl}/login.html?role=${role}`;
                try {
                    await mailService.sendEmail({
                        to: email,
                        subject: `Welcome to Smart Campus - Activate your ${role} Portal`,
                        text: `Hello ${name},\n\nYour ${role} account has been authorized by the Admin.\n\nPlease visit the link below, click "Activate Account", and verify your registered mobile number (${mobile}) via OTP to set your password:\n\n${loginUrl}\n\nWelcome aboard!`
                    });
                    summary.emailsSent++;
                } catch (mailErr) {
                    summary.emailsFailed++;
                    logger.error(`[StaffImport] Email failed for ${email}:`, mailErr.message);
                }
            }

            await client.commit();
        } catch (chunkErr) {
            await client.rollback();
            logger.error(`[StaffImport] Chunk failure at index ${i}:`, chunkErr.message);
            chunk.forEach(r => summary.failedRows.push({ ...r, error_reason: `Batch transaction failure: ${chunkErr.message}` }));
            summary.invalid += chunk.length;
        } finally {
            client.release();
        }
    }

    return summary;
}

module.exports = { bulkImportStaff };
