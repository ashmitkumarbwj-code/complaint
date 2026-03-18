const mysql = require('mysql2/promise');
require('dotenv').config();

async function updateSchema() {
    let conn;
    try {
        conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('1. Creating student_verification_data table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS student_verification_data (
                id INT AUTO_INCREMENT PRIMARY KEY,
                roll_number VARCHAR(20) UNIQUE NOT NULL,
                department VARCHAR(100),
                year VARCHAR(10),
                mobile_number VARCHAR(15),
                email VARCHAR(100),
                id_card_image VARCHAR(255),
                is_account_created TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('2. Creating otps table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS otps (
                id INT AUTO_INCREMENT PRIMARY KEY,
                identifier VARCHAR(50) NOT NULL, -- roll_number or mobile
                otp_code VARCHAR(6) NOT NULL,
                expires_at DATETIME NOT NULL,
                type ENUM('activation', 'reset') DEFAULT 'activation',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_identifier (identifier)
            )
        `);

        console.log('3. Updating users table for security (failed attempts, locking)...');
        // Check if columns exist before adding
        const [columns] = await conn.query("SHOW COLUMNS FROM users");
        const columnNames = columns.map(c => c.Field);

        if (!columnNames.includes('failed_attempts')) {
            await conn.query("ALTER TABLE users ADD COLUMN failed_attempts INT DEFAULT 0");
        }
        if (!columnNames.includes('locked_until')) {
            await conn.query("ALTER TABLE users ADD COLUMN locked_until DATETIME DEFAULT NULL");
        }
        if (!columnNames.includes('mobile_number')) {
            await conn.query("ALTER TABLE users ADD COLUMN mobile_number VARCHAR(15) AFTER email");
        }

        console.log('Database schema refactored successfully!');
    } catch (err) {
        console.error('Schema update failed:', err);
    } finally {
        if (conn) await conn.end();
    }
}

updateSchema();
