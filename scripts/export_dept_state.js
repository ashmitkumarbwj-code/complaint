require('dotenv').config();
const { Pool } = require('pg');

const PROD_URL = 'postgresql://neondb_owner:npg_XCajzy1uh4SQ@ep-young-darkness-ancd84e0-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
    connectionString: PROD_URL,
    ssl: { rejectUnauthorized: false }
});

async function exportState() {
    try {
        console.log('--- CURRENT DEPARTMENTS ---');
        const depts = await pool.query('SELECT id, name FROM departments ORDER BY id');
        console.table(depts.rows);

        console.log('\n--- USED DEPARTMENT IDS (STUDENTS) ---');
        const usedInStudents = await pool.query('SELECT DISTINCT department_id FROM students');
        console.table(usedInStudents.rows);

        console.log('\n--- USED DEPARTMENT IDS (COMPLAINTS) ---');
        const usedInComplaints = await pool.query('SELECT DISTINCT department_id FROM complaints');
        console.table(usedInComplaints.rows);

    } catch (err) {
        console.error('Export failed:', err.message);
    } finally {
        await pool.end();
    }
}

exportState();
