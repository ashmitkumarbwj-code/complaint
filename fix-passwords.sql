USE smart_campus_prod;
UPDATE users SET password_hash = '$2b$10$u2eK4E40f3d6YmK1vqyBjOTzXg1pL5PVRbix2RFaIH1uvnCjK1Y/u' WHERE email IN ('admin@gdc.edu', 'student@test.com');
