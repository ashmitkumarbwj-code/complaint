-- Migration: Add ip_address column to otp_verifications for rate limiting
-- Created: 2026-05-01
-- Severity: Critical (Security)

-- [UP]
-- 1. Add column with safe character varying length (supports IPv6)
ALTER TABLE otp_verifications ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);

-- 2. Add useful index for identifier + created_at rate limiting
CREATE INDEX IF NOT EXISTS idx_otp_identifier_created ON otp_verifications (identifier, created_at);

-- 3. Add useful index for IP + created_at rate limiting
CREATE INDEX IF NOT EXISTS idx_otp_ip_created ON otp_verifications (ip_address, created_at);

-- [DOWN]
-- ROLLBACK INSTRUCTIONS:
-- DROP INDEX IF EXISTS idx_otp_ip_created;
-- DROP INDEX IF EXISTS idx_otp_identifier_created;
-- ALTER TABLE otp_verifications DROP COLUMN IF EXISTS ip_address;
