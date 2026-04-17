require('dotenv').config();
const db = require('../config/db');

async function fix() {
    try {
        console.log('Starting Infrastructure Fix...');

        // 1. Create Roles Table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS roles (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) UNIQUE NOT NULL
            )
        `);
        console.log('Roles table ready.');

        // 2. Seed Roles
        const roles = ['student', 'staff', 'admin', 'principal'];
        for (const role of roles) {
            await db.execute('INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [role]);
        }
        console.log('Roles seeded.');

        // 3. Create Complaint Departments Table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS complaint_departments (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                description TEXT
            )
        `);
        console.log('Complaint departments table ready.');

        // 4. Create Gallery Images Table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS gallery_images (
                id SERIAL PRIMARY KEY,
                url VARCHAR(255) NOT NULL,
                title VARCHAR(255),
                is_featured BOOLEAN DEFAULT FALSE,
                display_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Gallery images table ready.');

        // 5. Create Slides Table (Home Slider)
        await db.execute(`
            CREATE TABLE IF NOT EXISTS slides (
                id SERIAL PRIMARY KEY,
                image_url VARCHAR(255) NOT NULL,
                title VARCHAR(255),
                description TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                display_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Slides table ready.');

        // 6. Seed one Slide if empty
        const [slideCount] = await db.execute('SELECT COUNT(*) FROM slides');
        if (parseInt(slideCount[0].count) === 0) {
            await db.execute(`
                INSERT INTO slides (image_url, title, description) 
                VALUES ($1, $2, $3)`,
                ['https://images.unsplash.com/photo-1541339907198-e08756ebafe3?q=80&w=2070&auto=format&fit=crop', 'Welcome to Smart Campus', 'Modern Complaint & Response Management System']
            );
            console.log('Initial slide added.');
        }

        console.log('Infrastructure Fix Completed Successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Fix failed:', err);
        process.exit(1);
    }
}

fix();
