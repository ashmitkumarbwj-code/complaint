const db = require('../config/db');

async function cleanup() {
    console.log('--- Database Cleanup Started ---');
    let connection;
    try {
        connection = await db.pool.getConnection();
        console.log('[DB] Connected successfully for cleanup.');

        // 1. Delete all complaints
        console.log('Cleaning up complaints...');
        const [complaintRes] = await connection.execute('DELETE FROM complaints');
        await connection.execute('ALTER TABLE complaints AUTO_INCREMENT = 1');
        console.log(`  - Deleted ${complaintRes.affectedRows} complaints.`);

        // 2. Delete test users
        console.log('Cleaning up test users...');
        const [userRes] = await connection.execute(`
            DELETE FROM users 
            WHERE username LIKE 'test_%' 
               OR email LIKE '%@test.gdc.edu'
               OR username IN ('admin', 'principal', 'hod', 'staff', 'student')
        `);
        console.log(`  - Removed ${userRes.affectedRows} test user accounts.`);

        // 3. Clean up role tables
        console.log('Cleaning up role records...');
        const [stuRes] = await connection.execute('DELETE FROM students WHERE user_id NOT IN (SELECT id FROM users)');
        const [stfRes] = await connection.execute('DELETE FROM staff WHERE user_id NOT IN (SELECT id FROM users)');
        console.log(`  - Cleaned ${stuRes.affectedRows} student and ${stfRes.affectedRows} staff records.`);

        console.log('\n--- Cleanup Complete Successfully ---');
    } catch (err) {
        console.error('\n--- Cleanup Failed ---');
        console.error('Error Details:', err.message);
    } finally {
        if (connection) connection.release();
        process.exit(0);
    }
}

cleanup();
