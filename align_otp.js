const db = require('./config/db');

async function migrate() {
    try {
        console.log('--- Final OTP Schema Alignment ---');
        
        // Rename otp_code -> otp_hash if exists
        const [rows] = await db.query('SHOW COLUMNS FROM otp_verifications LIKE "otp_code"');
        if (rows.length > 0) {
            console.log('Renaming "otp_code" column to "otp_hash"...');
            await db.execute('ALTER TABLE otp_verifications CHANGE COLUMN otp_code otp_hash VARCHAR(255) NOT NULL');
            console.log('Column renamed to "otp_hash".');
        } else {
            console.log('Column "otp_code" not found. Already migrated?');
        }

        console.log('--- Alignment Complete ---');
    } catch (err) {
        console.error('Migration crashed:', err);
    } finally {
        process.exit();
    }
}

migrate();
