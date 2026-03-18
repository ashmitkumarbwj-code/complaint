const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('Updating complaint categories...');
        await conn.query(`ALTER TABLE complaints MODIFY COLUMN category ENUM(
            'Noise', 'Electricity', 'Mess', 'Harassment', 'Infrastructure', 
            'Security', 'Cleanliness', 'Technical', 'Faculty', 'Other'
        ) NOT NULL`);

        console.log('Inserting initial departments...');
        const departments = [
            'Hostel Administration',
            'Maintenance Department',
            'Mess Management',
            'Disciplinary Committee',
            'Campus Security',
            'Academic Department',
            'General Administration'
        ];

        for (const dept of departments) {
            await conn.query('INSERT IGNORE INTO departments (name) VALUES (?)', [dept]);
        }

        console.log('Schema updated successfully');
        await conn.end();
    } catch (err) {
        console.error('Update failed:', err);
        process.exit(1);
    }
}

run();
