require('dotenv').config();
const { Pool } = require('pg');

const PROD_URL = 'postgresql://neondb_owner:npg_XCajzy1uh4SQ@ep-young-darkness-ancd84e0-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
    connectionString: PROD_URL,
    ssl: { rejectUnauthorized: false }
});

async function executeAlignment() {
    const client = await pool.connect();
    try {
        console.log('🚀 Starting Production Department Alignment...');
        await client.query('BEGIN');

        // PHASE 1: Insert missing departments
        console.log('--- Phase 1: Inserting institutional departments ---');
        const insertSql = `
            INSERT INTO departments (id, name, description) VALUES 
            (7, 'General Administration', 'General clerical work, document processing, and public relations.'),
            (8, 'B. Voc. (Hospitality and Tourism)', 'Professional hospitality and tourism management studies.'),
            (9, 'B. Voc. (Retail Management)', 'Retail operations and business management.'),
            (10, 'B.A - Bachelors (Arts)', 'Liberal arts and humanities.'),
            (11, 'B.Com - Bachelors (Commerce)', 'Business, accountancy, and trade studies.'),
            (12, 'B.Sc - Medical (Life Science)', 'Biological sciences and medical preparatory studies.'),
            (13, 'B.Sc - Non-Medical', 'Mathematics, physics, and chemistry focus.'),
            (14, 'B.Sc. - Physical Science', 'Study of inanimate natural objects.'),
            (15, 'B.Sc. Hons. Biotechnology', 'Advanced biological technology research.'),
            (16, 'B.Tech - Computer Science and Engineering', 'Engineering focus on computing and software systems.'),
            (17, 'BBA - Bachelor of Business Administration', 'Foundational business management.'),
            (18, 'BCA - Bachelor of Computer Application', 'Application-focused computer science studies.'),
            (19, 'M.A. English', 'Masters in English literature and language.'),
            (20, 'M.Sc. Chemistry', 'Post-graduate chemical sciences.'),
            (21, 'M.Sc. Geography', 'Post-graduate geographical and spatial studies.'),
            (22, 'Master of Business Administration - MBA', 'Advanced business leadership.'),
            (23, 'Master of Commerce (M.Com)', 'Advanced commerce and financial studies.'),
            (24, 'Master of Computer Application - MCA', 'Advanced computer applications.'),
            (25, 'PGDCA - Post Graduate Diploma in Computer Applications', 'Technical diploma in computing.')
            ON CONFLICT (id) DO NOTHING;
        `;
        await client.query(insertSql);

        // PHASE 2: Re-mapping
        console.log('--- Phase 2: Re-mapping data references ---');
        // Mapping: 1 -> 7, 2 -> 18, 6 -> 2
        
        // Students
        await client.query('UPDATE students SET department_id = 7 WHERE department_id = 1');
        await client.query('UPDATE students SET department_id = 18 WHERE department_id = 2');
        
        // Complaints
        await client.query('UPDATE complaints SET department_id = 7 WHERE department_id = 1');
        await client.query('UPDATE complaints SET department_id = 2 WHERE department_id = 6');
        
        // Department Members
        await client.query('UPDATE department_members SET department_id = 7 WHERE department_id = 1');
        await client.query('UPDATE department_members SET department_id = 18 WHERE department_id = 2');
        await client.query('UPDATE department_members SET department_id = 2 WHERE department_id = 6');

        // Complaint Departments Audit
        await client.query('UPDATE complaint_departments SET department_id = 7 WHERE department_id = 1');
        await client.query('UPDATE complaint_departments SET department_id = 18 WHERE department_id = 2');
        await client.query('UPDATE complaint_departments SET department_id = 2 WHERE department_id = 6');

        // PHASE 3: Update IDs 1-6 Names
        console.log('--- Phase 3: Repurposing Core IDs 1-6 ---');
        await client.query("UPDATE departments SET name = 'Hostel Administration', description = 'Handles hostel noise, room allocation, and student conduct.' WHERE id = 1");
        await client.query("UPDATE departments SET name = 'Maintenance Department', description = 'Maintains campus infrastructure, electrical systems, and plumbing.' WHERE id = 2");
        await client.query("UPDATE departments SET name = 'Mess Management', description = 'Oversees cafeteria quality, hygiene, and meal scheduling.' WHERE id = 3");
        await client.query("UPDATE departments SET name = 'Disciplinary Committee', description = 'Investigates sensitive student issues and code of conduct violations.' WHERE id = 4");
        await client.query("UPDATE departments SET name = 'Campus Security', description = 'Ensures campus safety, patrolling, and emergency response.' WHERE id = 5");
        await client.query("UPDATE departments SET name = 'Academic Department', description = 'Academic concerns, lecturer issues, and lab equipment support.' WHERE id = 6");

        // PHASE 4: Reset Sequence
        console.log('--- Phase 4: Resetting sequence ---');
        await client.query("SELECT setval('departments_id_seq', (SELECT MAX(id) FROM departments))");

        // PHASE 5: Verification
        console.log('\n--- VERIFICATION RESULTS ---');
        const vDepts = await client.query('SELECT id, name FROM departments ORDER BY id');
        console.log('Departments:');
        console.table(vDepts.rows);

        const vStudents = await client.query('SELECT department_id, COUNT(*) FROM students GROUP BY department_id');
        console.log('Student Counts per Dept ID:');
        console.table(vStudents.rows);

        const vComplaints = await client.query('SELECT department_id, COUNT(*) FROM complaints GROUP BY department_id');
        console.log('Complaint Counts per Dept ID:');
        console.table(vComplaints.rows);

        await client.query('COMMIT');
        console.log('\n🎉 SUCCESS: Department Alignment committed to production.');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('\n💥 ERROR: Alignment failed. Rolling back...', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

executeAlignment();
