
const db = require('../config/db');

async function discover() {
    try {
        console.log('--- Departments ---');
        const [depts] = await db.execute('SELECT id, name FROM departments');
        console.log(JSON.stringify(depts, null, 2));

        console.log('\n--- User Roles (Enum) ---');
        const [roles] = await db.execute(`
            SELECT enumlabel 
            FROM pg_enum 
            JOIN pg_type ON pg_type.oid = pg_enum.enumtypid 
            WHERE pg_type.typname = 'user_role'
        `);
        console.log(JSON.stringify(roles.map(r => r.enumlabel), null, 2));
        
        process.exit(0);
    } catch (e) {
        console.error(e.message);
        process.exit(1);
    }
}

discover();
