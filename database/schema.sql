-- Final Production Schema for Smart Campus Complaint & Response System
CREATE DATABASE IF NOT EXISTS smart_campus_db;
USE smart_campus_db;

-- 1. Users Table (Core Auth)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100),
    mobile_number VARCHAR(15),
    password_hash VARCHAR(255),
    role ENUM('Principal', 'Admin', 'HOD', 'Staff', 'Student', 'StudentHead') NOT NULL,
    is_verified TINYINT(1) DEFAULT 0,
    failed_attempts INT DEFAULT 0,
    locked_until DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Master Verification Table (For Account Activation)
CREATE TABLE student_verification_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    roll_number VARCHAR(20) UNIQUE NOT NULL,
    department VARCHAR(100),
    year VARCHAR(10),
    mobile_number VARCHAR(15),
    email VARCHAR(100),
    id_card_image VARCHAR(255),
    is_account_created TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. OTP Tracking
CREATE TABLE otps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    identifier VARCHAR(50) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    expires_at DATETIME NOT NULL,
    type ENUM('activation', 'reset') DEFAULT 'activation',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_identifier (identifier)
);

-- 4. Departments Table
CREATE TABLE departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    hod_id INT,
    FOREIGN KEY (hod_id) REFERENCES users(id)
);

-- 5. Students Table (Profile Data)
CREATE TABLE students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    roll_number VARCHAR(20) UNIQUE NOT NULL,
    department_id INT,
    mobile VARCHAR(15),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (department_id) REFERENCES departments(id)
);

-- 6. Staff Table
CREATE TABLE staff (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    department_id INT,
    designation VARCHAR(50),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (department_id) REFERENCES departments(id)
);

-- 7. Complaints Table (The Heart of the System)
CREATE TABLE complaints (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    department_id INT NOT NULL,
    category ENUM('Noise', 'Electricity', 'Mess', 'Harassment', 'Infrastructure', 'Security', 'Cleanliness', 'Technical', 'Faculty', 'Other') NOT NULL,
    description TEXT NOT NULL,
    location VARCHAR(255),
    media_url VARCHAR(255),
    status ENUM('Pending', 'In Progress', 'Resolved', 'Rejected', 'Escalated') DEFAULT 'Pending',
    priority ENUM('Low', 'Medium', 'High', 'Emergency') DEFAULT 'Medium',
    assigned_to INT,
    admin_notes TEXT,
    warning_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (department_id) REFERENCES departments(id),
    FOREIGN KEY (assigned_to) REFERENCES staff(id)
);

-- 8. Feedback Table
CREATE TABLE feedback (
    id INT AUTO_INCREMENT PRIMARY KEY,
    complaint_id INT NOT NULL,
    is_satisfied TINYINT(1),
    feedback_text TEXT,
    feedback_media VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (complaint_id) REFERENCES complaints(id)
);

-- Critical Indexes for Scalability
CREATE INDEX idx_complaint_status ON complaints(status);
CREATE INDEX idx_student_roll ON students(roll_number);
CREATE INDEX idx_complaint_dept ON complaints(department_id);

-- Initial Departments
INSERT IGNORE INTO departments (name) VALUES 
('Hostel Administration'),
('Maintenance Department'),
('Mess Management'),
('Disciplinary Committee'),
('Campus Security'),
('Academic Department'),
('General Administration');
