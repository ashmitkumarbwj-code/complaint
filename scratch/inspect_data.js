
const XLSX = require('xlsx');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

const dataDir = 'C:\\Users\\Rajesh Kumar\\Desktop\\Data';

async function inspectFiles() {
    console.log('--- Inspecting Students Excel ---');
    try {
        const wb = XLSX.readFile(path.join(dataDir, 'StudentInfo_Report_10_03_2026_12_06_PM.xls'));
        const sheetName = wb.SheetNames[0];
        const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
        console.log('Students Header:', data[0]);
        console.log('Students Sample Row 1:', data[1]);
        console.log('Students Sample Row 2:', data[2]);
    } catch (e) {
        console.error('Error reading students excel:', e.message);
    }

    console.log('\n--- Inspecting Staff Docx ---');
    try {
        const result = await mammoth.extractRawText({ path: path.join(dataDir, 'STAFF LIST for B-Tech Project.docx') });
        console.log('Staff List Text (First 500 chars):');
        console.log(result.value.substring(0, 500));
    } catch (e) {
        console.error('Error reading staff docx:', e.message);
    }

    console.log('\n--- Inspecting SFC Excel ---');
    try {
        const wb = XLSX.readFile(path.join(dataDir, 'SFC List.xlsx'));
        const sheetName = wb.SheetNames[0];
        const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
        console.log('SFC Header:', data[0]);
        console.log('SFC Sample Row 1:', data[1]);
    } catch (e) {
        console.error('Error reading SFC excel:', e.message);
    }
}

inspectFiles();
