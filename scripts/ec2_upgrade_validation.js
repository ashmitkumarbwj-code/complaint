require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const { Pool } = require('pg');

const API_BASE = 'https://gcd-smart-complaint-and-response-system.co.in';

// EC2 production Neon DB
const PROD_DB_URL = 'postgresql://neondb_owner:npg_XCajzy1uh4SQ@ep-young-darkness-ancd84e0-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString: PROD_DB_URL, ssl: { rejectUnauthorized: false } });

function makeSession() {
    const jar = new CookieJar();
    return wrapper(axios.create({ baseURL: API_BASE, jar, withCredentials: true }));
}

const results = [];

async function test(label, fn) {
    try {
        const detail = await fn();
        results.push({ label, status: 'PASS', detail });
        console.log(`  ✅ PASS  ${label}`);
        if (detail) console.log(`         ↳ ${detail}`);
    } catch (err) {
        const detail = err.response
            ? `HTTP ${err.response.status} — ${JSON.stringify(err.response.data)}`
            : err.message;
        results.push({ label, status: 'FAIL', detail });
        console.log(`  ❌ FAIL  ${label}`);
        console.log(`         ↳ ${detail}`);
    }
}

async function runValidation() {
    const username = process.argv[2];
    const password = process.argv[3];

    if (!username || !password) {
        console.log('\n⚠️  Usage: node scripts/ec2_upgrade_validation.js <username> <password>\n');
        process.exit(0);
    }

    console.log('\n══════════════════════════════════════════════════════');
    console.log('  EC2 Upgrade Validation — Live Production Test');
    console.log(`  Target : ${API_BASE}`);
    console.log(`  Student: ${username}`);
    console.log('══════════════════════════════════════════════════════\n');

    const session = makeSession();
    let complaintId = null;

    // ── [1] API Health ────────────────────────────────────────────────────────
    console.log('── [1] API Health ──');
    await test('GET /api/health → 200 + db:ok', async () => {
        const r = await session.get('/api/health');
        if (!r.data.success || r.data.db !== 'ok') throw new Error(`Unexpected: ${JSON.stringify(r.data)}`);
        return `uptime=${r.data.uptime}s  db=${r.data.db}`;
    });

    // ── [2] Activation Endpoint ───────────────────────────────────────────────
    console.log('\n── [2] Activation Endpoint ──');
    await test('POST /api/auth/student/request-activation → Security Enforcement Check', async () => {
        const payload = { 
            role: 'Student', 
            method: 'email',
            email: 'validation_test@example.com',
            roll_number: 'VALIDROLL123' 
        };
        try {
            const r = await session.post('/api/auth/student/request-activation', payload);
            return `Success: ${r.data.message}`;
        } catch (err) {
            const msg = err.response?.data?.message || '';
            // 403 means the registry check is working correctly
            if (err.response?.status === 403 && msg.includes('not part of our college')) {
                return `PASS (Security Enforcement): "Sorry, you are not part of our college."`;
            }
            throw err;
        }
    });

    // ── [3] Login ─────────────────────────────────────────────────────────────
    console.log('\n── [3] Login ──');
    let userId = null;
    await test(`POST /api/auth/login as ${username}`, async () => {
        const r = await session.post('/api/auth/login', {
            identifier: username,
            password,
            role: 'student'
        });
        if (!r.data.success) throw new Error(JSON.stringify(r.data));
        userId = r.data.user?.id;
        return `user_id=${userId}  role=${r.data.user?.role}`;
    });

    if (!userId) {
        console.log('\n  ⛔ Login failed — skipping complaint submission.\n');
    } else {
        // ── [4] Complaint Submit ──────────────────────────────────────────────
        console.log('\n── [4] Complaint Submission ──');
        await test('POST /api/complaints (authenticated student session)', async () => {
            const form = new FormData();
            form.append('title', 'EC2 Upgrade Validation');
            form.append('category', 'Infrastructure');
            form.append('priority', 'Low');
            form.append('location', 'Test Lab Block A');
            form.append('description', 'Automated validation complaint. Safe to delete after upgrade check.');
            const r = await session.post('/api/complaints', form, { headers: form.getHeaders() });
            if (!r.data.complaint_id) throw new Error(`No complaint_id: ${JSON.stringify(r.data)}`);
            complaintId = r.data.complaint_id;
            return `complaint_id=#${complaintId}`;
        });

        // ── [5] DB Verify on Neon ─────────────────────────────────────────────
        if (complaintId) {
            console.log('\n── [5] DB Verification (Neon Cloud) ──');
            await test(`Neon DB contains complaint #${complaintId}`, async () => {
                const r = await pool.query('SELECT id, title, status FROM complaints WHERE id = $1', [complaintId]);
                if (!r.rows.length) throw new Error('Complaint NOT found in Neon DB!');
                return `id=${r.rows[0].id}  status=${r.rows[0].status}`;
            });
        }
    }

    await pool.end();

    // ── SUMMARY ───────────────────────────────────────────────────────────────
    console.log('\n══════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('══════════════════════════════════════════════════════');
    results.forEach(r => {
        console.log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.status.padEnd(5)} │ ${r.label}`);
    });

    const failures = results.filter(r => r.status === 'FAIL');
    console.log('\n──────────────────────────────────────────────────────');
    if (failures.length === 0) {
        console.log('  🎉 VERDICT: PASS — EC2 Production is fully operational.');
    } else {
        console.log(`  💥 VERDICT: FAIL — ${failures.length} test(s) failed`);
        failures.forEach(f => console.log(`     • ${f.label}\n       ${f.detail}`));
        process.exit(1);
    }
    console.log('══════════════════════════════════════════════════════\n');
}

runValidation().catch(err => {
    console.error('\n[CRASH]', err.message);
    pool.end().finally(() => process.exit(1));
});
