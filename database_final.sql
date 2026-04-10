CREATE DATABASE IF NOT EXISTS smart_campus_prod;
USE smart_campus_prod;

-- 0. Tenants Table (SaaS Root)
CREATE TABLE IF NOT EXISTS tenants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    subdomain VARCHAR(50) UNIQUE NOT NULL,
    api_key VARCHAR(100) UNIQUE, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Default Tenant
INSERT IGNORE INTO tenants (id, name, subdomain) VALUES (1, 'Main Campus', 'main');

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100),
    mobile_number VARCHAR(15),
    password_hash VARCHAR(255),
    firebase_uid VARCHAR(128) NULL,
    role ENUM('Principal', 'Admin', 'HOD', 'Staff', 'Student', 'StudentHead') NOT NULL,
    is_verified TINYINT(1) DEFAULT 0,
    failed_attempts INT DEFAULT 0,
    locked_until DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    UNIQUE KEY uq_user_email (tenant_id, email),
    UNIQUE KEY uq_user_mobile (tenant_id, mobile_number),
    INDEX idx_user_role (tenant_id, role)
);

-- 2. Verified Students (Master Registry)
CREATE TABLE IF NOT EXISTS verified_students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    roll_number VARCHAR(20) NOT NULL,
    department VARCHAR(100),
    year VARCHAR(10),
    mobile_number VARCHAR(15) NOT NULL,
    email VARCHAR(100),
    id_card_image VARCHAR(255),
    is_account_created TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    UNIQUE KEY uq_vstud_roll (tenant_id, roll_number),
    UNIQUE KEY uq_vstud_mobile (tenant_id, mobile_number)
);

-- 3. Verified Staff (Master Registry)
CREATE TABLE IF NOT EXISTS verified_staff (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    mobile_number VARCHAR(15) NOT NULL,
    department_id INT,
    role ENUM('Staff', 'HOD', 'Admin', 'Principal') NOT NULL,
    is_account_created TINYINT(1) DEFAULT 0,
    activation_token VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    UNIQUE KEY uq_vstaff_email (tenant_id, email),
    UNIQUE KEY uq_vstaff_mobile (tenant_id, mobile_number)
);

-- 4. Departments Table
CREATE TABLE IF NOT EXISTS departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    email VARCHAR(100),
    head VARCHAR(100),
    hod_id INT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (hod_id) REFERENCES users(id),
    UNIQUE KEY uq_dept_name (tenant_id, name)
);

-- 6. Staff Table
CREATE TABLE IF NOT EXISTS staff (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    user_id INT NOT NULL,
    department_id INT,
    designation VARCHAR(50),
    mobile_number VARCHAR(15), -- Local record for redundancy/display
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE KEY uq_staff_user (tenant_id, user_id)
);

-- 8. Students Table
CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    user_id INT NOT NULL,
    roll_number VARCHAR(20) NOT NULL,
    department_id INT,
    mobile_number VARCHAR(15),
    id_card_image VARCHAR(255),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE KEY uq_stud_roll (tenant_id, roll_number),
    UNIQUE KEY uq_stud_user (tenant_id, user_id)
);

-- 9. Complaints Table
CREATE TABLE IF NOT EXISTS complaints (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    student_id INT NOT NULL,
    title VARCHAR(255),
    department_id INT NOT NULL,
    category ENUM('Noise', 'Electricity', 'Mess', 'Harassment', 'Infrastructure', 'Security', 'Cleanliness', 'Technical', 'Faculty', 'Other') NOT NULL,
    description TEXT NOT NULL,
    location VARCHAR(255),
    media_url VARCHAR(255),
    local_file_path VARCHAR(255), -- Fallback storage path for resilience
    processing_status ENUM('pending', 'processing', 'completed', 'failed', 'pending_resync') DEFAULT 'pending',
    status ENUM('Pending', 'In Progress', 'Resolved', 'Rejected', 'Escalated') DEFAULT 'Pending',
    assigned_to INT,
    admin_notes TEXT,
    priority ENUM('Low', 'Medium', 'High', 'Emergency') DEFAULT 'Medium',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    resolved_at DATETIME NULL,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id),
    FOREIGN KEY (assigned_to) REFERENCES staff(id) ON DELETE SET NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    INDEX idx_comp_lookup (tenant_id, status, created_at)
);

-- 14. Login Audit
CREATE TABLE IF NOT EXISTS login_audit (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    user_id INT NULL,
    identifier VARCHAR(100) NOT NULL,
    success TINYINT(1) NOT NULL,
    reason VARCHAR(100) NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 5. Department Members (Staff Assignment)
CREATE TABLE IF NOT EXISTS department_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    department_id INT NOT NULL,
    user_id INT NOT NULL,
    role_in_dept ENUM('Staff', 'HOD') DEFAULT 'Staff',
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_dept_member (tenant_id, department_id, user_id)
);

-- 6. Department Categories (Auto-Routing Map)
CREATE TABLE IF NOT EXISTS department_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    department_id INT NOT NULL,
    category VARCHAR(50) NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
    UNIQUE KEY uq_dept_cat (tenant_id, department_id, category)
);

-- 7. Complaint Assignment History (Audit Trail)
CREATE TABLE IF NOT EXISTS complaint_departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    complaint_id INT NOT NULL,
    department_id INT NOT NULL,
    assigned_by INT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    is_current TINYINT(1) DEFAULT 1,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 8. Gallery Table
CREATE TABLE IF NOT EXISTS gallery_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    filename VARCHAR(255) NOT NULL,
    url VARCHAR(255) NOT NULL,
    title VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- SEED DATA
-- Default Admin (Password: admin123)
-- Note: In a real system, you would create a tenant first, then its admin.
-- For the default "Main Campus", we seed one admin.
INSERT IGNORE INTO users (id, tenant_id, username, email, mobile_number, password_hash, role, is_verified) 
VALUES (1, 1, 'admin', 'admin@gdc.edu', '9876543210', '$2a$10$XmS5L/n5cI6tS.8yv.A7uejX0.9v0q3W5O.qfR/e.J8fR8Z2YfVmW', 'Admin', 1);

-- Seed Default Departments for Main Campus
INSERT IGNORE INTO departments (id, tenant_id, name, description) VALUES (1, 1, 'College Administration', 'Main office and general registry');
INSERT IGNORE INTO department_categories (tenant_id, department_id, category) VALUES (1, 1, 'Other');
