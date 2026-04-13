'use strict';
const db = require('../config/db');

async function migrate() {
    const createTableSql = `
        CREATE TABLE IF NOT EXISTS bulk_import_logs (
            id SERIAL PRIMARY KEY,
            tenant_id INTEGER NOT NULL,
            admin_id INTEGER NOT NULL,
            import_type VARCHAR(50) NOT NULL, -- 'students', 'staff'
            total_rows INTEGER NOT NULL DEFAULT 0,
            inserted_count INTEGER NOT NULL DEFAULT 0,
            duplicate_count INTEGER NOT NULL DEFAULT 0,
            error_count INTEGER NOT NULL DEFAULT 0,
            original_filename TEXT,
            status VARCHAR(20) DEFAULT 'completed', -- 'completed', 'dry_run'
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

    try {
        console.log('[Migration] Creating bulk_import_logs table...');
        await db.query(createTableSql);
        console.log('[Migration] Success: bulk_import_logs table is ready.');
        process.exit(0);
    } catch (err) {
        console.error('[Migration] Failed:', err.message);
        process.exit(1);
    }
}

migrate();
