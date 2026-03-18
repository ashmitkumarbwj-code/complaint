const db = require('./config/db');

async function fixSchema() {
    try {
        console.log('Checking for is_used column...');
        const [columns] = await db.execute("SHOW COLUMNS FROM otps LIKE 'is_used'");
        
        if (columns.length === 0) {
            console.log('Adding is_used column to otps table...');
            await db.execute("ALTER TABLE otps ADD COLUMN is_used TINYINT DEFAULT 0 AFTER type");
            console.log('Column added successfully.');
        } else {
            console.log('is_used column already exists.');
        }
        
        process.exit(0);
    } catch (err) {
        console.error('Error fixing schema:', err);
        process.exit(1);
    }
}

fixSchema();
