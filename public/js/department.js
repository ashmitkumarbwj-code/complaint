/**
 * public/js/department.js
 */

let allComplaints = [];

document.addEventListener("DOMContentLoaded", async () => {
    // 🛡️ SECURITY HARDENING: Immediate Server-Side Session Validation
    const userProfile = await window.validateSession(['staff', 'hod']);
    if (!userProfile) return;

    // Sync localStorage for UI consistency, but server is the source of truth
    const user = JSON.parse(localStorage.getItem('scrs_user')) || userProfile;

    // Set UI Details
    document.getElementById('header-dept').textContent = `${user.department_name || 'Department'} Dashboard`;
    document.getElementById('header-welcome').textContent = `Welcome, ${user.username} (${user.role})`;

    // Populate profile photo
    const profileImgContainer = document.getElementById('dept-profile-img');
    if (profileImgContainer) {
        profileImgContainer.innerHTML = MediaUtils.renderProfilePhoto(user.profile_image, user.username, 'md');
    }

    // Initialize Socket
    const socket = io(API_BASE);
    socket.emit('join', `dept_${user.department_id}`);
    
    socket.on('new_complaint', () => {
        fetchDashboardData();
    });

    socket.on('complaint_updated', () => {
        fetchDashboardData();
    });

    // Initial Load
    fetchDashboardData();

    // Search Interaction
    document.getElementById('complaint-search').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allComplaints.filter(c => 
            c.id.toString().includes(term) || 
            (c.student_name && c.student_name.toLowerCase().includes(term)) ||
            (c.category && c.category.toLowerCase().includes(term))
        );
        renderComplaints(filtered);
    });
});

async function fetchDashboardData() {
    const user = JSON.parse(localStorage.getItem('scrs_user'));
    
    if (!user || !user.department_id || user.department_id === 'undefined') {
        console.error('[Dept] Missing department identity. Aborting fetch.');
        return;
    }

    try {
        // Fetch Stats
        const statsRes = await fetch(`${API_BASE}/api/dashboards/authority/stats/${user.department_id}`, {
            credentials: 'include' // ← httpOnly cookie auth
        });
        if (!statsRes.ok) { console.error('[Dept] Stats fetch failed:', statsRes.status); return; }
        const statsData = await statsRes.json();
        if (statsData.success) updateStatsUI(statsData.stats);

        // Fetch Complaints
        const compRes = await fetch(`${API_BASE}/api/dashboards/authority/complaints/${user.department_id}`, {
            credentials: 'include'
        });
        if (!compRes.ok) { console.error('[Dept] Complaints fetch failed:', compRes.status); return; }
        const compData = await compRes.json();
        if (compData.success) {
            allComplaints = compData.complaints;
            renderComplaints(allComplaints);
        }
    } catch (err) {
        console.error('[Dept] Error fetching dashboard data:', err);
    }
}

function updateStatsUI(stats) {
    document.getElementById('stat-total').textContent = stats.total_complaints || 0;
    document.getElementById('stat-pending').textContent = stats.pending || 0;
    document.getElementById('stat-progress').textContent = stats.in_progress || 0;
    document.getElementById('stat-resolved').textContent = stats.resolved || 0; // field is 'resolved', not 'resolved_today'
}

