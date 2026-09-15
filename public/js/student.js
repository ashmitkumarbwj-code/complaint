document.addEventListener("DOMContentLoaded", async () => {
    // ??? SECURITY HARDENING: Immediate Server-Side Session Validation
    const userProfile = await window.validateSession('student');
    if (!userProfile) return;

    // Sync localStorage for UI consistency, but server is the source of truth
    const user = JSON.parse(localStorage.getItem('scrs_user')) || userProfile;

    const displayName = user.username || user.name || 'Student';
    document.getElementById('welcome-text').textContent = `Hello, ${displayName}!`;

    // Populate profile photo
    const profileImgContainer = document.getElementById('student-profile-img');
    if (profileImgContainer) {
        profileImgContainer.innerHTML = MediaUtils.renderProfilePhoto(user.profile_image, displayName, 'md');
    }

    const complaintForm = document.getElementById('complaint-form');
    // Prevent double submissions
    let isSubmitting = false;
    const complaintList = document.getElementById('complaint-list');

    // Handle Submission
    complaintForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (isSubmitting) return; // guard against double clicks
        isSubmitting = true;

        const submitBtn = complaintForm.querySelector('button[type="submit"]');
        const origHtml = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Submitting...';

        const formData = new FormData();
        formData.append("student_id", user.student_id); // we need this otherwise it breaks
        formData.append("title", document.getElementById("complaint-title").value);
        formData.append("category", document.getElementById("complaint-category").value);
        formData.append("priority", document.getElementById("complaint-priority").value);
        formData.append("location", document.getElementById("complaint-location").value);
        formData.append("description", document.getElementById("complaint-description").value);

        const fileInput = document.getElementById("image");
        if (fileInput && fileInput.files[0]) {
            formData.append("image", fileInput.files[0]); // ?? name must match backend
        }

        try {
            const res = await fetch(`${API_BASE}/api/complaints`, {
                method: "POST",
                body: formData,
                credentials: "include" // ?? MUST
            });

            const data = await res.json();
            console.log("Response:", data);

            if (res.ok && data.success) {
                showToast("Complaint submitted ?", "success");
                complaintForm.reset();
                // Explicitly clear file input (some browsers retain file path after reset)
                if (fileInput) fileInput.value = '';
                // Refresh list and ensure new complaint is visible at top
                fetchComplaints().then(() => {
                    if (complaintList) complaintList.scrollTop = 0;
                });
            } else {
                showToast(data.message || "Failed ?", "error");
            }

        } catch (err) {
            console.error(err);
            showToast("Server error ?", "error");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origHtml;
            isSubmitting = false;
        }
    });

    // Initialize Socket.io and Room
    const socket = io(API_BASE);
    socket.emit('join', `student_${user.student_id}`);

    socket.on('status_updated', (data) => {
        console.log('Real-time update received:', data);
        // Optionally show a notification toast here
        fetchComplaints();
    });

    // Load initial complaints
    fetchComplaints();

    async function fetchComplaints() {
        if (!user || (!user.student_id && user.student_id !== 0) || user.student_id === 'undefined') {
            console.error('[Student] Missing student identity. Aborting fetch.');
            complaintList.innerHTML = '<div class="error-msg text-center" style="color: var(--red); padding: 2rem;"><i class="fa-solid fa-circle-exclamation fa-2x mb-3"></i><p>Unable to load reports. Profile incomplete.</p></div>';
            return;
        }

        try {
            // Skeleton loader for student list
            complaintList.innerHTML = `
                <div class="skeleton-card" style="height: 150px; border-radius: 12px; margin-bottom: 1.5rem;"></div>
                <div class="skeleton-card" style="height: 150px; border-radius: 12px; opacity: 0.6; margin-bottom: 1.5rem;"></div>
            `;

            const response = await fetch(`${API_BASE}/api/complaints/student/${user.student_id}`, {
                credentials: 'include' // ? httpOnly cookie auth
            });
            if (!response.ok) { 
                console.error('[Student] fetchComplaints failed:', response.status); 
                showToast('Failed to load your reports.', 'error');
                complaintList.innerHTML = '<div class="error-msg text-center" style="color: var(--red); padding: 2rem;"><i class="fa-solid fa-server fa-2x mb-3"></i><p>Failed to load your reports.</p></div>';
                return; 
            }
            const data = await response.json();

            if (data.success) {
                renderComplaints(data.complaints);
            }
        } catch (error) {
            console.error('Error fetching complaints:', error);
            showToast('Network error while loading reports.', 'error');
        }
    }

    function renderStudentWorkflowTimeline(currentStatus) {
        const statuses = [
            { key: 'SUBMITTED', label: 'Submitted' },
            { key: 'FORWARDED', label: 'Forwarded' },
            { key: 'HOD_VERIFIED', label: 'HOD Verified' },
            { key: 'IN_PROGRESS', label: 'In Progress' },
            { key: 'STAFF_RESOLVED', label: 'Staff Resolved' },
            { key: 'HOD_APPROVED', label: 'HOD Approved' },
            { key: 'CLOSED', label: 'Closed' }
        ];

        const s = String(currentStatus || '').toUpperCase().trim();

        // Exception States
        if (s === 'REJECTED_BY_ADMIN') {
            return `
                <div style="background: rgba(248, 81, 73, 0.1); border: 1px solid rgba(248, 81, 73, 0.3); border-radius: 8px; padding: 0.75rem 1rem; margin: 1rem 0; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-ban" style="color: var(--red); font-size: 1.2rem;"></i>
                    <div>
                        <strong style="color: var(--red); font-size: 0.85rem;">Complaint Rejected by Administration</strong>
                        <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7);">This report did not meet submission criteria or was flagged during central triage.</div>
                    </div>
                </div>
            `;
        }

        if (s === 'RETURNED_TO_ADMIN') {
            return `
                <div style="background: rgba(212, 175, 55, 0.1); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 8px; padding: 0.75rem 1rem; margin: 1rem 0; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-arrow-left" style="color: var(--gold); font-size: 1.2rem;"></i>
                    <div>
                        <strong style="color: var(--gold); font-size: 0.85rem;">Returned to Admin Queue for Re-routing</strong>
                        <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7);">The department requested reassignment to a more suitable department.</div>
                    </div>
                </div>
            `;
        }

        if (s === 'HOD_REWORK_REQUIRED') {
            return `
                <div style="background: rgba(212, 175, 55, 0.1); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 8px; padding: 0.75rem 1rem; margin: 1rem 0; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-arrows-rotate fa-spin" style="color: var(--gold); font-size: 1.2rem;"></i>
                    <div>
                        <strong style="color: var(--gold); font-size: 0.85rem;">Rework Requested by HOD</strong>
                        <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7);">The Head of Department reviewed staff resolution and requested further corrective action.</div>
                    </div>
                </div>
            `;
        }

        if (s === 'REOPENED') {
            return `
                <div style="background: rgba(58, 134, 255, 0.1); border: 1px solid rgba(58, 134, 255, 0.3); border-radius: 8px; padding: 0.75rem 1rem; margin: 1rem 0; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-rotate-left" style="color: #3a86ff; font-size: 1.2rem;"></i>
                    <div>
                        <strong style="color: #3a86ff; font-size: 0.85rem;">Complaint Reopened by Student</strong>
                        <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7);">Reopened for further investigation by the Head of Department.</div>
                    </div>
                </div>
            `;
        }

        let currentIndex = statuses.findIndex(st => st.key === s);
        if (currentIndex === -1) currentIndex = 0;

        return `
            <div class="workflow-timeline" style="margin: 1.25rem 0 1.5rem 0; overflow-x: auto; padding-bottom: 5px;">
                ${statuses.map((st, i) => {
                    let stateClass = '';
                    let iconHtml = `${i + 1}`;
                    let tooltip = 'Pending';
                    
                    if (i < currentIndex) {
                        stateClass = 'completed';
                        iconHtml = '<i class="fa-solid fa-check"></i>';
                        tooltip = 'Completed';
                    } else if (i === currentIndex) {
                        stateClass = 'active';
                        if (st.key === 'CLOSED') iconHtml = '<i class="fa-solid fa-lock"></i>';
                        else iconHtml = '<i class="fa-solid fa-circle-dot fa-beat-fade"></i>';
                        tooltip = 'Current Stage';
                    }

                    return `
                        <div class="timeline-step ${stateClass}" title="${st.label}: ${tooltip}">
                            <div class="step-icon">${iconHtml}</div>
                            <div class="step-label" style="font-size: 0.62rem;">${st.label}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function renderComplaints(complaints) {
        if (complaints.length === 0) {
            complaintList.innerHTML = '<p class="text-center" style="color: var(--text-secondary); padding: 2rem;">No reports yet.</p>';
            return;
        }

        complaintList.innerHTML = complaints.map(c => {
            const isVideo = c.media_url && (c.media_url.endsWith('.mp4') || c.media_url.endsWith('.mov') || c.media_url.includes('/video/upload/'));
            const timelineHtml = renderStudentWorkflowTimeline(c.status);
            
            return `
            <div class="complaint-card glass-panel" style="margin-bottom: 1.5rem; padding: 1.5rem; border-left: 4px solid var(--gold);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                    <div>
                        <span class="status-badge status-${c.status.toLowerCase().replace(/_/g, '').replace(/ /g, '')}" style="font-weight: 800;">${c.status}</span>
                        <span class="status-badge" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); margin-left: 0.5rem; font-size: 0.75rem;">
                             ${c.priority || 'Medium'} Priority
                        </span>
                    </div>
                    <small style="color: var(--text-secondary); opacity: 0.7;">${new Date(c.created_at).toLocaleString()}</small>
                </div>
                
                <h3 style="margin-bottom: 0.5rem; color: white; font-weight: 700;">${c.title || c.category}</h3>
                <div style="margin-bottom: 1rem; font-size: 0.85rem; color: var(--gold); opacity: 0.8; font-weight: 600;">
                    <i class="fa-solid fa-location-dot"></i> ${c.location} | <i class="fa-solid fa-tag"></i> ${c.category}
                </div>
                
                <p style="font-size: 0.95rem; color: rgba(255,255,255,0.8); line-height: 1.6; margin-bottom: 1.25rem;">${c.description}</p>
                
                <!-- ??? 7-Stage Workflow Progression Display -->
                ${timelineHtml}

                ${c.media_url ? '' : `
                    <div class="processing-status-container" style="margin-top: 1rem;">
                        ${c.processing_status === 'processing' ? `
                            <div class="status-badge status-processing" style="background: rgba(58, 134, 255, 0.2); color: #3a86ff; border: 1px solid rgba(58, 134, 255, 0.4); padding: 0.5rem 1rem; border-radius: 8px; display: inline-flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-circle-notch fa-spin"></i> Uploading to Cloud...
                            </div>
                        ` : ''}
                        ${c.processing_status === 'pending_resync' ? `
                            <div class="status-badge status-syncing" style="background: rgba(212, 175, 55, 0.2); color: var(--gold); border: 1px solid var(--gold); padding: 0.5rem 1rem; border-radius: 8px; display: inline-flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-clock-rotate-left"></i> Syncing via Backup Queue...
                            </div>
                        ` : ''}
                        ${c.processing_status === 'failed' ? `
                            <div class="status-badge status-failed" style="background: rgba(248, 81, 73, 0.2); color: var(--red); border: 1px solid var(--red); padding: 0.5rem 1rem; border-radius: 8px; display: inline-flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-circle-exclamation"></i> Upload Failed. Retrying...
                            </div>
                        ` : ''}
                    </div>
                `}
                
                ${c.media_url ? `
                    <div class="media-preview" style="margin-top: 1rem; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(0, 0, 0, 0.2); max-width: 400px;">
                        ${isVideo ? 
                            `<video src="${c.media_url}" controls style="width: 100%; display: block;"></video>` : 
                            `<img src="${c.media_url}" style="width: 100%; display: block; cursor: pointer;" onclick="window.open('${c.media_url}', '_blank')">`
                        }
                    </div>
                ` : ''}
                
                <!-- Action / Audit History Controls -->
                <div style="margin-top: 1.25rem; display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;">
                    <button onclick="toggleAuditTrail(${c.id})" id="btn-toggle-audit-${c.id}" class="btn btn-glass btn-sm" style="font-size: 0.8rem; padding: 0.4rem 0.8rem;">
                        <i class="fa-solid fa-clock-rotate-left"></i> View Full Timeline History
                    </button>
                    ${c.status === 'CLOSED' ? `
                        <button onclick="promptReopen(${c.id})" class="btn-secondary btn-sm" style="font-weight: 800; border-color: var(--red); color: var(--red); padding: 0.4rem 0.8rem;">
                            <i class="fa-solid fa-rotate-left"></i> Reopen (within 7 days)
                        </button>
                    ` : ''}
                </div>

                <div id="audit-trail-${c.id}" style="display: none; margin-top: 1rem; padding: 1rem; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);"></div>
                
                <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.05); font-size: 0.8rem; color: var(--text-secondary); display: flex; justify-content: space-between; align-items: center;">
                    <span><i class="fa-solid fa-building"></i> Department: <strong>${c.department_name}</strong></span>
                    <span style="font-family: monospace; opacity: 0.5;">ID: #${c.id}</span>
                </div>
            </div>
        `}).join('');
    }

    // Toggle Audit History for Complaint
    window.toggleAuditTrail = async (complaintId) => {
        const container = document.getElementById(`audit-trail-${complaintId}`);
        const btn = document.getElementById(`btn-toggle-audit-${complaintId}`);
        if (!container) return;

        if (container.style.display === 'block') {
            container.style.display = 'none';
            if (btn) btn.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> View Full Timeline History';
            return;
        }

        container.style.display = 'block';
        container.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin"></i> Loading audit history...</div>';
        if (btn) btn.innerHTML = '<i class="fa-solid fa-chevron-up"></i> Hide Timeline History';

        try {
            const res = await fetch(`${API_BASE}/api/complaints/${complaintId}/history`, { credentials: 'include' });
            const data = await res.json();
            if (data.success && data.history && data.history.length > 0) {
                container.innerHTML = `
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--gold); margin-bottom: 0.75rem;">
                        <i class="fa-solid fa-list-check"></i> Stage Transition Audit Log
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                        ${data.history.map(item => `
                            <div style="display: flex; gap: 10px; font-size: 0.8rem; border-left: 2px solid var(--gold); padding-left: 10px;">
                                <div>
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <strong style="color: white;">${item.to_status || 'STATUS UPDATE'}</strong>
                                        <span class="badge" style="font-size: 0.65rem; background: rgba(255,255,255,0.08);">${item.actor_role || 'System'}</span>
                                    </div>
                                    <div style="color: var(--text-secondary); font-size: 0.72rem; margin-top: 2px;">
                                        ${new Date(item.assigned_at).toLocaleString()}
                                    </div>
                                    ${item.notes ? `<div style="color: rgba(255,255,255,0.85); margin-top: 4px; font-size: 0.8rem;">${item.notes}</div>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            } else {
                container.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-secondary);">No audit events recorded yet.</div>';
            }
        } catch (err) {
            container.innerHTML = '<div style="font-size: 0.8rem; color: var(--red);">Unable to load history at this time.</div>';
        }
    };

    // ?? V2 ACTION HANDLERS
    window.handleComplaintAction = async (id, status, reason = '') => {
        try {
            const res = await fetch(`${API_BASE}/api/complaints/${id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, reason }),
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                showToast(`Complaint ${status} successfully`, 'success');
                fetchComplaints();
            } else {
                showToast(data.message, 'error');
            }
        } catch (err) {
            showToast('Action failed', 'error');
        }
    };

    window.promptReopen = (id) => {
        const reason = prompt("Please provide a detailed reason for reopening (min 10 characters):");
        if (reason && reason.length >= 10) {
            handleComplaintAction(id, 'REOPENED', reason);
        } else if (reason) {
            showToast("Reason is too short", "error");
        }
    };

});

async function logout() {
    try {
        await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (_) {}
    localStorage.removeItem('scrs_token');
    localStorage.removeItem('scrs_user');
    window.location.href = 'login.html';
}
