USE smart_campus_prod;
INSERT INTO users (tenant_id, username, email, mobile_number, password_hash, role, is_verified) VALUES (1, 'Test Student', 'student@test.com', '1234567890', '$2a$10$XmS5L/n5cI6tS.8yv.A7uejX0.9v0q3W5O.qfR/e.J8fR8Z2YfVmW', 'Student', 1);
INSERT INTO students (tenant_id, user_id, roll_number, mobile_number) VALUES (1, LAST_INSERT_ID(), 'TEST-123', '1234567890');
