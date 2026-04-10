
const db = require('../config/db');

async function fixDatabase() {
    try {
        console.log('Checking for missing tables...');
        
        // 1. Check if department_categories exists
        const [tables] = await db.execute("SHOW TABLES LIKE 'department_categories'");
        if (tables.length === 0) {
            console.log('Creating department_categories table...');
            await db.execute(`
                CREATE TABLE department_categories (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    category VARCHAR(50) NOT NULL UNIQUE,
                    department_id INT NOT NULL,
                    FOREIGN KEY (department_id) REFERENCES departments(id)
                )
            `);
            
            console.log('Seeding department_categories...');
            await db.execute(`
                INSERT INTO department_categories (category, department_id) VALUES 
                ('Noise', 1),
                ('Electricity', 2),
                ('Mess', 3),
                ('Harassment', 4),
                ('Infrastructure', 2),
                ('Security', 5),
                ('Faculty', 6),
                ('Other', 7)
            `);
        } else {
            console.log('department_categories table already exists.');
        }

        console.log('Checking for title column in complaints...');
        const [columns] = await db.execute("SHOW COLUMNS FROM complaints LIKE 'title'");
        if (columns.length === 0) {
            console.log('Adding title column to complaints...');
            await db.execute('ALTER TABLE complaints ADD COLUMN title VARCHAR(255) AFTER student_id');
        } else {
            console.log('title column already exists.');
        }

        console.log('Database fix completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Database fix failed:', err);
        process.exit(1);
    }
}

fixDatabase();
