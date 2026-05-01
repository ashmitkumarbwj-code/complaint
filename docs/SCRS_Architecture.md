# Smart Complaint & Response System — Production Architecture

> **Based on live DB schema inspection (2026-05-01)**  
> All tables, columns, and enums verified against the PostgreSQL production database.

---

## Database Tables (Verified)

| Table | Status |
|---|---|
| complaints | ✅ Verified |
| users | ✅ Verified |
| departments | ✅ Verified |
| students | ✅ Verified |
| staff | ✅ Verified |
| tenants | ✅ Verified |
| refresh_tokens | ✅ Verified |
| otp_verifications | ✅ Verified |
| complaint_ai_analysis | ✅ Verified |
| complaint_audit_trail_v2 | ✅ Verified |
| complaint_status_history | ✅ Verified |
| complaint_departments | ✅ Verified |
| admin_audit_logs | ✅ Verified |
| department_members | ✅ Verified |
| department_categories | ✅ Verified |
| login_audit | ✅ Verified |
| bulk_import_logs | ✅ Verified |
| complaint_media | ❌ NOT FOUND (media_url stored in complaints.media_url) |
| complaint_audit_logs | ❌ NOT FOUND (replaced by complaint_audit_trail_v2) |
| notifications | ❌ NOT FOUND (Socket.io only, no persistence table) |

---

## Verified ENUMs

### complaint_status
`Pending` | `In Progress` | `Resolved` | `Rejected` | `Escalated` | `Reopened`  
`SUBMITTED` | `FORWARDED` | `HOD_VERIFIED` | `STAFF_RESOLVED` | `HOD_APPROVED`  
`CLOSED` | `REJECTED_BY_ADMIN` | `RETURNED_TO_ADMIN` | `HOD_REWORK_REQUIRED` | `IN_PROGRESS`

### complaint_priority
`Low` | `Medium` | `High` | `Emergency`

### user_role
`Principal` | `Admin` | `HOD` | `Staff` | `Student` | `StudentHead`

### otp_type
`Registration` | `Login` | `Verification` | `activation` | `reset`

---

## 1. Class Diagram

