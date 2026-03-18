const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// 1. Generate Dummy Students
const studentsData = [
    { "Name": "Amit Sharma", "Roll Number": "STU/2026/001", "Department": "Academic Department", "Mobile Number": "9876543210" },
    { "Name": "Priya Singh", "Roll Number": "STU/2026/002", "Department": "Hostel Administration", "Mobile Number": "9876543211" },
    { "Name": "Rahul Kumar", "Roll Number": "STU/2026/003", "Department": "Maintenance Department", "Mobile Number": "9876543212" }
];

const studentWS = xlsx.utils.json_to_sheet(studentsData);
const studentWB = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(studentWB, studentWS, "Students");
xlsx.writeFile(studentWB, path.join(DATA_DIR, 'test_students.xlsx'));

// 2. Generate Dummy Staff
const staffData = [
    { "Name": "Dr. Vikas Verma", "Designation": "Professor", "Department": "Academic Department", "Mobile Number": "9988776650" },
    { "Name": "Sunita Devi", "Designation": "Clerk", "Department": "General Administration", "Mobile Number": "9988776651" },
    { "Name": "Rakesh Negi", "Designation": "Security Guard", "Department": "Campus Security", "Mobile Number": "9988776652" }
];

const staffWS = xlsx.utils.json_to_sheet(staffData);
const staffWB = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(staffWB, staffWS, "Staff");
xlsx.writeFile(staffWB, path.join(DATA_DIR, 'test_staff.xlsx'));

console.log('✅ Test Excel files created in /data directory:');
console.log('- test_students.xlsx');
console.log('- test_staff.xlsx');
