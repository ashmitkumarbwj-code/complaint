const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    console.log('🚀 Starting Production DB Migration...');
    const config = {
        host: process.env.DB_HOST || '127.0.0.1',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    };

    const connection = await mysql.createConnection(config);
    try {
        const sql = `
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                token TEXT NOT NULL,
                expires_at DATETIME,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `;
        await connection.execute(sql);
        console.log('✅ Success: refresh_tokens table ensured.');
    } catch (err) {
        console.error('❌ Migration Failed:', err.message);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

migrate();
