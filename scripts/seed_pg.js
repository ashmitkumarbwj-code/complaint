'use strict';

const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

async function seed() {
    console.log('--- STARTING POSTGRES SEEDING ---');
    
    try {
        // 1. Read and Execute Schema
        const schema = fs.readFileSync(path.join(__dirname, '../database_pg.sql'), 'utf8');
        console.log('[1/4] Applying Schema (Target: Neon/Postgres)...');
        await db.pool.query(schema);
        console.log('✅ Schema applied successfully.');

        // 2. Hash Passwords
        const hashedPassword = await bcrypt.hash('admin123', 10);

        // 3. Seed Core Data
        console.log('[2/4] Seeding Institutional Master Data...');
        
        // Departments
        const [depts] = await db.execute(`
            INSERT INTO departments (name, description) VALUES 
            ('General Administration', 'Campus HQ'),
            ('Computer Science', 'Academic Dept'),
            ('Mechanical Engineering', 'Academic Dept'),
            ('Electronics', 'Academic Dept'),
            ('Business Administration', 'Academic Dept'),
            ('Maintenance', 'Infrastructure Support')
            RETURNING id, name
        `);
        const adminDeptId = depts[0].id;
        const csDeptId    = depts[1].id;

        // Admin User
        const [admins] = await db.execute(`
            INSERT INTO users (username, email, mobile_number, password_hash, role, is_verified) 
            VALUES ('admin', 'admin@gdc.edu', '9876543210', $1, 'Admin', true)
            RETURNING id
        `, [hashedPassword]);
        const adminId = admins[0].id;

        // Staff User (HOD)
        const [hods] = await db.execute(`
            INSERT INTO users (username, email, mobile_number, password_hash, role, is_verified) 
            VALUES ('hod_cs', 'hod@gdc.edu', '8888777766', $1, 'HOD', true)
            RETURNING id
        `, [hashedPassword]);
        const hodUserId = hods[0].id;

        await db.execute(
            'INSERT INTO staff (user_id, department_id, designation) VALUES ($1, $2, $3)',
            [hodUserId, csDeptId, 'Head of Department']
        );

        // Student User
        const [students] = await db.execute(`
            INSERT INTO users (username, email, mobile_number, password_hash, role, is_verified) 
            VALUES ('student01', 'student@example.com', '9999888877', $1, 'Student', true)
            RETURNING id
        `, [hashedPassword]);
        const studentUserId = students[0].id;

        const [studentProfiles] = await db.execute(`
            INSERT INTO students (user_id, roll_number, department_id, registration_no, semester) 
            VALUES ($1, '21DCS001', $2, 'REG-2026-001', 3)
            RETURNING id
        `, [studentUserId, csDeptId]);
        const studentRecordId = studentProfiles[0].id;

        // 4. Seed Verified Registries (Master List)
        console.log('[3/4] Seeding Verified Registries...');
        await db.execute(`
            INSERT INTO verified_students (roll_number, department, year, mobile_number, email)
            VALUES ('21DCS001', 'Computer Science', '3rd', '9999888877', 'student@example.com')
            ON CONFLICT (tenant_id, roll_number) DO NOTHING
        `);

        // 5. Sample Complaints
        console.log('[4/4] Seeding Sample Complaints...');
        await db.execute(`
            INSERT INTO complaints (student_id, title, department_id, category, description, priority, status)
            VALUES ($1, 'Lab AC Not Working', $2, 'Infrastructure', 'The AC in Lab 1 is leaking and noisy.', 'High', 'Pending')
        `, [studentRecordId, adminDeptId]);

        console.log('\n✅ POSTGRES SEEDING COMPLETE!');
        console.log(`- Admin:   admin    / admin123`);
        console.log(`- Student: student01 / admin123`);
        console.log(`- HOD:     hod_cs   / admin123`);
        
        process.exit(0);

    } catch (err) {
        console.error('\n❌ SEEDING FAILED!');
        console.error(err);
        process.exit(1);
    }
}

seed();
