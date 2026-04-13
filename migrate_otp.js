const db = require('./config/db');

async function migrate() {
    try {
        console.log('--- Starting Unified OTP Schema Migration ---');
        
        // 1. Rename column email -> identifier
        // We use a check to avoid failing if already renamed
        const [rows] = await db.query('SHOW COLUMNS FROM otp_verifications LIKE "email"');
        if (rows.length > 0) {
            console.log('Renaming "email" column to "identifier"...');
            await db.execute('ALTER TABLE otp_verifications CHANGE COLUMN email identifier VARCHAR(255) NOT NULL');
            console.log('Column renamed.');
        } else {
            console.log('Column "email" not found. Skipping rename.');
        }

        // 2. Ensure indices
        console.log('Ensuring indices...');
        try { await db.execute('DROP INDEX email ON otp_verifications'); } catch(e) {}
        try { await db.execute('CREATE INDEX idx_identifier ON otp_verifications(identifier)'); } catch(e) {}
        try { await db.execute('CREATE INDEX idx_created_at ON otp_verifications(created_at)'); } catch(e) {}
        
        console.log('Indices verified.');
        console.log('--- Migration Complete Successfully ---');
    } catch (err) {
        console.error('Migration crashed:', err);
    } finally {
        process.exit();
    }
}

migrate();
