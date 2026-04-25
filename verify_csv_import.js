const fs = require('fs');
const { parse } = require('csv-parse/sync');

const CSV_PATH = 'C:\\Users\\Rajesh Kumar\\Downloads\\StudentInfo_Report_10_03_2026_12_06_PM - StudentInfo Report.csv';

async function verifyCsv() {
    try {
        const fileContent = fs.readFileSync(CSV_PATH);
        const records = parse(fileContent, {
            skip_empty_lines: true,
            from_line: 3 // Row 3 is the header
        });

        const header = records[0];
        const data = records.slice(1);

        console.log('--- CSV Verification Report ---');
        console.log(`Total Rows in CSV: ${data.length}`);

        let validRows = [];
        let duplicates = 0;
        let invalidEmail = 0;
        let invalidMobile = 0;
        let missingRoll = 0;

        const seenKeys = new Set();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        data.forEach((row, index) => {
            // Mapping based on preview:
            // StudentID(1), Name(2), Course(3), Semester(4), Email(5), FatherName(6), MobileNo(7), WhatsappNo(8), CollegeRoll(9)
            const studentId = row[1];
            const name = row[2];
            const course = row[3];
            const semester = row[4];
            const email = row[5];
            const fatherName = row[6];
            const mobile = row[7];
            const whatsapp = row[8];
            const roll = row[9];

            let isInvalid = false;

            if (!roll || roll.trim() === '') {
                missingRoll++;
                isInvalid = true;
            }

            if (!email || !emailRegex.test(email.trim())) {
                invalidEmail++;
                isInvalid = true;
            }

            if (!mobile || mobile.trim().length !== 10) {
                invalidMobile++;
                isInvalid = true;
            }

            if (!isInvalid) {
                const key = `${roll}-${email}-${mobile}`;
                if (seenKeys.has(key)) {
                    duplicates++;
                } else {
                    seenKeys.add(key);
                    validRows.push({
                        full_name: name,
                        roll_number: roll,
                        registration_number: studentId,
                        course: course,
                        semester: semester,
                        email: email,
                        mobile: mobile,
                        department: course, // Initial mapping, might need refinement
                        father_name: fatherName,
                        whatsapp_number: whatsapp
                    });
                }
            }
        });

        console.log(`Valid Rows: ${validRows.length}`);
        console.log(`Duplicate Rows: ${duplicates}`);
        console.log(`Invalid Email: ${invalidEmail}`);
        console.log(`Invalid Mobile (not 10 digits): ${invalidMobile}`);
        console.log(`Missing Roll Number: ${missingRoll}`);

        console.log('\n--- First 10 Mapped Rows (Cleaned) ---');
        console.table(validRows.slice(0, 10));

    } catch (err) {
        console.error('CSV Parsing Error:', err.message);
    }
}

verifyCsv();
