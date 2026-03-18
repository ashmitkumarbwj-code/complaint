const db = require('./config/db');

async function migrate() {
    try {
        console.log('Running OTP schema migration...');
        
        await db.query(`ALTER TABLE otps MODIFY COLUMN otp_code VARCHAR(255) NOT NULL`);
        console.log('1. OTP Code column expanded to VARCHAR(255)');
        
        try {
            await db.query(`ALTER TABLE otps ADD COLUMN attempts INT DEFAULT 0 AFTER type`);
            console.log('2. Added attempts column');
        } catch(e) {
            console.log('2. Attempts column already exists or error:', e.message);
        }

        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