```mermaid
classDiagram
    class Tenant {
        +Int id
        +String name
        +String subdomain
        +String api_key
        +JSONB db_config
        +Timestamp created_at
    }

    class User {
        +Int id
        +Int tenant_id
        +String username
        +String full_name
        +String email
        +String mobile_number
        +String password_hash
        +Enum role
        +Boolean is_verified
        +Int failed_attempts
        +Timestamp locked_until
        +String profile_image
        +Timestamp last_login_at
        +String status
    }

    class Student {
        +Int id
        +Int user_id
        +Int tenant_id
        +String roll_number
        +Int department_id
        +String registration_no
        +Int semester
        +String course
        +String section
        +Int admission_year
    }

    class Staff {
        +Int id
        +Int user_id
        +Int tenant_id
        +Int department_id
        +String designation
        +String employee_id
        +String employment_type
    }

    class Department {
        +Int id
        +Int tenant_id
        +String name
        +String code
        +String description
        +String email
        +Int hod_id
        +Boolean is_active
    }

    class DepartmentMember {
        +Int id
        +Int tenant_id
        +Int department_id
        +Int user_id
        +String role_in_dept
        +Timestamp assigned_at
    }

    class Complaint {
        +Int id
        +Int tenant_id
        +Int user_id
        +Int student_id
        +String title
        +Int department_id
        +String category
        +String description
        +String location
        +String media_url
        +Enum status
        +Int assigned_to
        +String admin_notes
        +Enum priority
        +Int escalation_level
        +Int warning_count
        +Int lock_version
        +Int reopened_count
        +Int workflow_version
        +Int current_owner_user_id
        +String current_owner_role
        +Int current_owner_department_id
        +Boolean is_v2_compliant
        +Timestamp last_transition_at
        +Int last_hod_id
        +Int last_staff_id
        +String ai_status
        +JSONB ai_analysis
    }

    class ComplaintAuditTrailV2 {
        +Int id
        +Int complaint_id
        +String from_status
        +String to_status
        +Int acted_by_user_id
        +String acted_by_role
        +Int previous_owner_user_id
        +Int new_owner_user_id
        +String previous_owner_role
        +String new_owner_role
        +Int previous_owner_department_id
        +Int new_owner_department_id
        +String reason
        +JSONB metadata
        +Timestamp created_at
    }

    class ComplaintStatusHistory {
        +Int id
        +Int complaint_id
        +Int actor_user_id
        +Enum actor_role
        +String action_type
        +Enum from_status
        +Enum to_status
        +String note
        +String visibility
        +JSONB metadata_json
        +String ip_address
        +Timestamp created_at
        +Int tenant_id
    }

    class ComplaintAIAnalysis {
        +Int id
        +Int complaint_id
        +Int tenant_id
        +String suggested_category
        +String suggested_priority
        +Decimal evidence_match_score
        +Boolean is_emergency
        +Boolean requires_manual_review
        +String reasoning_summary
        +JSONB metadata_json
        +String provider
        +String spam_risk
        +Boolean is_relevant_evidence
        +Timestamp processed_at
    }

    class OTPVerification {
        +Int id
        +Int user_id
        +String identifier
        +String otp_hash
        +Boolean verified
        +Int attempt_count
        +Timestamp expires_at
    }

    class RefreshToken {
        +Int id
        +Int user_id
        +String token
        +Timestamp expires_at
        +Timestamp created_at
    }

    class ComplaintService {
        <<Service>>
        +checkSpam(studentId, tenantId)
        +getTargetDepartment(category, tenantId)
        +submitComplaint(data, tenantId)
        +getComplaints(filters, tenantId, user)
        +updateStatus(req, params)
        +Note: Idempotency via SELECT FOR UPDATE + status equality check
        +Note: noOp return if current_status == new_status
    }

    class WorkflowEngine {
        <<Service>>
        +isValidTransition(current, target, role, version)
        +isReasonRequired(targetStatus, version)
        +isWithinReopenWindow(resolvedAt)
        +Note: Dual-version matrix (V1 legacy + V2 strict FSM)
    }

    class AIComplaintVerifier {
        <<Service>>
        +analyzeText(content) confidence_score
        +verifyEvidence(url) evidence_match_score
        +detectSpam(data) spam_risk
        +detectEmergency(data) is_emergency
        +suggestPriority(data) suggested_priority
        +suggestCategory(data) suggested_category
        +Note: Async via BullMQ queue, result in complaint_ai_analysis
    }

    class AuthService {
        <<Service>>
        +login(identifier, password)
        +verifyOTP(identifier, otp)
        +issueJWT(userId) HttpOnly Cookie
        +issueRefreshToken(userId) stored in refresh_tokens
        +rotateRefreshToken(token)
        +revokeRefreshToken(token)
        +Note: JWT stored in HttpOnly Secure cookie
        +Note: Refresh tokens stored in refresh_tokens table (VERIFIED)
    }

    class NotificationService {
        <<Service>>
        +sendSocket(userId, event, data)
        +sendEmail(email, template, data)
        +sendOTP(identifier, type)
        +Note: No persistent notifications table in DB
        +Note: Socket.io only for real-time push
    }

    Tenant "1" --> "many" User
    Tenant "1" --> "many" Department
    Tenant "1" --> "many" Complaint
    User "1" --> "1" Student
    User "1" --> "1" Staff
    User "1" --> "many" RefreshToken
    User "1" --> "many" OTPVerification
    Department "1" --> "many" DepartmentMember
    Complaint "1" --> "many" ComplaintAuditTrailV2
    Complaint "1" --> "many" ComplaintStatusHistory
    Complaint "1" --> "1" ComplaintAIAnalysis
```

---

## 2. FSM Activity Diagram (Verified Enum States)

