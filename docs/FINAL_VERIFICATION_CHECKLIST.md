# Final Verification Checklist - Smart Campus Response System (SCRS)
## Post-Hardening QA Protocol

Perform these tests after deploying the zero-trust refactor to ensure all security boundaries are intact.

---

### 1. Multi-Tenant Isolation Test (CRITICAL)
- [ ] Create two tenants (e.g., `College A` and `College B`).
- [ ] Log in as a Student of `College A`.
- [ ] Try to access `/api/complaints` via Postman with the `College A` JWT but passing a `tenant_id` of `College B` in the query params.
- [ ] **Expectation**: The system MUST return only `College A` complaints. The `tenant_id` param must be ignored/overridden by the DB wrapper.

---

### 2. Triple-Lock RBAC Test
- [ ] **Membership Lock (Staff)**:
  - Log in as Staff member assigned only to `Electricity`.
  - Try to fetch stats for `Mess` department (`/api/dashboard/authority/stats/2`).
  - **Expectation**: 403 Forbidden.
- [ ] **Ownership Lock (Student)**:
  - Log in as Student A.
  - Attempt to view Complaint ID belonging to Student B.
  - **Expectation**: 404 Not Found (or 403).

---

### 3. Schema Standardization Test
- [ ] Register a new student.
- [ ] Ensure the mobile number field in the database is saved under `mobile_number` (not `mobile` or `phone`).
- [ ] Trigger an OTP. Verify it looks up the same `mobile_number` field.

---

### 4. Background Job Isolation
- [ ] Submit a complaint with an image.
- [ ] Check `pm2 logs`.
- [ ] Verify the log entry: `[Job:XX] [Tenant:1] Uploaded successfully...`.
- [ ] Ensure the image is stored in the Cloudinary folder: `smart_campus/complaints/tenant_1/`.

---

### 5. Principal Dashboards
- [ ] Log in as Principal.
- [ ] Verify the "System Health" metrics only show data for their specific college, not global system data.

---

### 6. Audit Trail
- [ ] Forward a complaint from one department to another.
- [ ] Check the `complaint_departments` table.
- [ ] Verify `assigned_by` maps to the Admin ID and `tenant_id` is recorded correctly.
