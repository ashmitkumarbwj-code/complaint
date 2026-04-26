-- database/safe_workflow_v2.sql
-- Description: Strict FSM Ownership & Audit Trail Establishment
-- Author: Antigravity Architect

BEGIN;

-- 1. Update Enum to include V2 Statuses
-- PostgreSQL doesn't support IF NOT EXISTS for ADD VALUE, so we use a DO block
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'complaint_status' AND pg_enum.enumlabel = 'SUBMITTED') THEN
        ALTER TYPE complaint_status ADD VALUE 'SUBMITTED';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'complaint_status' AND pg_enum.enumlabel = 'FORWARDED') THEN
        ALTER TYPE complaint_status ADD VALUE 'FORWARDED';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'complaint_status' AND pg_enum.enumlabel = 'HOD_VERIFIED') THEN
        ALTER TYPE complaint_status ADD VALUE 'HOD_VERIFIED';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'complaint_status' AND pg_enum.enumlabel = 'STAFF_RESOLVED') THEN
        ALTER TYPE complaint_status ADD VALUE 'STAFF_RESOLVED';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'complaint_status' AND pg_enum.enumlabel = 'HOD_APPROVED') THEN
        ALTER TYPE complaint_status ADD VALUE 'HOD_APPROVED';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'complaint_status' AND pg_enum.enumlabel = 'CLOSED') THEN
        ALTER TYPE complaint_status ADD VALUE 'CLOSED';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'complaint_status' AND pg_enum.enumlabel = 'REJECTED_BY_ADMIN') THEN
        ALTER TYPE complaint_status ADD VALUE 'REJECTED_BY_ADMIN';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'complaint_status' AND pg_enum.enumlabel = 'RETURNED_TO_ADMIN') THEN
        ALTER TYPE complaint_status ADD VALUE 'RETURNED_TO_ADMIN';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'complaint_status' AND pg_enum.enumlabel = 'HOD_REWORK_REQUIRED') THEN
        ALTER TYPE complaint_status ADD VALUE 'HOD_REWORK_REQUIRED';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'complaint_status' AND pg_enum.enumlabel = 'IN_PROGRESS') THEN
        ALTER TYPE complaint_status ADD VALUE 'IN_PROGRESS';
    END IF;
END $$;

-- 2. Explicit Backfill for Legacy rows
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS workflow_version INT;
UPDATE complaints SET workflow_version = 1 WHERE workflow_version IS NULL;
ALTER TABLE complaints ALTER COLUMN workflow_version SET DEFAULT 2;

-- 3. Ownership Columns with Referential Integrity
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS current_owner_user_id INT REFERENCES users(id);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS current_owner_role VARCHAR(50);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS current_owner_department_id INT REFERENCES departments(id);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS is_v2_compliant BOOLEAN DEFAULT TRUE;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS last_transition_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 4. Historical Tracking Columns
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS last_hod_id INT REFERENCES users(id);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS last_staff_id INT REFERENCES users(id);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS reopened_count INT DEFAULT 0;

-- 5. Ensure lock_version exists
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS lock_version INT DEFAULT 0;

-- 6. Create Immutable Audit Trail
CREATE TABLE IF NOT EXISTS complaint_audit_trail_v2 (
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

-- 7. Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_complaints_v2_owner ON complaints(workflow_version, current_owner_user_id, current_owner_role);
CREATE INDEX IF NOT EXISTS idx_audit_v2_complaint_id ON complaint_audit_trail_v2(complaint_id);

COMMIT;
