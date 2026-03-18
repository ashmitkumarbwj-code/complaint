const mysql = require('mysql2/promise');
require('dotenv').config();

async function seed() {
    let conn;
    try {
        conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('Seeding student_verification_data...');
        await conn.query(`
            INSERT IGNORE INTO student_verification_data (roll_number, department, year, mobile_number, email)
            VALUES (?, ?, ?, ?, ?)
        `, ['21DCS001', 'Computer Science', '3rd', '9876543210', 'student@gdc.edu']);

        console.log('Verification data seeded for Roll: 21DCS001');
    } catch (err) {
        console.error('Seeding failed:', err);
    } finally {
        if (conn) await conn.end();
    }
}

seed();
