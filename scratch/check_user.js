
const db = require('../config/db');
const email = 'ashmitkumarbwj@gmail.com';

async function check() {
    try {
        console.log(`Checking for email: ${email}`);
        const [rows] = await db.execute('SELECT * FROM verified_students WHERE email = $1', [email]);
        console.log('Results:', rows);
        
        if (rows.length === 0) {
            console.log('No exact match. Trying case-insensitive search...');
            const [rows2] = await db.execute('SELECT * FROM verified_students WHERE email ILIKE $1', [email]);
            console.log('Case-insensitive Results:', rows2);
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}
check();