```mermaid
stateDiagram-v2
    [*] --> SUBMITTED : Student submits (workflow_version=2, owner_role=admin)

    SUBMITTED --> REJECTED_BY_ADMIN : Admin rejects with reason
    SUBMITTED --> FORWARDED : Admin forwards\n(owner_role=hod, owner_dept=target)

    FORWARDED --> RETURNED_TO_ADMIN : HOD returns to Admin queue
    FORWARDED --> HOD_VERIFIED : HOD verifies\n(owner_id=targetStaff, owner_role=staff)
    FORWARDED --> ESCALATED : >48h inactivity (System worker)

    HOD_VERIFIED --> IN_PROGRESS : Staff starts work\n(owner_id=self)
    HOD_VERIFIED --> ESCALATED : >48h inactivity (System worker)

    IN_PROGRESS --> STAFF_RESOLVED : Staff resolves\n(owner_id=last_hod_id, owner_role=hod)
    IN_PROGRESS --> HOD_REWORK_REQUIRED : HOD requests rework\n(owner_id=last_staff_id)

    HOD_REWORK_REQUIRED --> IN_PROGRESS : Staff restarts work

    STAFF_RESOLVED --> HOD_APPROVED : HOD approves\n(owner_id=student_user_id, owner_role=student)
    STAFF_RESOLVED --> HOD_REWORK_REQUIRED : HOD rejects resolution

    HOD_APPROVED --> CLOSED : Student closes (within 7 days)\n(owner=null)
    HOD_APPROVED --> REOPENED : Student reopens\n(reopened_count <= 1, within 7 days)\n(owner_id=last_hod_id, owner_role=hod)

    state "Auto-Close Check (System)" as AC
    HOD_APPROVED --> AC : >7 days inactivity
    AC --> CLOSED : System auto-closes

    REOPENED --> IN_PROGRESS : HOD re-assigns staff

    ESCALATED --> ESCALATED : Principal reviews (no dedicated state yet)

    REJECTED_BY_ADMIN --> [*]
    CLOSED --> [*]
```

---

## 3. Sequence Diagram A — Student Submits Complaint

```mermaid
sequenceDiagram
    participant S as Student Browser
    participant API as Express API
    participant CS as ComplaintService
    participant DB as PostgreSQL
    participant MQ as Redis/BullMQ
    participant AI as Gemini/AIVerifier

    S->>API: POST /api/complaints (title, desc, category, media)
    API->>API: Authenticate JWT (HttpOnly Cookie)
    API->>CS: submitComplaint(data, tenantId)
    CS->>DB: checkSpam(student_id) — max 5/hour
    CS->>DB: getTargetDepartment(category, tenantId)
    CS->>DB: INSERT complaints (status=SUBMITTED, owner_role=admin, v2=true)
    DB-->>CS: complaint_id
    CS->>MQ: Enqueue AI analysis job (complaint_id)
    API-->>S: 201 Created {complaint_id}
    
    MQ->>AI: analyzeText + verifyEvidence
    AI-->>MQ: {spam_risk, priority, evidence_score, is_emergency}
    MQ->>DB: INSERT complaint_ai_analysis
    MQ->>DB: UPDATE complaints (ai_status=DONE, ai_processed_at)
```

---

## 4. Sequence Diagram B — Forward Complaint (Admin → HOD)

```mermaid
sequenceDiagram
    participant A as Admin Browser
    participant API as Express API
    participant CS as ComplaintService
    participant DB as PostgreSQL
    participant SOC as Socket.io

    A->>API: POST /api/complaints/:id/status {newStatus: FORWARDED, dept_id}
    API->>CS: updateStatus(req, {FORWARDED, targetDeptId})
    CS->>DB: SELECT * FROM complaints WHERE id=? FOR UPDATE
    DB-->>CS: complaint row (locked)
    CS->>CS: Idempotency: if status==FORWARDED → noOp return
    CS->>CS: WorkflowEngine.isValidTransition(SUBMITTED→FORWARDED, admin, v2)
    CS->>DB: UPDATE complaints SET status=FORWARDED,\ncurrent_owner_role=hod,\ncurrent_owner_department_id=dept_id,\nlast_transition_at=NOW()
    CS->>DB: INSERT complaint_audit_trail_v2\n(from=SUBMITTED, to=FORWARDED,\nprev_owner=admin, new_owner=hod)
    CS->>DB: INSERT complaint_status_history
    DB-->>CS: OK
    CS->>SOC: emit('complaint_forwarded') → HOD department room
    API-->>A: 200 {success, noOp: false}
```

