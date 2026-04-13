const db = require('./config/db');

async function runTest() {
    try {
        console.log('Inserting Demo Complaint...');
        const tenantId = 1;
        const studentId = 1; // Assuming Student 1 exists
        
        // 1. Insert ONE test complaint manually
        const [result] = await db.pool.execute(
            `INSERT INTO complaints (tenant_id, student_id, title, department_id, category, description, location, priority, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [tenantId, studentId, 'Demo Feedback Test', 1, 'Other', 'This is a live demo safety test for the hackathon presentation.', 'Main Hall', 'Medium', 'Pending']
        );
        console.log('Insert Success! ID:', result.insertId);

        // 2. Fetch last 5 complaints
        console.log('Verifying Database State...');
        const [rows] = await db.pool.execute('SELECT id, title, local_file_path, status FROM complaints ORDER BY id DESC LIMIT 5');
        console.table(rows);
    } catch (e) {
        console.error('DB Test Error:', e);
    } finally {
        process.exit();
    }
}
runTest();
