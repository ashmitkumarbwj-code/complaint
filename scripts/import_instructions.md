# 📊 Smart Campus Bulk Import Instructions

To effortlessly ingest 40,000+ users without slowing down the system, I have created a fully automated, chunked Node.js streaming importer and a raw SQL query sheet. 

Both methods strictly enforce the rule: **No Principal data is inserted yet** (a placeholder is ready for it).

---

## 🚀 Option 1 (Recommended): Node.js Script
This is the safest and most reliable method. The script (`scripts/bulk_import.js`) batches 500 records at a time into a single MySQL transaction, safely avoiding duplicate mobile numbers, assigning the correct roles, creating missing departments on the fly, and properly structuring relational links between `users` and `students`/`staff` tables.

### How to Run:
**1. Prepare your Excel Files**
Ensure your Excel or CSV files are on your computer. Let's assume they are `students_data.xlsx` and `staff_data.xlsx`.

**2. Open your Terminal inside `smart_complaint_&_resonse_system`**

**3. Run the Student Import**
```bash
node scripts/bulk_import.js C:/path/to/your/students_data.xlsx student
```
*(The script will map `Name, Mobile Number, Department` into the DB, skipping any duplicates).*

**4. Run the Staff Import**
```bash
node scripts/bulk_import.js C:/path/to/your/staff_data.xlsx staff
```
*(The script will intelligently process 'Clerk/Superintendent' as `Admin`, and Teaching/Non-Teaching as `Staff`).*

---

## 🛠 Option 2: Raw SQL `LOAD DATA INFILE`
If you prefer pure database engine ingestion, I have written a backup script located at `scripts/bulk_import.sql`. 

1. Open `scripts/bulk_import.sql` in your IDE or XAMPP PHPMyAdmin.
2. Edit the `/path/to/students.csv` absolute path.
3. Execute the statement.

### ❗ Principal Placeholder
As requested, because the Principal data hasn't arrived yet, I have left a clearly marked block commented out inside `scripts/bulk_import.sql`. 
When the Principal's data finally arrives, you simply uncomment that section, fill in the placeholder text (`XXXXXXXXXX`), and run the snippet. The Node.js script also explicitly ignores any row with a designation including 'Principal'.
