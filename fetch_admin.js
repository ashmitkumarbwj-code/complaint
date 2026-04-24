const db = require('./config/db');
async function run() {
    const [rows] = await db.execute(
        "SELECT id, username, email, role, status, is_verified FROM users WHERE role = 'admin' ORDER BY id"
    );
    console.table(rows);
    process.exit(0);
}
run();
