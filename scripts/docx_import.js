const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

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

async function runDocxImport() {
    const filePath = "E:/Project Work/STAFF LIST for B-Tech Project.docx";
    if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found -> ${filePath}`);
        process.exit(1);
    }

    console.log(`[Docx-Import] Parsing ${filePath}...`);
    
    // Extract raw text
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value;
    
    // The docx parsed as raw lines ending with double newlines usually.
    // Let's split it aggressively.
    const chunks = text.split(/\n+/).map(s => s.trim()).filter(s => s.length > 0);

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'smart_campus_db'
    });

    const [deptRows] = await connection.query('SELECT id, name FROM departments');
    const deptMap = {};
    deptRows.forEach(d => { deptMap[d.name.toLowerCase().trim()] = d.id; });

    const getDeptId = async (name) => {
        if (!name || name.toString().toLowerCase() === 'n/a') return 7; // Gen Admin
        const normalized = name.toString().toLowerCase().trim();
        if (deptMap[normalized]) return deptMap[normalized];
        
        try {
            const [res] = await connection.execute('INSERT IGNORE INTO departments (name) VALUES (?)', [name.toString().trim()]);
            if (res.insertId) { deptMap[normalized] = res.insertId; return res.insertId; }
            const [rows] = await connection.execute('SELECT id FROM departments WHERE name = ?', [name.toString().trim()]);
            if (rows.length > 0) return rows[0].id;
        } catch (e) {}
        return 7;
    };

    let metrics = { admin: 0, staff: 0, errors: 0, skips: 0 };

    // We noticed a pattern in the docx dump for Non-Teaching:
    // "Sh. Ashwani Kumar" -> "Supdt G-I" -> "9418188560"
    // So we can look for numbers, and grab the preceding chunks.
    
    console.log(`[Docx-Import] Hunting for valid staff records...`);

    const processedMobiles = new Set();
    const pass = '$2a$10$A/8r.WvWzG2N.2oD.UuXxOQ5sYxk8M3kYg2R8zQ6VwG9R7b3.7xKG'; 

    for (let i = 0; i < chunks.length; i++) {
        // Find chunks that match phone numbers (10 digits)
        const possibleMobile = chunks[i].replace(/[^\d]/g, '');
        
        if (possibleMobile.length === 10) {
            // Found a mobile number. The designation is likely i-1, and name i-2 or i-3
            let name = "Unknown";
            let designation = "Staff";
            let department = "General Administration";

            // Heuristic backward search for name (starts with Sh., Smt., Dr., Mr., Ms., Mrs.)
            for (let j = 1; j <= 5; j++) {
                if (i - j < 0) break;
                const prevChunk = chunks[i - j];
                if (prevChunk.startsWith('Sh.') || prevChunk.startsWith('Smt.') || 
                    prevChunk.startsWith('Dr.') || prevChunk.startsWith('Mr.') || 
                    prevChunk.startsWith('Ms.') || prevChunk.startsWith('Mrs.')) {
                    
                    name = prevChunk;
                    designation = chunks[i - j + 1]; // designation is usually the string after name
                    
                    // If designation looks like a subject (less than 12 chars usually), assign to Academic
                    if (designation === 'Chemistry' || designation === 'English' || designation === 'Physics' || designation === 'Maths') {
                        department = "Academic Department";
                    } else if (designation.includes('Supdt') || designation.includes('Clerk') || designation.includes('JOA')) {
                        department = "Administration (Non-Teaching)";
                    }
                    
                    break;
                }
            }

            // Sometimes the name isn't prefixed exactly. If not found, use a strict i-2, i-1 pattern 
            if (name === "Unknown" && i >= 2) {
                 // skip raw numbers
                 if (!chunks[i-2].match(/^\d+$/)) {
                     name = chunks[i-2];
                     designation = chunks[i-1];
                 }
            }

            if (name === "Unknown" || processedMobiles.has(possibleMobile)) continue;
            processedMobiles.add(possibleMobile);

            try {
                const role = adminMobileWhiteList.includes(possibleMobile) ? 'Admin' : 'Staff';
                const username = possibleMobile; 

                const [exists] = await connection.execute('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
                if (exists.length > 0) {
                    metrics.skips++;
                    continue;
                }

                const deptId = await getDeptId(department);

                const [uRes] = await connection.execute(
                    'INSERT INTO users (username, mobile_number, email, password_hash, role, is_verified) VALUES (?, ?, ?, ?, ?, 1)',
                    [username, possibleMobile, null, pass, role]
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
    DOCX STAFF / ADMIN IMPORT SUMMARY
    ────────────────────────────────────────
    🛡️ Elevated Admins Inserted : ${metrics.admin}
    👨‍🏫 Regular Staff Inserted   : ${metrics.staff}
    ⚠️ Duplicates Skipped       : ${metrics.skips}
    ❌ Errors                   : ${metrics.errors}
    ────────────────────────────────────────`);
    await connection.end();
}

runDocxImport().catch(e => { console.error(e); process.exit(1); });
