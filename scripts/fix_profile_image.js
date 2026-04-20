/**
 * scripts/fix_profile_image.js
 * Ensures the profile_image column exists in the users table.
 */
const db = require('../config/db');

async function fix() {
    try {
        console.log('--- Ensuring profile_image exists in users table ---');
        await db.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image VARCHAR(255)');
        console.log('SUCCESS: profile_image column is present.');
    } catch (err) {
        console.error('ERROR fixing schema:', err.message);
    } finally {
        process.exit(0);
    }
}

fix();
