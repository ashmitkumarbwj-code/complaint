
const fetch = require('node-fetch');
const { pool } = require('./config/db');

async function runAudit() {
    console.log("--- PRODUCTION FORENSIC AUDIT START ---");
    
    // 1. Check if workers are actually initialized (via internal probe if possible or log check)
    // For now, we hit the health endpoint
    try {
        const healthRes = await fetch('http://127.0.0.1:5000/api/health');
        const health = await healthRes.json();
        console.log("[HEALTH] Result:", JSON.stringify(health));
    } catch (e) {
        console.log("[HEALTH] Failed to hit health endpoint:", e.message);
    }

    // 2. Get real test data
    let studentEmail = "";
    try {
        const result = await pool.query('SELECT email FROM verified_students LIMIT 1');
        if (result.rows.length > 0) {
            studentEmail = result.rows[0].email;
            console.log("[DB] Found valid student email for test:", studentEmail);
        } else {
            console.log("[DB] No verified students found!");
        }
    } catch (e) {
        console.log("[DB] Query failed:", e.message);
    }

    if (studentEmail) {
        // 3. Test Valid Activation Request
        try {
            console.log("[API] Testing valid activation request...");
            const res = await fetch('http://127.0.0.1:5000/api/auth/request-activation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    method: 'email',
                    email: studentEmail,
                    role: 'Student'
                })
            });
            const data = await res.json();
            console.log("[API] Valid Request Result:", JSON.stringify(data));
        } catch (e) {
            console.log("[API] Valid Request Failed:", e.message);
        }
    }

    // 4. Test Invalid Activation Request
    try {
        console.log("[API] Testing invalid activation request...");
        const res = await fetch('http://127.0.0.1:5000/api/auth/request-activation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: 'email',
                email: 'fake_non_existent_user@gmail.com',
                role: 'Student'
            })
        });
        const data = await res.json();
        console.log("[API] Invalid Request Result (Expected Failure):", JSON.stringify(data));
    } catch (e) {
        console.log("[API] Invalid Request Failed:", e.message);
    }

    console.log("--- PRODUCTION FORENSIC AUDIT END ---");
}

runAudit().then(() => process.exit(0));
