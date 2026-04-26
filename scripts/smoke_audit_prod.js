require('dotenv').config();
const { Pool } = require('pg');

const PROD_URL = 'postgresql://neondb_owner:npg_XCajzy1uh4SQ@ep-young-darkness-ancd84e0-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
    connectionString: PROD_URL,
    ssl: { rejectUnauthorized: false }
});

async function smokeAudit() {
    try {
        console.log('--- AUDIT 1: Student & Dept Linkage ---');
        const studentDept = await pool.query(`
            SELECT s.department_id, d.name, COUNT(*) 
            FROM students s
            LEFT JOIN departments d ON s.department_id = d.id
            GROUP BY s.department_id, d.name
            ORDER BY count DESC
        `);
        console.table(studentDept.rows);

        console.log('\n--- AUDIT 2: HOD Accounts & Designation ---');
        const hods = await pool.query(`
            SELECT u.username, s.designation, d.name as department
            FROM staff s
            JOIN users u ON s.user_id = u.id
            JOIN departments d ON s.department_id = d.id
            WHERE s.designation = 'HOD' LIMIT 5
        `);
        if (hods.rows.length === 0) {
            console.log('No HODs found. Checking any staff...');
            const anyStaff = await pool.query(`
                SELECT u.username, s.designation, d.name as department
                FROM staff s
                JOIN users u ON s.user_id = u.id
                JOIN departments d ON s.department_id = d.id
                LIMIT 5
            `);
            console.table(anyStaff.rows);
        } else {
            console.table(hods.rows);
        }

        console.log('\n--- AUDIT 3 & 5: Global System Stats ---');
        const stats = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM complaints) as total_complaints,
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM departments) as total_depts
        `);
        console.table(stats.rows);

        console.log('\n--- AUDIT 4: Category-to-Department Routing ---');
        const routing = await pool.query(`
            SELECT dc.category, d.name as routed_to_department
            FROM department_categories dc
            JOIN departments d ON dc.department_id = d.id
            ORDER BY dc.category
        `);
        console.table(routing.rows);

        console.log('\n--- AUDIT 6: Foreign Key / Orphan Checks ---');
        const orphanStudents = await pool.query(`
            SELECT COUNT(*) FROM students 
            WHERE department_id IS NOT NULL 
            AND department_id NOT IN (SELECT id FROM departments)
        `);
        const invalidStudentDepts = parseInt(orphanStudents.rows[0].count);
        console.log('Orphan Students (Invalid Dept ID):', invalidStudentDepts);

        const orphanComplaints = await pool.query(`
            SELECT COUNT(*) FROM complaints 
            WHERE department_id IS NOT NULL 
            AND department_id NOT IN (SELECT id FROM departments)
        `);
        const invalidComplaintDepts = parseInt(orphanComplaints.rows[0].count);
        console.log('Orphan Complaints (Invalid Dept ID):', invalidComplaintDepts);

        console.log('\n--- FINAL VERDICT ---');
        if (invalidStudentDepts === 0 && invalidComplaintDepts === 0 && routing.rows.length > 0) {
            console.log('🎉 VERDICT: PASS');
            console.log('Data integrity confirmed. All references point to valid departments.');
        } else {
            console.log('❌ VERDICT: FAIL');
            console.log('Integrity issues detected or routing table empty.');
        }

    } catch (err) {
        console.error('Audit failed:', err.message);
    } finally {
        await pool.end();
    }
}

smokeAudit();
