const db = require('./config/db');
async function run() {
    const [users] = await db.execute("SELECT username, email, role, is_verified FROM users WHERE role IN ('admin', 'Principal')");
    console.log('Admin Users:', JSON.stringify(users, null, 2));
    process.exit(0);
}
run();
