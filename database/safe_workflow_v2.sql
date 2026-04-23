-- database/safe_workflow_v2.sql
-- Description: Strict FSM Ownership & Audit Trail Establishment
-- Author: Antigravity Architect

BEGIN;

-- 1. Explicit Backfill for Legacy rows
-- First add the column without default
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS workflow_version INT;
-- Backfill existing rows to version 1
UPDATE complaints SET workflow_version = 1 WHERE workflow_version IS NULL;
-- Now set the default for future rows to 2 (Strict)
ALTER TABLE complaints ALTER COLUMN workflow_version SET DEFAULT 2;

-- 2. Ownership Columns with Referential Integrity
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS current_owner_user_id INT REFERENCES users(id);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS current_owner_role VARCHAR(50);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS current_owner_department_id INT REFERENCES departments(id);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS is_v2_compliant BOOLEAN DEFAULT FALSE;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS last_transition_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 3. Historical Tracking Columns
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS last_hod_id INT REFERENCES users(id);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS last_staff_id INT REFERENCES users(id);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS reopened_count INT DEFAULT 0;

-- 4. Create Immutable Audit Trail with Full Context
CREATE TABLE IF NOT EXISTS complaint_audit_trail (
    id SERIAL PRIMARY KEY,
    complaint_id INT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    acted_by_user_id INT NOT NULL REFERENCES users(id),
    acted_by_role VARCHAR(50) NOT NULL,
    previous_owner_user_id INT,
    new_owner_user_id INT,
    previous_owner_role VARCHAR(50),
    new_owner_role VARCHAR(50),
    previous_owner_department_id INT REFERENCES departments(id),
    new_owner_department_id INT REFERENCES departments(id),
    reason TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_complaints_v2_owner ON complaints(workflow_version, current_owner_user_id, current_owner_role);
CREATE INDEX IF NOT EXISTS idx_audit_complaint_id ON complaint_audit_trail(complaint_id);

COMMIT;
