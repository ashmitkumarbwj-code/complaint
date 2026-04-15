const xlsx = require('xlsx');
const path = require('path');

function readExcel(filename) {
    const filePath = path.join(__dirname, '..', 'data', filename);
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(sheet);
}

try {
    console.log('--- TEST DATA FROM EXCEL ---');
    
    const students = readExcel('test_students.xlsx');
    console.log(`\nFound ${students.length} students in Excel.`);
    if (students.length > 0) {
        console.log('First Student Row Keys:', Object.keys(students[0]));
        console.log('First Student Row Sample:', students[0]);
    }

    const staff = readExcel('test_staff.xlsx');
    console.log(`\nFound ${staff.length} staff in Excel.`);
    if (staff.length > 0) {
        console.log('First Staff Row Keys:', Object.keys(staff[0]));
        console.log('First Staff Row Sample:', staff[0]);
    }

} catch (err) {
    console.error('Error reading Excel:', err.message);
}
