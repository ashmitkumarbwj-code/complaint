-- database/phase2_ai_suggestions.sql
-- Description: AI Suggestion Assistant Infrastructure & Audit Fix
-- Author: Antigravity

BEGIN;

-- 1. Ensure complaint_status_history has tenant_id for automated enforcement
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='complaint_status_history' AND column_name='tenant_id') THEN
        ALTER TABLE complaint_status_history ADD COLUMN tenant_id INT DEFAULT 1 REFERENCES tenants(id);
    END IF;
END $$;

-- 2. Create AI Analysis Table
CREATE TABLE IF NOT EXISTS complaint_ai_analysis (
    id SERIAL PRIMARY KEY,
    complaint_id INT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    tenant_id INT NOT NULL DEFAULT 1 REFERENCES tenants(id),
    suggested_category VARCHAR(50),
    suggested_priority VARCHAR(20),
    evidence_match_score DECIMAL(3, 2), -- Renamed to match aiService usage
    is_emergency BOOLEAN DEFAULT FALSE,
    requires_manual_review BOOLEAN DEFAULT FALSE,
    reasoning_summary TEXT,
    metadata_json JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (complaint_id)
);

-- 3. Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_ai_analysis_complaint_id ON complaint_ai_analysis(complaint_id);

COMMIT;
