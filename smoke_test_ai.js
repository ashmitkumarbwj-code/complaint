/**
 * Phase 2 Smoke Test: AI Suggestion Application (v2)
 */
const axios = require('axios');
require('dotenv').config();

const API_BASE = 'http://localhost:3000/api';
let cookie = '';

async function loginPrincipal() {
    console.log('--- Step 1: Principal Login ---');
    try {
        const res = await axios.post(`${API_BASE}/auth/login`, {
            role: 'principal',
            identifier: 'test_principal_dummy',
            password: 'password123',
            tenant_id: 1
        });
        
        // Axios stores cookies in headers['set-cookie']
        if (res.headers['set-cookie']) {
            cookie = res.headers['set-cookie'][0];
            console.log('✅ Principal logged in.');
        } else {
            console.log('⚠️ Login succeeded but no cookie returned. Is the server using sessions or JWT in body?');
            // Check if token is in body
            if (res.data.token) {
                console.log('✅ JWT found in response body.');
                // We'll use Bearer token if cookie is missing
            }
        }
    } catch (err) {
        console.error('❌ Login failed:', err.response?.data || err.message);
        // Fallback to test_staff if principal fails
        await loginStaff();
    }
}

async function loginStaff() {
    console.log('--- Step 1b: Staff Login Fallback ---');
    try {
        const res = await axios.post(`${API_BASE}/auth/login`, {
            role: 'staff',
            identifier: 'test_staff_7',
            password: 'password123',
            tenant_id: 1
        });
        if (res.headers['set-cookie']) {
            cookie = res.headers['set-cookie'][0];
            console.log('✅ Staff logged in.');
        }
    } catch (err) {
        console.error('❌ Staff Login failed:', err.response?.data || err.message);
        process.exit(1);
    }
}

async function testApplyAi(complaintId) {
    console.log(`\n--- Step 2: Testing Apply AI for #${complaintId} ---`);
    try {
        const headers = cookie ? { Cookie: cookie } : {};
        const res = await axios.post(`${API_BASE}/complaints/${complaintId}/apply-ai`, 
        { type: 'both' },
        { 
            headers,
            withCredentials: true
        });
        console.log('✅ AI Suggestion applied:', res.data);
    } catch (err) {
        console.error('❌ Apply AI failed:', err.response?.data || err.message);
        console.log('   (This is expected if no AI analysis exists for this ID yet)');
    }
}

async function checkAuditLog(complaintId) {
    console.log(`\n--- Step 3: Checking Audit Log for #${complaintId} ---`);
    try {
        const headers = cookie ? { Cookie: cookie } : {};
        const res = await axios.get(`${API_BASE}/complaints/${complaintId}/history`, {
            headers,
            withCredentials: true
        });
        const history = res.data.history || [];
        const aiLog = history.find(h => h.action_type === 'AI_SUGGESTION_APPLIED');
        if (aiLog) {
            console.log('✅ Audit log entry found!');
            console.log('   - Note:', aiLog.note);
        } else {
            console.log('❌ AI_SUGGESTION_APPLIED log not found in history.');
        }
    } catch (err) {
        console.error('❌ History fetch failed:', err.response?.data || err.message);
    }
}

async function run() {
    await loginPrincipal();
    // Try some IDs
    for (let id of [1, 2, 3]) {
        await testApplyAi(id);
        await checkAuditLog(id);
    }
}

run();
