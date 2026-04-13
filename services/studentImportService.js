'use strict';

/**
 * services/studentImportService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Bulk Student Import via CSV.
 *
 * Rules (Approved):
 *   - Strict department matching: name must exactly match departments.name in DB
 *   - Skip and report duplicates (roll_number must be unique per tenant)
 *   - Firebase: create disabled account per valid student email
 *   - Email: send activation link via Firebase Password Reset / Verify Email
 *   - Return JSON summary: { total, inserted, duplicates, invalid, emailsQueued, emailsFailed }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { parse } = require('csv-parse');
const { Readable } = require('stream');
const db = require('../config/db');
const mailService = require('../utils/mailService');
const logger = require('../utils/logger');

// Required CSV columns (case-insensitive header mapping below)
const REQUIRED_FIELDS = ['roll_number', 'name', 'email', 'department', 'year'];

// Maps lowercase CSV header → canonical field name
const HEADER_MAP = {
    roll_number: 'roll_number',
    rollno: 'roll_number',
    'roll no': 'roll_number',
    name: 'name',
    fullname: 'name',
    'full name': 'name',
    email: 'email',
    'email address': 'email',
    department: 'department',
    dept: 'department',
    year: 'year',
    semester: 'year',
    mobile: 'mobile_number',
    mobile_number: 'mobile_number',
    phone: 'mobile_number',
};

/**
 * Approved Department Alias Map (lowercase alias → exact DB name).
 * Admins may use these shorthands in CSV; all others fail strict validation.
 * To extend: add entries here or move to a config/department_aliases.json.
 */
const DEPT_ALIASES = {
    // Computer Science
    'cs':                    'Computer Science',
    'cse':                   'Computer Science',
    'comp sci':              'Computer Science',
    'computer science':      'Computer Science',
    // Electronics
    'ec':                    'Electronics',
    'ece':                   'Electronics',
    'electronics':           'Electronics',
    // Mechanical
    'me':                    'Mechanical Engineering',
    'mech':                  'Mechanical Engineering',
    'mechanical':            'Mechanical Engineering',
    'mechanical engineering':'Mechanical Engineering',
    // Civil
    'ce':                    'Civil Engineering',
    'civil':                 'Civil Engineering',
    'civil engineering':     'Civil Engineering',
    // Business Administration
    'ba':                    'Business Administration',
    'bba':                   'Business Administration',
    'business administration':'Business Administration',
    // Maintenance / Admin
    'maintenance':           'Maintenance',
    'general administration':'General Administration',
    'admin':                 'General Administration',
};

/**
 * Normalize CSV headers to canonical field names.
 * @param {string[]} headers
 * @returns {string[]}
 */
function normalizeHeaders(headers) {
    return headers.map(h => HEADER_MAP[h.trim().toLowerCase()] || h.trim().toLowerCase());
}

/**
 * Validate a single student row. Resolves department aliases before strict matching.
 * @param {object} row - normalized keys
 * @param {Set<string>} validDepts - lowercase set of valid DB department names
 * @returns {{ error: string|null, resolvedDept: string|null }}
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

    // 1. Try alias map first (covers shorthand like 'CS', 'CSE')
    const deptLower = row.department.trim().toLowerCase();
    let resolvedDept = DEPT_ALIASES[deptLower] || null;

    // 2. If no alias, try direct DB match (exact name, case-insensitive)
    if (!resolvedDept) {
        if (validDepts.has(deptLower)) {
            // Get the canonical casing from DB via validDepts iteration would require a map,
            // so we pass canonical resolution via deptNameMap in the caller
            resolvedDept = '__EXACT_MATCH__'; // signal to caller to use deptNameMap
        }
    }

    if (!resolvedDept) {
        return {
            error: `Unknown department: "${row.department}". Use exact department name or an approved alias (e.g. CS, CSE, ECE, ME).`,
            resolvedDept: null
        };
    }

    return { error: null, resolvedDept };
}

/**
 * Parse a CSV buffer into an array of row objects.
 * @param {Buffer} buffer
 * @returns {Promise<object[]>}
 */
function parseCSV(buffer) {
    return new Promise((resolve, reject) => {
        const rows = [];
        const stream = Readable.from(buffer.toString('utf8'));

        stream
            .pipe(parse({
                columns: headers => normalizeHeaders(headers),
                skip_empty_lines: true,
                trim: true,
            }))
            .on('data', row => rows.push(row))
            .on('end', () => resolve(rows))
            .on('error', err => reject(err));
    });
}

/**
 * Get Firebase admin instance (gracefully handles unconfigured env).
 * @returns {object|null}
 */
function getFirebaseAdmin() {
    try {
        const admin = require('../config/firebase');
        // Only return if actually initialized
        if (admin.apps && admin.apps.length > 0) return admin;
        return null;
    } catch {
        return null;
    }
}

/**
 * Create a disabled Firebase user and generate an activation link.
 * Returns { link, error } — link is null if firebase is not configured.
 * @param {string} email
 * @param {string} baseUrl - frontend base URL  
 * @returns {Promise<{ link: string|null, error: string|null }>}
 */
