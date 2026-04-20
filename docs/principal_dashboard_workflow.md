# Principal Dashboard Workflow & Logic Flow

## Overview
The Principal Dashboard is the highest oversight layer in the Smart Campus Complaint & Response System. It enables the Principal of Govt. College Dharamshala (approx. 40,000 students) to monitor campus issues, analyze department performance, and intervene in critical or escalated situations.

This document outlines the system architecture, access control, and logic flows required to implement this role.

---

## 1. Principal Account Creation

**Context:** To maintain tight security, the Principal role cannot be registered publicly.

**Workflow:**
1. **Super Admin Action:** Only a Super Admin can initiate the account creation.
2. **Data Entry:** The Admin enters the Principal's details (Name, Official Email, Mobile Number, Designation).
3. **Token Generation:** The system generates a unique, time-sensitive activation token.
4. **Email Delivery:** A secure activation link (containing the token) is sent to the Principal's official email.
5. **Activation & Password:** The Principal clicks the link, sets a strong password, and activates the account.
6. **Storage:** The password is hashed using `bcrypt` before saving to the database.

**Logic Flow:**
```text
IF admin initiates principal account creation:
    VALIDATE input data
    GENERATE secure activation_token
    STORE token in DB with expiration timestamp
    SEND email with activation link (URL + token)

ON principal clicking link:
    VALIDATE token expiration and match
    PROMPT for new password
    HASH password using bcrypt
    UPDATE user record (status = active, password = hashed_password, role = 'Principal')
    CLEAR activation_token
```

---

## 2. Principal Login Process

**Context:** Secure authentication for the highest-level account.

**Security Rules:**
- `bcrypt` hashing for password verification.
- **Lockout Policy:** 5 failed login attempts lock the account for 15 minutes.
- **Session Management:** JWT (JSON Web Tokens) are used for secure session authentication.

**Logic Flow:**
```text
INPUT email + password
QUERY database for user by email

IF user NOT FOUND or role != 'Principal':
    RETURN error "Invalid credentials"

IF user.is_locked AND user.lock_expires > CURRENT_TIME:
    RETURN error "Account temporarily locked"

VERIFY password against stored bcrypt hash

IF password MATCHES:
    RESET failed_login_attempts to 0
    GENERATE JWT session token (payload: user_id, role)
    RETURN token and REDIRECT to Principal Dashboard
ELSE:
    INCREMENT failed_login_attempts
    IF failed_login_attempts >= 5:
        SET user.is_locked = TRUE
        SET user.lock_expires = CURRENT_TIME + 15 minutes
    RETURN error "Invalid credentials"
```

---

## 3. Dashboard Overview & Analytics

**Context:** The initial view upon login, providing a high-level summary of campus health.

**Key Metrics Displayed:**
- **Total Complaints Submitted Today:** Volume indicator.
- **Total Pending Complaints:** System backlog.
- **Complaints Resolved Today:** Daily throughput.
- **Department Performance Metrics:** Efficiency scores.
- **Escalated Complaints:** Items requiring immediate attention.
- **Average Response Time:** Global system latency.
- **Recent Critical Complaints:** High-severity issues.

**Visual Widgets:**
- **Complaint Statistics Charts:** Bar/line graphs showing weekly/monthly trends.
- **Department Complaint Distribution:** Pie charts showing workload per department.
- **Complaint Resolution Timeline:** Visual tracking of average time-to-close.
- **Emergency Alerts Panel:** A dedicated, highlighted section for urgent matters.

---

## 4. Complaint Escalation Monitoring

**Context:** Ensuring no complaint is ignored. The system automatically escalates issues based on SLA (Service Level Agreement) breaches.

**Escalation Rules & Logic:**
```text
CRON JOB runs periodically (e.g., hourly) checking complaint timestamps:

FOR EACH complaint IN pending_status:
    time_elapsed = CURRENT_TIME - complaint.created_at

    IF time_elapsed >= 24 hours AND complaint.status == 'new' (not accepted):
        UPDATE complaint.escalation_level = 'HOD'
        SEND notification to HOD
        
    IF time_elapsed >= 48 hours AND complaint.status != 'resolved':
        UPDATE complaint.escalation_level = 'Admin'
        SEND notification to Admin

    IF time_elapsed >= 72 hours AND complaint.status != 'resolved':
        UPDATE complaint.escalation_level = 'Principal'
        FLAG complaint as 'Escalated'
        SEND notification to Principal
        UPDATE Principal Dashboard Priority Section
```

---

## 5. Principal Complaint Actions

**Context:** The Principal has the authority to intervene in any complaint process.

