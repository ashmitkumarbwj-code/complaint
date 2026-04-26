require('dotenv').config();
const { Pool } = require('pg');

const PROD_URL = 'postgresql://neondb_owner:npg_XCajzy1uh4SQ@ep-young-darkness-ancd84e0-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
    connectionString: PROD_URL,
    ssl: { rejectUnauthorized: false }
});

async function fixRouting() {
    try {
        console.log('🔄 Synchronizing Department Categories with New Alignment...');
        
        await pool.query('BEGIN');

        // Clear existing mappings
        await pool.query('DELETE FROM department_categories');

        // Insert Correct Institutional Mappings
        const mappings = [
            [1, 'Noise'],
            [2, 'Electricity'],
            [2, 'Infrastructure'],
            [2, 'Cleanliness'],
            [2, 'Technical'],
            [3, 'Mess'],
            [4, 'Harassment'],
            [5, 'Security'],
            [6, 'Faculty'],
            [7, 'Other']
        ];

        for (const [deptId, category] of mappings) {
            await pool.query('INSERT INTO department_categories (department_id, category) VALUES ($1, $2)', [deptId, category]);
        }

        await pool.query('COMMIT');
        console.log('✅ Routing synchronized.');

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('❌ Failed to fix routing:', err.message);
    } finally {
        await pool.end();
    }
}

fixRouting();
