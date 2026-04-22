const { Pool } = require('pg');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const TABLES = [
    'users', 'students', 'verified_students', 'verified_staff', 'complaints', 
    'complaint_ai_analysis', 'gallery_images', 'slides', 'dynamic_homepage_slides',
    'departments', 'department_members', 'otp_verifications'
];

async function backup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '../backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
    
    const backupFile = path.join(backupDir, `pg_backup_${timestamp}.json`);
    const data = {};

    console.log('--- Starting Production Backup (Postgres/Neon) ---');
    
    try {
        for (const table of TABLES) {
            console.log(`Backing up table: ${table}...`);
            const res = await pool.query(`SELECT * FROM "${table}"`);
            data[table] = res.rows;
        }

        fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
        console.log(`✅ Backup COMPLETE: ${backupFile}`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Backup FAILED:', err.message);
        process.exit(1);
    }
}

backup();
