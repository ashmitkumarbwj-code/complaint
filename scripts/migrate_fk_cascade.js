/**
 * Migration: Add ON DELETE CASCADE / SET NULL to existing FK constraints.
 *
 * Run this ONCE against a live database that was created from an older database.sql
 * that lacked these ON DELETE rules. New deployments using the latest database.sql
 * do NOT need to run this script.
 *
 * Usage:  node scripts/migrate_fk_cascade.js
 */

require('dotenv').config();
const db = require('../config/db');

const migrations = [
    // ── students ──────────────────────────────────────────────────────────
    {
        table: 'students',
        oldFk: 'students_ibfk_1',       // user_id → users.id
        newFk: 'fk_students_user',
        column: 'user_id',
        ref: 'users(id)',
        onDelete: 'CASCADE'
    },
    {
        table: 'students',
        oldFk: 'students_ibfk_2',       // department_id → departments.id
        newFk: 'fk_students_dept',
        column: 'department_id',
        ref: 'departments(id)',
        onDelete: 'SET NULL'
    },
    {
        table: 'students',
        oldFk: 'students_ibfk_3',       // tenant_id → tenants.id
        newFk: 'fk_students_tenant',
        column: 'tenant_id',
        ref: 'tenants(id)',
        onDelete: 'CASCADE'
    },

    // ── staff ─────────────────────────────────────────────────────────────
    {
        table: 'staff',
        oldFk: 'staff_ibfk_1',
        newFk: 'fk_staff_user',
        column: 'user_id',
        ref: 'users(id)',
        onDelete: 'CASCADE'
    },
    {
        table: 'staff',
        oldFk: 'staff_ibfk_2',
        newFk: 'fk_staff_dept',
        column: 'department_id',
        ref: 'departments(id)',
        onDelete: 'SET NULL'
    },
    {
        table: 'staff',
        oldFk: 'staff_ibfk_3',
        newFk: 'fk_staff_tenant',
        column: 'tenant_id',
        ref: 'tenants(id)',
        onDelete: 'CASCADE'
    },

    // ── complaints ────────────────────────────────────────────────────────
    {
        table: 'complaints',
        oldFk: 'complaints_ibfk_1',     // student_id → students.id
        newFk: 'fk_complaints_student',
        column: 'student_id',
        ref: 'students(id)',
        onDelete: 'CASCADE'
    },
    {
        table: 'complaints',
        oldFk: 'complaints_ibfk_3',     // assigned_to → staff.id
        newFk: 'fk_complaints_assigned',
        column: 'assigned_to',
        ref: 'staff(id)',
        onDelete: 'SET NULL'
    },
    {
        table: 'complaints',
        oldFk: 'complaints_ibfk_4',     // tenant_id → tenants.id
        newFk: 'fk_complaints_tenant',
        column: 'tenant_id',
        ref: 'tenants(id)',
        onDelete: 'CASCADE'
    },

    // ── feedback ──────────────────────────────────────────────────────────
    {
        table: 'feedback',
        oldFk: 'feedback_ibfk_1',
        newFk: 'fk_feedback_complaint',
        column: 'complaint_id',
        ref: 'complaints(id)',
        onDelete: 'CASCADE'
    },
    {
        table: 'feedback',
        oldFk: 'feedback_ibfk_2',
        newFk: 'fk_feedback_tenant',
        column: 'tenant_id',
        ref: 'tenants(id)',
        onDelete: 'CASCADE'
    },

    // ── login_audit ───────────────────────────────────────────────────────
    {
        table: 'login_audit',
        oldFk: 'login_audit_ibfk_1',
        newFk: 'fk_audit_user',
        column: 'user_id',
        ref: 'users(id)',
        onDelete: 'SET NULL'
    },
    {
        table: 'login_audit',
        oldFk: 'login_audit_ibfk_2',
        newFk: 'fk_audit_tenant',
        column: 'tenant_id',
        ref: 'tenants(id)',
        onDelete: 'CASCADE'
    },
];

async function getActualFkName(conn, table, column) {
    const [rows] = await conn.execute(`
        SELECT CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = ?
          AND COLUMN_NAME  = ?
          AND REFERENCED_TABLE_NAME IS NOT NULL
        LIMIT 1
    `, [table, column]);
    return rows.length ? rows[0].CONSTRAINT_NAME : null;
}

async function run() {
    const conn = await db.getConnection();
    try {
        console.log('🔧  Starting FK CASCADE migration…\n');
        await conn.execute('SET FOREIGN_KEY_CHECKS = 0');

        for (const m of migrations) {
            // Auto-detect the real FK name instead of relying on assumed names
            const actualFkName = await getActualFkName(conn, m.table, m.column);

            if (!actualFkName) {
                console.log(`  ⚠️  No FK found on ${m.table}.${m.column} — skipping.`);
                continue;
            }

            try {
                await conn.execute(`ALTER TABLE \`${m.table}\` DROP FOREIGN KEY \`${actualFkName}\``);
                await conn.execute(
                    `ALTER TABLE \`${m.table}\` ADD CONSTRAINT \`${m.newFk}\`
                     FOREIGN KEY (\`${m.column}\`) REFERENCES ${m.ref}
                     ON DELETE ${m.onDelete}`
                );
                console.log(`  ✅  ${m.table}.${m.column} → ON DELETE ${m.onDelete}`);
            } catch (err) {
                console.error(`  ❌  Failed on ${m.table}.${m.column}: ${err.message}`);
            }
        }

        await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
        console.log('\n✅  FK CASCADE migration complete.');
    } finally {
        conn.release();
        process.exit(0);
    }
}

run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