**Capabilities:**
- View full details and media evidence.
- Identify the responsible department.
- Review the complete timeline/history of the complaint.
- Assign or reassign investigations.
- Send direct directives/instructions to a department.
- Force-mark a complaint as "High Priority".

**Logic Flow:**
```text
ON principal selecting a complaint:
    FETCH full complaint record (details, media, timeline, assigned_dept)
    DISPLAY record

IF principal executes action 'Reassign':
    UPDATE complaint.assigned_dept = new_dept
    LOG action in complaint timeline
    NOTIFY new_dept

IF principal executes action 'Send Directive':
    APPEND directive to complaint remarks
    NOTIFY assigned_dept of Principal Directive

IF principal executes action 'Mark Priority':
    UPDATE complaint.priority = 'High'
    NOTIFY assigned_dept
```

---

## 6. Emergency Complaint Handling

**Context:** Immediate surfacing of critical issues.

**Categories:** Violence, Harassment, Security Threats, Major Infrastructure Damage.

**Logic Flow:**
```text
ON complaint submission:
    IF complaint.category IN ['Violence', 'Harassment', 'Security', 'Major Damage']:
        SET complaint.priority = 'Emergency'
        
        // Real-time Push
        EMIT Socket.io event 'emergency_alert' to 'principal_room'
        
        // Fallback/Persistent Alert
        CREATE high_priority_notification record for Principal
        TRIGGER SMS/Email alert to Principal (optional based on severity)
```

---

## 7. Department Performance Monitoring

**Context:** Identifying bottlenecks and ensuring accountability.

**Metrics Tracked per Department:**
- Department Name
- Total Complaints Received
- Average Resolution Time (in hours)
- Pending Complaints Count
- Resolved Complaints Count
- Escalated Complaints Count (Complaints breached SLA)

**Dashboard Visualization:**
- Sortable data table.
- Color-coded highlighting (e.g., Red for departments with >20% escalated complaints or avg resolution time > 48h).

---

## 8. Real-time Notification System

**Context:** Keeping the Principal informed without requiring page refreshes using **Socket.io**.

**Events Triggering Notifications to Principal:**
1. `critical_submission`: A new emergency complaint is filed.
2. `complaint_escalated_principal`: A complaint hits the 72-hour SLA breach.
3. `escalated_complaint_resolved`: A department finally resolves a previously escalated issue.

**Implementation Concept:**
- Client (Dashboard) connects to Socket.io server and joins the `principal_room`.
- Backend emits events to this room when triggers occur.
- Frontend displays toast notifications and increments alert counters instantly.

---

## 9. Complaint Investigation Mode

**Context:** Deep dive into specific issues.

**Features Available in Investigation UI:**
- **Student Profile:** Reporter details (unless anonymous reporting is enabled for specific categories).
- **Incident Details:** Text description and attached media (photos/videos).
- **Audit Trail:** Department responses, status changes, and time between actions.
- **Principal Remarks Entry:** A form to add official un-deletable remarks or orders to the file.

---

## 10. System Analytics Section

**Context:** Macro-level data for policy making and resource allocation.

**Key Visualizations:**
- **Category frequency:** Which types of complaints are most common?
- **Heatmap:** (If location data is collected) Where are physical issues happening?
- **Workload Distribution:** Are certain departments overwhelmed?
- **Trend Lines:** Monthly comparisons of volume vs. resolution times.

---

## 11. Security and Access Control (RBAC)

**Context:** Strict data segregation.

**Role Permissions:**
- **Student:** `READ/WRITE` own complaints only.
- **Staff/Department:** `READ` complaints assigned to their department; `UPDATE` status/remarks.
- **Admin:** `READ` all complaints; `UPDATE` system settings, user management, basic complaint routing.
- **Principal:** `READ` all complaints globally; `UPDATE` reassignments, priorities, escalations, override statuses; `ANALYZE` full system data.

---

## 12. Complete Workflow Summary

1. **Submission:** Student submits a complaint via the Application.
2. **Routing:** System automatically categorizes and assigns the complaint to the relevant Department.
   - *Exception:* If it's an Emergency, it bypasses queues and alerts the Principal instantly.
3. **Review:** Department receives and reviews the complaint.
4. **Resolution (Happy Path):** Department resolves the issue within 24-48 hours. Student confirms.
5. **Escalation (SLA Breach Path):**
   - At **24h unsettled:** Escalates to Head of Department (HOD).
   - At **48h unsettled:** Escalates to Campus Admin.
   - At **72h unsettled:** Escalates to Principal Dashboard Priority Queue.
6. **Intervention:** Principal reviews the escalated complaint, investigates timelines, user remarks, and sends a strict directive or reassigns personnel to force resolution.
