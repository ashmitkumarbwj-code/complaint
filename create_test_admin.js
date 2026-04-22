require('dotenv').config();
const db = require('./config/db');
const bcrypt = require('bcryptjs');

async function setup() {
    try {
        console.log("--- Checking Database Schema ---");
        const [tables] = await db.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log("Tables:", tables.map(r => r.table_name));

        const [cols] = await db.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users'");
        console.log("Users table columns:");
        console.table(cols);

        const email = 'testadmin@gcd.local';
        const password = 'Test@12345';
        const role = 'Admin';
        
        console.log(`--- Creating test account: ${email} ---`);
        
        // Check if tenant_id exists
        const hasTenantId = cols.some(c => c.column_name === 'tenant_id');
        let tenantId = null;
        if (hasTenantId) {
            const [tenants] = await db.execute("SELECT id FROM tenants LIMIT 1");
            if (tenants.length > 0) {
                tenantId = tenants[0].id;
                console.log("Using tenant_id:", tenantId);
            }
        }

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Check if user exists
        const [existing] = await db.execute("SELECT id FROM users WHERE email = $1", [email]);
        if (existing.length > 0) {
            console.log("User already exists. Updating password.");
            let sql = "UPDATE users SET password_hash = $1, role = $2, is_verified = true WHERE email = $3";
            await db.execute(sql, [passwordHash, role, email]);
        } else {
            console.log("Inserting new user.");
            let sql;
            let params;
            if (hasTenantId && tenantId) {
                sql = "INSERT INTO users (username, email, password_hash, role, is_verified, tenant_id) VALUES ($1, $2, $3, $4, true, $5)";
                params = ['testadmin', email, passwordHash, role, tenantId];
            } else {
                sql = "INSERT INTO users (username, email, password_hash, role, is_verified) VALUES ($1, $2, $3, $4, true)";
                params = ['testadmin', email, passwordHash, role];
            }
            await db.execute(sql, params);
        }

        console.log("--- Test Admin Account Ready ---");
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

setup();
