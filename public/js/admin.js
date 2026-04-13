/**
 * Admin Dashboard - Smart Campus Response System
 * Govt. College Dharamshala
 */

document.addEventListener("DOMContentLoaded", async () => {
    // 🛡️ SECURITY HARDENING: Immediate Server-Side Session Validation
    // This allows both Admin and Principal roles since both use this dashboard logic
    const userProfile = await window.validateSession(['Admin', 'Principal']);
    if (!userProfile) return; // Exit if validation fails (handled by redirect)

    // Sync localStorage for UI consistency, but server is the source of truth
    const user = JSON.parse(localStorage.getItem('scrs_user')) || userProfile;

    // 1.1 Populate SaaS Sidebar Profile
    if (user) {
        document.getElementById('user-display-name').textContent = user.name || 'Admin';
        document.getElementById('user-display-role').textContent = user.role;
        document.getElementById('user-avatar-initial').textContent = (user.name || 'A')[0].toUpperCase();
        document.getElementById('welcome-user-name').textContent = user.name || 'Admin';

        // Role-based Navigation Guard
        if (user.role !== 'Principal') {
            const principalOnlyTabs = ['tab-staff', 'tab-students'];
            document.querySelectorAll('.nav-item').forEach(item => {
                if (principalOnlyTabs.includes(item.dataset.tab)) {
                    item.style.display = 'none';
                }
            });
        }
    }

    // 2. Initialize Three.js Background
    initThreeJSBackground();

    // 3. Initialize Socket.io
    const socket = io(API_BASE);
    socket.emit('join', 'admin');

    // 3.1 Initialize Live Incident Map
    window.incidentMap = null;
    window.heatLayer = null;
    window.markerLayer = null;

    function initHeatmap() {
        if (!document.getElementById('map')) return;
        window.incidentMap = L.map('map').setView([31.1048, 77.1734], 16);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap © CARTO'
        }).addTo(window.incidentMap);
        window.markerLayer = L.layerGroup().addTo(window.incidentMap);
    }
    initHeatmap();

    window.plotComplaintsOnMap = function(complaints) {
        if (!window.incidentMap) return;
        
        // Clear previous layers
        window.markerLayer.clearLayers();
        if (window.heatLayer) window.incidentMap.removeLayer(window.heatLayer);

        const locationMap = {
            "Main Hall": [31.1048, 77.1734],
            "Lab": [31.1055, 77.1742],
            "Hostel": [31.1060, 77.1750],
            "Library": [31.1050, 77.1740],
            "Cafeteria": [31.1040, 77.1720]
        };

        const heatPoints = [];

        complaints.forEach((c, idx) => {
            // Fuzzy location matching for hackathon demo
            let locString = (c.location || "").toLowerCase();
            let coords = null;
            if (locString.includes('hall')) coords = locationMap["Main Hall"];
            else if (locString.includes('lab')) coords = locationMap["Lab"];
            else if (locString.includes('hostel') || locString.includes('room')) coords = locationMap["Hostel"];
            else if (locString.includes('library')) coords = locationMap["Library"];
            else if (locString.includes('cafe') || locString.includes('mess')) coords = locationMap["Cafeteria"];
            else {
                // Generate a slight random offset around central campus for unknown locations
                coords = [31.1048 + (Math.random() - 0.5) * 0.003, 77.1734 + (Math.random() - 0.5) * 0.003];
            }

            const color = c.priority === 'Emergency' ? '#ef4444' : c.priority === 'High' ? '#f59e0b' : '#3b82f6';
            
            L.circleMarker(coords, {
                radius: 8,
                color: color,
                fillColor: color,
                fillOpacity: 0.8,
                weight: 1
            })
            .bindPopup(`<b style="color:#000;">${c.title || c.category}</b><br><span style="color:#444;">${c.location}</span><br><span style="color:${color};font-weight:bold;">${c.priority}</span>`)
            .addTo(window.markerLayer);

            heatPoints.push([coords[0], coords[1], c.priority === 'Emergency' ? 1.0 : 0.5]);
        });

        if (typeof L.heatLayer !== 'undefined') {
            window.heatLayer = L.heatLayer(heatPoints, { radius: 25, blur: 15, maxZoom: 16 }).addTo(window.incidentMap);
        }
    };

    // Live Activity Feed Log Array
    window.activityQueue = [];
    
    function logActivity(text, type = 'new', time = 'Just now') {
        const feed = document.getElementById('activity-feed');
        if (!feed) return;
        
        let iconHtml = '<i class="fa-solid fa-file-circle-plus"></i>';
        if (type === 'resolved') iconHtml = '<i class="fa-solid fa-check"></i>';
        if (type === 'assigned') iconHtml = '<i class="fa-solid fa-share"></i>';
        if (type === 'emergency') iconHtml = '<i class="fa-solid fa-triangle-exclamation"></i>';

        const rawHtml = `
            <div class="feed-item">
                <div class="feed-icon ${type}">${iconHtml}</div>
                <div class="feed-content">
                    <p>${text}</p>
                    <small>${time}</small>
                </div>
            </div>
        `;
        
        // Remove empty state
        if (feed.innerHTML.includes('Listening for campus events')) feed.innerHTML = '';
        
        feed.insertAdjacentHTML('afterbegin', rawHtml);
        
        // Keep only top 10 items
        if (feed.children.length > 10) {
            feed.removeChild(feed.lastElementChild);
        }
    }

    socket.on('new_complaint', (data) => {
        const isEmg = data.priority === 'Emergency' || data.priority === 'High';
        showToast('New dynamic alert from AI engine.', isEmg ? 'error' : 'info');
        logActivity(`New ${isEmg ? '<b>Emergency</b>' : 'complaint'} logged: ${data.category}`, isEmg ? 'emergency' : 'new', new Date().toLocaleTimeString());
        
        // LIVE Update Map
        if (window.plotComplaintsOnMap && window.lastFetchedComplaints) {
            window.lastFetchedComplaints.unshift(data);
            window.plotComplaintsOnMap(window.lastFetchedComplaints);
            showToast("🔥 Spatial map live updated", "info");
        }

        fetchStats();
        fetchComplaints();
    });

    socket.on('status_updated', (data) => {
        logActivity(`Action triggered: Status updated directly in system.`, 'resolved', new Date().toLocaleTimeString());
        fetchStats();
        fetchComplaints();
    });

    // 4. Initial Fetches
    fetchStats();
    loadDashboardAnalytics(); // New analytics suite
    fetchComplaints();
    fetchStaff();
    fetchStudents();
    loadDepartments();
    fetchDeptManagement();
    loadGallery();

    // 4.1 SaaS Navigation Logic
    const navItems = document.querySelectorAll('.nav-item');
    const tabs = document.querySelectorAll('.admin-tab-content');
    const sectionTitle = document.getElementById('current-section-title');
    const sectionSubtitle = document.getElementById('current-section-subtitle');

    const meta = {
        'tab-dashboard': { title: 'Dashboard Overview', sub: 'Real-time campus pulse' },
        'tab-complaints': { title: 'Complaints Management', sub: 'Live resolution stream' },
        'tab-departments': { title: 'Academic Departments', sub: 'Routing and structure' },
        'tab-staff': { title: 'Faculty & Administration', sub: 'Staff permissions and roles' },
        'tab-students': { title: 'Student Registry', sub: 'Identity and credentials' },
        'tab-gallery': { title: 'Homepage Gallery', sub: 'Public slider control' }
    };

    function switchTab(tabId) {
        // Update Sidebar UI
        navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.tab === tabId);
        });

        // Update Content UI
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.id === tabId);
        });

        // Update Header
        if (meta[tabId]) {
            sectionTitle.textContent = meta[tabId].title;
            sectionSubtitle.textContent = meta[tabId].sub;
        }

        // Trigger fetches on tab switch for live data
        if (tabId === 'tab-dashboard') loadDashboardAnalytics();
        if (tabId === 'tab-departments') fetchDeptManagement();
        if (tabId === 'tab-complaints') fetchComplaints();
        if (tabId === 'tab-gallery') loadGallery();
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.tab));
    });

    // 5. Global Functions
    window.logout = async () => {
        try {
            await fetch(`${API_BASE}/api/auth/logout`, { 
                method: 'POST',
                credentials: 'include' 
            });
        } catch (err) {
            console.error('Logout request failed:', err);
        }
        localStorage.removeItem('scrs_user');
        window.location.href = 'login.html';
    };

    window.toggleStaffForm = () => {
        const container = document.getElementById('staff-form-container');
        container.style.display = container.style.display === 'none' ? 'block' : 'none';
    };

    window.toggleStudentForm = () => {
        const container = document.getElementById('student-form-container');
        container.style.display = container.style.display === 'none' ? 'block' : 'none';
    };

    window.viewID = (url) => {
        const modal = document.getElementById('idModal');
        const img = document.getElementById('modalImg');
        if (img) img.src = url;
        window.showModal('idModal');
    };

    // 5.1 Gallery Cropping Logic
    let cropper = null;
    let selectedFile = null;

    window.closeCropModal = () => {
        window.closeModal('cropModal');
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        document.getElementById('gallery-file').value = '';
    };

    // 6. Complaint Status Update Logic
    let currentAction = null;

    window.updateStatus = (id, status) => {
        currentAction = { id, status };
        showConfirmModal(
            `Confirm ${status}`,
            `Are you sure you want to mark complaint #${id} as <b>${status.toLowerCase()}</b>?`,
            () => executeStatusUpdate()
        );
    };

    async function executeStatusUpdate() {
        if (!currentAction) return;
        const { id, status } = currentAction;
        
        // Show loading state on specific buttons if possible, or global spinner
        const btnResolve = document.querySelector(`button[onclick*="updateStatus(${id}, 'Resolved')"]`);
        const btnReject = document.querySelector(`button[onclick*="updateStatus(${id}, 'Rejected')"]`);
        
        if (btnResolve) btnResolve.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        if (btnReject) btnReject.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        
        try {
            const res = await fetch(`${API_BASE}/api/admin/complaints/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' , credentials: 'include' },
                credentials: 'include',
                body: JSON.stringify({ status: status.toLowerCase() })
            });

            const data = await res.json();
            if (data.success) {
                showToast(`Complaint #${id} ${status.toLowerCase()} successfully!`, 'success');
                fetchStats();
                fetchComplaints();
            } else {
                showToast(data.message || 'Update failed', 'error');
            }
        } catch (err) {
            showToast('Network error. Please try again.', 'error');
        } finally {
            closeConfirmModal();
            currentAction = null;
        }
    }

    // 7. Modal & Toast Utilities
    window.showConfirmModal = (title, message, onConfirm) => {
        document.getElementById('confirmTitle').innerText = title;
        document.getElementById('confirmMessage').innerHTML = message;
        window.showModal('confirmModal');
        document.getElementById('confirmActionBtn').onclick = onConfirm;
    };

    window.closeConfirmModal = () => {
        window.closeModal('confirmModal');
    };

    // Removed embedded showToast

    // 8.1 Premium Analytics Engine
    let dashboardCharts = {
        trends: null,
        status: null,
        dept: null
    };

    window.loadDashboardAnalytics = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/dashboards/stats`, { credentials: 'include' });
            const data = await res.json();
            
            if (data.success) {
                renderTrendsChart(data.dailyTrends);
                renderStatusPieChart(data.statusDistribution);
                renderDeptBarChart(data.departmentStats);
                
                // Also update the summary count cards
                animateNumber('stat-total', data.summary.total);
                animateNumber('stat-pending', data.summary.pending);
                animateNumber('stat-resolved', data.summary.resolved);
                
                if (document.getElementById('stat-students')) {
                    animateNumber('stat-students', data.summary.active_students);
                }
            }
        } catch (err) {
            console.error('Analytics fetch failed:', err);
        }
    };

    function renderTrendsChart(trends) {
        const ctx = document.getElementById('trendsChart').getContext('2d');
        if (dashboardCharts.trends) dashboardCharts.trends.destroy();

        // Target Hackathon Requirement: "Default to last 7 days"
        // We slice the 30-day backend payload to just the last 7 days here.
        const recentTrends = trends.length > 7 ? trends.slice(-7) : trends;

        dashboardCharts.trends = new Chart(ctx, {
            type: 'line',
            data: {
                labels: recentTrends.map(t => new Date(t.date).toLocaleDateString(undefined, {weekday:'short', day:'numeric'})),
                datasets: [{
                    label: 'Complaints',
                    data: recentTrends.map(t => t.count),
                    borderColor: '#d4af37',
                    backgroundColor: 'rgba(212, 175, 55, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#d4af37',
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#adb5bd' } },
                    x: { grid: { display: false }, ticks: { color: '#adb5bd' } }
                }
            }
        });
    }

    function renderStatusPieChart(distribution) {
        const ctx = document.getElementById('statusPieChart').getContext('2d');
        if (dashboardCharts.status) dashboardCharts.status.destroy();

        dashboardCharts.status = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: distribution.map(d => d.status),
                datasets: [{
                    data: distribution.map(d => d.count),
                    backgroundColor: ['#f59e0b', '#3b82f6', '#10b981', '#ef4444'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#adb5bd', padding: 20, font: { size: 10 } } }
                },
                cutout: '70%'
            }
        });
    }

    function renderDeptBarChart(stats) {
        const ctx = document.getElementById('deptBarChart').getContext('2d');
        if (dashboardCharts.dept) dashboardCharts.dept.destroy();

        dashboardCharts.dept = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: stats.map(s => s.name.split(' ')[0]), // Shorten names
                datasets: [{
                    label: 'Complaints',
                    data: stats.map(s => s.count),
                    backgroundColor: 'rgba(58, 134, 255, 0.6)',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#adb5bd' } },
                    x: { grid: { display: false }, ticks: { color: '#adb5bd' } }
                }
            }
        });
    }

    // 8. Fetch Stats — wrapper kept alive for socket listeners + status update handlers
    async function fetchStats() {
        try {
            const statsRes = await fetch(`${API_BASE}/api/stats/admin`, { credentials: 'include' });
            const stats = await statsRes.json();
            if (stats.success) {
                animateNumber('stat-total', stats.stats.total);
                animateNumber('stat-pending', stats.stats.pending);
                animateNumber('stat-resolved', stats.stats.resolved);
            }
        } catch (err) { console.error('[Stats]', err); }
    }

    function animateNumber(id, endValue) {
        const el = document.getElementById(id);
        const startValue = parseInt(el.textContent) || 0;
        const duration = 1000;
        let startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            el.textContent = Math.floor(progress * (endValue - startValue) + startValue);
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        }
        window.requestAnimationFrame(step);
    }

    window.currentCompPage = 1;
    let totalCompPages = 1;

    window.changeCompPage = (delta) => {
        const newPage = window.currentCompPage + delta;
        if (newPage >= 1 && newPage <= totalCompPages) {
            window.currentCompPage = newPage;
            fetchComplaints();
        }
    };

    async function fetchComplaints() {
        try {
            const status = document.getElementById('filter-status')?.value || '';
            const dept = document.getElementById('filter-dept')?.value || '';
            
            let url = `${API_BASE}/api/complaints/all?page=${window.currentCompPage}&limit=10`;
            if (status) url += `&status=${encodeURIComponent(status)}`;
            if (dept) url += `&department_id=${encodeURIComponent(dept)}`;
            
            // Skeleton Loader Polish
            document.getElementById('complaints-tbody').innerHTML = `<tr><td colspan="7" style="padding: 2rem;">
                <div class="skeleton-row"></div>
                <div class="skeleton-row" style="margin-top:10px; width:70%;"></div>
                <div class="skeleton-row" style="margin-top:10px; width:40%;"></div>
            </td></tr>`;

            const compRes = await fetch(url, { credentials: 'include' });
            if (!compRes.ok) { console.error('Complaints fetch failed:', compRes.status); return; }
            const compData = await compRes.json();
            if (compData.success) {
                window.lastFetchedComplaints = compData.complaints;
                if (window.plotComplaintsOnMap) window.plotComplaintsOnMap(compData.complaints);
                
                renderTable(compData.complaints);
                if (compData.pagination) {
                    totalCompPages = compData.pagination.totalPages || 1;
                    const info = document.getElementById('comp-page-info');
                    if (info) info.textContent = `Page ${window.currentCompPage} of ${totalCompPages}`;
                }
            }
        } catch (err) { console.error('[Complaints]', err); }
    }
    window.fetchComplaints = fetchComplaints; // expose to HTML onchange handlers

    function renderTable(complaints) {
        const tbody = document.getElementById('complaints-tbody');
        tbody.innerHTML = complaints.map(c => {
            const isVideo = c.media_url && (c.media_url.endsWith('.mp4') || c.media_url.endsWith('.mov') || c.media_url.includes('/video/upload/'));
            
            // Priority Visual Indicator (Smart Feature)
            const prioClass = c.priority === 'Emergency' ? 'spi-high' : c.priority === 'High' ? 'spi-medium' : 'spi-low';
            const aiBadge = ['Emergency', 'High'].includes(c.priority) ? `<span class="ai-badge" title="AI Priority Engine">⚡ AI Escalate</span>` : '';
            const rowClass = ['Emergency', 'High'].includes(c.priority) ? 'fade-in ai-glowing-row' : 'fade-in';

            return `
            <tr class="${rowClass}">
                <td>#${c.id}</td>
                <td style="font-weight: 700; color: var(--gold);">${c.title || 'Untitled'} ${aiBadge}
                    <div style="margin-top: 4px;"><span class="smart-priority-indicator ${prioClass}">${c.priority || 'Medium'}</span></div>
                </td>
                <td>${c.student_name || 'Student #' + c.student_id}</td>
                <td><span style="font-size:0.8rem; opacity:0.8;">${c.category} @ ${c.location}</span></td>
                <td><span class="status-badge status-${c.status.toLowerCase().replace(' ', '')}">${c.status}</span></td>
                <td style="text-align:center;">
                    ${c.media_url ? `
                        <button class="action-btn" style="background:rgba(212,175,55,0.1); color:var(--gold); border: 1px solid var(--gold);" onclick="viewComplaintMedia('${c.media_url}', '${c.title || 'Complaint Media'}')">
                            <i class="fa-solid ${isVideo ? 'fa-video' : 'fa-image'}"></i> View
                        </button>
                    ` : '<span style="opacity:0.3;">None</span>'}
                </td>
                <td style="display:flex; gap:0.4rem; flex-wrap:wrap;">
                    <button class="action-btn btn-resolve" ${c.status.toLowerCase() === 'resolved' ? 'disabled' : ''} onclick="updateStatus(${c.id}, 'Resolved')">
                        <i class="fa-solid fa-check-double"></i> Resolve
                    </button>
                    <button class="action-btn btn-reject" ${c.status.toLowerCase() === 'rejected' ? 'disabled' : ''} onclick="updateStatus(${c.id}, 'Rejected')">
                        <i class="fa-solid fa-ban"></i> Reject
                    </button>
                    <button class="action-btn" style="background:#54a0ff; color:white;" onclick="openForwardModal(${c.id})">
                        <i class="fa-solid fa-share-from-square"></i> Forward
                    </button>
                </td>
            </tr>
        `}).join('');
    }

    // New utility for seamless media viewing
    window.viewComplaintMedia = (url, title) => {
        const isVideo = url && (url.endsWith('.mp4') || url.endsWith('.mov') || url.includes('/video/upload/'));
        const modal = document.getElementById('idModal'); // Reuse ID Modal for general media
        const container = modal.querySelector('.modal-content') || modal;
        
        // Clear previous and set new content
        const modalBody = document.getElementById('modalImg').parentElement;
        modalBody.innerHTML = `
            <h3 style="margin-bottom: 2rem; color: var(--gold);">${title}</h3>
            ${MediaUtils.render(url)}
            <button class="btn btn-glass" style="margin-top: 1.5rem; width: 100%;" onclick="document.getElementById('idModal').style.display='none'">Close Preview</button>
        `;

        
        window.showModal('idModal');
    };

    // Additional fetch functions (Staff, Students, Departments, Gallery) reused from original
    // ... [Implementation for fetchStaff, fetchStudents, loadDepartments, loadGallery remains similar but cleaned up]
    // [I will compress these for the final output while ensuring they work]

    // ── Forward / Reassign Department ─────────────────────────────────────────
    let forwardTargetId = null;

    window.openForwardModal = (complaintId) => {
        forwardTargetId = complaintId;
        document.getElementById('forward-notes').value = '';

        // Populate department dropdown from cached departments (already loaded via loadDepartments)
        const deptSelect = document.getElementById('forward-dept-select');
        const staffDept = document.getElementById('staff-dept');
        // Re-use options from the staff form's dept dropdown (already populated)
        if (staffDept && staffDept.options.length > 0) {
            deptSelect.innerHTML = Array.from(staffDept.options)
                .filter(o => o.value !== '')
                .map(o => `<option value="${o.value}">${o.text}</option>`)
                .join('');
        } else {
            // Fallback: fetch directly if not yet populated
            fetch(`${API_BASE}/api/admin/departments`, { credentials: 'include' })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        deptSelect.innerHTML = data.departments
                            .map(d => `<option value="${d.id}">${d.name}</option>`)
                            .join('');
                    }
                });
        }

        window.showModal('forwardModal');
    };

    window.closeForwardModal = () => {
        window.closeModal('forwardModal');
        forwardTargetId = null;
    };

    window.executeForward = async () => {
        if (!forwardTargetId) return;

        const deptId   = document.getElementById('forward-dept-select').value;
        const notes    = document.getElementById('forward-notes').value.trim();
        const btn      = document.getElementById('forwardConfirmBtn');

        if (!deptId) {
            showToast('Please select a department', 'error');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Forwarding...';

        try {
            const token = localStorage.getItem('scrs_token');
            const res = await fetch(`${API_BASE}/api/admin/complaints/${forwardTargetId}/forward`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' , credentials: 'include' },
                credentials: 'include',
                body: JSON.stringify({ department_id: deptId, admin_notes: notes || null })
            });
            const data = await res.json();

            if (data.success) {
                showToast(data.message, 'success');
                closeForwardModal();
                fetchStats();
                fetchComplaints();
            } else {
                showToast(data.message || 'Forward failed', 'error');
            }
        } catch (err) {
            showToast('Network error. Please try again.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-share-from-square"></i> Confirm Forward';
        }
    };
    // ─────────────────────────────────────────────────────────────────────────

    // ── Department Management ─────────────────────────────────────────────────
    const ALL_CATEGORIES = ['Noise','Electricity','Mess','Harassment','Infrastructure','Security','Cleanliness','Technical','Faculty','Other'];
    let currentDeptId = null;

    async function fetchDeptManagement() {
        try {
            const res = await fetch(`${API_BASE}/api/departments`, {
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                renderDeptTable(data.departments);
            }
        } catch (err) { console.error('Error fetching depts:', err); }
    }

    function renderDeptTable(departments) {
        const tbody = document.getElementById('dept-tbody');
        if (!tbody) return;
        
        tbody.innerHTML = departments.map(d => `
            <tr class="fade-in">
                <td>
                    <div style="font-weight:600; color:#54a0ff;">${d.name}</div>
                    <div style="font-size:0.75rem; color:var(--text-secondary); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        ${d.description || 'No description'}
                    </div>
                </td>
                <td>
                    <div style="display:flex; flex-wrap:wrap; gap:0.3rem;">
                        ${d.categories.map(c => `<span class="status-badge" style="background:rgba(84,160,255,0.1); color:#54a0ff; font-size:0.7rem; padding:0.1rem 0.5rem; border-radius:4px;">${c}</span>`).join('')}
                        ${d.categories.length === 0 ? '<span style="color:var(--text-muted); font-size:0.8rem;">None</span>' : ''}
                    </div>
                </td>
                <td style="text-align:center;"><span style="font-weight:bold;">${d.staff_count}</span></td>
                <td style="text-align:center;"><span style="color:#f59e0b;">${d.pending}</span></td>
                <td style="text-align:center;"><span style="color:#10b981;">${d.resolved}</span></td>
                <td>
                    <div style="display:flex; gap:0.5rem;">
                        <button class="action-btn" style="background:rgba(84,160,255,0.1); color:#54a0ff; border:1px solid rgba(84,160,255,0.3);" onclick="openDeptModal(${d.id})">
                            <i class="fa-solid fa-pen-to-square"></i> Edit
                        </button>
                        <button class="action-btn" style="background:rgba(255,255,255,0.05); color:white;" onclick="openMembersModal(${d.id}, '${d.name}')">
                            <i class="fa-solid fa-users"></i> Staff
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    window.openDeptModal = async (deptId = null) => {
        currentDeptId = deptId;
        const modal = document.getElementById('deptModal');
        const title = document.getElementById('deptModalTitle');
        const nameInput = document.getElementById('dept-name-input');
        const descInput = document.getElementById('dept-desc-input');
        const emailInput = document.getElementById('dept-email-input');
        const checkboxContainer = document.getElementById('dept-categories-checkboxes');

        // Reset inputs
        nameInput.value = '';
        descInput.value = '';
        emailInput.value = '';
        
        // Render category checkboxes
        checkboxContainer.innerHTML = ALL_CATEGORIES.map(cat => `
            <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.85rem; cursor:pointer;">
                <input type="checkbox" name="dept-cat" value="${cat}" class="dept-cat-check">
                ${cat}
            </label>
        `).join('');

        if (deptId) {
            title.textContent = 'Edit Department';
            try {
                const res = await fetch(`${API_BASE}/api/departments/${deptId}`, {
                    credentials: 'include'
                });
                const data = await res.json();
                if (data.success) {
                    nameInput.value = data.department.name;
                    descInput.value = data.department.description || '';
                    emailInput.value = data.department.email || '';
                    
                    const cats = data.department.categories || [];
                    document.querySelectorAll('.dept-cat-check').forEach(cb => {
                        if (cats.includes(cb.value)) cb.checked = true;
                    });
                }
            } catch (err) { console.error('Error fetching dept details:', err); }
        } else {
            title.textContent = 'Add New Department';
        }

        window.showModal('deptModal');
    };

    window.closeDeptModal = () => {
        window.closeModal('deptModal');
        currentDeptId = null;
    };

    window.saveDept = async () => {
        const name = document.getElementById('dept-name-input').value.trim();
        const description = document.getElementById('dept-desc-input').value.trim();
        const email = document.getElementById('dept-email-input').value.trim();
        const categories = Array.from(document.querySelectorAll('.dept-cat-check:checked')).map(cb => cb.value);

        if (!name) {
            showToast('Department name is required', 'error');
            return;
        }

        const btn = document.getElementById('saveDeptBtn');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

        try {
            const method = currentDeptId ? 'PUT' : 'POST';
            const url = currentDeptId ? `${API_BASE}/api/departments/${currentDeptId}` : `${API_BASE}/api/departments`;

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' , credentials: 'include' },
                credentials: 'include',
                body: JSON.stringify({ name, description, email, categories })
            });
            const data = await res.json();

            if (data.success) {
                showToast(data.message, 'success');
                closeDeptModal();
                fetchDeptManagement();
                loadDepartments(); // Update staff form dropdown too
            } else {
                showToast(data.message || 'Operation failed', 'error');
            }
        } catch (err) {
            showToast('Network error', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    };

    // --- Members Management ---
    let activeDeptIdForMembers = null;

    // ── Forward Complaint Modal (single clean implementation) ──────────────────
    window.openForwardModal = (complaintId) => {
        forwardTargetId = complaintId;
        document.getElementById('forward-notes').value = '';

        const deptSelect = document.getElementById('forward-dept-select');
        const staffDept  = document.getElementById('staff-dept');

        // Fast path: re-use already-loaded department options from staff form
        if (staffDept && staffDept.options.length > 1) {
            deptSelect.innerHTML = Array.from(staffDept.options)
                .filter(o => o.value !== '')
                .map(o => `<option value="${o.value}">${o.text}</option>`)
                .join('');
        } else {
            // Fallback: fetch departments directly
            deptSelect.innerHTML = '<option>Loading departments...</option>';
            fetch(`${API_BASE}/api/admin/departments`, { credentials: 'include' })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        deptSelect.innerHTML = data.departments
                            .map(d => `<option value="${d.id}">${d.name}</option>`)
                            .join('');
                    } else {
                        deptSelect.innerHTML = '<option>Could not load departments</option>';
                    }
                })
                .catch(() => { deptSelect.innerHTML = '<option>Error loading departments</option>'; });
        }

        window.showModal('forwardModal');
    };    



    window.openMembersModal = (deptId, deptName) => {
        activeDeptIdForMembers = deptId;
        document.getElementById('membersModalTitle').textContent = `Manage Staff - ${deptName}`;
        window.showModal('membersModal');
        
        fetchDeptMembers(deptId);
        populateAvailableStaff();
    };

    window.closeMembersModal = () => {
        window.closeModal('membersModal');
        activeDeptIdForMembers = null;
    };

    async function fetchDeptMembers(deptId) {
        const tbody = document.getElementById('members-tbody');
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1rem;">Loading...</td></tr>';

        try {
            const res = await fetch(`${API_BASE}/api/departments/${deptId}`, {
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                renderMembersTable(data.department.members, deptId);
            }
        } catch (err) { console.error('Error fetching members:', err); }
    }

    function renderMembersTable(members, deptId) {
        const tbody = document.getElementById('members-tbody');
        if (members.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1rem; color:var(--text-secondary);">No staff assigned to this department yet.</td></tr>';
            return;
        }

        tbody.innerHTML = members.map(m => `
            <tr>
                <td style="padding:0.75rem; border-bottom:1px solid rgba(255,255,255,0.05);">${m.username}</td>
                <td style="padding:0.75rem; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.85rem;">${m.email}</td>
                <td style="padding:0.75rem; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <span class="status-badge" style="background:${m.role_in_dept === 'HOD' ? 'rgba(84,160,255,0.2)' : 'rgba(255,255,255,0.05)'}; 
                                                   color:${m.role_in_dept === 'HOD' ? '#54a0ff' : 'white'};">
                        ${m.role_in_dept}
                    </span>
                </td>
                <td style="padding:0.75rem; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <button class="action-btn btn-reject" style="padding:0.3rem 0.6rem; font-size:0.75rem;" onclick="removeDeptMember(${deptId}, ${m.user_id})">
                        <i class="fa-solid fa-trash"></i> Remove
                    </button>
                </td>
            </tr>
        `).join('');
    }

    async function populateAvailableStaff() {
        const select = document.getElementById('add-member-select');
        select.innerHTML = '<option value="">Loading staff...</option>';

        try {
            const res = await fetch(`${API_BASE}/api/departments/available-staff`, {
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                select.innerHTML = '<option value="">Select staff to add...</option>' + 
                    data.staff.map(s => `<option value="${s.id}">${s.username} (${s.email})</option>`).join('');
            }
        } catch (err) { console.error('Error fetching available staff:', err); }
    }

    window.submitAddMember = async () => {
        const user_id = document.getElementById('add-member-select').value;
        const role_in_dept = document.getElementById('add-member-role').value;

        if (!user_id || !activeDeptIdForMembers) {
            showToast('Please select a staff member', 'error');
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/api/departments/${activeDeptIdForMembers}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' , credentials: 'include' },
                credentials: 'include',
                body: JSON.stringify({ user_id, role_in_dept })
            });
            const data = await res.json();
            if (data.success) {
                showToast(data.message, 'success');
                fetchDeptMembers(activeDeptIdForMembers);
                fetchDeptManagement();
            } else {
                showToast(data.message || 'Failed to add member', 'error');
            }
        } catch (err) { showToast('Request failed', 'error'); }
    }

    window.removeDeptMember = async (deptId, userId) => {
        if (!confirm('Are you sure you want to remove this staff member from this department?')) return;

        try {
            const res = await fetch(`${API_BASE}/api/departments/${deptId}/members/${userId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                showToast(data.message, 'success');
                fetchDeptMembers(deptId);
                fetchDeptManagement();
            } else {
                showToast(data.message || 'Failed to remove member', 'error');
            }
        } catch (err) { showToast('Request failed', 'error'); }
    }

    // 9. Background - Three.js Implementation
    function initThreeJSBackground() {
        const container = document.getElementById('admin-bg-container');
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        
        renderer.setSize(window.innerWidth, window.innerHeight);
        container.appendChild(renderer.domElement);

        // Terrain
        const geometry = new THREE.PlaneGeometry(100, 100, 50, 50);
        const material = new THREE.MeshPhongMaterial({
            color: 0x1c2541,
            wireframe: false,
            flatShading: true,
            transparent: true,
            opacity: 0.8
        });

        // Add displacement for mountains
        const pos = geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            const noise = (Math.sin(x * 0.1) * Math.cos(y * 0.1)) * 5;
            pos.setZ(i, noise);
        }
        geometry.computeVertexNormals();
        
        const terrain = new THREE.Mesh(geometry, material);
        terrain.rotation.x = -Math.PI / 2;
        terrain.position.y = -5;
        scene.add(terrain);

        // Lights
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(0, 5, 10);
        scene.add(light);
        scene.add(new THREE.AmbientLight(0x404040, 2));

        // Particles
        const particleCount = 1000;
        const particles = new THREE.BufferGeometry();
        const pPositions = new Float32Array(particleCount * 3);
        for(let i=0; i<particleCount*3; i++) {
            pPositions[i] = (Math.random() - 0.5) * 100;
        }
        particles.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
        const pMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.1, transparent: true, opacity: 0.5 });
        const particleSystem = new THREE.Points(particles, pMaterial);
        scene.add(particleSystem);

        camera.position.z = 30;
        camera.position.y = 5;

        function animate() {
            requestAnimationFrame(animate);
            terrain.rotation.z += 0.001;
            particleSystem.rotation.y += 0.002;
            renderer.render(scene, camera);
        }

        animate();

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    // Reuse existing fetch functions from admin.html script section
    async function fetchStaff() {
        try {
            const res = await fetch(`${API_BASE}/api/admin/staff`, {
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                const tbody = document.getElementById('staff-tbody');
                if(!tbody) return;
                tbody.innerHTML = data.staff.map(s => `
                    <tr>
                        <td>${s.name}</td>
                        <td>${s.email}</td>
                        <td>${s.department_name}</td>
                        <td>${s.role}</td>
                        <td>
                            <span class="status-badge ${s.is_account_created ? 'status-resolved' : 'status-pending'}">
                                ${s.is_account_created ? 'Active' : 'Pending Activation'}
                            </span>
                        </td>
                    </tr>
                `).join('');
            }
        } catch (err) { console.error(err); }
    }

    async function fetchStudents() {
        try {
            const res = await fetch(`${API_BASE}/api/admin/students`, {
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                const tbody = document.getElementById('students-tbody');
                if(!tbody) return;
                tbody.innerHTML = data.students.map(s => `
                    <tr>
                        <td><span style="font-weight: 600;">${s.roll_number}</span></td>
                        <td>${s.email}</td>
                        <td>${s.department} (${s.year} Year)</td>
                        <td>${s.mobile_number}</td>
                        <td>
                            ${s.id_card_image ? 
                                `<img src="${s.id_card_image}" class="id-card-thumb" onclick="viewID('${s.id_card_image}')">` : 
                                '<span style="color: var(--text-muted); font-size: 0.8rem;">No Image</span>'}
                        </td>
                        <td>
                            <span class="status-badge ${s.is_account_created ? 'status-resolved' : 'status-pending'}">
                                ${s.is_account_created ? 'Active' : 'Unregistered'}
                            </span>
                        </td>
                    </tr>
                `).join('');
            }
        } catch (err) { console.error(err); }
    }

    async function loadDepartments() {
        try {
            const res = await fetch(`${API_BASE}/api/admin/departments`, {
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                const optionsHtml = data.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
                
                const deptSelect = document.getElementById('staff-dept');
                if(deptSelect) {
                    deptSelect.innerHTML = '<option value="">No Department / General</option>' + optionsHtml;
                }

                const filterDept = document.getElementById('filter-dept');
                if(filterDept) {
                    filterDept.innerHTML = '<option value="">All Departments</option>' + optionsHtml;
                }
            }
        } catch (err) { console.error(err); }
    }

    async function loadGallery() {
        try {
            const user = JSON.parse(localStorage.getItem('scrs_user'));
            const res = await fetch(`${API_BASE}/api/gallery`, {
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                const grid = document.getElementById('gallery-grid');
                if(!grid) return;
                grid.innerHTML = data.images.map(img => `
                    <div class="glass-panel fade-in gallery-item" data-id="${img.id}" style="padding: 12px; position: relative; display: flex; flex-direction: column; gap: 10px; border: 1px solid ${img.is_featured ? 'var(--gold)' : 'rgba(255,255,255,0.05)'};">
                        <div style="height: 150px; border-radius: 8px; overflow: hidden; position: relative;">
                            <img src="${API_BASE}/${img.url}" style="width: 100%; height: 100%; object-fit: cover; opacity: ${img.is_featured ? '1' : '0.5'};">
                            ${!img.is_featured ? '<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; background: rgba(0,0,0,0.6); padding: 5px 10px; border-radius: 20px; font-size: 0.75rem;">Hidden</div>' : ''}
                            <div style="position: absolute; top: 8px; right: 8px; display: flex; align-items: center; gap: 4px; background: rgba(0,0,0,0.7); padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; border: 1px solid rgba(255,255,255,0.1);">
                                <span>Order:</span>
                                <input type="number" value="${img.display_order || 0}" 
                                    onchange="updateDisplayOrder(${img.id}, this.value)"
                                    ${user.role !== 'Principal' ? 'disabled' : ''}
                                    style="width: 35px; background: transparent; border: none; color: var(--gold); font-weight: bold; text-align: center;">
                            </div>
                        </div>
                        <div class="form-group" style="margin: 0;">
                            <input type="text" class="form-control" value="${img.title || ''}" 
                                placeholder="Add image title..." 
                                onchange="updateGalleryTitle(${img.id}, this.value)"
                                style="font-size: 0.85rem; padding: 5px 8px; background: rgba(0,0,0,0.2);">
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 5px; border-top: 1px solid rgba(255,255,255,0.05);">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <label class="featured-toggle" title="${user.role === 'Principal' ? 'Toggle Homepage Visibility' : 'Principal Only'}">
                                    <input type="checkbox" ${img.is_featured ? 'checked' : ''} 
                                        ${user.role !== 'Principal' ? 'disabled' : ''}
                                        onchange="toggleFeatured(${img.id}, this.checked)">
                                    <span class="toggle-slider"></span>
                                </label>
                                <span style="font-size: 0.70rem; color: var(--text-muted);">${new Date(img.created_at).toLocaleDateString()}</span>
                            </div>
                            ${user.role === 'Principal' ? `
                            <button class="action-btn btn-reject" onclick="deleteGalleryImage(${img.id})" style="padding: 4px 8px; font-size: 0.75rem;">
                                <i class="fa-solid fa-trash"></i> Delete
                            </button>` : ''}
                        </div>
                    </div>
                `).join('');

                // 🚀 Initialize Sortable (Principal Only)
                if (user.role === 'Principal' && typeof Sortable !== 'undefined') {
                    Sortable.create(grid, {
                        animation: 150,
                        ghostClass: 'sortable-ghost',
                        chosenClass: 'sortable-chosen',
                        draggable: '.gallery-item',
                        onEnd: async () => {
                            const newOrder = Array.from(grid.querySelectorAll('.gallery-item')).map((item, index) => ({
                                id: parseInt(item.dataset.id),
                                display_order: index + 1
                            }));
                            saveGalleryOrder(newOrder);
                        }
                    });
                }
            }
        } catch (err) { console.error(err); }
    }

    window.toggleFeatured = async (id, is_featured) => {
        try {
            const res = await fetch(`${API_BASE}/api/gallery/${id}/featured`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' , credentials: 'include' },
                credentials: 'include',
                body: JSON.stringify({ is_featured })
            });
            const data = await res.json();
            if (data.success) {
                showToast(data.message, 'success'); // Uses dynamic message from server
                await loadGallery();
            } else {
                showToast(data.message || 'Toggle failed', 'error');
                await loadGallery(); // Revert UI
            }
        } catch (err) { 
            showToast('Update failed', 'error');
            await loadGallery(); 
        }
    };

    window.updateDisplayOrder = async (id, display_order) => {
        try {
            const res = await fetch(`${API_BASE}/api/gallery/${id}/display-order`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' , credentials: 'include' },
                credentials: 'include',
                body: JSON.stringify({ display_order })
            });
            const data = await res.json();
            if (data.success) {
                showToast('Display order updated', 'success');
                // No full reload needed to keep focus, but optional
            } else {
                showToast(data.message || 'Update failed', 'error');
            }
        } catch (err) { showToast('Update failed', 'error'); }
    };

    window.updateGalleryTitle = async (id, title) => {
        try {
            const res = await fetch(`${API_BASE}/api/gallery/${id}/title`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' , credentials: 'include' },
                credentials: 'include',
                body: JSON.stringify({ title })
            });
            const data = await res.json();
            if (data.success) {
                showToast('Title updated!', 'success');
            }
        } catch (err) { showToast('Failed to update title', 'error'); }
    };

    // Forms handling
    const addStudentForm = document.getElementById('add-student-form');
    if(addStudentForm) {
        addStudentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = {
                roll_number: document.getElementById('stu-roll').value,
                department: document.getElementById('stu-dept').value,
                year: document.getElementById('stu-year').value,
                mobile_number: document.getElementById('stu-mobile').value,
                email: document.getElementById('stu-email').value,
                id_card_image: document.getElementById('stu-id-url').value
            };

            try {
                const res = await fetch(`${API_BASE}/api/admin/add-student`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' , credentials: 'include' },
                    credentials: 'include',
                    body: JSON.stringify(formData)
                });
                const data = await res.json();
                if (data.success) {
                    showToast('Student added to registry!', 'success');
                    addStudentForm.reset();
                    document.getElementById('student-form-container').style.display = 'none';
                    fetchStudents();
                } else {
                    showToast(data.message, 'error');
                }
            } catch (err) { showToast('Request failed', 'error'); }
        });
    }

    const addStaffForm = document.getElementById('add-staff-form');
    if(addStaffForm) {
        addStaffForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            btn.disabled = true;
            btn.textContent = 'Sending...';

            const staffData = {
                name: document.getElementById('staff-name').value,
                email: document.getElementById('staff-email').value,
                mobile: document.getElementById('staff-mobile').value,
                department_id: document.getElementById('staff-dept').value || null,
                role: document.getElementById('staff-role').value
            };

            try {
                const res = await fetch(`${API_BASE}/api/admin/add-staff`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' , credentials: 'include' },
                    credentials: 'include',
                    body: JSON.stringify(staffData)
                });
                const data = await res.json();
                if (data.success) {
                    showToast(data.message, 'success');
                    addStaffForm.reset();
                    toggleStaffForm();
                    fetchStaff();
                } else {
                    showToast(data.message, 'error');
                }
            } catch (err) { showToast('Action failed', 'error'); }
            finally {
                btn.disabled = false;
                btn.textContent = 'Send Activation link';
            }
        });
    }

    window.uploadGalleryImage = (input) => {
        if (!input.files || input.files.length === 0) return;
        selectedFile = input.files[0];
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const image = document.getElementById('imageToCrop');
            image.src = e.target.result;
            document.getElementById('gallery-title-input').value = '';
            window.showModal('cropModal');
            
            if (cropper) cropper.destroy();
            cropper = new Cropper(image, {
                aspectRatio: 2 / 1,
                viewMode: 2,
                responsive: true
            });
        };
        reader.readAsDataURL(selectedFile);
    };

    const btnCropUpload = document.getElementById('btn-crop-upload');
    if (btnCropUpload) {
        btnCropUpload.addEventListener('click', () => {
            if (!cropper) return;
            
            btnCropUpload.disabled = true;
            btnCropUpload.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
            
            cropper.getCroppedCanvas({
                width: 1200,
                height: 600
            }).toBlob(async (blob) => {
                const formData = new FormData();
                formData.append('file', blob, selectedFile.name);
                formData.append('title', document.getElementById('gallery-title-input').value);

                try {
                    const res = await fetch(`${API_BASE}/api/gallery/upload`, {
                        method: 'POST',
                        credentials: 'include',
                        body: formData
                    });
                    const data = await res.json();
                    if (data.success) {
                        showToast('Storytelling image uploaded!', 'success');
                        closeCropModal();
                        loadGallery();
                    } else {
                        showToast(data.error || 'Upload failed', 'error');
                    }
                } catch (err) {
                    showToast('Upload error', 'error');
                } finally {
                    btnCropUpload.disabled = false;
                    btnCropUpload.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Crop & Upload';
                }
            }, 'image/jpeg', 0.9);
        });
    }

    window.saveGalleryOrder = async (order) => {
        try {
            const res = await fetch(`${API_BASE}/api/gallery/reorder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' , credentials: 'include' },
                credentials: 'include',
                body: JSON.stringify({ order })
            });
            const data = await res.json();
            if (data.success) {
                showToast('New display order saved!', 'success');
            } else {
                showToast(data.message || 'Failed to save order', 'error');
                loadGallery(); // Revert on failure
            }
        } catch (err) { 
            showToast('Sync error', 'error');
            loadGallery();
        }
    };

    window.deleteGalleryImage = async (id) => {
        if (!confirm('Are you sure you want to delete this image? One careless click = broken homepage slider!')) return;
        try {
            const res = await fetch(`${API_BASE}/api/gallery/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                showToast('Image removed from gallery', 'success');
                await loadGallery(); // Instant update
            } else {
                showToast(data.message || 'Delete failed', 'error');
            }
        } catch (err) { showToast('Delete failed', 'error'); }
    };

    // ==========================================
    // USER REQUESTED UX WIRING
    // ==========================================

    // Search bar logic
    const searchInput = document.getElementById("search");
    if(searchInput) {
        searchInput.addEventListener("input", function(e) {
            console.log("Searching:", e.target.value);
            // Basic functional demo of filter mapping
            const rows = document.querySelectorAll("tbody tr");
            const term = e.target.value.toLowerCase();
            rows.forEach(row => {
                row.style.display = row.innerText.toLowerCase().includes(term) ? "" : "none";
            });
        });
    }

    // Notification icon logic
    const notifBtn = document.getElementById("notifBtn");
    const notifDropdown = document.getElementById("notifDropdown");
    if(notifBtn && notifDropdown) {
        notifBtn.addEventListener("click", (e) => {
            notifDropdown.style.display = notifDropdown.style.display === "none" ? "block" : "none";
            e.stopPropagation();
        });
        
        // Click outside to close
        document.addEventListener("click", (e) => {
            if(!notifBtn.contains(e.target) && !notifDropdown.contains(e.target)) {
                notifDropdown.style.display = "none";
            }
        });
    }

    // Modal UI Handlers
    window.closeConfirmModal = () => window.closeModal("confirmModal");
    window.resetForm = () => {
        const title = document.getElementById("gallery-title-input");
        const notes = document.getElementById("forward-notes");
        if(title) title.value = "";
        if(notes) notes.value = "";
    };
    window.closeForwardModal = () => {
        window.closeModal("forwardModal");
        window.resetForm();
    };

    // Generic Confirm Stub
    window.confirmAction = () => {
        console.log("Confirm action triggered.");
        window.closeConfirmModal();
    };

    // Generic Button Clicks (Testing purposes)
    document.querySelectorAll("button").forEach(btn => {
        if(!btn.dataset.uiWired) {
            btn.addEventListener("click", () => {
                console.log("Button clicked:", btn.innerText.trim());
            });
            btn.dataset.uiWired = "true";
        }
    });

});

