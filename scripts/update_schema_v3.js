const mysql = require('mysql2/promise');
require('dotenv').config();

async function updateSchemaProduction() {
    let conn;
    try {
        conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('--- Commencing Production Schema Updates ---');

        // 1. Complaint Priority Lookup Table
        console.log('1. Creating complaint_priority table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS complaint_priority (
                id INT AUTO_INCREMENT PRIMARY KEY,
                level_name VARCHAR(50) UNIQUE NOT NULL,
                sla_hours INT NOT NULL,
                color_code VARCHAR(7) DEFAULT '#000000',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Seed Priority Table if empty
        const [priorities] = await conn.query('SELECT COUNT(*) as count FROM complaint_priority');
        if (priorities[0].count === 0) {
            console.log('Seeding complaint_priority table...');
            await conn.query(`
                INSERT INTO complaint_priority (level_name, sla_hours, color_code) VALUES
                ('Low', 72, '#28a745'),
                ('Medium', 48, '#ffc107'),
                ('High', 24, '#fd7e14'),
                ('Emergency', 4, '#dc3545')
            `);
        }

        // 2. Complaint Escalation Lookup Table
        console.log('2. Creating complaint_escalation table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS complaint_escalation (
                id INT AUTO_INCREMENT PRIMARY KEY,
                escalation_level INT UNIQUE NOT NULL,
                role_assigned ENUM('Staff', 'HOD', 'Principal', 'Admin') NOT NULL,
                description VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Seed Escalation Table if empty
        const [escalations] = await conn.query('SELECT COUNT(*) as count FROM complaint_escalation');
        if (escalations[0].count === 0) {
            console.log('Seeding complaint_escalation table...');
            await conn.query(`
                INSERT INTO complaint_escalation (escalation_level, role_assigned, description) VALUES
                (0, 'Staff', 'Initial Assignment'),
                (1, 'HOD', 'Escalated to Head of Department'),
                (2, 'Principal', 'Escalated to Principal for Executive Review'),
                (3, 'Admin', 'Escalated to System Admin for Audit')
            `);
        }

        // 3. Complaint Status History (Audit Trail)
        console.log('3. Creating complaint_status_history table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS complaint_status_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                complaint_id INT NOT NULL,
                old_status VARCHAR(50),
                new_status VARCHAR(50) NOT NULL,
                changed_by INT,
                comments TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
                FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        // 4. Notifications Table (Explicitly for WebSockets / Dashboards)
        console.log('4. Creating notifications table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                title VARCHAR(100) NOT NULL,
                message TEXT NOT NULL,
                type ENUM('info', 'warning', 'success', 'error', 'alert') DEFAULT 'info',
                is_read TINYINT(1) DEFAULT 0,
                reference_id INT, -- E.g., complaint ID
                reference_type VARCHAR(50), -- E.g., 'complaint'
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // 5. Update complaints table to utilize tracking id
        console.log('5. Ensuring tracking_id on complaints table...');
        const [columns] = await conn.query("SHOW COLUMNS FROM complaints");
        const columnNames = columns.map(c => c.Field);

        if (!columnNames.includes('tracking_id')) {
            await conn.query("ALTER TABLE complaints ADD COLUMN tracking_id VARCHAR(50) UNIQUE AFTER id");
            
            // Generate fallback tracking IDs for existing rows
            console.log('Generating legacy tracking IDs...');
            const [rows] = await conn.query("SELECT id FROM complaints WHERE tracking_id IS NULL");
            for (const row of rows) {
                const trackingId = `CMP-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
                await conn.query("UPDATE complaints SET tracking_id = ? WHERE id = ?", [trackingId, row.id]);
            }
        }

        console.log('--- Production Schema Updates Complete ---');

    } catch (err) {
        console.error('Schema update failed:', err);
    } finally {
        if (conn) await conn.end();
        process.exit();
    }
}

updateSchemaProduction();
