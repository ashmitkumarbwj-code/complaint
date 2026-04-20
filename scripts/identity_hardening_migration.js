/**
 * scripts/identity_hardening_migration.js
 * Production-safe migration to align schema with identity hardening requirements.
 */
const db = require('../config/db');

async function runMigration() {
    console.log('--- Starting Identity Hardening Migration ---');

    try {
        // 1. Users Table Hardening
        console.log('Hardening users table...');
        await db.execute(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS full_name VARCHAR(100),
            ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
        `);

        // Backfill full_name from username
        await db.execute(`
            UPDATE users SET full_name = username WHERE full_name IS NULL;
        `);

        // Apply Unique Constraints
        console.log('Applying unique constraints to users...');
        await db.execute(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_unique_username') THEN
                    CREATE UNIQUE INDEX idx_users_unique_username ON users (tenant_id, username);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_unique_email') THEN
                    CREATE UNIQUE INDEX idx_users_unique_email ON users (tenant_id, email) WHERE email IS NOT NULL;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_unique_mobile') THEN
                    CREATE UNIQUE INDEX idx_users_unique_mobile ON users (tenant_id, mobile_number) WHERE mobile_number IS NOT NULL;
                END IF;
            END $$;
        `);

        // 2. Students Table Enrichment
        console.log('Enriching students table...');
        await db.execute(`
            ALTER TABLE students 
            ADD COLUMN IF NOT EXISTS course VARCHAR(100),
            ADD COLUMN IF NOT EXISTS section VARCHAR(10),
            ADD COLUMN IF NOT EXISTS admission_year INT;
        `);

        // 3. Staff Table Enrichment
        console.log('Enriching staff table...');
        await db.execute(`
            ALTER TABLE staff 
            ADD COLUMN IF NOT EXISTS subject_specialization VARCHAR(100),
            ADD COLUMN IF NOT EXISTS employment_type VARCHAR(50);
        `);

        // 4. Departments Table Enrichment
        console.log('Enriching departments table...');
        await db.execute(`
            ALTER TABLE departments 
            ADD COLUMN IF NOT EXISTS code VARCHAR(10),
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
        `);

        // 5. Verified Registries Hardening
        console.log('Hardening verified registries...');
        await db.execute(`
            ALTER TABLE verified_students 
            ADD COLUMN IF NOT EXISTS name VARCHAR(100);
            
            ALTER TABLE verified_staff 
            ADD COLUMN IF NOT EXISTS designation VARCHAR(100);
        `);

        console.log('--- Migration Completed Successfully ---');
    } catch (error) {
        console.error('--- Migration Failed ---');
        console.error(error.message);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

runMigration();
