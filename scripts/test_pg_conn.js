const db = require('../config/db');

(async () => {
    try {
        const [rows, result] = await db.query('SELECT NOW() as now, version()');
        console.log('✅ PostgreSQL Connectivity: SUCCESS');
        console.log('🕒 Time on DB:', rows[0].now);
        console.log('📦 Version:', rows[0].version);
        process.exit(0);
    } catch (err) {
        console.error('❌ PostgreSQL Connectivity: FAILED');
        console.error(err.message);
        process.exit(1);
    }
})();
