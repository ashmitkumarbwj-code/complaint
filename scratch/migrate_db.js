'use strict';
require('dotenv').config();
const { Pool } = require('pg');

async function migrate() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('Connecting to database...');
        const client = await pool.connect();
        
        console.log('Checking for processing_status column in complaints table...');
        const checkQuery = `
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'complaints' AND column_name = 'processing_status';
        `;
        const { rows } = await client.query(checkQuery);

        if (rows.length === 0) {
            console.log('Column missing. Adding processing_status to complaints table...');
            await client.query(`
                ALTER TABLE complaints 
                ADD COLUMN processing_status VARCHAR(20) DEFAULT 'completed';
            `);
            console.log('Column added successfully.');
        } else {
            console.log('Column already exists.');
        }

        client.release();
    } catch (err) {
        console.error('Migration failed:', err.message);
    } finally {
        await pool.end();
    }
}

migrate();
