require('dotenv').config();
const { Pool } = require('pg');
const PROD_URL = 'postgresql://neondb_owner:npg_XCajzy1uh4SQ@ep-young-darkness-ancd84e0-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString: PROD_URL, ssl: { rejectUnauthorized: false } });
async function check() {
    const u = await pool.query("SELECT id, username, role FROM users WHERE role = 'admin' LIMIT 10");
    console.table(u.rows);
    pool.end();
}
check();
