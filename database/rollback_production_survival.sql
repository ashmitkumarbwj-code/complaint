-- rollback_production_survival.sql
-- Reverses schema hardening for AI Analysis and Media tracking

BEGIN;

-- 1. Remove columns from complaints
ALTER TABLE complaints 
DROP COLUMN IF EXISTS ai_queued_at,
DROP COLUMN IF EXISTS ai_started_at,
DROP COLUMN IF EXISTS ai_failed_at,
DROP COLUMN IF EXISTS ai_processed_at;

-- 2. Drop AI analysis table
DROP TABLE IF EXISTS complaint_ai_analysis;

COMMIT;
