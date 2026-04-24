-- PostgreSQL Schema Migration: Departments & Mappings
-- This file synchronizes the PostgreSQL database schema with the application requirements,
-- replacing the older MySQL definitions.

-- 1. Ensure 'description' and 'email' columns exist in departments
ALTER TABLE departments ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS email VARCHAR(100);

-- 2. Category → Department mapping table
-- We use a standard PostgreSQL CHECK constraint instead of ENUM for simpler management
CREATE TABLE IF NOT EXISTS department_categories (
    id SERIAL PRIMARY KEY,
    department_id INT NOT NULL,
    category VARCHAR(50) NOT NULL,
    CONSTRAINT chk_category CHECK (category IN ('Noise','Electricity','Mess','Harassment','Infrastructure','Security','Cleanliness','Technical','Faculty','Other')),
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
    UNIQUE (department_id, category)
);

-- 3. Staff ↔ Department bridging table
CREATE TABLE IF NOT EXISTS department_members (
    id SERIAL PRIMARY KEY,
    department_id INT NOT NULL,
    user_id INT NOT NULL,
    role_in_dept VARCHAR(20) DEFAULT 'Staff',
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_role CHECK (role_in_dept IN ('HOD','Staff')),
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (department_id, user_id)
);

-- 4. Audit Trail: Tracks assignment history for complaints
-- This fixes the 'relation complaint_departments does not exist' runtime error
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
);

CREATE INDEX IF NOT EXISTS idx_comp_dept_current ON complaint_departments(complaint_id, is_current);

-- 5. Seed Initial Category Mappings
INSERT INTO department_categories (department_id, category) VALUES
(1, 'Noise'),
(2, 'Electricity'), (2, 'Infrastructure'), (2, 'Cleanliness'),
(3, 'Mess'),
(4, 'Harassment'),
(5, 'Security'),
(6, 'Faculty'), (6, 'Technical'),
(7, 'Other')
ON CONFLICT (department_id, category) DO NOTHING;

-- 6. Add Descriptions to existing departments
UPDATE departments SET description = 'Handles hostel noise, room allocation disagreements, and student conduct.' WHERE id = 1 AND (description IS NULL OR description = '');
UPDATE departments SET description = 'Maintains campus infrastructure, electrical systems, and plumbing.' WHERE id = 2 AND (description IS NULL OR description = '');
UPDATE departments SET description = 'Oversees cafeteria quality, hygiene, and meal scheduling.' WHERE id = 3 AND (description IS NULL OR description = '');
UPDATE departments SET description = 'Investigates sensitive student issues, harassment, and code of conduct violations.' WHERE id = 4 AND (description IS NULL OR description = '');
UPDATE departments SET description = 'Ensures campus safety, patrolling, and emergency response.' WHERE id = 5 AND (description IS NULL OR description = '');
UPDATE departments SET description = 'Academic concerns, lecturer issues, and technical/lab equipment support.' WHERE id = 6 AND (description IS NULL OR description = '');
UPDATE departments SET description = 'General clerical work, document processing, and public relations.' WHERE id = 7 AND (description IS NULL OR description = '');
