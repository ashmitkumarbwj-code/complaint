const mysql = require('mysql2/promise');
require('dotenv').config();

async function verify() {
    // We check the NEW database name specified in the config or we just check specific tables
    const dbName = 'smart_campus_prod'; 
    console.log(`Verifying Schema in: ${dbName}...`);

    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || '127.0.0.1',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: dbName
        });

        const tables = [
            'tenants', 'users', 'students', 'staff', 'departments', 
            'complaints', 'otp_verifications', 'department_members'
        ];

        for (const table of tables) {
            const [rows] = await connection.execute(`SHOW TABLES LIKE ?`, [table]);
            if (rows.length > 0) {
                console.log(`✅ Table '${table}' exists.`);
            } else {
                console.error(`❌ Table '${table}' is MISSING!`);
            }
        }

        await connection.end();
        console.log('\nVerification complete. If all tables match, updated your .env to use this DB.');
    } catch (err) {
        console.error('❌ Verification failed:', err.message);
    }
}

verify();
