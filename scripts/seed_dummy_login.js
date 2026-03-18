/**
 * seed_dummy_login.js
 * Generates dummy accounts for each role in the Smart Campus system.
 * Usage: node scripts/seed_dummy_login.js
 */

const db = require('../config/db');
const bcrypt = require('bcryptjs');

async function seed() {
    console.log('--- Database Seeding Started ---');

    const password = 'password123';
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const testUsers = [
        { username: 'test_admin', email: 'admin@test.gdc.edu', mobile: '9000000001', role: 'Admin' },
        { username: 'test_principal', email: 'principal@test.gdc.edu', mobile: '9000000002', role: 'Principal' },
        { username: 'test_hod', email: 'hod@test.gdc.edu', mobile: '9000000003', role: 'HOD' },
        { username: 'test_staff', email: 'staff@test.gdc.edu', mobile: '9000000004', role: 'Staff' },
        { username: 'test_student', email: 'student@test.gdc.edu', mobile: '9000000005', role: 'Student', roll: 'TEST2024001' }
    ];

    try {
        // Step 0: Ensure a department exists for foreign keys
        let deptId = null;
        const [depts] = await db.execute('SELECT id FROM departments LIMIT 1');
        if (depts.length > 0) {
            deptId = depts[0].id;
        } else {
            console.log('Creating default department...');
            const [deptResult] = await db.execute('INSERT INTO departments (name) VALUES (?)', ['General Administration']);
            deptId = deptResult.insertId;
        }

        for (const u of testUsers) {
            console.log(`Processing role: ${u.role}...`);

            // 1. Ensure user exists or update them
            const [existingUsers] = await db.execute(
                'SELECT id FROM users WHERE username = ? OR email = ? OR mobile_number = ?',
                [u.username, u.email, u.mobile]
            );

            let userId;
            if (existingUsers.length > 0) {
                userId = existingUsers[0].id;
                await db.execute(
                    'UPDATE users SET password_hash = ?, role = ?, is_verified = 1 WHERE id = ?',
                    [passwordHash, u.role, userId]
                );
                console.log(`  - Updated existing user: ${u.username}`);
            } else {
                const [result] = await db.execute(
                    'INSERT INTO users (username, email, mobile_number, password_hash, role, is_verified) VALUES (?, ?, ?, ?, ?, 1)',
                    [u.username, u.email, u.mobile, passwordHash, u.role]
                );
                userId = result.insertId;
                console.log(`  - Created new user: ${u.username}`);
            }

            // 2. Link to role-specific tables
            if (u.role === 'Student') {
                const [existingStudents] = await db.execute('SELECT id FROM students WHERE user_id = ?', [userId]);
                if (existingStudents.length === 0) {
                    await db.execute(
                        'INSERT INTO students (user_id, roll_number, department_id, mobile) VALUES (?, ?, ?, ?)',
                        [userId, u.roll, deptId, u.mobile]
                    );
                    console.log('    - Added to students table');
                }
            } else {
                const [existingStaff] = await db.execute('SELECT id FROM staff WHERE user_id = ?', [userId]);
                if (existingStaff.length === 0) {
                    // NOTE: The 'staff' table has a column 'department_name' which is actually an INT foreign key to 'departments.id'
                    await db.execute(
                        'INSERT INTO staff (user_id, department_name, designation) VALUES (?, ?, ?)',
                        [userId, deptId, u.role]
                    )
                    console.log('    - Added to staff table');
                }
            }
        }

        console.log('\n--- Seeding Complete Successfully ---');
        console.log('Dummy Credentials (Password for all: password123):');
        testUsers.forEach(u => {
            console.log(`- ${u.role}: ${u.username} (or ${u.mobile})`);
        });

    } catch (err) {
        console.error('\n--- Seeding Failed ---');
        console.error(err);
    } finally {
        process.exit(0);
    }
}

seed();
