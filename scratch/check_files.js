const fs = require('fs');

const files = [
    '/mnt/data/faculty list(1).pdf',
    '/mnt/data/STAFF LIST for B-Tech Project(1).docx',
    '/mnt/data/SFC List.pdf',
    '/mnt/data/StudentInfo_Report_10_03_2026_12_06_PM.pdf'
];

console.log('--- FILE REACHABILITY CHECK ---');
files.forEach(f => {
    try {
        const stats = fs.statSync(f);
        console.log(`[✔] ${f}: Size ${stats.size} bytes`);
    } catch (err) {
        console.log(`[✖] ${f}: ${err.message}`);
    }
});
