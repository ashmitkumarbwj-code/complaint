require('dotenv').config();
const db = require('../config/db');
const fs = require('fs');
const path = require('path');

const BACKUP_DIR = path.join(__dirname, '..', 'backups_1776440166865');
const DRY_RUN = false; // LIVE MODE

const tableOrder = [
    'tenants',
    'departments',
    'department_categories',
    'users',
    'students',
    'staff',
    'department_members',
    'complaints',
    'otp_verifications',
    'slides'
];

async function restore() {
    console.log(`\n🚀 STARTING LIVE RESTORATION...`);
    console.log(`[MODE] ${DRY_RUN ? 'DRY-RUN (READ-ONLY)' : 'LIVE (WRITE)'}`);

    const stats = {};

    for (const table of tableOrder) {
        const backupPath = path.join(BACKUP_DIR, `${table}.json`);
        if (!fs.existsSync(backupPath)) {
            console.warn(`[SKIP] No backup file for ${table}`);
            continue;
        }

        const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
        console.log(`\n--- Processing Table: ${table} (${data.length} records) ---`);

        let inserted = 0;
        let skipped = 0;
        let errors = 0;

        for (const record of data) {
            try {
                // 1. Existence check
                const [existing] = await db.execute(`SELECT id FROM ${table} WHERE id = $1`, [record.id]);
                
                if (existing.length > 0) {
                    skipped++;
                    continue;
                }

                if (DRY_RUN) {
                    inserted++;
                    continue;
                }

                // 2. Prepare Dynamic Insert
                const keys = Object.keys(record);
                const columns = keys.join(', ');
                const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
                const values = keys.map(k => record[k]);

                const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
                await db.execute(sql, values);
                inserted++;

                if (inserted % 10 === 0) process.stdout.write('.');
            } catch (err) {
                console.error(`\n[ERR] ${table} ID ${record.id}: ${err.message}`);
                errors++;
            }
        }

        console.log(`\n[RESULTS] ${table}: ${inserted} inserted, ${skipped} skipped, ${errors} errors.`);
        stats[table] = { inserted, skipped, errors };
    }

    // --- CRITICAL: Reset Sequences ---
    console.log(`\n🔄 RESETTING POSTGRES SEQUENCES...`);
    for (const table of tableOrder) {
        try {
            // Postgres-specific sequence reset
            const seqSql = `SELECT setval(pg_get_serial_sequence('${table}', 'id'), coalesce(max(id), 1), max(id) IS NOT null) FROM ${table}`;
            await db.execute(seqSql);
            console.log(`[SEQ] Reset sequence for ${table}`);
        } catch (err) {
            console.warn(`[SEQ ERR] Could not reset sequence for ${table}: ${err.message}`);
        }
    }

    console.log(`\n✅ RESTORATION COMPLETE.`);
    console.table(stats);
    process.exit(0);
}

restore().catch(err => {
    console.error(`\n[FATAL ERROR] ${err.message}`);
    process.exit(1);
});
