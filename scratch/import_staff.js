
const XLSX = require('xlsx');
const mammoth = require('mammoth');
const db = require('../config/db');
const path = require('path');

/**
 * IMPORT SETTINGS
 */
const DOCX_FILE = 'C:\\Users\\Rajesh Kumar\\Desktop\\Data\\STAFF LIST for B-Tech Project.docx';
const SFC_XLSX = 'C:\\Users\\Rajesh Kumar\\Desktop\\Data\\SFC List.xlsx';
const TENANT_ID = 1;
const DRY_RUN = process.argv.includes('--run') ? false : true;

// 1. Manually extracted emails from 'faculty list.pdf' (Vision)
const PDF_EMAILS = {
    "Rajnish Dewan": "dewan_rajnish@yahoo.co.in",
    "Sanjay Jasrotia": "Sanjay_jasrotia@yahoo.co",
    "Anjali Sharma": "7876372719@noemail.local",
    "Naresh Sharma": "drnareshsharma@gmail.com",
    "Balraj Singh": "rajbandral@gmail.com",
    "Naresh Mankotia": "nareshmankotia@gmail.com",
    "V.S. Vats": "vsvats72@gmail.com",
    "Monika Sharma": "sethimonkia144@gmail.com",
    "Bharat Bhushan": "brogibharat420@gmail.com",
    "Ashwani Kumar": "ashwani2021durgela@gmail.com",
    "Puja Sandal": "pujasandal1976@gmail.com",
    "SS Randhawa": "ssrandhawa1970@gmail.com",
    "Ritu Bala": "riu.dhiman@gmail.com",
    "Poonam Dhiman": "poonudg@gmail.com",
    "Ashish Ranjan": "drashishmaths@gmail.com",
    "Sanjeev Kumar": "sanjeevrananit@gmail.com",
    "Arti Chandel": "dr.artiparmar4002@gmail.com",
    "Sanjay Kumar": "sanjaykt79@gmail.com",
    "Rajinder Singh": "contact2rajinder@gmail.com",
    "Govind Singh": "gsgovind22@gmail.com",
    "Sarita": "sss.sharmasarita@gmail.com",
    "Sumana Devi": "281993sumandevi@gmail.com",
    "Nishesh Kumar": "nisheshkumar55@yahoo.com",
    "Sanjeev Katoch": "sanjeevktch@gmail.com",
    "Satbir Guleria": "satbirguleria@gmail.com",
    "Chander Shekhar": "chander583@gmail.com",
    "Kamaljeet Singh": "kamalbajrang@gmail.com",
    "Nitin Kumar": "nk37154kumar@gmail.com",
    "Rohit Kumar": "rohitkumar23091991@gmail.com",
    "Pardeep Singh": "ps0053803@gmail.com",
    "Amit Kumar": "amitrajput800@gmail.com",
    "Umesh Kumar": "umesh82275@gmail.com"
};

const DEPT_MAP = {
    "Chemistry": 3, "Physics": 3, "Botany": 3, "Zoology": 3, "Mathematics": 3, "Maths": 3, "Geology": 3, "Geog": 1, "Geography": 1,
    "Hindi": 1, "English": 1, "Commerce": 5, "Economics": 5, "Music": 1, "History": 1, "Pol. Science": 1, "Political Science": 1,
    "Comp. App": 2, "MBA": 5, "JMC": 1, "T & T": 1, "Education": 1, "Sanskrit": 1, "EVS": 1, "Soc": 1, "Psychology": 1,
    "Maintenance": 6, "Sweeper": 6, "Mali": 6, "Peon": 1, "Supdt": 1, "Clerk": 1, "JOA (IT)": 2, "Sr. Asstt": 1, "SLA": 1, "JLA": 1, "LA": 1
};

function slugify(name) {
    return name.toLowerCase().replace(/[^a-z]/g, '');
}

