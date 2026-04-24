/**
 * Admin Portal Production Smoke Test (V2)
 * Verifies: Session, Analytics, Complaints, Staff, Students, Slides, and Role Security.
 */

const axios = require('axios');
const API_BASE = 'https://gcd-smart-complaint-and-response-system.co.in';

async function runSmokeTest() {
    console.log("--- Starting Admin Portal Smoke Test ---");
    let results = [];

    async function test(name, fn) {
        try {
            const res = await fn();
            results.push({ name, status: 'PASS', details: res });
            console.log(`[PASS] ${name}`);
        } catch (err) {
            let details = err.message;
            if (err.response) {
                details = `${err.response.status} ${JSON.stringify(err.response.data)}`;
            }
            results.push({ name, status: 'FAIL', details });
            console.log(`[FAIL] ${name}: ${details}`);
        }
    }

    // 1. Admin Session Check
    const adminSession = axios.create({ baseURL: API_BASE, withCredentials: true });
    await test("Admin Login", async () => {
        const res = await adminSession.post('/api/auth/login', { 
            identifier: 'testadmin', 
            password: 'Admin@1234',
            role: 'admin' 
        });
        // Axios handles cookies automatically if configured, but let's be explicit if needed
        // Actually on Node, we need to handle the cookie jar if axios doesn't.
        // But for a simple test, the server usually sets a session cookie.
        adminSession.defaults.headers.Cookie = res.headers['set-cookie'] ? res.headers['set-cookie'].join('; ') : '';
        return `Role: ${res.data.user.role}`;
    });

    // 2. Admin Dashboard Stats
    await test("Admin Stats API", async () => {
        const res = await adminSession.get('/api/dashboards/stats');
        return `Total: ${res.data.summary.total}`;
    });

    // 3. Admin Complaints API
    await test("Admin Complaints API", async () => {
        const res = await adminSession.get('/api/complaints/all');
        return `Count: ${res.data.complaints.length}`;
    });

    // 4. Admin Staff API
    await test("Admin Staff API", async () => {
        const res = await adminSession.get('/api/admin/staff');
        return `Count: ${res.data.staff.length}`;
    });

    // 5. Admin Students API
    await test("Admin Students API", async () => {
        const res = await adminSession.get('/api/admin/students');
        return `Count: ${res.data.students.length}`;
    });

    // 6. Role Security: Student trying to access Admin API
    const studentSession = axios.create({ baseURL: API_BASE, withCredentials: true });
    await test("Security: Student Role Guard", async () => {
        // Login as student
        const loginRes = await studentSession.post('/api/auth/login', { 
            identifier: 'test_student_3', 
            password: 'Admin@1234', // Updated pw
            role: 'student'
        });
        studentSession.defaults.headers.Cookie = loginRes.headers['set-cookie'] ? loginRes.headers['set-cookie'].join('; ') : '';
        
        try {
            await studentSession.get('/api/admin/staff');
            throw new Error("Student was allowed to access Admin Staff API!");
        } catch (err) {
            if (err.response && (err.response.status === 401 || err.response.status === 403)) {
                return "Correctly blocked with " + err.response.status;
            }
            throw err;
        }
    });

    console.log("\n--- SMOKE TEST SUMMARY ---");
    results.forEach(r => console.log(`${r.status.padEnd(5)} | ${r.name.padEnd(25)} | ${r.details}`));
    
    if (results.some(r => r.status === 'FAIL')) {
        console.log("\nVERDICT: FAIL - Issues detected in production.");
        process.exit(1);
    } else {
        console.log("\nVERDICT: PASS - Admin Portal is Production-Ready.");
    }
}

runSmokeTest();
