# Smart Campus Response System (SCRS) - System Logic Playbook
## Strategic Overview for Senior Architects

This document outlines the internal logic, security boundaries, and architectural patterns of the hardened Smart Campus Response System.

---

### 1. Multi-Tenant Architecture (Zero-Trust)
The system uses a **Single Schema, Multi-Tenant** model. Isolation is enforced at the **Data Access Layer**.

#### The Golden Rule: `tenantExecute`
No controller should manually filter by `tenant_id`. Instead, we use the `db.tenantExecute(req, query, params)` wrapper.
- **Logic**: It intercepts the SQL query, detects if a `WHERE` clause exists, and appends `AND tenant_id = ?` (or `WHERE tenant_id = ?`) automatically.
- **Source of Truth**: The `tenant_id` is extracted strictly from the JWT (`req.user.tenant_id`). It can NEVER be overridden by request body or query params.

---

### 2. Triple-Lock RBAC Enforcement
We implement three layers of validation for every sensitive request:

1.  **Role Lock (Middleware)**:
    - Primary gatekeeper (`checkRole(['Admin', 'Staff'])`).
2.  **Membership Lock (Controller Layer)**:
    - For Staff/HOD: Verifies the user belongs to the `department_id` associated with the complaint.
3.  **Ownership Lock (Service Layer)**:
    - For Students: Filters queries by `student_id` derived from the session, making it impossible to "ID-swap" and see other students' entries.

---

### 3. Standardized Data Schema
- **Mobile Number**: Unified field `mobile_number` across all tables. This is the primary key for OTP-based identity verification.
- **Master Registries**: `verified_students` and `verified_staff` act as the "Source of Truth" for onboarding. A user cannot create an account unless their details pre-exist in these registries (scoped to their tenant).

---

### 4. Background Job Security
Background workers (BullMQ) operate in a "Zero-Trust" environment.
- **Payload Requirement**: Every job enqueued (Uploads, Notifications) **must** include `tenantId`.
- **Worker Enforcement**: Workers use the `tenantId` from the job data in every SQL update. If `tenantId` is missing, the job fails immediately to prevent cross-tenant data corruption.

---

### 5. Resolution & Audit Flow
1. **Submission**: Student submits -> Auto-routed to Dept based on `department_categories`.
2. **Assignment**: Admin/HOD can "Forward" a complaint. This creates an entry in `complaint_departments` for an immutable audit trail.
3. **Status Life-cycle**: `Pending` -> `In Progress` -> `Resolved` / `Rejected`.
4. **Visibility**: Real-time updates via Socket.io, email notifications via BullMQ.

---

### 6. Edge Cases Handled
- **Subdomain Routing**: Multi-tenancy begins at the frontend/middleware level via subdomain detection.
- **Asset Isolation**: Cloudinary folders are segmented by `tenant_{id}`.
- **Firebase Sync**: Users created via Firebase are immediately linked to the tenant identified during the activation handshake.
