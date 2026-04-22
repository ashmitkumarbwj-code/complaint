require('dotenv').config();
const db = require('./config/db');
async function check() {
    try {
        const [rows] = await db.execute("SELECT * FROM otp_verifications WHERE identifier = 'gdcdharamshala@gmail.com' ORDER BY created_at DESC LIMIT 1");
        console.log('OTP DB Record:', rows[0]);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
