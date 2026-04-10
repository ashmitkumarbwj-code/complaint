const db = require('../config/db');

async function migrateSaaS() {
    console.log('--- Starting SaaS Migration ---');
    try {
        // 1. Create Tenants table
        console.log('Creating tenants table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS tenants (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                subdomain VARCHAR(50) UNIQUE NOT NULL,
                api_key VARCHAR(100) UNIQUE,
                db_config JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Seed Default Tenant
        console.log('Seeding default tenant...');
        await db.query('INSERT IGNORE INTO tenants (id, name, subdomain) VALUES (1, "Main Campus", "main")');

        const tablesToUpdate = [
            'users', 'verified_students', 'verified_staff', 'departments', 
            'students', 'staff', 'complaints', 'feedback', 
            'login_audit', 'department_categories'
        ];

        for (const table of tablesToUpdate) {
            console.log(`Checking table: ${table}...`);
            
            // Create table if missing (e.g. login_audit, department_categories)
            if (table === 'login_audit') {
                await db.query(`
                    CREATE TABLE IF NOT EXISTS login_audit (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        tenant_id INT NOT NULL DEFAULT 1,
                        user_id INT NULL,
                        identifier VARCHAR(100) NOT NULL,
                        success TINYINT(1) NOT NULL,
                        reason VARCHAR(100) NULL,
                        ip_address VARCHAR(45) NULL,
                        user_agent VARCHAR(255) NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
                    )
                `);
            } else if (table === 'department_categories') {
                await db.query(`
                    CREATE TABLE IF NOT EXISTS department_categories (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        tenant_id INT NOT NULL DEFAULT 1,
                        category VARCHAR(50) NOT NULL,
                        department_id INT NOT NULL,
                        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
                    )
                `);
            }

            // Add tenant_id if not exists
            const [columns] = await db.query(`SHOW COLUMNS FROM ${table} LIKE "tenant_id"`);
            if (columns.length === 0) {
                await db.query(`ALTER TABLE ${table} ADD COLUMN tenant_id INT NOT NULL DEFAULT 1 AFTER id`);
                console.log(`  Added tenant_id to ${table}`);
            }

            // Add Foreign Key
            try {
                await db.query(`ALTER TABLE ${table} ADD CONSTRAINT fk_${table}_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)`);
                console.log(`  Added Foreign Key to ${table}`);
            } catch (e) {
                console.log(`  Foreign Key already exists or failed for ${table}`);
            }

            // Add Index
            try {
                await db.query(`CREATE INDEX idx_${table}_tenant ON ${table}(tenant_id)`);
                console.log(`  Added Index to ${table}`);
            } catch (e) {
                console.log(`  Index already exists or failed for ${table}`);
            }
        }

        // Special unique constraints
        console.log('Applying unique constraints...');
        try {
            await db.query('ALTER TABLE verified_students DROP INDEX roll_number'); // Drop old unique if exists
        } catch (e) {}
        try {
            await db.query('ALTER TABLE verified_students ADD UNIQUE KEY uk_vs_tenant_roll (tenant_id, roll_number)');
        } catch (e) {}

        try {
            await db.query('ALTER TABLE verified_staff DROP INDEX email');
        } catch (e) {}
        try {
            await db.query('ALTER TABLE verified_staff ADD UNIQUE KEY uk_vf_tenant_email (tenant_id, email)');
        } catch (e) {}

        console.log('--- SaaS Migration Completed Successfully ---');
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

migrateSaaS();
