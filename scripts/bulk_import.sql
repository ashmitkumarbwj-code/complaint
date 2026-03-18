-- ============================================================================
-- SQL Option 2: BULK IMPORT SCRIPT
-- ============================================================================
-- Note: Replace '/path/to/data.csv' with your absolute file paths.
-- Ensure MySQL secure-file-priv allows reading from the directory.

-- 1. Import Students
LOAD DATA INFILE '/path/to/students.csv'
IGNORE INTO TABLE users
FIELDS TERMINATED BY ',' ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(@name, @mobile, @dept)
SET 
  username = @name,
  mobile_number = @mobile,
  role = 'Student',
  is_verified = 1,
  password_hash = '$2a$10$A/8r.WvWzG2N.2oD.UuXxOQ5sYxk8M3kYg2R8zQ6VwG9R7b3.7xKG'; -- Default 'Password123'

-- Note: You would then need to query the inserted users to link them into the 'students' table.
-- The Node.js script (scripts/bulk_import.js) handles this relational mapping automatically.


-- ============================================================================
-- ❗ PRINCIPAL DATA SECTION ❗
-- ============================================================================
-- IMPORTANT DATA CONDITION: The Principal data has not been received yet.
-- Do NOT insert any principal record yet. 
-- Insert principal details here when data is available.

-- Example structure:
/*
INSERT INTO users 
(username, mobile_number, email, password_hash, role, is_verified) 
VALUES 
('Principal Name', 'XXXXXXXXXX', 'principal@campus.edu', '$2a$10$A/8r.WvWzG2N.2oD.UuXxOQ5sYxk8M3kYg2R8zQ6VwG9R7b3.7xKG', 'Principal', 1);

SET @principal_user_id = LAST_INSERT_ID();

INSERT INTO staff
(user_id, department_id, designation)
VALUES
(@principal_user_id, (SELECT id FROM departments WHERE name = 'General Administration' LIMIT 1), 'Principal');
*/
