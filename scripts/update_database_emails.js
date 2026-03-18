const db = require('../config/db');
const xlsx = require('xlsx');
const path = require('path');

async function updateEmails() {
    try {
        console.log('--- Starting Database Email Update ---');

        // 1. Update Students
        const studentPath = path.join(__dirname, '..', 'data', 'test_students.xlsx');
        const studentWorkbook = xlsx.readFile(studentPath);
        const studentSheetName = studentWorkbook.SheetNames[0];
        const students = xlsx.utils.sheet_to_json(studentWorkbook.Sheets[studentSheetName]);

        console.log(`Processing ${students.length} student records...`);
        for (const student of students) {
            const rollNumber = student.roll_number || student.RollNumber;
            const email = student.email || student.Email;

            if (rollNumber && email) {
                await db.execute(
                    'UPDATE verified_students SET email = ? WHERE roll_number = ?',
                    [email, rollNumber]
                );
            }
        }
        console.log('Student emails updated.');

        // 2. Update Staff
        const staffPath = path.join(__dirname, '..', 'data', 'test_staff.xlsx');
        const staffWorkbook = xlsx.readFile(staffPath);
        const staffSheetName = staffWorkbook.SheetNames[0];
        const staffMembers = xlsx.utils.sheet_to_json(staffWorkbook.Sheets[staffSheetName]);

        console.log(`Processing ${staffMembers.length} staff records...`);
        for (const staff of staffMembers) {
            const mobile = staff.mobile || staff.Mobile || staff.mobile_number;
            const email = staff.email || staff.Email;

            if (mobile && email) {
                await db.execute(
                    'UPDATE verified_staff SET email = ? WHERE mobile = ?',
                    [email, mobile.toString()]
                );
            }
        }
        console.log('Staff emails updated.');

        console.log('--- Database Email Update Completed Successfully ---');
        process.exit(0);
    } catch (error) {
        console.error('Error updating emails:', error);
        process.exit(1);
    }
}

updateEmails();
