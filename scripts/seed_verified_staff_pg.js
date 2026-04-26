'use strict';
/**
 * seed_verified_staff_pg.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Seeds the `verified_staff` table in PostgreSQL with all known real staff.
 *
 * Sources:
 *   1. Principal  — from scripts/add_principal.sql
 *   2. Admin list — from scripts/staff_import.js whitelist
 *   3. HOD list   — placeholder HODs per department
 *
 * Run: node scripts/seed_verified_staff_pg.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const { Pool } = require('pg');

const isNeon = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('neon');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isNeon ? { rejectUnauthorized: false } : false,
});

// ── Dept IDs from production DB ──────────────────────────────────────────────
const DEPT = {
  HOSTEL:      1,
  MAINTENANCE: 2,
  MESS:        3,
  DISCIPLINE:  4,
  SECURITY:    5,
  ACADEMIC:    6,
  ADMIN:       7,
  BCA:         18,
  CSE:         16,
  COMMERCE:    11,
  ARTS:        10,
  BSC_MED:     12,
  BSC_NONMED:  13,
  MBA:         22,
  MCA:         24,
  BBA:         17,
  BCOM:        11,
  MCOM:        23,
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. PRINCIPAL (from add_principal.sql)
// ─────────────────────────────────────────────────────────────────────────────
const PRINCIPAL = {
  name:        'Prof. Rakesh Pathania',
  email:       'gdcdharamshala@gmail.com',
  mobile:      '7018168314',
  role:        'Principal',
  dept_id:     DEPT.ADMIN,
  designation: 'Principal',
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. ADMIN LIST (from scripts/staff_import.js whitelist, with names)
// ─────────────────────────────────────────────────────────────────────────────
const ADMINS = [
  { name: 'Sh. Ashwani Kumar',    mobile: '9418188560', dept_id: DEPT.ADMIN,       designation: 'Administrative Officer' },
  { name: 'Sh. Sanjeev Katoch',   mobile: '7018196283', dept_id: DEPT.ADMIN,       designation: 'Administrative Officer' },
  { name: 'Sh. Satbir Guleria',   mobile: '9418237833', dept_id: DEPT.ADMIN,       designation: 'Administrative Officer' },
  { name: 'Sh. Chander Shekhar',  mobile: '9817175252', dept_id: DEPT.ACADEMIC,    designation: 'Administrative Officer' },
  { name: 'Sh. Kamaljeet Singh',  mobile: '8219659265', dept_id: DEPT.ADMIN,       designation: 'Administrative Officer' },
  { name: 'Sh. Nitin Kumar',      mobile: '9418911944', dept_id: DEPT.ADMIN,       designation: 'Administrative Officer' },
  { name: 'Sh. Rohit Kumar',      mobile: '7876172603', dept_id: DEPT.MAINTENANCE, designation: 'Maintenance Supervisor' },
  { name: 'Sh. Pardeep Singh',    mobile: '9418713034', dept_id: DEPT.SECURITY,    designation: 'Security Officer' },
  { name: 'Sh. Amit Kumar',       mobile: '9805457410', dept_id: DEPT.ADMIN,       designation: 'Administrative Officer' },
  { name: 'Sh. Umesh Kumar',      mobile: '8219676735', dept_id: DEPT.ADMIN,       designation: 'Administrative Officer' },
  { name: 'Mr. Abneet Singh',     mobile: '9882906696', dept_id: DEPT.HOSTEL,      designation: 'Hostel Warden' },
  { name: 'Mr. Ankur',            mobile: '7807723617', dept_id: DEPT.ADMIN,       designation: 'Administrative Officer' },
  { name: 'Mr. Mandeep Kumar',    mobile: '9418314308', dept_id: DEPT.ADMIN,       designation: 'Administrative Officer' },
  { name: 'Ms. Shaila',           mobile: '9882717003', dept_id: DEPT.ADMIN,       designation: 'Administrative Officer' },
  { name: 'Mr. Ajay Kumar',       mobile: '8351865937', dept_id: DEPT.MAINTENANCE, designation: 'Maintenance Officer' },
  { name: 'Mr. Manoj Kumar',      mobile: '8091364033', dept_id: DEPT.ADMIN,       designation: 'Administrative Officer' },
  { name: 'Mr. Vijay Kumar',      mobile: '8263936735', dept_id: DEPT.SECURITY,    designation: 'Security Officer' },
  { name: 'Mr. Bir Singh',        mobile: '8628027717', dept_id: DEPT.SECURITY,    designation: 'Security Guard' },
  { name: 'Ms. Roma Devi',        mobile: '9418398834', dept_id: DEPT.MESS,        designation: 'Mess Supervisor' },
  { name: 'Ms. Indira Devi',      mobile: '7831068668', dept_id: DEPT.MESS,        designation: 'Mess Supervisor' },
  { name: 'Mr. Karnail Singh',    mobile: '9816349856', dept_id: DEPT.MAINTENANCE, designation: 'Maintenance Officer' },
  { name: 'Ms. Pushpa Devi',      mobile: '7831810536', dept_id: DEPT.ADMIN,       designation: 'Administrative Officer' },
  { name: 'Mr. Tirlok Singh',     mobile: '9625670003', dept_id: DEPT.ADMIN,       designation: 'Administrative Officer' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. HOD PLACEHOLDERS (one per academic department)
//    These are structural placeholders — real data from PDF must be filled in
// ─────────────────────────────────────────────────────────────────────────────
const HODS = [
  { name: 'HOD - Computer Science',    mobile: '9000000001', email: 'hod.cs@gdcdharamshala.ac.in',       dept_id: DEPT.CSE,      designation: 'Head of Department' },
  { name: 'HOD - Commerce',            mobile: '9000000002', email: 'hod.commerce@gdcdharamshala.ac.in', dept_id: DEPT.COMMERCE, designation: 'Head of Department' },
  { name: 'HOD - Arts',                mobile: '9000000003', email: 'hod.arts@gdcdharamshala.ac.in',     dept_id: DEPT.ARTS,     designation: 'Head of Department' },
  { name: 'HOD - Life Science',        mobile: '9000000004', email: 'hod.lifesci@gdcdharamshala.ac.in',  dept_id: DEPT.BSC_MED,  designation: 'Head of Department' },
  { name: 'HOD - Non-Medical Science', mobile: '9000000005', email: 'hod.nonmed@gdcdharamshala.ac.in',   dept_id: DEPT.BSC_NONMED, designation: 'Head of Department' },
  { name: 'HOD - BCA',                 mobile: '9000000006', email: 'hod.bca@gdcdharamshala.ac.in',      dept_id: DEPT.BCA,      designation: 'Head of Department' },
  { name: 'HOD - MBA',                 mobile: '9000000007', email: 'hod.mba@gdcdharamshala.ac.in',      dept_id: DEPT.MBA,      designation: 'Head of Department' },
  { name: 'HOD - MCA',                 mobile: '9000000008', email: 'hod.mca@gdcdharamshala.ac.in',      dept_id: DEPT.MCA,      designation: 'Head of Department' },
  { name: 'HOD - BBA',                 mobile: '9000000009', email: 'hod.bba@gdcdharamshala.ac.in',      dept_id: DEPT.BBA,      designation: 'Head of Department' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build email from name + mobile if not provided
// ─────────────────────────────────────────────────────────────────────────────
function makeEmail(name, mobile) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '.');
  return `${slug}.${mobile.slice(-4)}@gdcdharamshala.ac.in`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core insert function — idempotent (ON CONFLICT DO UPDATE)
// ─────────────────────────────────────────────────────────────────────────────
async function upsertStaff(client, record, role) {
  const email = record.email || makeEmail(record.name, record.mobile);

  await client.query(`
    INSERT INTO verified_staff (tenant_id, name, email, mobile, department_id, designation, role, is_account_created)
    VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
    ON CONFLICT (tenant_id, email)
    DO UPDATE SET
      name        = EXCLUDED.name,
      mobile      = EXCLUDED.mobile,
      department_id = EXCLUDED.department_id,
      designation = EXCLUDED.designation,
      role        = EXCLUDED.role
  `, [1, record.name, email, record.mobile, record.dept_id, record.designation, role]);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function seed() {
  const client = await pool.connect();
  const metrics = { principal: 0, admin: 0, hod: 0, errors: 0 };

  try {
    await client.query('BEGIN');

    // 1. Principal
    console.log('\n[1/3] Inserting Principal...');
    await upsertStaff(client, PRINCIPAL, 'Principal');
    metrics.principal++;
    console.log(`  ✅ ${PRINCIPAL.name} (${PRINCIPAL.mobile})`);

    // 2. Admins
    console.log('\n[2/3] Inserting Admins...');
    for (const admin of ADMINS) {
      try {
        await upsertStaff(client, admin, 'Admin');
        metrics.admin++;
        console.log(`  ✅ ${admin.name} (${admin.mobile})`);
      } catch (e) {
        console.error(`  ❌ ${admin.name}: ${e.message}`);
        metrics.errors++;
      }
    }

    // 3. HODs
    console.log('\n[3/3] Inserting HOD Placeholders...');
    for (const hod of HODS) {
      try {
        await upsertStaff(client, hod, 'HOD');
        metrics.hod++;
        console.log(`  ✅ ${hod.name} (${hod.mobile})`);
      } catch (e) {
        console.error(`  ❌ ${hod.name}: ${e.message}`);
        metrics.errors++;
      }
    }

    await client.query('COMMIT');

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('\n[FATAL] Transaction rolled back:', e.message);
    process.exit(1);
  } finally {
    client.release();
  }

  // ── Verification ────────────────────────────────────────────────────────────
  console.log('\n=== VERIFICATION ===');
  const final = await pool.query(`
    SELECT role, COUNT(*) as cnt FROM verified_staff
    WHERE tenant_id = 1
    GROUP BY role ORDER BY role
  `);
  const total = await pool.query('SELECT COUNT(*) as cnt FROM verified_staff WHERE tenant_id = 1');

  final.rows.forEach(r => console.log(`  ${r.role.padEnd(15)}: ${r.cnt} records`));
  console.log(`  ${'TOTAL'.padEnd(15)}: ${total.rows[0].cnt} records`);

  console.log(`
══════════════════════════════════════════
SEED SUMMARY
══════════════════════════════════════════
  Principal  : ${metrics.principal}
  Admins     : ${metrics.admin}
  HODs       : ${metrics.hod}
  Errors     : ${metrics.errors}
══════════════════════════════════════════

⚠️  HOD mobiles are PLACEHOLDERS (900000000X).
   Run: node scripts/import_staff_csv.js <path-to-csv>
   to replace with real faculty data from the PDF exports.
══════════════════════════════════════════`);

  await pool.end();
}

seed().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
