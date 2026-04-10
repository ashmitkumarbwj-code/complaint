const db = require('../config/db');
const redis = require('../config/redis');
require('dotenv').config();

async function verify() {
    console.log('--- SCRS Connectivity Verification ---');
    
    const targetDb = process.argv.includes('--prod') ? 'smart_campus_prod' : process.env.DB_NAME;
    console.log(`📡 Targeting Database: ${targetDb}`);

    // 1. Database Check
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || '127.0.0.1',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: targetDb
        });
        console.log(`✅ MySQL Connectivity [${targetDb}]: OK`);
        
        const tables = ['tenants', 'users', 'students', 'staff', 'departments', 'department_members', 'complaint_departments', 'otp_verifications'];
        for (const table of tables) {
            const [rows] = await connection.execute(`SHOW TABLES LIKE ?`, [table]);
            if (rows.length > 0) console.log(`✅ Table [${table}]: EXISTS`);
            else console.error(`❌ Table [${table}]: MISSING`);
        }
        await connection.end();
    } catch (err) {
        console.error(`❌ MySQL Connectivity [${targetDb}]: FAILED - ${err.message}`);
    }

    // 2. Firebase Admin Check
    try {
        const admin = require('../config/firebase');
        if (admin.apps.length > 0) {
            console.log('✅ Firebase Admin: INITIALIZED');
            // Try to list a user or something minimal if possible, but initialization is usually enough check.
        } else {
            console.warn('⚠️ Firebase Admin: NOT INITIALIZED (Check FIREBASE_SERVICE_ACCOUNT)');
        }
    } catch (err) {
        console.error('❌ Firebase Admin: FAILED -', err.message);
    }

    // 3. Redis Check
    if (process.env.USE_REDIS !== 'false') {
        console.log('ℹ️ Redis: Integrated. Check startup logs for connection status.');
    }

    // 4. Environment Check
    const required = ['JWT_SECRET', 'CLOUDINARY_API_KEY', 'DB_HOST', 'DB_USER', 'DB_NAME', 'SMTP_PASS'];
    required.forEach(key => {
        if (!process.env[key] || process.env[key].includes('your_')) {
            console.warn(`⚠️ Environment: [${key}] is missing or has placeholder.`);
        } else {
            console.log(`✅ Environment: [${key}] is set.`);
        }
    });

    console.log('--- Verification Complete ---');
    process.exit(0);
}

verify();
