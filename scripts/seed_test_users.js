const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function createTestUser() {
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        const salt = await bcrypt.genSalt(10);
        const studentPassword = await bcrypt.hash('password123', salt);
        const adminPassword = await bcrypt.hash('admin123', salt);

        console.log('Creating test student user (hashed)...');
        const [userResult] = await conn.query(
            "INSERT IGNORE INTO users (username, email, password_hash, role, is_verified) VALUES (?, ?, ?, ?, ?)",
            ['test_student', 'student@gdc.edu', studentPassword, 'Student', 1]
        );

        if (userResult.insertId) {
            await conn.query(
                "INSERT IGNORE INTO students (user_id, roll_number, department_id, mobile) VALUES (?, ?, ?, ?)",
                [userResult.insertId, '21DCS001', 1, '9876543210']
            );
        } else {
            // Update existing if insert ignored
            await conn.query(
                "UPDATE users SET password_hash = ? WHERE email = ?",
                [studentPassword, 'student@gdc.edu']
            );
        }

        console.log('Creating test admin user (hashed)...');
        const [adminResult] = await conn.query(
            "INSERT IGNORE INTO users (username, email, password_hash, role, is_verified) VALUES (?, ?, ?, ?, ?)",
            ['admin_user', 'admin@gdc.edu', adminPassword, 'Admin', 1]
        );

        console.log('Creating HOD user (hashed)...');
        const [hodResult] = await conn.query(
            "INSERT IGNORE INTO users (username, email, password_hash, role, is_verified) VALUES (?, ?, ?, ?, ?)",
            ['hostel_hod', 'hostel_hod@gdc.edu', adminPassword, 'HOD', 1]
        );

        if (hodResult.insertId) {
            await conn.query(
                "INSERT IGNORE INTO staff (user_id, department_id, designation) VALUES (?, ?, ?)",
                [hodResult.insertId, 1, 'Head of Hostel Dept']
            );
        } else {
             await conn.query(
                "UPDATE users SET password_hash = ? WHERE email = ?",
                [adminPassword, 'hostel_hod@gdc.edu']
            );
        }

        console.log('Test users updated with secure passwords and HOD role successfully');
        await conn.end();
    } catch (err) {
        console.error('Error creating users:', err);
    }
}

createTestUser();
