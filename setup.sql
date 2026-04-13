CREATE USER IF NOT EXISTS 'smart_campus_user'@'localhost' IDENTIFIED BY 'akshu_secure_db_2026';
GRANT ALL PRIVILEGES ON smart_campus_db.* TO 'smart_campus_user'@'localhost';
FLUSH PRIVILEGES;
