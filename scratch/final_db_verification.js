const db = require('../config/db');

async function finalVerification() {
    try {
        console.log('--- STEP 1 & 2: TABLES & COUNTS ---');
        const tables = ['students', 'staff', 'users', 'verified_students', 'verified_staff'];
        
        for (const table of tables) {
            const [rows] = await db.execute(`SELECT COUNT(*) FROM ${table}`);
            console.log(`${table}: ${rows[0].count} records`);
        }

        console.log('\n--- STEP 3: SAMPLE DATA (Last 5 Users) ---');
        const [users] = await db.execute('SELECT id, email, role, created_at FROM users ORDER BY id DESC LIMIT 5');
        console.table(users);

        console.log('\n--- STEP 4: EXCEL DATA MATCH ---');
        // Test Mobiles from test_students.xlsx
        const studentMobiles = ['9876543210', '9876543211', '9876543212'];
        // Test Mobiles from test_staff.xlsx
        const staffMobiles = ['9988776650', '9988776651', '9988776652'];

        console.log('Checking Student Mobiles in verified_students:');
        for (const mob of studentMobiles) {
            const [rows] = await db.execute('SELECT id, roll_number, mobile_number FROM verified_students WHERE mobile_number = $1', [mob]);
            console.log(`${mob}: ${rows.length > 0 ? 'FOUND (' + rows[0].roll_number + ')' : 'NOT FOUND'}`);
        }

        console.log('\nChecking Staff Mobiles in verified_staff:');
        for (const mob of staffMobiles) {
            const [rows] = await db.execute('SELECT id, name, mobile FROM verified_staff WHERE mobile = $1', [mob]);
            console.log(`${mob}: ${rows.length > 0 ? 'FOUND (' + rows[0].name + ' | ' + rows[0].role + ')' : 'NOT FOUND'}`);
        }

        process.exit(0);
    } catch (err) {
        console.error('Final verification failed:', err);
        process.exit(1);
    }
}

finalVerification();
