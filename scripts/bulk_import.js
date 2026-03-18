const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BATCH_SIZE = 500;

async function runImport() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error("Usage: node bulk_import.js <path_to_excel_file> <student|staff>");
        process.exit(1);
    }

    const filePath = args[0];
    const importType = args[1].toLowerCase();

    if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found -> ${filePath}`);
        process.exit(1);
    }

    console.log(`[Import] Starting ${importType} import from ${filePath}`);

    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const allRows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    console.log(`[Import] Total raw rows: ${allRows.length}`);

    // Dynamic Column Discovery
    let headerRowIndex = -1;
    let colIndices = { name: -1, mobile: -1, dept: -1, roll: -1, email: -1 };

    for (let i = 0; i < Math.min(25, allRows.length); i++) {
        const row = allRows[i];
        if (!row) continue;
        
        row.forEach((cell, idx) => {
            if (!cell) return;
            const val = cell.toString().toLowerCase().trim().replace(/[\s_]/g, '');
            if (val === 'name') colIndices.name = idx;
            if (val === 'mobileno' || (val.includes('mobile') && !val.includes('parent'))) colIndices.mobile = idx;
            if (val.includes('department') || val === 'course') colIndices.dept = idx;
            if (val.includes('roll') || val === 'collegeroll' || val === 'studentid') {
                if (colIndices.roll === -1 || val.includes('roll')) colIndices.roll = idx;
            }
            if (val === 'email') colIndices.email = idx;
        });

        if (colIndices.name !== -1 && (colIndices.mobile !== -1 || colIndices.roll !== -1)) {
            headerRowIndex = i;
            break;
        }
    }

    if (headerRowIndex === -1) {
        console.error("[Import] Error: Could not detect header row.");
        process.exit(1);
    }

    const dataRows = allRows.slice(headerRowIndex + 1);
    console.log(`[Import] Header Row detected at index ${headerRowIndex}`);
    console.log(`[Import] Map: Name=${colIndices.name}, Mobile=${colIndices.mobile}, Roll=${colIndices.roll}, Dept=${colIndices.dept}`);

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'smart_campus_db'
    });

    // Cache departments
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
            const [rows] = await connection.execute('SELECT id FROM departments WHERE name = ?', [name.toString().trim()]);
            if (rows.length > 0) {
                deptMap[normalized] = rows[0].id;
                return rows[0].id;
            }
        } catch (e) { console.error(`[Dept Error] ${name}:`, e.message); }
        return 7;
    };

    let success = 0, duplicates = 0, errors = 0;

    for (let i = 0; i < dataRows.length; i += BATCH_SIZE) {
        const batch = dataRows.slice(i, i + BATCH_SIZE);
        await connection.beginTransaction();

        try {
            for (const row of batch) {
                if (!row || row.length === 0) continue;

                try {
                    const rawName = row[colIndices.name];
                    const rawMobile = row[colIndices.mobile] || '';
                    const rawRoll = colIndices.roll !== -1 ? row[colIndices.roll] : null;
                    const rawDept = colIndices.dept !== -1 ? row[colIndices.dept] : 'General Administration';
                    const rawEmail = colIndices.email !== -1 ? row[colIndices.email] : null;

                    const name = rawName ? rawName.toString().trim() : '';
                    const mobile = rawMobile.toString().trim().replace(/[\s-]/g, '');
                    const roll = rawRoll ? rawRoll.toString().trim() : `STU-${mobile}`;
                    const deptStr = rawDept ? rawDept.toString().trim() : 'General Administration';

                    if (!name || name === 'Unknown' || name.toLowerCase() === 'n/a' || name.length < 2) continue;

                    const deptId = await getDeptId(deptStr);
                    const username = importType === 'student' ? roll : name;

                    if (!username || username.toLowerCase() === 'n/a' || username === '0') continue;

                    const [exists] = await connection.execute(
                        'SELECT id FROM users WHERE username = ? LIMIT 1',
                        [username]
                    );

                    if (exists.length > 0) {
                        duplicates++;
                        continue;
                    }

                    const role = importType === 'student' ? 'Student' : 'Staff';
                    const pass = '$2a$10$A/8r.WvWzG2N.2oD.UuXxOQ5sYxk8M3kYg2R8zQ6VwG9R7b3.7xKG'; 

                    const [uRes] = await connection.execute(
                        'INSERT INTO users (username, mobile_number, email, password_hash, role, is_verified) VALUES (?, ?, ?, ?, ?, 1)',
                        [username, mobile, rawEmail, pass, role]
                    );
                    const uid = uRes.insertId;

                    if (importType === 'student') {
                        await connection.execute(
                            'INSERT INTO students (user_id, roll_number, department_id, mobile) VALUES (?, ?, ?, ?)',
                            [uid, roll, deptId, mobile]
                        );
                    } else {
                        await connection.execute(
                            'INSERT INTO staff (user_id, department_id, designation) VALUES (?, ?, ?)',
                            [uid, deptId, roll || 'Staff']
                        );
                    }
                    success++;
                } catch (e) {
                    // console.error(`[Row Error] row ${i + batch.indexOf(row)}:`, e.message);
                    errors++;
                }
            }
            await connection.commit();
            console.log(`[Import] Committed batch at row ${i}... Success total: ${success}`);
        } catch (e) {
            await connection.rollback();
            console.error(`[Batch Fatal]`, e.message);
        }
    }

    console.log(`
    ────────────────────────────────────────
    IMPORT SUMMARY (${importType.toUpperCase()})
    ────────────────────────────────────────
    ✅ Success: ${success}
    ⚠️ Duplicates: ${duplicates}
    ❌ Errors: ${errors}
    ────────────────────────────────────────`);
    await connection.end();
}

runImport().catch(e => { console.error('[Fatal]', e); process.exit(1); });
