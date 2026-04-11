const db = require('../config/db');

async function fixSchema() {
    try {
        console.log('Checking complaints table schema...');
        const [rows] = await db.execute('DESC complaints');
        const hasColumn = rows.some(r => r.Field === 'local_file_path');
        
        if (!hasColumn) {
            console.log('Adding local_file_path column...');
            await db.execute('ALTER TABLE complaints ADD COLUMN local_file_path VARCHAR(255) AFTER media_url');
            console.log('Column added successfully.');
        } else {
            console.log('local_file_path column already exists.');
        }
        
        process.exit(0);
    } catch (err) {
        console.error('Error fixing schema:', err.message);
        process.exit(1);
    }
}

fixSchema();
