require('dotenv').config();
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const { Pool } = require('pg');

const PROD_URL = 'postgresql://neondb_owner:npg_XCajzy1uh4SQ@ep-young-darkness-ancd84e0-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require';
const API_BASE = 'https://gcd-smart-complaint-and-response-system.co.in';

const pool = new Pool({
    connectionString: PROD_URL,
    ssl: { rejectUnauthorized: false }
});

function makeSession() {
    const jar = new CookieJar();
    return wrapper(axios.create({ baseURL: API_BASE, jar, withCredentials: true }));
}

async function runAudit() {
    console.log('🚀 Starting Admin User Management Verification...');

    const session = makeSession();
    try {
        // 1. Login as admin
        const login = await session.post('/api/auth/login', {
            identifier: 'testadmin',
            password: 'Admin@1234',
            role: 'admin'
        });
        
        if (!login.data.success) throw new Error('Admin login failed: ' + JSON.stringify(login.data));
        console.log('✅ Admin login successful');

        // 2. API Smoke Test
        const r = await session.get('/api/admin/users', { params: { role: 'student' } });
        console.log(`Users List (Student Filter): ${r.data.users?.length || 0} found`);
        
        if (r.data.users && r.data.users.length > 0) {
            const testStudent = r.data.users.find(u => u.name && u.name.toLowerCase().includes('test')) || r.data.users[0];
            const testUserId = testStudent.id;
            console.log(`Selected Test User: ${testStudent.name || 'N/A'} (ID: ${testUserId})`);

            // 3. Soft Delete Test
            console.log(`Deactivating user ID ${testUserId}...`);
            const deactivate = await session.delete(`/api/admin/users/student/${testUserId}`);
            console.log('Deactivation Response:', deactivate.data.message);

            // Verify in DB
            const dbCheck = await pool.query('SELECT is_active FROM verified_students WHERE id = $1', [testUserId]);
            console.log('is_active in DB:', dbCheck.rows[0].is_active);

            // Verify Audit Log
            const auditLog = await pool.query('SELECT action, target_id, details FROM admin_audit_logs ORDER BY created_at DESC LIMIT 1');
            console.table(auditLog.rows);

            // 4. Rollback (Reactivate)
            console.log(`Reactivating user ID ${testUserId}...`);
            const reactivate = await session.put(`/api/admin/users/student/${testUserId}`, {
                is_active: true
            });
            console.log('Reactivation Response:', reactivate.data.message);
            
            const finalStatus = await pool.query('SELECT is_active FROM verified_students WHERE id = $1', [testUserId]);
            console.log('Final is_active in DB:', finalStatus.rows[0].is_active);
        }

    } catch (err) {
        console.error('Audit failed:', err.response?.data || err.message);
    } finally {
        await pool.end();
    }
}

runAudit();
