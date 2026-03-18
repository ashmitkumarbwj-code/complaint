const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// The specific list provided by the user that MUST GET ADMIN ACCESS
const adminMobileWhiteList = [
    '9418188560', // Sh. Ashwani Kumar
    '7018196283', // Sh. Sanjeev Katoch
    '9418237833', // Sh. Satbir Guleria
    '9817175252', // Sh. Chander Shekhar
    '8219659265', // Sh. Kamaljeet Singh
    '9418911944', // Sh. Nitin Kumar
    '7876172603', // Sh. Rohit Kumar
    '9418713034', // Sh. Pardeep Singh
    '9805457410', // Sh. Amit Kumar
    '8219676735', // Sh. Umesh Kumar
    '9882906696', // Mr. Abneet Singh 
    '7807723617', // Mr. Ankur
    '9418314308', // Mr. Mandeep Kumar
    '9882717003', // Ms. Shaila
    '8351865937', // Mr. Ajay Kumar
    '8091364033', // Mr. Manoj Kumar
    '8263936735', // Mr. Vijay Kumar
    '8628027717', // Mr. Bir Singh
    '9418398834', // Ms. Roma Devi
    '7831068668', // Ms. Indira Devi
    '9816349856', // Mr. Karnail Singh
    '7831810536', // Ms. Pushpa Devi
    '9625670003'  // Mr. Tirlok Singh
];

async function runStaffImport() {
    const filePath = process.argv[2] || "E:/Project Work/staff_lists.xlsx";
    if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found -> ${filePath}`);
        process.exit(1);
    }

    console.log(`[Staff-Import] Started on ${filePath}. Injecting granular Admin vs Staff logic...`);
    const workbook = xlsx.readFile(filePath);

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'smart_campus_db'
    });

    // Dept cache
    const [deptRows] = await connection.query('SELECT id, name FROM departments');
    const deptMap = {};
    deptRows.forEach(d => { deptMap[d.name.toLowerCase().trim()] = d.id; });

    const getDeptId = async (name) => {
        if (!name || name.toString().toLowerCase() === 'n/a') return 7;
        const normalized = name.toString().toLowerCase().trim();
        if (deptMap[normalized]) return deptMap[normalized];
        
        try {
            const [res] = await connection.execute('INSERT IGNORE INTO departments (name) VALUES (?)', [name.toString().trim()]);
            if (res.insertId) { 
                deptMap[normalized] = res.insertId; 
                return res.insertId; 
            }
            // Fetch if it was ignored (already exists)
            const [rows] = await connection.execute('SELECT id FROM departments WHERE name = ?', [name.toString().trim()]);
            if (rows.length > 0) {
                deptMap[normalized] = rows[0].id;
                return rows[0].id;
            }
        } catch (e) {
            console.error(`[Dept Error] ${name}:`, e.message); 
        }
        return 7;
    };

    let metrics = { admin: 0, staff: 0, errors: 0, skips: 0 };

    for (const sheetName of workbook.SheetNames) {
        console.log(`\n▶ Processing Sheet: [${sheetName}]`);
        const sheet = workbook.Sheets[sheetName];
        const allRows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        // Skip header row
        const dataRows = allRows.slice(1);
        
        for (const row of dataRows) {
            if (!row || row.length === 0) continue;

            const nameRaw = row[1];
            if (!nameRaw) continue; // Skip empty rows

            const name = nameRaw.toString().trim();
            const designation = row[2] ? row[2].toString().trim() : 'Staff';
            
            let departmentTitle = 'General Administration';
            let mobileStr = '';

            // Sheet 2 (Non_Teaching) missing department column 3
            if (sheetName.includes('Non_Teaching_SFC')) {
                departmentTitle = 'Administration (Non-Teaching)';
                mobileStr = row[3] ? row[3].toString() : '';
            } else {
                departmentTitle = row[3] ? row[3].toString().trim() : 'General Administration';
                mobileStr = row[4] ? row[4].toString() : '';
            }

            if (!mobileStr) continue;

            // Clean mobile string
            const mobile = mobileStr.replace(/[^\d]/g, ''); // Extract only digits
            if (mobile.length < 10) continue; // invalid mobile

            try {
                // Determine Admin promotion based on whitelist
                const role = adminMobileWhiteList.includes(mobile) ? 'Admin' : 'Staff';

                // Use mobile as username since they don't have roll numbers
                const username = mobile; 

                // Check exists
                const [exists] = await connection.execute('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
                if (exists.length > 0) {
                    metrics.skips++;
                    if (role === 'Admin') console.log(`   [SKIP-ADMIN] ${name} (${mobile}) already exists in DB!`);
                    continue;
                }

                const deptId = await getDeptId(departmentTitle);
                const pass = '$2a$10$A/8r.WvWzG2N.2oD.UuXxOQ5sYxk8M3kYg2R8zQ6VwG9R7b3.7xKG'; 

                const [uRes] = await connection.execute(
                    'INSERT INTO users (username, mobile_number, email, password_hash, role, is_verified) VALUES (?, ?, ?, ?, ?, 1)',
                    [username, mobile, null, pass, role]
                );
                
                await connection.execute(
                    'INSERT INTO staff (user_id, department_name, designation) VALUES (?, ?, ?)',
                    [uRes.insertId, deptId, designation]
                );

                if (role === 'Admin') metrics.admin++;
                else metrics.staff++;

            } catch (err) {
                console.error(`[Record Error] ${name}:`, err.message);
                metrics.errors++;
            }
        }
    }

    console.log(`
    ────────────────────────────────────────
    STAFF / ADMIN IMPORT SUMMARY
    ────────────────────────────────────────
    🛡️ Elevated Admins Inserted : ${metrics.admin}
    👨‍🏫 Regular Staff Inserted   : ${metrics.staff}
    ⚠️ Duplicates Skipped       : ${metrics.skips}
    ❌ Errors                   : ${metrics.errors}
    ────────────────────────────────────────`);
    await connection.end();
}

runStaffImport().catch(e => { console.error(e); process.exit(1); });