function renderComplaints(complaints) {
    const tbody = document.getElementById('complaints-tbody');
    const urgentSection = document.getElementById('urgent-section');
    const urgentList = document.getElementById('urgent-list');
    
    // Level Up: Find urgent complaints for the elite strip
    const urgentComplaints = complaints.filter(c => String(c.priority).toLowerCase() === 'high' || String(c.priority).toLowerCase() === 'urgent');

    if (complaints.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-5 text-secondary">No complaints found.</td></tr>';
        urgentSection.style.display = 'none';
        return;
    }

    // Level Up: Render Elite Pulsing Urgent Strip
    if (urgentComplaints.length > 0) {
        const stripId = 'urgent-pulse-strip';
        let existingStrip = document.getElementById(stripId);
        if (!existingStrip) {
            existingStrip = document.createElement('div');
            existingStrip.id = stripId;
            existingStrip.className = 'urgent-strip';
            urgentSection.parentNode.insertBefore(existingStrip, urgentSection);
        }
        existingStrip.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px;">
                <div style="background: #ff4444; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px rgba(255,68,68,0.5);">
                    <i class="fas fa-exclamation-triangle" style="color: white; font-size: 1.2rem;"></i>
                </div>
                <div>
                    <div style="font-weight: 800; color: #ff4444; font-size: 1.1rem; letter-spacing: 0.5px;">CRITICAL INTERVENTION REQUIRED</div>
                    <div style="font-size: 0.85rem; color: rgba(255,255,255,0.7); font-weight: 500;">There are ${urgentComplaints.length} high-priority complaints requiring immediate attention.</div>
                </div>
            </div>
            <button class="btn btn-sm btn-danger" style="border-radius: 20px; padding: 5px 15px; font-weight: 700; background: #ff4444; border:none; box-shadow: 0 4px 10px rgba(255,68,68,0.3);">
                TAKE ACTION <i class="fas fa-arrow-right ml-1"></i>
            </button>
        `;
        existingStrip.onclick = () => {
            document.getElementById('complaint-search').value = 'High';
            document.getElementById('complaint-search').dispatchEvent(new Event('input'));
            window.scrollTo({ top: tbody.offsetTop - 100, behavior: 'smooth' });
        };
    } else {
        const strip = document.getElementById('urgent-pulse-strip');
        if (strip) strip.remove();
    }

    // Handle Complaints Table
    tbody.innerHTML = complaints.map(c => `
        <tr>
            <td><span class="text-primary font-bold">#${c.id}</span></td>
            <td style="font-weight:600; color:var(--primary-color);">${c.title || 'Untitled'}</td>
            <td>${c.student_name || 'Anonymous'}</td>
            <td>${c.category}</td>
            <td><span class="badge ${c.priority === 'High' ? 'badge-high' : ''}">${c.priority}</span></td>
            <td><span class="badge badge-${c.status.toLowerCase().replace(' ', '')}">${c.status}</span></td>
            <td class="text-secondary">${timeSince(new Date(c.created_at))} ago</td>
            <td><button class="btn btn-glass btn-sm" onclick='viewDetails(${JSON.stringify(c)})'>View</button></td>
        </tr>
    `).join('');

    // Handle Urgent Alerts
    const urgent = complaints.filter(c => c.priority === 'High' && c.status !== 'Resolved');
    if (urgent.length > 0) {
        urgentSection.style.display = 'block';
        urgentList.innerHTML = urgent.slice(0, 3).map(u => `
            <div class="urgent-item">
                <span><strong>#${u.id}</strong> - ${u.category} by ${u.student_name}</span>
                <button class="btn btn-sm btn-primary" onclick='viewDetails(${JSON.stringify(u)})'>Take Action</button>
            </div>
        `).join('');
    } else {
        urgentSection.style.display = 'none';
    }
}

function viewDetails(c) {
    const modal = document.getElementById('detailsModal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const actions = document.getElementById('modal-actions');

    title.textContent = `#${c.id} ${c.title || c.category}`;
    const isVideo = c.media_url && (c.media_url.endsWith('.mp4') || c.media_url.endsWith('.mov') || c.media_url.includes('/video/upload/'));

    const timelineHtml = renderWorkflowTimeline(c.status);
    
    body.innerHTML = `
        <div class="mb-3"><strong>Student:</strong> ${c.student_name} (${c.roll_number || 'N/A'})</div>
        ${timelineHtml}
        <div class="complaint-info-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 20px;">
            <div><strong>Category:</strong> ${c.category}</div>
            <div><strong>Location:</strong> ${c.location}</div>
            <div style="grid-column: span 2"><strong>Description:</strong><br><p class="mt-1">${c.description}</p></div>
        </div>
        ${c.media_url ? `
            <div class="mb-3">
                <strong>Attachment:</strong><br>
                ${MediaUtils.render(c.media_url)}
            </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 10px 15px; border-radius: 8px;">
            <div style="font-size: 0.8rem; opacity: 0.7;">Submitted ${new Date(c.created_at).toLocaleString()}</div>
            <div><span class="badge badge-${c.status.toLowerCase().replace(' ', '')}">${c.status}</span></div>
        </div>
    `;

    const user = JSON.parse(localStorage.getItem('scrs_user'));
    actions.innerHTML = `
        <div class="modal-action-footer">
            <div class="decision-moment-title">
                <i class="fas fa-gavel"></i> Take Formal Action
            </div>
            <div class="mb-3">
                <label style="font-size: 0.85rem; font-weight: 600; color: rgba(255,255,255,0.5); display: block; margin-bottom: 8px;">Action Remark / Internal Notes</label>
                <textarea id="admin-notes" placeholder="Describe the action taken or reason for assignment..." class="form-control" style="width: 100%; min-height: 100px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: white; border-radius: 8px;"></textarea>
            </div>
            <div id="action-buttons-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                <!-- Buttons injected dynamically -->
            </div>
        </div>
    `;

    renderWorkflowActions(c, user);
    window.showModal('detailsModal');
}

/**
 * Visual Timeline Renderer
 */
function renderWorkflowTimeline(currentStatus) {
    const statuses = [
        { key: 'SUBMITTED', label: 'Submitted' },
        { key: 'FORWARDED', label: 'Forwarded' },
        { key: 'HOD_VERIFIED', label: 'Verified' },
        { key: 'IN_PROGRESS', label: 'Working' },
        { key: 'STAFF_RESOLVED', label: 'Resolved' },
        { key: 'HOD_APPROVED', label: 'Approved' },
        { key: 'CLOSED', label: 'Closed' }
    ];

    const s = String(currentStatus).toUpperCase();
    let currentIndex = statuses.findIndex(st => st.key === s);
    if (currentIndex === -1) currentIndex = 0;

    return `
        <div class="workflow-timeline">
            ${statuses.map((st, i) => {
                let stateClass = '';
                if (i < currentIndex) stateClass = 'completed';
                else if (i === currentIndex) stateClass = 'active';
                
                let icon = i + 1;
                if (stateClass === 'completed') icon = '<i class="fas fa-check"></i>';
                if (st.key === 'CLOSED' && stateClass === 'active') icon = '<i class="fas fa-lock"></i>';

                return `
                    <div class="timeline-step ${stateClass}">
                        <div class="step-icon">${icon}</div>
                        <div class="step-label">${st.label}</div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

/**
 * Phase 2: Action Button Renderer
 */
function renderWorkflowActions(c, user) {
    const btnGrid = document.getElementById('action-buttons-grid');
    const role = String(user.role).toLowerCase().trim();
    const status = String(c.status).toUpperCase().trim();
    const isV2 = c.workflow_version === 2 || c.is_v2_compliant;

    btnGrid.innerHTML = ''; 

    if (status === 'CLOSED') {
        btnGrid.innerHTML = `<div class="alert alert-success w-100 text-center" style="grid-column: span 2; background: rgba(68, 255, 68, 0.1); border-color: rgba(68, 255, 68, 0.2); color: #44ff44;"><i class="fas fa-check-circle"></i> This complaint has been officially closed.</div>`;
        return;
    }

    if (isV2) {
        if (role === 'hod') {
            if (status === 'FORWARDED' || status === 'REOPENED') {
                btnGrid.innerHTML = `
                    <div style="grid-column: span 2; margin-bottom: 0.5rem; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px;">
                        <label style="font-size: 0.75rem; color: var(--gold); font-weight: 700; display:block; margin-bottom:6px; text-transform: uppercase;">Assign to Specialist:</label>
                        <select id="target-staff-id" class="form-control" style="width:100%; background: #000; color: white; border-color: rgba(255,255,255,0.1); border-radius: 6px;"></select>
                    </div>
                    <button class="btn btn-primary btn-lg" style="font-weight: 700; letter-spacing: 1px;" onclick="executeV2Action(${c.id}, 'HOD_VERIFIED')">
                        <i class="fas fa-check-circle"></i> VERIFY & ASSIGN
                    </button>
                    <button class="btn btn-outline-danger" onclick="executeV2Action(${c.id}, 'RETURNED_TO_ADMIN')">
                        <i class="fas fa-arrow-left"></i> RETURN TO ADMIN
                    </button>
                `;
                loadStaffList(c.department_id);
            } else if (status === 'STAFF_RESOLVED') {
                btnGrid.innerHTML = `
                    <button class="btn btn-success btn-lg" style="font-weight: 700; letter-spacing: 1px;" onclick="executeV2Action(${c.id}, 'HOD_APPROVED')">
                        <i class="fas fa-thumbs-up"></i> APPROVE SOLUTION
                    </button>
                    <button class="btn btn-warning" onclick="executeV2Action(${c.id}, 'HOD_REWORK_REQUIRED')">
                        <i class="fas fa-redo"></i> REJECT & REWORK
                    </button>
                `;
            } else if (status === 'HOD_APPROVED') {
                btnGrid.innerHTML = `
                    <button class="btn btn-danger btn-lg" style="grid-column: span 2; font-weight: 700; letter-spacing: 1px;" onclick="executeV2Action(${c.id}, 'CLOSED')">
                        <i class="fas fa-lock"></i> FINAL RESOLUTION & CLOSE
                    </button>
                `;
            }
        } else if (role === 'staff') {
            if (status === 'HOD_VERIFIED' || status === 'HOD_REWORK_REQUIRED') {
                btnGrid.innerHTML = `
                    <button class="btn btn-primary btn-lg" style="grid-column: span 2; font-weight: 700; letter-spacing: 1px;" onclick="executeV2Action(${c.id}, 'IN_PROGRESS')">
                        <i class="fas fa-play"></i> START WORKING
                    </button>
                `;
            } else if (status === 'IN_PROGRESS') {
                btnGrid.innerHTML = `
                    <button class="btn btn-success btn-lg" style="grid-column: span 2; font-weight: 700; letter-spacing: 1px;" onclick="executeV2Action(${c.id}, 'STAFF_RESOLVED')">
                        <i class="fas fa-check-double"></i> MARK AS RESOLVED
                    </button>
                `;
            }
        }
    } else {
        // V1 Compatibility
        if (status === 'PENDING') {
            btnGrid.innerHTML = `<button class="btn btn-primary btn-lg" onclick="updateComplaintStatus(${c.id}, 'In Progress')">INVESTIGATE</button>`;
        }
        if (status === 'PENDING' || status === 'IN_PROGRESS') {
            btnGrid.innerHTML += `
                <button class="btn btn-success" onclick="updateComplaintStatus(${c.id}, 'Resolved')">RESOLVE</button>
                <button class="btn btn-danger" onclick="updateComplaintStatus(${c.id}, 'Rejected')">REJECT</button>
            `;
        }
    }
}

async function loadStaffList(deptId) {
    const select = document.getElementById('target-staff-id');
    try {
        const res = await fetch(`${API_BASE}/api/dashboards/authority/staff-members/${deptId}`, { credentials: 'include' });
        const data = await res.json();
        if (data.success) {
            select.innerHTML = data.staff.map(s => `<option value="${s.id}">${s.username} (${s.role})</option>`).join('');
        }
    } catch (err) { console.error('Staff load failed'); }
}

async function executeV2Action(id, status) {
    const reason = document.getElementById('admin-notes').value;
    const targetStaffId = document.getElementById('target-staff-id')?.value;
    
    try {
        const res = await fetch(`${API_BASE}/api/complaints/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status, reason, targetStaffId })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Action ${status} successful`, 'success');
            closeModal();
            fetchDashboardData();
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) { showToast('Action failed', 'error'); }
}


async function updateComplaintStatus(id, newStatus) {
    const notes = document.getElementById('admin-notes').value;
    const btn = event ? event.target : null;
    const origHtml = btn ? btn.innerHTML : '';
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    }

    try {
        const res = await fetch(`${API_BASE}/api/complaints/status/${id}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus, admin_notes: notes })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Complaint #${id} marked as ${newStatus}`, 'success');
            closeModal();
            fetchDashboardData();
        } else {
            showToast(data.message || 'Update failed', 'error');
        }
    } catch (err) {
        showToast('Failed to update status', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }
}

function closeModal() {
    window.closeModal('detailsModal');
}

function timeSince(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes";
    return Math.floor(seconds) + " seconds";
}

async function logout() {
    try {
        await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (_) {}
    localStorage.removeItem('scrs_token');
    localStorage.removeItem('scrs_user');
    window.location.href = 'login.html';
}

// Close modal on click outside
window.onclick = function(event) {
    const modal = document.getElementById('detailsModal');
    if (event.target == modal) closeModal();
}
