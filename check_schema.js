require('dotenv').config();
const db = require('./config/db');
async function checkSchema() {
    try {
        const [hs] = await db.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'homepage_slides'");
        const [s] = await db.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'slides'");
        console.log('homepage_slides columns:', hs);
        console.log('slides columns:', s);
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
checkSchema();
