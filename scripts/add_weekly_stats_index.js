'use strict';
/**
 * Migration: Add composite index for weekly stats query performance
 * 
 * Run once:  node scripts/add_weekly_stats_index.js
 *
 * Index: idx_tenant_week
 * Covers the WHERE tenant_id = ? AND created_at >= DATE_SUB(...) query
 * used by GET /api/dashboards/weekly-stats
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
    let conn;
    try {
        conn = await mysql.createConnection({
            host:     process.env.DB_HOST,
            user:     process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('[Migration] Connected to database.');

        // Check if index already exists first (idempotent)
        const [rows] = await conn.execute(`
            SELECT COUNT(*) AS cnt
            FROM information_schema.statistics
            WHERE table_schema = ? AND table_name = 'complaints' AND index_name = 'idx_tenant_week'
        `, [process.env.DB_NAME]);

        if (rows[0].cnt > 0) {
            console.log('[Migration] Index idx_tenant_week already exists. Skipping.');
        } else {
            await conn.execute(`
                ALTER TABLE complaints
                ADD INDEX idx_tenant_week (tenant_id, created_at, status)
            `);
            console.log('[Migration] ✅ Index idx_tenant_week created successfully.');
            console.log('[Migration]    Covers: WHERE tenant_id=? AND created_at>=? (GROUP BY status)');
        }

    } catch (err) {
        console.error('[Migration] ❌ Failed:', err.message);
        process.exit(1);
    } finally {
        if (conn) await conn.end();
        console.log('[Migration] Done. Connection closed.');
    }
})();
