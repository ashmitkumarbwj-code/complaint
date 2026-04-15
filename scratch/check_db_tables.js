const db = require('../config/db');

async function checkTables() {
    try {
        const tablesToCheck = ['verified_students', 'verified_staff', 'students', 'staff', 'users'];
        console.log('--- DB TABLE AUDIT ---');
        
        for (const table of tablesToCheck) {
            try {
                const [rows] = await db.execute(`SELECT 1 FROM ${table} LIMIT 1`);
                console.log(`[✔] Table '${table}' is accessible.`);
            } catch (err) {
                console.log(`[✖] Table '${table}' is NOT accessible or does not exist. (${err.message})`);
            }
        }
        
        process.exit(0);
    } catch (err) {
        console.error('Audit script failed:', err);
        process.exit(1);
    }
}

checkTables();
