'use strict';
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('neon')
    ? { rejectUnauthorized: false }
    : false,
});

async function executeHODUpdate() {
  const client = await pool.connect();
  let updatedCount = 0;
  
  try {
    await client.query('BEGIN');
    
    // 1. Dr. Pawan Thakur → B.Tech CSE (id 25)
    // Email: dr.pawan.thakur.6325@...
    const res1 = await client.query(`
      UPDATE verified_staff 
      SET name = 'Dr. Pawan Thakur', 
          mobile = '9827336325', 
          email = 'dr.pawan.thakur.6325@gdcdharamshala.ac.in',
          designation = 'Head of Department'
      WHERE id = 25 
        AND role = 'HOD' 
        AND mobile LIKE '900000000%'
      RETURNING name
    `);
    if (res1.rowCount > 0) {
      console.log(`✅ Updated ID 25: ${res1.rows[0].name}`);
      updatedCount++;
    }

    // 2. Dr. Naresh Sharma → Arts (id 27)
    // Using a HOD-specific email to avoid collision with his Staff record (id 37)
    const res2 = await client.query(`
      UPDATE verified_staff 
      SET name = 'Dr. Naresh Sharma', 
          mobile = '9418045833', 
          email = 'dr.naresh.sharma.hod@gdcdharamshala.ac.in',
          designation = 'Head of Department'
      WHERE id = 27 
        AND role = 'HOD' 
        AND mobile LIKE '900000000%'
      RETURNING name
    `);
    if (res2.rowCount > 0) {
      console.log(`✅ Updated ID 27: ${res2.rows[0].name}`);
      updatedCount++;
    }

    // 3. Dr. Deepika Thakur → Life Science (id 28)
    // Mobile: 8699010809
    const res3 = await client.query(`
      UPDATE verified_staff 
      SET name = 'Dr. Deepika Thakur', 
          mobile = '8699010809', 
          email = 'dr.deepika.thakur.0809@gdcdharamshala.ac.in',
          designation = 'Head of Department'
      WHERE id = 28 
        AND role = 'HOD' 
        AND mobile LIKE '900000000%'
      RETURNING name
    `);
    if (res3.rowCount > 0) {
      console.log(`✅ Updated ID 28: ${res3.rows[0].name}`);
      updatedCount++;
    }

    await client.query('COMMIT');
    
    console.log(`\nTOTAL RECORDS UPDATED: ${updatedCount}`);

    // --- POST VERIFY ---
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('  FINAL HOD REGISTRY LIST');
    console.log('════════════════════════════════════════════════════════════');
    const finalHods = await client.query(`
      SELECT id, name, mobile, role, 
             CASE WHEN mobile LIKE '900000000%' THEN 'PLACEHOLDER' ELSE 'ACTIVE' END as status
      FROM verified_staff 
      WHERE role = 'HOD' 
      ORDER BY id
    `);
    console.table(finalHods.rows);

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ EXECUTION FAILED:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

executeHODUpdate();