---

## 5. Sequence Diagram C — Silent Auth Refresh

```mermaid
sequenceDiagram
    participant B as Browser JS
    participant API as Express API
    participant DB as PostgreSQL (refresh_tokens)

    B->>API: GET /api/complaints (expired JWT cookie)
    API-->>B: 401 Unauthorized
    
    B->>B: Intercept 401 → trigger silent refresh
    B->>API: POST /api/auth/refresh (refresh token in HttpOnly cookie)
    API->>DB: SELECT * FROM refresh_tokens WHERE token=hash AND expires_at > NOW()
    DB-->>API: Valid row found
    API->>API: Generate new JWT (15min expiry)
    API->>DB: UPDATE refresh_tokens (rotate token + expiry)
    API-->>B: Set-Cookie: accessToken=new_jwt; HttpOnly; Secure; SameSite=Strict
    B->>API: Retry GET /api/complaints (new JWT cookie)
    API-->>B: 200 {complaints data}
```

---

## 6. Sequence Diagram D — Student Reopens Complaint

```mermaid
sequenceDiagram
    participant S as Student Browser
    participant API as Express API
    participant CS as ComplaintService
    participant DB as PostgreSQL
    participant SOC as Socket.io

    S->>API: POST /api/complaints/:id/status\n{newStatus: REOPENED, reason: "Issue persists"}
    API->>CS: updateStatus(req, {REOPENED, reason})
    CS->>DB: SELECT * FROM complaints WHERE id=? FOR UPDATE
    CS->>CS: Check: reopened_count >= 1 → throw MAX_REOPEN_EXCEEDED
    CS->>CS: Check: days since last_transition_at > 7 → throw REOPEN_WINDOW_EXPIRED
    CS->>CS: WorkflowEngine.isValidTransition(HOD_APPROVED→REOPENED, student, v2)
    CS->>CS: isReasonRequired(REOPENED) → true, validate reason.length >= 10
    CS->>DB: UPDATE complaints SET status=REOPENED,\ncurrent_owner_id=last_hod_id,\ncurrent_owner_role=hod,\nreopened_count=+1
    CS->>DB: INSERT complaint_audit_trail_v2 + complaint_status_history
    CS->>SOC: emit('complaint_reopened') → HOD user room
    API-->>S: 200 {success: true}
```

---

## 7. ER Diagram (Verified Schema)

