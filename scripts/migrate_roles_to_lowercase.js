const db = require('../config/db');

async function migrate() {
    console.log('--- Phase 1: Database Migration (Lowercase Roles) ---');
    try {
        // 1. Rename ENUM values
        // Note: ALTER TYPE ... RENAME VALUE is supported in PostgreSQL
        const rolesToRename = [
            ['Principal', 'principal'],
            ['Admin', 'admin'],
            ['HOD', 'hod'],
            ['Staff', 'staff'],
            ['Student', 'student'],
            ['StudentHead', 'studenthead']
        ];

        for (const [oldVal, newVal] of rolesToRename) {
            console.log(`Renaming role ENUM: ${oldVal} -> ${newVal}`);
            try {
                await db.execute(`ALTER TYPE user_role RENAME VALUE '${oldVal}' TO '${newVal}'`);
            } catch (e) {
                if (e.message.includes('already exists')) {
                    console.log(`  - ${newVal} already exists, skipping rename.`);
                } else {
                    console.error(`  - Failed to rename ${oldVal}:`, e.message);
                }
            }
        }

        // 2. Ensure users.status is set for existing users
        console.log('Ensuring all users have status = \'active\' if null...');
        await db.execute('UPDATE users SET status = \'active\' WHERE status IS NULL');

        console.log('✅ Phase 1 Complete.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        process.exit();
    }
}

migrate();
