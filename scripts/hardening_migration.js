const mysql = require('mysql2/promise');
require('dotenv').config();

async function runMigration() {
    let conn;
    try {
        console.log('--- Starting Hardening Migration ---');
        conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        // 1. Update complaints table
        console.log('1. Updating complaints table schema...');
        
        // Check columns first for idempotent ALTER
        const [complaintCols] = await conn.query("SHOW COLUMNS FROM complaints");
        const compColNames = complaintCols.map(c => c.Field);

        if (!compColNames.includes('lock_version')) {
            await conn.query("ALTER TABLE complaints ADD COLUMN lock_version INT NOT NULL DEFAULT 0");
            console.log('Added lock_version');
        }
        if (!compColNames.includes('reopened_count')) {
            await conn.query("ALTER TABLE complaints ADD COLUMN reopened_count INT NOT NULL DEFAULT 0");
            console.log('Added reopened_count');
        }

        // Update status ENUM
        await conn.query(`
            ALTER TABLE complaints 
            MODIFY COLUMN status ENUM('Pending', 'In Progress', 'Resolved', 'Rejected', 'Escalated', 'On Hold', 'Reopened') DEFAULT 'Pending'
        `);
        console.log('Updated status ENUM');

        // 2. Update complaint_status_history table
        console.log('2. Updating complaint_status_history table schema...');
        
        const [historyCols] = await conn.query("SHOW COLUMNS FROM complaint_status_history");
        const histColNames = historyCols.map(c => c.Field);

        const newCols = [
            { name: 'action_type', def: "VARCHAR(50) NOT NULL DEFAULT 'STATUS_CHANGE'" },
            { name: 'visibility', def: "ENUM('STUDENT_VISIBLE', 'STAFF_ONLY') DEFAULT 'STAFF_ONLY'" },
            { name: 'metadata_json', def: "JSON NULL" },
            { name: 'actor_role', def: "VARCHAR(20) NULL" },
            { name: 'ip_address', def: "VARCHAR(45) NULL" },
            { name: 'user_agent', def: "VARCHAR(255) NULL" }
        ];

        for (const col of newCols) {
            if (!histColNames.includes(col.name)) {
                await conn.query(`ALTER TABLE complaint_status_history ADD COLUMN ${col.name} ${col.def}`);
                console.log(`Added ${col.name}`);
            }
        }

        console.log('--- Hardening Migration Successful ---');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        if (conn) await conn.end();
        process.exit();
    }
}

runMigration();
