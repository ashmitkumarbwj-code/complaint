-- Database migration to create otp_verifications table for free OTP system
-- Smart Campus Complaint & Response System

CREATE TABLE IF NOT EXISTS otp_verifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    email VARCHAR(255) NOT NULL,
    otp_code VARCHAR(255) NOT NULL, -- Hashed OTP
    expires_at DATETIME NOT NULL,
    attempt_count INT DEFAULT 0,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (email),
    INDEX (expires_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
