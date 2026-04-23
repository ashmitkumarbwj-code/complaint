document.addEventListener("DOMContentLoaded", async () => {
    // 🛡️ SECURITY HARDENING: Immediate Server-Side Session Validation
    const userProfile = await window.validateSession('student');
    if (!userProfile) return;

    // Sync localStorage for UI consistency, but server is the source of truth
    const user = JSON.parse(localStorage.getItem('scrs_user')) || userProfile;

    document.getElementById('welcome-text').textContent = `Hello, ${user.username}!`;

    const complaintForm = document.getElementById('complaint-form');
    const complaintList = document.getElementById('complaint-list');

    // Handle Submission
    complaintForm.addEventListener("submit", async (e) => {
        e.preventDefault();

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
        if (fileInput.files[0]) {
            formData.append("image", fileInput.files[0]); // ⚠️ name must match backend
        }

        try {
            const res = await fetch(`${API_BASE}/api/complaints`, {
                method: "POST",
                body: formData,
                credentials: "include" // 🔥 MUST
            });

            const data = await res.json();
            console.log("Response:", data);

            if (res.ok && data.success) {
                showToast("Complaint submitted ✅", "success");
                complaintForm.reset();
                fetchComplaints();
            } else {
                showToast(data.message || "Failed ❌", "error");
            }

        } catch (err) {
            console.error(err);
            showToast("Server error ❌", "error");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origHtml;
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
        if (!user || !user.student_id || user.student_id === 'undefined') {
            console.error('[Student] Missing student identity. Aborting fetch.');
            complaintList.innerHTML = '<div class="error-msg">Unable to load reports. Profile incomplete.</div>';
            return;
        }

        try {
            // Skeleton loader for student list
            complaintList.innerHTML = `
                <div class="skeleton-card" style="height: 150px; border-radius: 12px; margin-bottom: 1.5rem;"></div>
                <div class="skeleton-card" style="height: 150px; border-radius: 12px; opacity: 0.6; margin-bottom: 1.5rem;"></div>
            `;

            const response = await fetch(`${API_BASE}/api/complaints/student/${user.student_id}`, {
                credentials: 'include' // ← httpOnly cookie auth
            });
            if (!response.ok) { 
                console.error('[Student] fetchComplaints failed:', response.status); 
                showToast('Failed to load your reports.', 'error');
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

    function renderComplaints(complaints) {
        if (complaints.length === 0) {
            complaintList.innerHTML = '<p class="text-center" style="color: var(--text-secondary); padding: 2rem;">No reports yet.</p>';
            return;
        }

        complaintList.innerHTML = complaints.map(c => {
            const isVideo = c.media_url && (c.media_url.endsWith('.mp4') || c.media_url.endsWith('.mov') || c.media_url.includes('/video/upload/'));
            
            return `
            <div class="complaint-card glass-panel" style="margin-bottom: 1.5rem; padding: 1.5rem; border-left: 4px solid var(--gold);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                    <div>
                        <span class="status-badge status-${c.status.toLowerCase().replace(' ', '')}" style="font-weight: 800;">${c.status}</span>
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
                
                <p style="font-size: 0.95rem; color: rgba(255,255,255,0.8); line-height: 1.6; margin-bottom: 1.5rem;">${c.description}</p>
                
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
                
                ${c.status === 'HOD_APPROVED' ? `
                    <div style="margin-top: 1.5rem; display: flex; gap: 1rem;">
                        <button onclick="handleComplaintAction(${c.id}, 'CLOSED')" class="btn-primary" style="flex: 1; font-weight: 800; background: var(--success); color: white;">
                            <i class="fa-solid fa-check-double"></i> Confirm & Close
                        </button>
                        <button onclick="promptReopen(${c.id})" class="btn-secondary" style="flex: 1; font-weight: 800; border-color: var(--red); color: var(--red);">
                            <i class="fa-solid fa-rotate-left"></i> Reopen
                        </button>
                    </div>
                ` : ''}
                
                <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.05); font-size: 0.8rem; color: var(--text-secondary); display: flex; justify-content: space-between; align-items: center;">
                    <span><i class="fa-solid fa-building"></i> Assigned: <strong>${c.department_name}</strong></span>
                    <span style="font-family: monospace; opacity: 0.5;">ID: #${c.id}</span>
                </div>
            </div>
        `}).join('');
    }

    // 🔥 V2 ACTION HANDLERS
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
