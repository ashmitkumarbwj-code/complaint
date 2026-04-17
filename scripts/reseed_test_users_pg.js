const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('neon.tech')
        ? { rejectUnauthorized: false }
        : false
});

async function getOrCreateDept(name) {
    const existing = await pool.query('SELECT id FROM departments WHERE name = $1 AND tenant_id = 1', [name]);
    if (existing.rows.length > 0) return existing.rows[0].id;
    const res = await pool.query('INSERT INTO departments (name, tenant_id) VALUES ($1, 1) RETURNING id', [name]);
    return res.rows[0].id;
}

async function reseed() {
    console.log('--- RESEEDING TEST USERS (PG NATIVE) ---');
    const hashedPass = await bcrypt.hash('password123', 10);

    try {
        // 1. Clean existing test data (correct order for FK constraints)
        console.log('Cleaning...');
        await pool.query("DELETE FROM department_members WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_%' AND tenant_id = 1)");
        await pool.query("DELETE FROM staff WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_%' AND tenant_id = 1)");
        await pool.query("DELETE FROM students WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_%' AND tenant_id = 1)");
        await pool.query("DELETE FROM users WHERE username LIKE 'test_%' AND tenant_id = 1");
        await pool.query("DELETE FROM department_categories WHERE tenant_id = 1");

        // 2. Ensure departments exist
        console.log('Setting up departments...');
        const deptIds = {
            'General Administration': await getOrCreateDept('General Administration'),
            'Maintenance':            await getOrCreateDept('Maintenance'),
            'Computer Science':       await getOrCreateDept('Computer Science'),
            'Electronics':            await getOrCreateDept('Electronics'),
        };

        // 3. Map categories to departments
        console.log('Mapping categories...');
        const catMaps = [
            ['Electricity',    deptIds['Maintenance']],
            ['Infrastructure', deptIds['Maintenance']],
            ['Noise',          deptIds['General Administration']],
            ['Academic',       deptIds['Computer Science']],
            ['Harassment',     deptIds['General Administration']],
        ];
        for (const [cat, did] of catMaps) {
            await pool.query(
                'INSERT INTO department_categories (category, department_id, tenant_id) VALUES ($1, $2, 1)',
                [cat, did]
            );
        }

        // 4. Create 35 students (using correct column: roll_number)
        console.log('Creating 35 students...');
        for (let i = 1; i <= 35; i++) {
            const username = `test_student_${i}`;
            const r = await pool.query(
                `INSERT INTO users (username, password_hash, role, tenant_id, status)
                 VALUES ($1, $2, 'student', 1, 'active') RETURNING id`,
                [username, hashedPass]
            );
            await pool.query(
                'INSERT INTO students (user_id, roll_number, department_id, tenant_id) VALUES ($1, $2, $3, 1)',
                [r.rows[0].id, `STU${1000 + i}`, deptIds['Computer Science']]
            );
        }

        // 5. Create 12 staff/admin/principal (using correct column: employee_id)
        console.log('Creating 12 staff...');
        for (let i = 1; i <= 12; i++) {
            const username = `test_staff_${i}`;
            const role = i <= 1 ? 'principal' : (i <= 3 ? 'admin' : 'staff');
            const deptId = i % 2 === 0 ? deptIds['Maintenance'] : deptIds['General Administration'];

            const r = await pool.query(
                `INSERT INTO users (username, password_hash, role, tenant_id, status)
                 VALUES ($1, $2, $3, 1, 'active') RETURNING id`,
                [username, hashedPass, role]
            );

            await pool.query(
                'INSERT INTO staff (user_id, employee_id, department_id, tenant_id) VALUES ($1, $2, $3, 1)',
                [r.rows[0].id, `EMP${1000 + i}`, deptId]
            );

            await pool.query(
                'INSERT INTO department_members (user_id, department_id, tenant_id) VALUES ($1, $2, 1)',
                [r.rows[0].id, deptId]
            );
        }

        console.log('✅ Reseed complete.');
        console.log('   Students : test_student_1 .. test_student_35');
        console.log('   Staff    : test_staff_1 (principal), test_staff_2..3 (admin), test_staff_4..12 (staff)');
        console.log('   Password : password123');
        process.exit(0);
    } catch (e) {
        console.error('❌ Reseed failed:', e.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

reseed();
