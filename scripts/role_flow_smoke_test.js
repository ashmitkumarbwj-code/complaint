/**
 * Role Flow Smoke Test (V2 Workflow Hardening)
 *
 * Verifies the strict state-machine lifecycle:
 * SUBMITTED → FORWARDED → HOD_VERIFIED → IN_PROGRESS
 *   → STAFF_RESOLVED → HOD_APPROVED → CLOSED → REOPENED (once only)
 *
 * Uses tough-cookie jar to correctly handle httpOnly session cookies.
 * Run: node scripts/role_flow_smoke_test.js
 */

require('dotenv').config();
const axios      = require('axios');
const FormData   = require('form-data');
const fs         = require('fs');
const { Pool }   = require('pg');

// ── Polyfill cookie-jar support ───────────────────────────────────────────────
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const API_BASE = 'http://localhost:3000';

// ── DB pool (to fetch real test credentials) ──────────────────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeSession() {
    const jar = new CookieJar();
    const client = wrapper(axios.create({ baseURL: API_BASE, jar, withCredentials: true }));
    return client;
}

async function runSmokeTest() {
    console.log('\n══════════════════════════════════════════════════════');
    console.log('  V2 Role Flow Smoke Test');
    console.log('══════════════════════════════════════════════════════\n');

    const results = [];
    const state   = {};

    async function test(name, fn) {
        try {
            const detail = await fn();
            results.push({ name, status: 'PASS', detail });
            console.log(`  ✅ PASS  ${name}`);
            if (detail) console.log(`         ↳ ${detail}`);
        } catch (err) {
            const detail = err.response
                ? `HTTP ${err.response.status} — ${JSON.stringify(err.response.data)}`
                : err.message;
            results.push({ name, status: 'FAIL', detail });
            console.log(`  ❌ FAIL  ${name}`);
            console.log(`         ↳ ${detail}`);
        }
    }

    // ── Sessions ──────────────────────────────────────────────────────────────
    const studentSess = makeSession();
    const adminSess   = makeSession();
    const hodSess     = makeSession();
    const staffSess   = makeSession();

    // ── Phase 0: Fetch real credentials from DB ───────────────────────────────
    console.log('── Phase 0: Resolving credentials ──');
    let hodUsername   = null;
    let staffUsername = null;
    let studentIdentifier = 'test_student_3'; // known activated student

    await test('Resolve HOD username from DB', async () => {
        const r = await pool.query(`
            SELECT username FROM users
            WHERE role = 'hod'
              AND (failed_attempts IS NULL OR failed_attempts < 5)
              AND status = 'active'
            LIMIT 1
        `);
        if (!r.rows.length) throw new Error('No unlocked HOD found in DB');
        hodUsername = r.rows[0].username;
        return `HOD: ${hodUsername}`;
    });

    await test('Resolve Staff username from DB', async () => {
        const r = await pool.query(`
            SELECT username FROM users
            WHERE role = 'staff'
              AND (failed_attempts IS NULL OR failed_attempts < 5)
              AND status = 'active'
            LIMIT 1
        `);
        if (!r.rows.length) throw new Error('No unlocked Staff found in DB');
        staffUsername = r.rows[0].username;
        return `Staff: ${staffUsername}`;
    });

    await test('Reset failed_attempts for HOD & Staff (unlock)', async () => {
        await pool.query(`
            UPDATE users SET failed_attempts = 0, locked_until = NULL
            WHERE username = $1 OR username = $2
        `, [hodUsername, staffUsername]);
        return 'Unlocked';
    });

    // ── Phase 1: Login all roles ──────────────────────────────────────────────
    console.log('\n── Phase 1: Logins ──');

    await test('Student login', async () => {
        const r = await studentSess.post('/api/auth/login', {
            identifier: studentIdentifier, password: 'Admin@1234', role: 'student'
        });
        state.studentUserId = r.data.user?.id;
        return `uid=${state.studentUserId}`;
    });

    await test('Admin login', async () => {
        const r = await adminSess.post('/api/auth/login', {
            identifier: 'testadmin', password: 'Admin@1234', role: 'admin'
        });
        return `uid=${r.data.user?.id}`;
    });

    await test('HOD login', async () => {
        const r = await hodSess.post('/api/auth/login', {
            identifier: hodUsername, password: 'Admin@1234', role: 'staff'
        });
        state.hodDeptId = r.data.user?.department_id;
        state.hodUserId = r.data.user?.id;
        return `uid=${state.hodUserId} dept=${state.hodDeptId}`;
    });

    await test('Staff login', async () => {
        // Pick a staff member in the same dept as HOD
        const r2 = await pool.query(`
            SELECT u.id, u.username FROM users u
            JOIN staff s ON s.user_id = u.id
            WHERE u.role = 'staff'
              AND s.department_id = $1
              AND u.status = 'active'
              AND (u.failed_attempts IS NULL OR u.failed_attempts < 5)
            LIMIT 1
        `, [state.hodDeptId]);
        if (r2.rows.length) {
            staffUsername = r2.rows[0].username;
            await pool.query(`UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=$1`, [r2.rows[0].id]);
        }

        const r = await staffSess.post('/api/auth/login', {
            identifier: staffUsername, password: 'Admin@1234', role: 'staff'
        });
        state.staffUserId = r.data.user?.id;
        return `uid=${state.staffUserId}`;
    });

    // ── Phase 2: Submit Complaint ─────────────────────────────────────────────
    console.log('\n── Phase 2: Submit Complaint ──');

    await test('Student submits complaint', async () => {
        const form = new FormData();
        form.append('title', 'Smoke Test V2 AC Broken');
        form.append('category', 'Infrastructure');
        form.append('priority', 'Medium');
        form.append('location', 'Lab 2, Block A');
        form.append('description', 'The AC is leaking water on the workstations during operation.');
        if (fs.existsSync('public/images/logo.png')) {
            form.append('image', fs.createReadStream('public/images/logo.png'));
        }
        const r = await studentSess.post('/api/complaints', form, { headers: form.getHeaders() });
        if (!r.data.complaint_id) throw new Error(`No complaint_id in response: ${JSON.stringify(r.data)}`);
        state.complaintId = r.data.complaint_id;
        return `complaint #${state.complaintId}`;
    });

    // ── Phase 3: V2 State-Machine Lifecycle ───────────────────────────────────
    console.log('\n── Phase 3: V2 Workflow Lifecycle ──');

    const patch = (sess, status, extra = {}) =>
        sess.patch(`/api/complaints/status/${state.complaintId}`, { status, ...extra });

    await test('Admin forwards → FORWARDED', async () => {
        const r = await patch(adminSess, 'FORWARDED', {
            reason: 'Valid complaint, routing to CS dept',
            targetDeptId: state.hodDeptId
        });
        return r.data.message;
    });

    await test('HOD verifies & assigns → HOD_VERIFIED', async () => {
        const r = await patch(hodSess, 'HOD_VERIFIED', {
            reason: 'Verified. Assigning to staff.',
            targetStaffId: state.staffUserId
        });
        return r.data.message;
    });

    await test('Staff accepts → IN_PROGRESS', async () => {
        const r = await patch(staffSess, 'IN_PROGRESS', {
            reason: 'Starting work on the AC unit.'
        });
        return r.data.message;
    });

    await test('Staff resolves → STAFF_RESOLVED', async () => {
        const r = await patch(staffSess, 'STAFF_RESOLVED', {
            reason: 'AC coolant refilled, leak fixed.'
        });
        return r.data.message;
    });

    await test('HOD approves → HOD_APPROVED', async () => {
        const r = await patch(hodSess, 'HOD_APPROVED', {
            reason: 'Work verified on-site. Approved.'
        });
        return r.data.message;
    });

    await test('Admin closes → CLOSED', async () => {
        const r = await patch(adminSess, 'CLOSED', {
            reason: 'Final administrative closure.'
        });
        return r.data.message;
    });

    // ── Phase 4: Student Reopen (max 1) ───────────────────────────────────────
    console.log('\n── Phase 4: Student Reopen Rules ──');

    await test('Student reopens after CLOSED → REOPENED (1st, should pass)', async () => {
        const r = await patch(studentSess, 'REOPENED', {
            reason: 'Issue has recurred — still leaking after one day.'
        });
        return r.data.message;
    });

    await test('2nd reopen attempt (should be blocked → 403)', async () => {
        // Re-cycle: HOD → IN_PROGRESS → STAFF_RESOLVED → HOD_APPROVED → CLOSED
        await patch(hodSess, 'HOD_VERIFIED', { reason: 'Re-assessing', targetStaffId: state.staffUserId });
        await patch(staffSess, 'IN_PROGRESS',     { reason: 'Working again' });
        await patch(staffSess, 'STAFF_RESOLVED',  { reason: 'Fixed again' });
        await patch(hodSess,   'HOD_APPROVED',    { reason: 'Approved again' });
        await patch(adminSess, 'CLOSED',          { reason: 'Closed again' });

        try {
            await patch(studentSess, 'REOPENED', { reason: 'Trying to reopen a second time.' });
            throw new Error('Was allowed to reopen a second time — SECURITY BREACH');
        } catch (err) {
            if (err.response?.status === 403) return `Correctly blocked (403)`;
            throw err;
        }
    });

    // ── Phase 5: Security Guards ──────────────────────────────────────────────
    console.log('\n── Phase 5: Security Guards ──');

    await test('Staff cannot perform Admin action (FORWARDED → should fail)', async () => {
        try {
            // Create a fresh complaint to test on
            const form2 = new FormData();
            form2.append('title', 'Security Guard Test');
            form2.append('category', 'Noise');
            form2.append('priority', 'Low');
            form2.append('location', 'Corridor');
            form2.append('description', 'Loud noise from construction near labs');
            const sub = await studentSess.post('/api/complaints', form2, { headers: form2.getHeaders() });
            const id2 = sub.data.complaint_id;

            await staffSess.patch(`/api/complaints/status/${id2}`, {
                status: 'FORWARDED', reason: 'Staff trying to act as Admin'
            });
            throw new Error('Staff was allowed to FORWARD — SECURITY BREACH');
        } catch (err) {
            if (err.response?.status === 403) return `Correctly blocked (403)`;
            throw err;
        }
    });

    await pool.end();

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log('\n══════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('══════════════════════════════════════════════════════');
    const pad = 50;
    results.forEach(r => {
        const icon = r.status === 'PASS' ? '✅' : '❌';
        console.log(`  ${icon} ${r.status.padEnd(5)} │ ${r.name.padEnd(pad)} │ ${r.detail}`);
    });

    const failures = results.filter(r => r.status === 'FAIL');
    console.log('\n──────────────────────────────────────────────────────');
    if (failures.length === 0) {
        console.log('  🎉 VERDICT: PASS — V2 Workflow is Production-Ready');
    } else {
        console.log(`  💥 VERDICT: FAIL — ${failures.length} test(s) failed`);
        failures.forEach(f => console.log(`     • ${f.name}`));
    }
    console.log('══════════════════════════════════════════════════════\n');

    process.exit(failures.length === 0 ? 0 : 1);
}

runSmokeTest().catch(err => {
    console.error('Smoke test crashed:', err);
    process.exit(1);
});
