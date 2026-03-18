const mysql = require('mysql2/promise');
require('dotenv').config();

async function updateSchema() {
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('Adding priority column to complaints table...');
        await conn.query(`
            ALTER TABLE complaints 
            ADD COLUMN IF NOT EXISTS priority ENUM('Low', 'Medium', 'High', 'Emergency') DEFAULT 'Medium'
            AFTER media_url
        `);

        console.log('Schema updated successfully');
        await conn.end();
    } catch (err) {
        console.error('Schema update failed:', err);
    }
}

updateSchema();
