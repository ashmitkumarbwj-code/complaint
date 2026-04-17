require('dotenv').config();
const db = require('../config/db');

async function fix() {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS homepage_slides (
            id SERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            image_url VARCHAR(500) NOT NULL,
            public_id VARCHAR(255),
            display_order INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT TRUE,
            start_date TIMESTAMP,
            end_date TIMESTAMP,
            created_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('homepage_slides table created');

    const [rows] = await db.execute('SELECT COUNT(*) FROM homepage_slides');
    if (parseInt(rows[0].count) === 0) {
        await db.execute(
            `INSERT INTO homepage_slides (title, description, image_url, is_active, display_order)
             VALUES ($1, $2, $3, true, 1)`,
            [
                'Welcome to Smart Campus',
                'Modern Complaint & Response Management',
                'https://images.unsplash.com/photo-1541339907198-e08756ebafe3?q=80&w=2070&auto=format&fit=crop'
            ]
        );
        console.log('Initial homepage slide seeded');
    } else {
        console.log('Slides already exist, skipping seed');
    }

    console.log('Done');
    process.exit(0);
}

fix().catch(e => { console.error(e); process.exit(1); });
