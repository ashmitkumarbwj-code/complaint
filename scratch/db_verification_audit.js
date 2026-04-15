const db = require('../config/db');

async function auditDatabase() {
    try {
        console.log('--- STEP 1: TABLE STRUCTURE ---');
        const tables = ['students', 'staff', 'users', 'verified_students', 'verified_staff'];
        
        for (const table of tables) {
            console.log(`\nTable: ${table}`);
            try {
                // Native PG column list
                const [cols] = await db.execute(`
                    SELECT column_name, data_type, is_nullable 
                    FROM information_schema.columns 
                    WHERE table_name = $1 
                    ORDER BY ordinal_position
                `, [table]);
                
                console.table(cols.map(c => ({ 
                    Column: c.column_name, 
                    Type: c.data_type, 
                    Null: c.is_nullable 
                })));
            } catch (err) {
                console.log(`[!] Error describing ${table}: ${err.message}`);
            }
        }

        console.log('\n--- STEP 2: RECORD COUNTS ---');
        const countQueries = {
            students: 'SELECT COUNT(*) FROM students',
            staff: 'SELECT COUNT(*) FROM staff',
            verified_students: 'SELECT COUNT(*) FROM verified_students',
            verified_staff: 'SELECT COUNT(*) FROM verified_staff'
        };

        for (const [table, query] of Object.entries(countQueries)) {
            try {
                const [rows] = await db.execute(query);
                console.log(`${table}: ${rows[0].count}`);
            } catch (err) {
                console.log(`${table}: ERROR (${err.message})`);
            }
        }

        console.log('\n--- STEP 3: SAMPLE DATA ---');
        try {
            console.log('Sample Students (Last 5):');
            const [students] = await db.execute('SELECT id, email, mobile_number FROM students ORDER BY id DESC LIMIT 5');
            console.table(students);
        } catch (err) { console.log('Students Sample Error:', err.message); }

        try {
            console.log('\nSample Staff (Last 5):');
            const [staff] = await db.execute('SELECT id, email, mobile_number, role FROM staff ORDER BY id DESC LIMIT 5');
            console.table(staff);
        } catch (err) { console.log('Staff Sample Error:', err.message); }

        process.exit(0);
    } catch (err) {
        console.error('Audit failed:', err);
        process.exit(1);
    }
}

auditDatabase();
