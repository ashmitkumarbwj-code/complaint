/**
 * public/js/department.js
 */

let allComplaints = [];

document.addEventListener("DOMContentLoaded", async () => {
    // 🛡️ SECURITY HARDENING: Immediate Server-Side Session Validation
    const userProfile = await window.validateSession(['Staff', 'HOD']);
    if (!userProfile) return;

    // Sync localStorage for UI consistency, but server is the source of truth
    const user = JSON.parse(localStorage.getItem('scrs_user')) || userProfile;

    // Set UI Details
    document.getElementById('header-dept').textContent = `${user.department_name || 'Department'} Dashboard`;
    document.getElementById('header-welcome').textContent = `Welcome, ${user.username} (${user.role})`;

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

    if (complaints.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-5 text-secondary">No complaints found.</td></tr>';
        urgentSection.style.display = 'none';
        return;
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

    body.innerHTML = `
        <div class="mb-3"><strong>Student:</strong> ${c.student_name} (${c.roll_number || 'N/A'})</div>
        <div class="mb-3"><strong>Location:</strong> ${c.location}</div>
        <div class="mb-3"><strong>Category:</strong> ${c.category}</div>
        <div class="mb-3"><strong>Description:</strong><br>${c.description}</div>
        ${c.media_url ? `
            <div class="mb-3">
                <strong>Attachment:</strong><br>
                ${MediaUtils.render(c.media_url)}
            </div>
        ` : ''}

        <div class="mb-3"><strong>Submitted:</strong> ${new Date(c.created_at).toLocaleString()}</div>
        <div><strong>Current Status:</strong> <span class="badge badge-${c.status.toLowerCase().replace(' ', '')}">${c.status}</span></div>
    `;

    actions.innerHTML = `
        <textarea id="admin-notes" placeholder="Enter remarks/notes here..." class="form-control mb-3" style="width: 100%;">${c.admin_notes || ''}</textarea>
        <div class="d-flex gap-2" style="width:100%">
            ${c.status === 'Pending' ? `<button class="btn btn-primary flex-1" onclick="updateComplaintStatus(${c.id}, 'In Progress')">Start Investigation</button>` : ''}
            ${(c.status === 'Pending' || c.status === 'In Progress') ? `
                <button class="btn btn-glass flex-1" style="background:#2ed573; border:none; color:white;" onclick="updateComplaintStatus(${c.id}, 'Resolved')">Resolve</button>
                <button class="btn btn-glass flex-1" style="background:#ff4757; border:none; color:white;" onclick="updateComplaintStatus(${c.id}, 'Rejected')">Reject</button>
            ` : ''}
        </div>
    `;

    window.showModal('detailsModal');
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
            headers: { 'Content-Type': 'application/json' , credentials: 'include' },
            credentials: 'include', // ← httpOnly cookie auth
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
