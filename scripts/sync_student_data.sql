-- Script to sync student verification data to the production schema
-- Note: 'verified_students' requires a 'name' column which 'student_verification_data' lacks.
-- We will use 'Pending Name' for now.

INSERT INTO verified_students (roll_number, name, department_id, mobile, is_active)
SELECT 
    svd.roll_number, 
    'Student Name' as name, 
    d.id as department_id, 
    svd.mobile_number as mobile,
    1 as is_active
FROM student_verification_data svd
JOIN departments d ON LOWER(svd.department) = LOWER(d.name)
ON DUPLICATE KEY UPDATE 
    mobile = VALUES(mobile),
    department_id = VALUES(department_id);
