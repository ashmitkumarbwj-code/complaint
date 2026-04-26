const db = require('./config/db');

async function run() {
    try {
        console.log("Creating complaint_departments table if not exists...");
        await db.execute(`
            CREATE TABLE IF NOT EXISTS complaint_departments (
                id SERIAL PRIMARY KEY,
                complaint_id INT NOT NULL,
                department_id INT NOT NULL,
                assigned_by INT,
                assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                notes TEXT,
                is_current BOOLEAN DEFAULT TRUE,
                FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
                FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
                FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
            )
        `);
        await db.execute(`CREATE INDEX IF NOT EXISTS idx_comp_dept_current ON complaint_departments(complaint_id, is_current)`);
        
        console.log("Creating gallery_images table if not exists...");
        await db.execute(`
            CREATE TABLE IF NOT EXISTS gallery_images (
                id SERIAL PRIMARY KEY,
                tenant_id INT,
                filename VARCHAR(255) NOT NULL,
                url VARCHAR(500) NOT NULL,
                title VARCHAR(255),
                display_order INT DEFAULT 0,
                is_featured BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log("Migrations applied successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

run();
