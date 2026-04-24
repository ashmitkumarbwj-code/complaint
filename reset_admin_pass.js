const bcrypt = require('bcryptjs');
const db = require('./config/db');
async function run() {
    const hash = await bcrypt.hash('Admin@1234', 10);
    
    // Reset testadmin
    await db.execute(
        "UPDATE users SET password_hash = $1, failed_attempts = 0, locked_until = NULL WHERE username = 'testadmin'",
        [hash]
    );
    
    // Reset admin
    await db.execute(
        "UPDATE users SET password_hash = $1, failed_attempts = 0, locked_until = NULL WHERE username = 'admin'",
        [hash]
    );

    console.log('Password reset for testadmin & admin → Admin@1234');
    process.exit(0);
}
run();
