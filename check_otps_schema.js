const db = require('./config/db');

async function checkSchema() {
    try {
        const [columns] = await db.execute("SHOW COLUMNS FROM otps");
        console.log('Columns in otps table:');
        columns.forEach(c => console.log(`- ${c.Field} (${c.Type})`));
        process.exit(0);
    } catch (err) {
        console.error('Error checking schema:', err);
        process.exit(1);
    }
}

checkSchema();