```mermaid
erDiagram
    tenants {
        int id PK
        varchar name
        varchar subdomain
        varchar api_key
        jsonb db_config
        timestamp created_at
    }

    users {
        int id PK
        int tenant_id FK
        varchar username
        varchar full_name
        varchar email
        varchar mobile_number
        varchar password_hash
        enum role
        boolean is_verified
        int failed_attempts
        timestamp locked_until
        varchar status
        timestamp last_login_at
    }

    students {
        int id PK
        int user_id FK
        int tenant_id FK
        varchar roll_number
        int department_id FK
        varchar course
        int semester
        int admission_year
    }

    staff {
        int id PK
        int user_id FK
        int tenant_id FK
        int department_id FK
        varchar designation
        varchar employee_id
        varchar employment_type
    }

    departments {
        int id PK
        int tenant_id FK
        varchar name
        varchar code
        int hod_id FK
        boolean is_active
    }

    department_members {
        int id PK
        int tenant_id FK
        int department_id FK
        int user_id FK
        varchar role_in_dept
        timestamp assigned_at
    }

    department_categories {
        int id PK
        int tenant_id FK
        varchar category
        int department_id FK
    }

    complaints {
        int id PK
        int tenant_id FK
        int user_id FK
        int student_id FK
        varchar title
        int department_id FK
        varchar category
        text description
        varchar location
        varchar media_url
        enum status
        int assigned_to FK
        enum priority
        int escalation_level
        int lock_version
        int reopened_count
        int workflow_version
        int current_owner_user_id FK
        varchar current_owner_role
        int current_owner_department_id FK
        boolean is_v2_compliant
        timestamp last_transition_at
        int last_hod_id FK
        int last_staff_id FK
        jsonb ai_analysis
        varchar ai_status
        timestamp created_at
        timestamp updated_at
    }

    complaint_audit_trail_v2 {
        int id PK
        int complaint_id FK
        varchar from_status
        varchar to_status
        int acted_by_user_id FK
        varchar acted_by_role
        int previous_owner_user_id
        int new_owner_user_id
        varchar previous_owner_role
        varchar new_owner_role
        int previous_owner_department_id
        int new_owner_department_id
        text reason
        jsonb metadata
        timestamp created_at
    }

    complaint_status_history {
        int id PK
        int complaint_id FK
        int actor_user_id FK
        enum actor_role
        varchar action_type
        enum from_status
        enum to_status
        text note
        varchar visibility
        jsonb metadata_json
        varchar ip_address
        int tenant_id FK
        timestamp created_at
    }

    complaint_ai_analysis {
        int id PK
        int complaint_id FK
        int tenant_id FK
        varchar suggested_category
        varchar suggested_priority
        numeric evidence_match_score
        boolean is_emergency
        boolean requires_manual_review
        text reasoning_summary
        varchar spam_risk
        boolean is_relevant_evidence
        varchar provider
        jsonb metadata_json
        timestamp processed_at
    }

    complaint_departments {
        int id PK
        int complaint_id FK
        int department_id FK
        int assigned_by FK
        timestamp assigned_at
        text notes
        boolean is_current
    }

    refresh_tokens {
        int id PK
        int user_id FK
        text token
        timestamp expires_at
        timestamp created_at
    }

    otp_verifications {
        int id PK
        int user_id FK
        varchar identifier
        varchar otp_hash
        boolean verified
        int attempt_count
        timestamp expires_at
    }

    admin_audit_logs {
        int id PK
        int tenant_id FK
        int admin_id FK
        varchar action
        varchar target_type
        int target_id
        jsonb details
        timestamp created_at
    }

    login_audit {
        int id PK
        int tenant_id FK
        int user_id FK
        varchar identifier
        int success
        varchar reason
        varchar ip_address
        text user_agent
        timestamp created_at
    }

    tenants ||--o{ users : "hosts"
    tenants ||--o{ departments : "owns"
    tenants ||--o{ complaints : "scopes"
    users ||--o{ students : "profile"
    users ||--o{ staff : "profile"
    users ||--o{ refresh_tokens : "sessions"
    users ||--o{ otp_verifications : "auth"
    departments ||--o{ department_members : "members"
    departments ||--o{ department_categories : "categories"
    complaints ||--o{ complaint_audit_trail_v2 : "full audit"
    complaints ||--o{ complaint_status_history : "history"
    complaints ||--|| complaint_ai_analysis : "ai result"
    complaints ||--o{ complaint_departments : "routing"
```

---

## 8. Deployment Diagram

```mermaid
graph TB
    subgraph Internet
        User[Browser Client]
    end

    subgraph AWS_EC2["AWS EC2 (Ubuntu)"]
        Nginx[Nginx Reverse Proxy<br/>SSL Termination]
        subgraph NodeApp["Node.js Process (PM2)"]
            Express[Express HTTP Server<br/>Port 5000]
            Static[Static File Server<br/>public/ directory]
            SocketIO[Socket.io Server<br/>Real-time Events]
            BullWorker[BullMQ Worker<br/>AI Jobs + Notifications]
        end
    end

    subgraph DataLayer["Data Layer"]
        PG[(PostgreSQL<br/>Primary DB)]
        Redis[(Redis<br/>BullMQ + Socket Pub/Sub)]
    end

    subgraph ExternalServices["External Services"]
        Cloudinary[Cloudinary<br/>Media Storage]
        AI[Gemini / OpenRouter<br/>AI Analysis]
        SMTP[SMTP Server<br/>OTP Email]
    end

    User -->|HTTPS 443| Nginx
    Nginx -->|/api proxy_pass| Express
    Nginx -->|static files| Static
    Express --- SocketIO
    Express --- BullWorker
    Express -->|SQL queries| PG
    Express -->|enqueue jobs| Redis
    SocketIO -->|pub/sub| Redis
    BullWorker -->|dequeue| Redis
    BullWorker -->|AI inference| AI
    BullWorker -->|update DB| PG
    Express -->|media upload| Cloudinary
    Express -->|send OTP| SMTP
```

