const db = require('./config/db');

async function migrate() {
    try {
        console.log('Starting migration: Adding id_card_image to students table...');
        
        // Add the column
        await db.execute('ALTER TABLE students ADD COLUMN id_card_image VARCHAR(255) AFTER mobile');
        
        console.log('Migration successful: id_card_image column added.');
        process.exit(0);
    } catch (error) {
        if (error.code === 'ER_DUP_COLUMN_NAME') {
            console.log('Migration skipped: Column already exists.');
            process.exit(0);
        } else {
            console.error('Migration failed:', error);
            process.exit(1);
        }
    }
}

migrate();
