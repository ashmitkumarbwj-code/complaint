require('dotenv').config();
const db = require('./config/db');

async function createTable() {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS dynamic_homepage_slides (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                media_url VARCHAR(500) NOT NULL,
                media_type VARCHAR(50) NOT NULL CHECK (media_type IN ('image', 'video')),
                public_id VARCHAR(255),
                is_active BOOLEAN DEFAULT true,
                display_order INTEGER DEFAULT 0,
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("Table dynamic_homepage_slides created successfully!");
        process.exit(0);
    } catch (e) {
        console.error("Error creating table:", e);
        process.exit(1);
    }
}

createTable();