---

## 9. Use Case Diagram

```mermaid
graph LR
    subgraph Actors
        ST((Student))
        AD((Admin))
        HOD((HOD))
        SF((Staff))
        PR((Principal))
        SYS((System/AI))
    end

    subgraph SCRS["Smart Complaint & Response System"]
        UC1[Login / OTP Activation]
        UC2[Submit Complaint + Media]
        UC3[Track Own Complaint]
        UC4[Close or Reopen Complaint]
        UC5[Forward to Department]
        UC6[Verify + Assign to Staff]
        UC7[Request Rework]
        UC8[Approve Resolution]
        UC9[Start Work]
        UC10[Submit Resolution Notes]
        UC11[View All Complaints]
        UC12[Escalate Complaint]
        UC13[Manage Users / Departments]
        UC14[Bulk Import Staff/Students]
        UC15[AI Spam + Priority Detection]
        UC16[Auto-close Stale Complaints]
        UC17[Rotate Refresh Token]
    end

    ST --> UC1
    ST --> UC2
    ST --> UC3
    ST --> UC4

    AD --> UC1
    AD --> UC5
    AD --> UC11
    AD --> UC13
    AD --> UC14

    HOD --> UC1
    HOD --> UC6
    HOD --> UC7
    HOD --> UC8
    HOD --> UC11

    SF --> UC1
    SF --> UC9
    SF --> UC10

    PR --> UC1
    PR --> UC11
    PR --> UC12

    SYS --> UC15
    SYS --> UC16
    SYS --> UC17
```

---

## 10. Technical Accuracy Notes

### Verified Facts (DB Confirmed)
- `refresh_tokens` table EXISTS with columns: `id, user_id, token, expires_at, created_at`
- `complaint_audit_trail_v2` is the REAL audit table (not `complaint_audit_logs`)
- `complaint_status_history` is a SECONDARY audit table with IP/UA logging
- `complaint_media` table does NOT exist — media stored in `complaints.media_url`
- `notifications` table does NOT exist — push via Socket.io only
- Ownership tracking fields confirmed: `current_owner_user_id`, `current_owner_role`, `current_owner_department_id`
- `workflow_version` field confirmed in complaints table
- `lock_version` field confirmed (optimistic locking)
- `reopened_count` field confirmed (max 1 reopen enforced in code)

### Idempotency (Code Verified — complaintService.js:160)
```js
// Real implementation — not pseudocode
if (complaint.status === newStatus) {
    return { success: true, noOp: true, message: 'Status is already up-to-date.' };
}
// Uses SELECT ... FOR UPDATE before any mutation
```

### Auth Security (Code + DB Verified)
- JWT issued as `HttpOnly; Secure; SameSite=Strict` cookie
- Refresh tokens stored in `refresh_tokens` table (**CONFIRMED in DB**)
- OTP hashed before storage in `otp_verifications.otp_hash`
- Failed login attempts tracked in `users.failed_attempts` + `locked_until`
- All login events logged in `login_audit` table

### Known Gaps (Not Yet Implemented)
- No `WAITING_FOR_STUDENT` state in enum (HOD_APPROVED is the closest equivalent)
- No `PRINCIPAL_REVIEW` or `PRINCIPAL_FORCE_CLOSE` states in enum
- No persistent `notifications` table (real-time only via Socket.io)
- `complaint_media` as separate table not implemented (single URL in complaints)
- Auto-close worker logic: **not confirmed in code** — reopen window is 7 days per `workflowEngine.isWithinReopenWindow()`
