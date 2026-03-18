const mysql = require('mysql2/promise');
require('dotenv').config();

async function seedComplaints() {
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('Seeding initial complaints...');
        
        // Use student_id = 1 (test_student)
        const complaints = [
            { cat: 'Noise', loc: 'Hostel Block C', desc: 'Loud music in room 307 at 2 AM.', dept: 1 },
            { cat: 'Electricity', loc: 'Library 1st Floor', desc: 'Lights flickering in reading hall.', dept: 2 },
            { cat: 'Mess', loc: 'Main Mess', desc: 'Food quality is not meeting standards today.', dept: 3 }
        ];

        for (const c of complaints) {
            await conn.query(
                "INSERT INTO complaints (student_id, department_id, category, description, location, status) VALUES (?, ?, ?, ?, ?, 'Pending')",
                [1, c.dept, c.cat, c.desc, c.loc]
            );
        }

        console.log('Complaints seeded successfully');
        await conn.end();
    } catch (err) {
        console.error('Seeding failed:', err);
    }
}

seedComplaints();
