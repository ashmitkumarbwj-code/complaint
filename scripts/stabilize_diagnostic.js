require('dotenv').config();
const { Pool } = require('pg');

const PROD_URL = 'postgresql://neondb_owner:npg_XCajzy1uh4SQ@ep-young-darkness-ancd84e0-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
    connectionString: PROD_URL,
    ssl: { rejectUnauthorized: false }
});

async function diagnostic() {
    try {
        console.log('--- PHASE 1: verified_students name check ---');
        const phase1 = await pool.query(`
            SELECT 
                COUNT(*) AS total,
                COUNT(name) AS name_filled,
                COUNT(*) - COUNT(name) AS name_missing
            FROM verified_students
        `);
        console.table(phase1.rows);

        console.log('\n--- PHASE 3: departments check ---');
        const phase3 = await pool.query(`SELECT id, name FROM departments ORDER BY id`);
        console.table(phase3.rows);

        console.log('\n--- PHASE 5: user data integrity ---');
        const usersNull = await pool.query(`SELECT COUNT(*) FROM users WHERE full_name IS NULL`);
        console.log('Users with NULL full_name:', usersNull.rows[0].count);
        
        const studentsNull = await pool.query(`SELECT COUNT(*) FROM students WHERE department_id IS NULL`);
        console.log('Students with NULL department_id:', studentsNull.rows[0].count);

    } catch (err) {
        console.error('Diagnostic failed:', err.message);
    } finally {
        await pool.end();
    }
}

diagnostic();
