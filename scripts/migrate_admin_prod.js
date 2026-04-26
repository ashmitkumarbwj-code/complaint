'use strict';
const { Pool } = require('pg');

const PROD_URL = 'postgresql://neondb_owner:npg_XCajzy1uh4SQ@ep-young-darkness-ancd84e0-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
  connectionString: PROD_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('--- MIGRATION: ADMIN USER MANAGEMENT (PROD) ---');
    
    // 1. Audit Logs Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER DEFAULT 1,
        admin_id INTEGER,
        action VARCHAR(50) NOT NULL,
        target_type VARCHAR(50),
        target_id INTEGER,
        details JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created admin_audit_logs');

    // 2. Soft Delete Support
    await client.query('ALTER TABLE verified_students ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE');
    await client.query('ALTER TABLE verified_staff ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE');
    console.log('✅ Added is_active columns');

  } catch (e) {
    console.error('❌ Migration failed:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
