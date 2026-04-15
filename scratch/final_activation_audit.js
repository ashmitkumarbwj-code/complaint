// Native Node.js Fetch Audit (No axios needed)
async function runFinalAudit() {
    console.log('--- FINAL ROLE-BASED ACTIVATION AUDIT ---');
    
    const BASE_URL = 'http://127.0.0.1:5000/api/auth';
    const roles = ['student', 'staff', 'admin', 'principal'];
    const testEmail = 'nonexistent_test@gdc.edu';

    for (const role of roles) {
        try {
            console.log(`[TEST] ${role.toUpperCase()} Request Activation (POST /api/auth/${role}/request-activation)...`);
            const res = await fetch(`${BASE_URL}/${role}/request-activation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    method: 'email',
                    email: testEmail,
                    tenant_id: 1
                })
            });
            
            if (res.status === 403) {
                const data = await res.json();
                console.log(`[✔] PASS: ${role.toUpperCase()} correctly returned 403 Forbidden.`);
                console.log(`    Message: ${data.message}`);
            } else {
                console.log(`[✖] FAIL: ${role.toUpperCase()} returned status ${res.status} (Expected 403)`);
            }
        } catch (err) {
            console.log(`[✖] ERROR: ${role.toUpperCase()} target unreachable. (${err.message})`);
            console.log(`    (Ensure the local server is running on port 5000)`);
        }
    }
}

runFinalAudit();
