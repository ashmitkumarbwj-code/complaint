CREATE DATABASE IF NOT EXISTS smart_campus_db;
USE smart_campus_db;

-- 0. Tenants Table (SaaS Root)
CREATE TABLE IF NOT EXISTS tenants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    subdomain VARCHAR(50) UNIQUE NOT NULL,
    api_key VARCHAR(100) UNIQUE, -- For external integrations
    db_config JSON,              -- Optional if moving to separate DBs later
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Default Tenant
INSERT INTO tenants (id, name, subdomain) VALUES (1, 'Main Campus', 'main');

-- 1. Users Table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100),
    mobile_number VARCHAR(15),
    password_hash VARCHAR(255),
    role ENUM('Principal', 'Admin', 'HOD', 'Staff', 'Student', 'StudentHead') NOT NULL,
    is_verified TINYINT(1) DEFAULT 0,
    failed_attempts INT DEFAULT 0,
    locked_until DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    INDEX idx_user_tenant (tenant_id)
);

-- 2. Verified Students (Master Registry)
CREATE TABLE verified_students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    roll_number VARCHAR(20) NOT NULL,
    department VARCHAR(100),
    year VARCHAR(10),
    mobile_number VARCHAR(15),
    email VARCHAR(100),
    id_card_image VARCHAR(255),
    is_account_created TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    UNIQUE KEY (tenant_id, roll_number),
    INDEX idx_vs_tenant (tenant_id)
);

CREATE TABLE verified_staff (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    mobile VARCHAR(15) NOT NULL,
    department_id INT,
    role ENUM('Staff', 'HOD', 'Admin', 'Principal') NOT NULL,
    is_account_created TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    UNIQUE KEY (tenant_id, email),
    INDEX idx_vf_tenant (tenant_id)
);

-- 4. OTP Logs
CREATE TABLE otp_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mobile VARCHAR(15) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    type ENUM('Registration', 'Login', 'Verification') DEFAULT 'Registration',
    status ENUM('Pending', 'Verified', 'Expired') DEFAULT 'Pending',
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- OTP Tracking (otp_code stores bcrypt hash ~60 chars; attempts for lock-after-3-failures)
CREATE TABLE otps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    identifier VARCHAR(50) NOT NULL,
    otp_code VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    type ENUM('activation', 'reset') DEFAULT 'activation',
    attempts INT DEFAULT 0,
    is_used TINYINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_identifier (identifier)
);

-- 5. Departments Table
CREATE TABLE departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    email VARCHAR(100),
    head VARCHAR(100),
    hod_id INT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (hod_id) REFERENCES users(id),
    INDEX idx_dept_tenant (tenant_id)
);

-- 3. Students Table
CREATE TABLE students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    user_id INT NOT NULL,
    roll_number VARCHAR(20) NOT NULL,
    department_id INT,
    mobile VARCHAR(15),
    id_card_image VARCHAR(255),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE KEY (tenant_id, roll_number),
    INDEX idx_stud_tenant (tenant_id)
);

-- 4. Staff Table
CREATE TABLE staff (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    user_id INT NOT NULL,
    department_id INT,
    designation VARCHAR(50),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    INDEX idx_staff_tenant (tenant_id)
);

-- 5. Complaints Table
CREATE TABLE complaints (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    student_id INT NOT NULL,
    title VARCHAR(255),
    department_id INT NOT NULL,

    category ENUM('Noise', 'Electricity', 'Mess', 'Harassment', 'Infrastructure', 'Security', 'Cleanliness', 'Technical', 'Faculty', 'Other') NOT NULL,
    description TEXT NOT NULL,
    location VARCHAR(255),
    media_url VARCHAR(255),
    status ENUM('Pending', 'In Progress', 'Resolved', 'Rejected', 'Escalated') DEFAULT 'Pending',
    assigned_to INT,
    admin_notes TEXT,
    priority ENUM('Low', 'Medium', 'High', 'Emergency') DEFAULT 'Medium',
    escalation_level INT DEFAULT 0,
    warning_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id),
    FOREIGN KEY (assigned_to) REFERENCES staff(id) ON DELETE SET NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    INDEX idx_comp_tenant (tenant_id),
    INDEX idx_comp_status (tenant_id, status),
    INDEX idx_comp_created (tenant_id, created_at)
);

-- 6. Feedback Table
CREATE TABLE feedback (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    complaint_id INT NOT NULL,
    is_satisfied TINYINT(1),
    feedback_text TEXT,
    feedback_media VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    INDEX idx_feed_tenant (tenant_id)
);

-- Indexes
CREATE INDEX idx_complaint_status ON complaints(status);
CREATE INDEX idx_student_roll ON students(roll_number);

-- 7. Login Audit Table (tracks all login attempts)
CREATE TABLE login_audit (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    user_id INT NULL,
    identifier VARCHAR(100) NOT NULL,  -- what user typed (email/mobile/roll)
    success TINYINT(1) NOT NULL,       -- 1 = success, 0 = failed
    reason VARCHAR(100) NULL,          -- e.g. 'invalid_password', 'user_not_found'
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_login_user_id (user_id),
    INDEX idx_login_created_at (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    INDEX idx_audit_tenant (tenant_id)
);


-- 7. Initial Data for Testing
INSERT INTO departments (name) VALUES 
('Hostel Administration'),
('Maintenance Department'),
('Mess Management'),
('Disciplinary Committee'),
('Campus Security'),
('Academic Department'),
('General Administration');

-- 6. Department Categories (For Auto-Routing)
CREATE TABLE department_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1,
    category VARCHAR(50) NOT NULL,
    department_id INT NOT NULL,
    FOREIGN KEY (department_id) REFERENCES departments(id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    UNIQUE KEY (tenant_id, category),
    INDEX idx_cat_tenant (tenant_id)
);

-- Seed Categories
INSERT INTO department_categories (category, department_id) VALUES 
('Noise', 1),
('Electricity', 2),
('Mess', 3),
('Harassment', 4),
('Infrastructure', 2),
('Security', 5),
('Faculty', 6),
('Other', 7);

-- Seed a Default Admin
-- Password for all seed users is: admin123 (hashed below)
INSERT INTO users (username, email, mobile_number, password_hash, role, is_verified) 
VALUES ('admin', 'admin@gdc.edu', '9876543210', '$2a$10$XmS5L/n5cI6tS.8yv.A7uejX0.9v0q3W5O.qfR/e.J8fR8Z2YfVmW', 'Admin', 1);

-- Seed Verified Student (For activation test)
INSERT INTO verified_students (roll_number, department, year, mobile_number, email)
VALUES ('21DCS001', 'Computer Science', '3rd', '9999888877', 'student@example.com');

-- Seed Verified Staff (For activation test)
INSERT INTO verified_staff (name, email, mobile, department_id, role)
VALUES ('Dr. Sharma', 'sharma@gdc.edu', '8888777766', 6, 'HOD');


-- Refresh Tokens Table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
