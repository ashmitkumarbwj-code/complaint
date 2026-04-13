
const XLSX = require('xlsx');
const db = require('../config/db');

const SOURCE_FILE = 'C:\\Users\\Rajesh Kumar\\Desktop\\Data\\StudentInfo_Report_10_03_2026_12_06_PM.xls';
const TENANT_ID = 1;
const BATCH_SIZE = 100;

const DEPT_MAP = {
    'BCA - Bachelor of Computer Application': 2,
    'PGDCA - Post Graduate Diploma in Computer Applications': 2,
    'B.Tech - Computer Science and Engineering': 2,
    'Master of Computer Application - MCA': 2,
    'BBA - Bachelor of Business Administration': 5,
    'Master of Business Administration - MBA': 5,
    'B.Com - Bachelors (Commerce)': 5,
    'Master of Commerce (M.Com)': 5,
    'B.Sc - Medical (Life Science)': 3,
    'B.Sc - Non-Medical': 3,
    'B.Sc. - Physical Science': 3,
    'M.Sc. Chemistry': 3,
    'B.Sc. Hons. Biotechnology': 3,
    'B.A - Bachelors (Arts)': 1,
    'B. Voc. (Hospitality and Tourism)': 1,
    'B. Voc. (Retail Management)': 1,
    'M.Sc. Geography': 1,
    'M.A. English': 1
};

async function bulkImport() {
    console.log('🚀 Starting Optimized Bulk Student Import...');
    const wb = XLSX.readFile(SOURCE_FILE);
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    const rows = data.slice(3);
    
    let totalInserted = 0;
    let totalSkipped = 0;
    
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const values = [];
        const params = [];
        let paramIndex = 1;

        for (const row of batch) {
            const name = (row[2] || '').toString().trim();
            const course = (row[3] || '').toString().trim();
            const semester = (row[4] || '').toString().trim();
            const email = (row[5] || '').toString().toLowerCase().trim();
            const mobile = (row[7] || '').toString().trim();
            const roll = (row[9] || '').toString().trim();
            const deptId = DEPT_MAP[course];

            if (roll && email && name && deptId) {
                values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5})`);
                params.push(TENANT_ID, roll, course, semester, mobile, email);
                paramIndex += 6;
            }
        }

        if (values.length > 0) {
            const sql = `
                INSERT INTO verified_students (tenant_id, roll_number, department, year, mobile_number, email)
                VALUES ${values.join(', ')}
                ON CONFLICT (tenant_id, roll_number) DO NOTHING
            `;
            try {
                const [dbRows, result] = await db.execute(sql, params);
                totalInserted += result.rowCount;
                totalSkipped += (values.length - result.rowCount);
            } catch (err) {
                console.error(`Batch failed at index ${i}:`, err.message);
            }
        }
        console.log(`Processed ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length}...`);
    }

    console.log(`\n✅ Finished! Inserted: ${totalInserted}, Skipped (Duplicates): ${totalSkipped}`);
    process.exit(0);
}

bulkImport();
