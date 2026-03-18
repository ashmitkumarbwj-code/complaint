-- migrate_departments.sql
-- Comprehensive Department Management System Migration
-- Author: Senior Full-Stack Engineer

USE smart_campus_db;

-- 1. Ensure 'description' and 'email' columns exist in departments
ALTER TABLE departments ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS email VARCHAR(100);

-- 2. Category → Department mapping table
-- Allows Admin to map complaint categories (e.g., 'Electricity') to departments dynamically
CREATE TABLE IF NOT EXISTS department_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    department_id INT NOT NULL,
    category ENUM('Noise','Electricity','Mess','Harassment','Infrastructure','Security','Cleanliness','Technical','Faculty','Other') NOT NULL,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
    UNIQUE KEY uq_dept_cat (department_id, category)
);

-- 3. Staff ↔ Department bridging table (Many-to-Many)
-- Allows staff to be part of multiple departments if necessary
CREATE TABLE IF NOT EXISTS department_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    department_id INT NOT NULL,
    user_id INT NOT NULL,
    role_in_dept ENUM('HOD','Staff') DEFAULT 'Staff',
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_dept_user (department_id, user_id)
);

-- 4. Audit Trail: Tracks assignment history for complaints
-- Crucial for tracking reassignment flow as requested
CREATE TABLE IF NOT EXISTS complaint_departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    complaint_id INT NOT NULL,
    department_id INT NOT NULL,
    assigned_by INT, -- user_id of admin/system who assigned it
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    is_current TINYINT(1) DEFAULT 1, -- indicates the currently active department for this complaint
    FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_comp_dept_current (complaint_id, is_current)
);

-- 5. Seed Initial Category Mappings
-- Based on the project's existing 7 departments
INSERT IGNORE INTO department_categories (department_id, category) VALUES
(1, 'Noise'),
(2, 'Electricity'), (2, 'Infrastructure'), (2, 'Cleanliness'),
(3, 'Mess'),
(4, 'Harassment'),
(5, 'Security'),
(6, 'Faculty'), (6, 'Technical'),
(7, 'Other');

-- 6. Add Descriptions to existing departments for better UX
UPDATE departments SET description = 'Handles hostel noise, room allocation disagreements, and student conduct.' WHERE id = 1 AND (description IS NULL OR description = '');
UPDATE departments SET description = 'Maintains campus infrastructure, electrical systems, and plumbing.' WHERE id = 2 AND (description IS NULL OR description = '');
UPDATE departments SET description = 'Oversees cafeteria quality, hygiene, and meal scheduling.' WHERE id = 3 AND (description IS NULL OR description = '');
UPDATE departments SET description = 'Investigates sensitive student issues, harassment, and code of conduct violations.' WHERE id = 4 AND (description IS NULL OR description = '');
UPDATE departments SET description = 'Ensures campus safety, patrolling, and emergency response.' WHERE id = 5 AND (description IS NULL OR description = '');
UPDATE departments SET description = 'Academic concerns, lecturer issues, and technical/lab equipment support.' WHERE id = 6 AND (description IS NULL OR description = '');
UPDATE departments SET description = 'General clerical work, document processing, and public relations.' WHERE id = 7 AND (description IS NULL OR description = '');
