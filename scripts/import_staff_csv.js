'use strict';
/**
 * import_staff_csv.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Import staff / faculty / non-teaching staff from a CSV file into
 * the `verified_staff` table (PostgreSQL / Neon).
 *
 * Usage:
 *   node scripts/import_staff_csv.js <csv_file> [role]
 *
 * Arguments:
 *   csv_file  — Path to the CSV file
 *   role      — One of: Staff | Admin | HOD | Principal  (default: Staff)
 *
 * Expected CSV columns (auto-detected, case-insensitive):
 *   name / full_name
 *   mobile / mobile_no / phone
 *   email (optional)
 *   department / dept
 *   designation / post (optional)
 *
 * The script is fully idempotent — safe to run multiple times.
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { Pool } = require('pg');

// ── CLI Args ─────────────────────────────────────────────────────────────────
const [,, csvFile, roleArg] = process.argv;
if (!csvFile) {
  console.error('Usage: node scripts/import_staff_csv.js <csv_file> [Staff|Admin|HOD|Principal]');
  process.exit(1);
}
if (!fs.existsSync(csvFile)) {
  console.error(`File not found: ${csvFile}`);
  process.exit(1);
}

const VALID_ROLES = ['Principal', 'Admin', 'HOD', 'Staff'];
const importRole  = roleArg ? roleArg.trim() : 'Staff';
if (!VALID_ROLES.includes(importRole)) {
  console.error(`Invalid role "${importRole}". Must be one of: ${VALID_ROLES.join(', ')}`);
  process.exit(1);
}

// ── DB Connection ─────────────────────────────────────────────────────────────
const isNeon = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('neon');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isNeon ? { rejectUnauthorized: false } : false,
});

// ── Admin whitelist (same as original staff_import.js) ───────────────────────
const ADMIN_WHITELIST = new Set([
  '9418188560','7018196283','9418237833','9817175252','8219659265',
  '9418911944','7876172603','9418713034','9805457410','8219676735',
  '9882906696','7807723617','9418314308','9882717003','8351865937',
  '8091364033','8263936735','8628027717','9418398834','7831068668',
  '9816349856','7831810536','9625670003',
]);

// ── Column detection ─────────────────────────────────────────────────────────
function detectCol(headers, patterns) {
  for (const p of patterns) {
    const idx = headers.findIndex(h => p.test(h.toLowerCase().replace(/[\s_]/g, '')));
    if (idx !== -1) return idx;
  }
  return -1;
}

// ── Dept cache ────────────────────────────────────────────────────────────────
const deptCache = {};
async function getDeptId(pool, deptName) {
  const key = (deptName || '').toLowerCase().trim();
  if (deptCache[key]) return deptCache[key];

  // Try exact match first
  let res = await pool.query(
    "SELECT id FROM departments WHERE LOWER(name) = $1 AND tenant_id = 1 LIMIT 1",
    [key]
  );
  if (res.rows.length > 0) {
    deptCache[key] = res.rows[0].id;
    return deptCache[key];
  }

  // Fallback to General Administration (id=7)
  deptCache[key] = 7;
  return 7;
}

// ── Generate email ────────────────────────────────────────────────────────────
function makeEmail(name, mobile) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '.');
  return `${slug}.${mobile.slice(-4)}@gdcdharamshala.ac.in`;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function run() {
  const raw = fs.readFileSync(csvFile, 'utf8');
  const rows = parse(raw, {
    columns:          true,
    skip_empty_lines: true,
    trim:             true,
    bom:              true,
  });

  if (rows.length === 0) {
    console.error('CSV is empty or has no data rows.');
    process.exit(1);
  }

  // Detect column keys from headers
  const headers = Object.keys(rows[0]).map(h => h.toLowerCase().replace(/[\s_]/g, ''));
  console.log(`[Import] CSV headers detected: ${Object.keys(rows[0]).join(', ')}`);
  console.log(`[Import] Rows to process: ${rows.length}`);
  console.log(`[Import] Target role: ${importRole}`);
  console.log('');

  // Column mappings
  const colOf = (rawRow, patterns) => {
    for (const [key, val] of Object.entries(rawRow)) {
      const k = key.toLowerCase().replace(/[\s_]/g, '');
      if (patterns.some(p => p.test(k))) return (val || '').toString().trim();
    }
    return '';
  };

  const metrics = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const name        = colOf(row, [/^(name|fullname|staffname|facultyname)$/]);
    const mobileRaw   = colOf(row, [/mobile/, /phone/, /contact/]);
    const emailRaw    = colOf(row, [/^email$/]);
    const deptRaw     = colOf(row, [/department/, /dept/, /course/]);
    const designation = colOf(row, [/designation/, /post/, /position/]) || importRole;

    if (!name || name.length < 2) {
      metrics.skipped++;
      continue;
    }

    const mobile = mobileRaw.replace(/\D/g, '');
    if (mobile.length < 10) {
      console.log(`  [SKIP] Row ${i + 2}: "${name}" — invalid mobile "${mobileRaw}"`);
      metrics.skipped++;
      continue;
    }

    const email   = emailRaw || makeEmail(name, mobile);
    const deptId  = await getDeptId(pool, deptRaw);
    // Promote to Admin if on whitelist
    const role    = ADMIN_WHITELIST.has(mobile) ? 'Admin' : importRole;

    try {
      const res = await pool.query(`
        INSERT INTO verified_staff (tenant_id, name, email, mobile, department_id, designation, role, is_account_created)
        VALUES (1, $1, $2, $3, $4, $5, $6, FALSE)
        ON CONFLICT (tenant_id, email)
        DO UPDATE SET
          name        = EXCLUDED.name,
          mobile      = EXCLUDED.mobile,
          department_id = EXCLUDED.department_id,
          designation = EXCLUDED.designation,
          role        = EXCLUDED.role
        RETURNING (xmax = 0) AS inserted
      `, [name, email, mobile, deptId, designation, role]);

      if (res.rows[0].inserted) {
        metrics.inserted++;
        if (role === 'Admin') console.log(`  [ADMIN] ${name} (${mobile})`);
      } else {
        metrics.updated++;
      }

    } catch (e) {
      console.error(`  [ERROR] Row ${i + 2} "${name}": ${e.message}`);
      metrics.errors++;
    }
  }

  // Final verification
  const totals = await pool.query(`
    SELECT role, COUNT(*) as cnt FROM verified_staff WHERE tenant_id = 1 GROUP BY role ORDER BY role
  `);
  const total = await pool.query('SELECT COUNT(*) as cnt FROM verified_staff WHERE tenant_id = 1');

  console.log(`
══════════════════════════════════════════
IMPORT COMPLETE
══════════════════════════════════════════
  ✅ Inserted : ${metrics.inserted}
  🔄 Updated  : ${metrics.updated}
  ⏭️  Skipped  : ${metrics.skipped}
  ❌ Errors   : ${metrics.errors}

VERIFIED_STAFF TABLE TOTALS:
${totals.rows.map(r => `  ${r.role.padEnd(12)}: ${r.cnt}`).join('\n')}
  ${'TOTAL'.padEnd(12)}: ${total.rows[0].cnt}
══════════════════════════════════════════`);

  await pool.end();
}

run().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
