require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkDb() {
    // List tables
    const tables = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    console.log('== Tables in Neon DB ==');
    console.log(tables.rows.map(r => r.table_name).join(', '));

    // Check complaints
    const comp = await pool.query('SELECT id, title, status FROM complaints ORDER BY id DESC LIMIT 5');
    console.log('\n== Last 5 complaints ==');
    console.log(JSON.stringify(comp.rows, null, 2));

    // Check users
    const users = await pool.query("SELECT id, username, role, status FROM users WHERE username = 'test_student_3'");
    console.log('\n== test_student_3 user ==');
    console.log(JSON.stringify(users.rows, null, 2));

    await pool.end();
}

checkDb().catch(e => { console.error(e.message); pool.end(); });
