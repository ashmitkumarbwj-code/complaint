const { Pool } = require('pg');
require('dotenv').config();

async function testConn(port) {
    const pool = new Pool({
        connectionString: `postgresql://postgres:admin@localhost:${port}/scrs`,
        connectionTimeoutMillis: 2000
    });

    try {
        console.log(`Testing port ${port}...`);
        const res = await pool.query('SELECT NOW()');
        console.log(`Success on port ${port}:`, res.rows[0]);
        process.exit(0);
    } catch (err) {
        console.log(`Failed on port ${port}: ${err.code || err.message}`);
    } finally {
        await pool.end();
    }
}

async function run() {
    await testConn(5432);
    await testConn(60306);
    await testConn(3306);
}

run();