async function createFirebaseUserAndLink(email, baseUrl) {
    const admin = getFirebaseAdmin();
    if (!admin) {
        // Graceful degradation: Firebase not configured, skip enrollment
        return { link: null, error: 'Firebase not configured' };
    }

    try {
        // Check if user already exists in Firebase
        let firebaseUser;
        try {
            firebaseUser = await admin.auth().getUserByEmail(email);
        } catch (fetchErr) {
            if (fetchErr.code === 'auth/user-not-found') {
                // Create as disabled (requires activation to enable)
                firebaseUser = await admin.auth().createUser({
                    email,
                    disabled: true,
                    emailVerified: false,
                });
            } else {
                throw fetchErr;
            }
        }

        // Generate an activation link pointing to our custom page
        const actionCodeSettings = {
            url: `${baseUrl}/activate.html?email=${encodeURIComponent(email)}`,
            handleCodeInApp: false,
        };

        const link = await admin.auth().generatePasswordResetLink(email, actionCodeSettings);
        return { link, error: null };

    } catch (err) {
        logger.error(`[StudentImport] Firebase enrollment failed for ${email}:`, err.message);
        return { link: null, error: err.message };
    }
}

/**
 * Main bulk import function.
 *
 * @param {Buffer} csvBuffer - raw CSV file buffer
 * @param {object} req - Express request (for tenant context + base URL)
 * @returns {Promise<object>} - JSON import summary
 */
async function bulkImportStudents(csvBuffer, req) {
    const tenantId = req.user?.tenant_id || 1;
    const baseUrl = process.env.BASE_URL || `http://${req.get('host')}`;

    const summary = {
        total: 0,
        inserted: 0,
        duplicates: [],
        invalid: [],
        emailsQueued: 0,
        emailsFailed: 0,
    };

    // 1. Parse CSV
    let rows;
    try {
        rows = await parseCSV(csvBuffer);
    } catch (parseErr) {
        throw new Error(`CSV_PARSE_ERROR: ${parseErr.message}`);
    }

    summary.total = rows.length;
    if (rows.length === 0) return summary;

    // 2. Fetch valid departments for strict matching (tenant-scoped)
    const [deptRows] = await db.tenantExecute(req, 'SELECT name FROM departments');
    const validDepts = new Set(deptRows.map(d => d.name.toLowerCase()));
    const deptNameMap = Object.fromEntries(deptRows.map(d => [d.name.toLowerCase(), d.name]));

    // 3. Fetch existing roll numbers AND emails to detect all duplicates early
    const [existingRows] = await db.tenantExecute(req,
        'SELECT roll_number, email FROM verified_students'
    );
    const existingRollNumbers = new Set(existingRows.map(r => r.roll_number.toLowerCase()));
    const existingEmails      = new Set(existingRows.map(r => (r.email || '').toLowerCase()));

    // 4. Process each row
    for (const row of rows) {
        const rollNorm = (row.roll_number || '').trim();
        const email    = (row.email || '').trim().toLowerCase();
        const name     = (row.name || '').trim();
        const year     = (row.year || '').trim();
        const mobile   = (row.mobile_number || '').trim() || null;

        // Validation (alias resolution + field checks)
        const { error: validationError, resolvedDept } = validateRow({ ...row, email }, validDepts);
        if (validationError) {
            summary.invalid.push({ roll_number: rollNorm || '(empty)', reason: validationError });
            continue;
        }

        // Resolve canonical department name
        // __EXACT_MATCH__ means the alias map didn't hit but DB match succeeded
        const canonicalDept = resolvedDept === '__EXACT_MATCH__'
            ? deptNameMap[row.department.trim().toLowerCase()]
            : resolvedDept; // alias already resolved to canonical DB name

        // Duplicate check — skip by roll_number OR email (both identify a student)
        if (existingRollNumbers.has(rollNorm.toLowerCase())) {
            summary.duplicates.push({ roll_number: rollNorm, email, reason: 'Roll number already in registry' });
            continue;
        }
        if (existingEmails.has(email)) {
            summary.duplicates.push({ roll_number: rollNorm, email, reason: 'Email already in registry' });
            continue;
        }

        // 5. Insert into verified_students
        try {
            await db.tenantExecute(req,
                `INSERT INTO verified_students (tenant_id, roll_number, department, year, mobile_number, email, is_account_created)
                 VALUES ($1, $2, $3, $4, $5, $6, FALSE)`,
                [tenantId, rollNorm, canonicalDept, year, mobile, email]
            );

            // Track locally to prevent intra-batch duplicates
            existingRollNumbers.add(rollNorm.toLowerCase());
            existingEmails.add(email);
            summary.inserted++;
        } catch (dbErr) {
            // PostgreSQL unique constraint violation (concurrent insert)
            if (dbErr.code === '23505') {
                summary.duplicates.push({ roll_number: rollNorm, email, reason: 'Concurrent duplicate detected' });
                continue;
            }
            logger.error(`[StudentImport] DB insert error for ${rollNorm}:`, dbErr.message);
            summary.invalid.push({ roll_number: rollNorm, reason: `DB error: ${dbErr.message}` });
            continue;
        }

        // 6. Firebase enrollment + activation email
        const { link, error: firebaseErr } = await createFirebaseUserAndLink(email, baseUrl);

        if (link) {
            const sent = await mailService.sendStudentActivationEmail({
                to: email,
                name: name || rollNorm,
                activationLink: link,
            });
            if (sent) {
                summary.emailsQueued++;
            } else {
                summary.emailsFailed++;
                logger.warn(`[StudentImport] Activation email failed for ${email}`);
            }
        } else {
            // Firebase not configured — email without a personalized link
            logger.warn(`[StudentImport] Skipping Firebase enrollment for ${email}: ${firebaseErr}`);
            // Still count as inserted, but no email sent
        }
    }

    logger.info(`[StudentImport] Complete — Tenant ${tenantId}:`, summary);
    return summary;
}

module.exports = { bulkImportStudents };