async function importStaff() {
    console.log(`\n🚀 Starting Staff Import... [MODE: ${DRY_RUN ? 'DRY RUN' : 'REAL RUN'}]`);
    let stats = { total: 0, inserted: 0, skipped: 0, failed: 0 };
    let finalStaffList = [];

    // --- A. Process Docx File (Robust Line Splitting) ---
    const result = await mammoth.extractRawText({ path: DOCX_FILE });
    const fullText = result.value;
    
    // Split segments and extract entries
    const lines = fullText.split('\n');
    let isNonTeaching = false;

    for (const line of lines) {
        let clean = line.trim();
        if (!clean) continue;
        if (clean.includes('Non-Teaching')) { isNonTeaching = true; continue; }

        if (!isNonTeaching) {
            // Use global match to find all occurrences of Name + Subject + Optional Mobile
            // Pattern: (Optional Num) (Salutation) (Name) (Subject) (Optional Mobile)
            const entries = clean.matchAll(/(?:\d+\.?\s+)?(?:Sh\.|Dr\.|Smt\.|Mrs\.|Ms\.)\s+([A-Z\.\s]{3,30})\s+([A-Z][a-z\.\s\(]{3,20})\s*(\d{10})?/g);
            for (const match of entries) {
                const [_, name, subject, mobile] = match;
                finalStaffList.push({ name: name.trim(), subject: subject.trim(), mobile, source: 'Docx-Teaching' });
            }
        } else {
            // Non-teaching extraction
            const match = clean.match(/(?:Sh\.|Dr\.|Smt\.|Mrs\.|Ms\.)\s+([A-Z][A-Za-z\.\s]{3,30})\s+([A-Z][a-zA-Z\s\-\(\)\/]{3,30})\s*(\d{10})?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})?/);
            if (match) {
                const [_, name, desig, mobile, email] = match;
                finalStaffList.push({ name: name.trim(), subject: desig.trim(), mobile, email, source: 'Docx-NonTeaching' });
            }
        }
    }

    // --- B. Process MBA SFC Excel ---
    try {
        const wb = XLSX.readFile(SFC_XLSX);
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        for (const row of data.slice(2)) {
            const name = (row[1] || '').toString().trim().replace(/Dr\.|Sh\.|Smt\.|Mrs\.|Ms\./g, '').trim();
            const desig = (row[2] || '').toString().trim();
            const dept = (row[3] || '').toString().trim();
            if (name) finalStaffList.push({ name, subject: dept || desig, source: 'SFC-Excel' });
        }
    } catch (e) {}

    // --- C. Sync ---
    stats.total = finalStaffList.length;
    for (const item of finalStaffList) {
        let email = item.email;
        if (!email) {
            // Find in PDF map
            for (let k in PDF_EMAILS) {
                if (item.name.includes(k) || k.includes(item.name)) { email = PDF_EMAILS[k]; break; }
            }
        }
        if (!email) {
            email = item.mobile ? `staff_${item.mobile}@noemail.local` : `staff_${slugify(item.name)}@noemail.local`;
        }

        let deptId = 1;
        for (let key in DEPT_MAP) {
            if (item.subject && item.subject.toLowerCase().includes(key.toLowerCase())) { deptId = DEPT_MAP[key]; break; }
        }

        if (DRY_RUN) {
            if (stats.inserted < 15) console.log(`[DRY] ${item.name.padEnd(25)} | ${email.padEnd(35)} | Dept: ${deptId}`);
            stats.inserted++;
            continue;
        }

        try {
            const [rows, result] = await db.execute(
                `INSERT INTO verified_staff (tenant_id, name, email, mobile, department_id, role)
                 VALUES ($1, $2, $3, $4, $5, 'Staff')
                 ON CONFLICT (tenant_id, email) DO NOTHING`,
                [TENANT_ID, item.name, email, item.mobile || '0000000000', deptId]
            );
            if (result.rowCount === 1) stats.inserted++; else stats.skipped++;
        } catch (e) { console.error(`[DB ERROR] ${item.name}:`, e.message); stats.failed++; }
    }

    console.log(`\n--- SUMMARY ---`);
    console.log(`Found: ${stats.total} | Inserted: ${stats.inserted} | Skipped: ${stats.skipped} | Failed: ${stats.failed}`);
    process.exit(0);
}

importStaff();
