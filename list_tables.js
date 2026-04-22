const db = require('./config/db');

async function listTables() {
    try {
        const [rows] = await db.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log('Existing Tables:', rows.map(r => r.table_name));
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

listTables();
