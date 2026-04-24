const bcrypt = require('bcryptjs');
const db = require('./config/db');
async function run() {
    const hash = await bcrypt.hash('Admin@1234', 10);
    const [res] = await db.execute(
        "UPDATE users SET password_hash = $1, failed_attempts = 0, locked_until = NULL WHERE username = 'testadmin'",
        [hash]
    );
    console.log('Password reset for testadmin → Admin@1234');
    process.exit(0);
}
run();
