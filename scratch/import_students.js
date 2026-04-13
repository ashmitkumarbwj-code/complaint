
const XLSX = require('xlsx');
const db = require('../config/db');
const path = require('path');

/**
 * IMPORT SETTINGS
 */
const SOURCE_FILE = 'C:\\Users\\Rajesh Kumar\\Desktop\\Data\\StudentInfo_Report_10_03_2026_12_06_PM.xls';
const TENANT_ID = 1;
const DRY_RUN = process.argv.includes('--run') ? false : true;

// Strict Department Mapping
const DEPT_MAP = {
    // Computer Science (ID 2)
    'BCA - Bachelor of Computer Application': 2,
    'PGDCA - Post Graduate Diploma in Computer Applications': 2,
    'B.Tech - Computer Science and Engineering': 2,
    'Master of Computer Application - MCA': 2,

    // Business Administration (ID 5)
    'BBA - Bachelor of Business Administration': 5,
    'Master of Business Administration - MBA': 5,
    'B.Com - Bachelors (Commerce)': 5,
    'Master of Commerce (M.Com)': 5,

    // Technical / Science (ID 3 - Mechanical for now per user instruction)
    'B.Sc - Medical (Life Science)': 3,
    'B.Sc - Non-Medical': 3,
    'B.Sc. - Physical Science': 3,
    'M.Sc. Chemistry': 3,
    'B.Sc. Hons. Biotechnology': 3,

    // General Admin / Arts / Others (ID 1)
    'B.A - Bachelors (Arts)': 1,
    'B. Voc. (Hospitality and Tourism)': 1,
    'B. Voc. (Retail Management)': 1,
    'M.Sc. Geography': 1,
    'M.A. English': 1
};

async function importStudents() {
    console.log(`\n🚀 Starting Student Import... [MODE: ${DRY_RUN ? 'DRY RUN' : 'REAL RUN'}]`);
    
    let stats = {
        total: 0,
        valid: 0,
        inserted: 0,
        duplicates: 0,
        invalid: 0,
        unmappedDept: 0
    };

    try {
        const wb = XLSX.readFile(SOURCE_FILE);
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        
        // Data starts from index 3 (Row 4) based on header discovery
        const rows = data.slice(3);
        stats.total = rows.length;

        for (const row of rows) {
            const name = (row[2] || '').toString().trim();
            const course = (row[3] || '').toString().trim();
            const semester = (row[4] || '').toString().trim();
            const email = (row[5] || '').toString().toLowerCase().trim();
            const mobile = (row[7] || '').toString().trim();
            const rollNumber = (row[9] || '').toString().trim();

            // 1. Validation
            if (!rollNumber || !email || !name) {
                stats.invalid++;
                continue;
            }

            // 2. Department Mapping
            const deptId = DEPT_MAP[course];
            if (!deptId) {
                console.warn(`[SKIP] Unknown Course: "${course}" for Roll: ${rollNumber}`);
                stats.unmappedDept++;
                continue;
            }

            stats.valid++;

            if (DRY_RUN) {
                if (stats.valid <= 5) {
                    console.log(`[DRY] Validating: ${name} (${rollNumber}) -> Dept ${deptId}`);
                }
                continue;
            }

            // 3. Database Sync
            try {
                const [dbRows, result] = await db.execute(
                    `INSERT INTO verified_students (tenant_id, roll_number, department, year, mobile_number, email)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (tenant_id, roll_number) DO NOTHING`,
                    [TENANT_ID, rollNumber, course, semester, mobile, email]
                );

                if (result.rowCount === 0) {
                    stats.duplicates++;
                } else {
                    stats.inserted++;
                }
            } catch (err) {
                console.error(`[DB ERROR] Failed for ${rollNumber}:`, err.message);
                stats.invalid++;
            }
        }

        console.log(`\n--- IMPORT SUMMARY ---`);
        console.log(`Total Rows:    ${stats.total}`);
        console.log(`Valid Rows:    ${stats.valid}`);
        console.log(`Inserted:      ${stats.inserted}`);
        console.log(`Duplicates:    ${stats.duplicates}`);
        console.log(`Invalid:       ${stats.invalid}`);
        console.log(`Unmapped Dept: ${stats.unmappedDept}`);
        console.log(`----------------------`);

    } catch (err) {
        console.error('Fatal Error during import:', err.message);
    } finally {
        process.exit(0);
    }
}

importStudents();
