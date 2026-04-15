-- PostgreSQL Schema for Smart Campus Response System (Neon/Postgres)

-- 0. Standard Cleanups
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS department_categories CASCADE;
DROP TABLE IF EXISTS department_members CASCADE;
DROP TABLE IF EXISTS login_audit CASCADE;
DROP TABLE IF EXISTS otp_verifications CASCADE;
DROP TABLE IF EXISTS feedback CASCADE;
DROP TABLE IF EXISTS complaints CASCADE;
DROP TABLE IF EXISTS staff CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
DROP TABLE IF EXISTS otps CASCADE;
DROP TABLE IF EXISTS otp_logs CASCADE;
DROP TABLE IF EXISTS verified_staff CASCADE;
DROP TABLE IF EXISTS verified_students CASCADE;
DROP TABLE IF EXISTS complaint_status_history CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- Clear Types
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS complaint_status CASCADE;
DROP TYPE IF EXISTS complaint_priority CASCADE;
DROP TYPE IF EXISTS otp_type CASCADE;

-- 1. Types / Enums
CREATE TYPE user_role AS ENUM ('Principal', 'Admin', 'HOD', 'Staff', 'Student', 'StudentHead');
CREATE TYPE complaint_status AS ENUM ('Pending', 'In Progress', 'Resolved', 'Rejected', 'Escalated', 'Reopened');
CREATE TYPE complaint_priority AS ENUM ('Low', 'Medium', 'High', 'Emergency');
CREATE TYPE otp_type AS ENUM ('Registration', 'Login', 'Verification', 'activation', 'reset');

-- 2. Tenants Table (SaaS Root)
CREATE TABLE tenants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    subdomain VARCHAR(50) UNIQUE NOT NULL,
    api_key VARCHAR(100) UNIQUE,
    db_config JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Seed Default Tenant
INSERT INTO tenants (id, name, subdomain) VALUES (1, 'Main Campus', 'main');

-- 3. Users Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1 REFERENCES tenants(id),
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100),
    mobile_number VARCHAR(15),
    password_hash VARCHAR(255),
    role user_role NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    failed_attempts INT DEFAULT 0,
    locked_until TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active'
);

-- 4. Verified Registries
CREATE TABLE verified_students (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1 REFERENCES tenants(id),
    roll_number VARCHAR(20) NOT NULL,
    department VARCHAR(100),
    year VARCHAR(10),
    mobile_number VARCHAR(15),
    email VARCHAR(100),
    id_card_image VARCHAR(255),
    is_account_created BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, roll_number)
);

CREATE TABLE verified_staff (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1 REFERENCES tenants(id),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    mobile VARCHAR(15) NOT NULL,
    department_id INT, 
    role user_role NOT NULL,
    is_account_created BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, email)
);

-- 5. Departments Table
CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1 REFERENCES tenants(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    email VARCHAR(100),
    head VARCHAR(100),
    hod_id INT REFERENCES users(id) ON DELETE SET NULL
);

-- 6. Students & Staff (Profile Tables)
CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1 REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    roll_number VARCHAR(20) NOT NULL,
    department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    mobile_number VARCHAR(15),
    id_card_image VARCHAR(255),
    registration_no VARCHAR(50) UNIQUE,
    semester INT,
    admission_date DATE,
    UNIQUE (tenant_id, roll_number)
);

CREATE TABLE staff (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1 REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    designation VARCHAR(50),
    employee_id VARCHAR(50) UNIQUE,
    mobile_number VARCHAR(15),
    joining_date DATE
);

-- 7. Department Junction
CREATE TABLE department_members (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1 REFERENCES tenants(id) ON DELETE CASCADE,
    department_id INT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_in_dept VARCHAR(50) DEFAULT 'Staff',
    assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, department_id, user_id)
);

-- 8. Complaints & Workflow
CREATE TABLE complaints (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1 REFERENCES tenants(id) ON DELETE CASCADE,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    title VARCHAR(255),
    department_id INT NOT NULL REFERENCES departments(id),
    category VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    location VARCHAR(255),
    media_url VARCHAR(255),
    local_file_path VARCHAR(255),
    status complaint_status DEFAULT 'Pending',
    assigned_to INT REFERENCES staff(id) ON DELETE SET NULL,
    admin_notes TEXT,
    priority complaint_priority DEFAULT 'Medium',
    escalation_level INT DEFAULT 0,
    warning_count INT DEFAULT 0,
    lock_version INT DEFAULT 0,
    reopened_count INT DEFAULT 0,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE complaint_status_history (
    id SERIAL PRIMARY KEY,
    complaint_id INT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    actor_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    actor_role user_role,
    action_type VARCHAR(50),
    from_status complaint_status,
    to_status complaint_status,
    note TEXT,
    visibility VARCHAR(20) DEFAULT 'STUDENT_VISIBLE',
    metadata_json JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. Infrastructure (Audit, OTP, Tokens)
CREATE TABLE login_audit (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1 REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    identifier VARCHAR(100) NOT NULL,
    success INT DEFAULT 0,
    reason VARCHAR(100),
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE otp_verifications (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    identifier VARCHAR(100) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    attempt_count INT DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE department_categories (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL DEFAULT 1 REFERENCES tenants(id),
    category VARCHAR(50) NOT NULL,
    department_id INT NOT NULL REFERENCES departments(id),
    UNIQUE (tenant_id, category)
);

-- 10. Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER sync_complaints_updated_at
    BEFORE UPDATE ON complaints
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 11. Homepage System
CREATE TABLE homepage_slides (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    image_url VARCHAR(500) NOT NULL,
    public_id VARCHAR(255),
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER sync_homepage_slides_updated_at
    BEFORE UPDATE ON homepage_slides
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
