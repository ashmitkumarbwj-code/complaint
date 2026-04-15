
const http = require('http');
const { pool } = require('./config/db');

function post(url, data) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const options = {
            hostname: u.hostname,
            port: u.port || 80,
            path: u.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(JSON.stringify(data))
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
        });

        req.on('error', reject);
        req.write(JSON.stringify(data));
        req.end();
    });
}

function get(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
        }).on('error', reject);
    });
}

async function runAudit() {
    console.log("--- PRODUCTION FORENSIC AUDIT START ---");
    
    // 1. Health Check
    try {
        const h = await get('http://127.0.0.1:5000/api/health');
        console.log("[HEALTH] Result:", h.status, JSON.stringify(h.body));
    } catch (e) { console.log("[HEALTH] Failed:", e.message); }

    // 2. Data Lookup
    let studentEmail = "";
    try {
        const result = await pool.query('SELECT email FROM verified_students LIMIT 1');
        if (result.rows.length > 0) {
            studentEmail = result.rows[0].email;
            console.log("[DB] Found student email:", studentEmail);
        } else { console.log("[DB] No students found"); }
    } catch (e) { console.log("[DB] Error:", e.message); }

    if (studentEmail) {
        // 3. Valid Activation
        try {
            console.log("[API] Testing Valid Activation...");
            const res = await post('http://127.0.0.1:5000/api/auth/request-activation', {
                method: 'email',
                email: studentEmail,
                role: 'Student'
            });
            console.log("[API] Valid Result:", res.status, JSON.stringify(res.body));
        } catch (e) { console.log("[API] Valid Failed:", e.message); }
    }

    // 4. Invalid Activation
    try {
        console.log("[API] Testing Invalid Activation...");
        const res = await post('http://127.0.0.1:5000/api/auth/request-activation', {
            method: 'email',
            email: 'fake_user_audit@gmail.com',
            role: 'Student'
        });
        console.log("[API] Invalid Result (Expected 404):", res.status, JSON.stringify(res.body));
    } catch (e) { console.log("[API] Invalid Failed:", e.message); }

    console.log("--- PRODUCTION FORENSIC AUDIT END ---");
}

runAudit().then(() => process.exit(0));
