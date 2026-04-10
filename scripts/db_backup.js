const mysqldump = require('mysqldump');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function backup() {
    const dbName = process.env.DB_NAME || 'smart_campus_db';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(__dirname, `../backups/backup-${dbName}-${timestamp}.sql`);

    if (!fs.existsSync(path.join(__dirname, '../backups'))) {
        fs.mkdirSync(path.join(__dirname, '../backups'));
    }

    console.log(`Starting backup of ${dbName}...`);
    try {
        await mysqldump({
            connection: {
                host: process.env.DB_HOST || '127.0.0.1',
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                database: dbName,
            },
            dumpToFile: backupPath,
        });
        console.log(`✅ Backup successful! Saved to: ${backupPath}`);
    } catch (err) {
        console.error('❌ Backup failed:', err.message);
        console.log('Ensure you have mysqldump installed if this fails, or use: mysqldump -u root -p smart_campus_db > backup.sql');
    }
}

backup();
