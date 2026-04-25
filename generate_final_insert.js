const fs = require('fs');
const { parse } = require('csv-parse/sync');

const CSV_PATH = 'C:\\Users\\Rajesh Kumar\\Downloads\\StudentInfo_Report_10_03_2026_12_06_PM - StudentInfo Report.csv';
const SQL_PATH = 'insert_students.sql';

function escape(str) {
    if (str === null || str === undefined) return 'NULL';
    return "'" + str.replace(/'/g, "''") + "'";
}

async function generateSql() {
    try {
        const fileContent = fs.readFileSync(CSV_PATH);
        const records = parse(fileContent, {
            skip_empty_lines: true,
            from_line: 3
        });

        const data = records.slice(1);
        const seenRolls = new Set();
        const seenEmails = new Set();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        let validRows = [];
        let rejectedRows = 0;
        let duplicateRolls = 0;
        let duplicateEmails = 0;

        data.forEach((row) => {
            const studentId = row[1];
            const name = row[2];
            const course = row[3];
            const semester = row[4];
            const email = row[5]?.trim().toLowerCase();
            const fatherName = row[6];
            const mobile = row[7]?.trim();
            const whatsapp = row[8];
            const roll = row[9]?.trim().toUpperCase();

            if (!roll || roll === '' || !email || !emailRegex.test(email) || !mobile || mobile.length !== 10) {
                rejectedRows++;
                return;
            }

            if (seenRolls.has(roll)) {
                duplicateRolls++;
                return;
            }
            
            // Note: Email might not have a unique constraint but it's good practice
            // However, DB constraint is specifically (tenant_id, roll_number)
            seenRolls.add(roll);

            validRows.push({
                tenant_id: 1,
                roll_number: roll,
                full_name: name.trim(),
                mobile: mobile,
                email: email,
                is_account_created: 0,
                is_active: 1,
                registration_number: studentId.trim(),
                father_name: fatherName.trim(),
                whatsapp_number: whatsapp.trim(),
                department: course.trim()
            });
        });

        console.log(`Summary: Valid=${validRows.length}, Rejected=${rejectedRows}, DuplicateRolls=${duplicateRolls}`);

        let sql = "USE smart_campus_db;\n";
        sql += "DELETE FROM verified_students;\n"; // Safety: ensure it's empty
        sql += "ALTER TABLE verified_students AUTO_INCREMENT = 1;\n";
        sql += "INSERT INTO verified_students (tenant_id, roll_number, full_name, mobile, email, is_account_created, is_active, registration_number, father_name, whatsapp_number, department) VALUES\n";

        const valueRows = validRows.map(row => {
            return `(${row.tenant_id}, ${escape(row.roll_number)}, ${escape(row.full_name)}, ${escape(row.mobile)}, ${escape(row.email)}, ${row.is_account_created}, ${row.is_active}, ${escape(row.registration_number)}, ${escape(row.father_name)}, ${escape(row.whatsapp_number)}, ${escape(row.department)})`;
        });

        sql += valueRows.join(",\n") + ";\n";

        fs.writeFileSync(SQL_PATH, sql);
        console.log(`SQL file generated: ${SQL_PATH}`);

    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

generateSql();
