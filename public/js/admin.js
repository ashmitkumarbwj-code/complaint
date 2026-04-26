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
        document.getElementById('user-display-name').textContent = user.full_name || user.name || user.username || 'Admin';
        document.getElementById('user-display-role').textContent = user.role || 'Admin';
        document.getElementById('user-avatar-initial').textContent = (user.full_name || user.name || user.username || 'A')[0].toUpperCase();
        const welcomeEl = document.getElementById('welcome-user-name'); // Not present in all layouts
        if (welcomeEl) welcomeEl.textContent = user.full_name || user.name || user.username || 'Admin';

        // Role-based Navigation Guard
        const userRole = String(user.role).toLowerCase();
        if (userRole !== 'principal' && userRole !== 'admin') {
            const principalOnlyTabs = ['tab-staff', 'tab-students'];
            document.querySelectorAll('.nav-item').forEach(item => {
                if (principalOnlyTabs.includes(item.dataset.tab)) {
                    item.style.display = 'none';
                }
            });
        }
        
        // Admin-only Navigation Guard
        if (String(user.role).toLowerCase() === 'admin') {
            const slidesTab = document.getElementById('nav-item-slides');
            if (slidesTab) slidesTab.style.display = 'flex';
            const dynamicSlidesTab = document.getElementById('nav-item-dynamic-slides');
            if (dynamicSlidesTab) dynamicSlidesTab.style.display = 'flex';
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

    // 🚨 Phase 1: Real-Time Signal Sync (Refetch-on-Signal)
    let lastStatsSync = 0;
    socket.on('DASHBOARD_STATS_CHANGED', () => {
        const now = Date.now();
        if (now - lastStatsSync < 1000) return; // Debounce 1s
        lastStatsSync = now;

        console.log('[RealTime] Statistics sync signal received.');
        if (typeof fetchStats === 'function') fetchStats();
        if (typeof loadDashboardAnalytics === 'function') loadDashboardAnalytics();
    });

    // 4. Initial Fetches
    // [Moved to the end of DOMContentLoaded to prevent hoisting ReferenceErrors]

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
        'tab-gallery': { title: 'Homepage Gallery', sub: 'Public slider control' },
        'tab-slides': { title: 'Homepage Hero Slider', sub: 'Dynamic animated background slides' },
        'tab-dynamic-slides': { title: 'Dynamic Slider Manager', sub: 'Image & video slide management' }
    };

    window.switchTab = function(tabId) {
        console.log(`[Admin] Switching to tab: ${tabId}`);
        
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

        // Trigger fetches
        if (tabId === 'tab-dashboard') window.loadDashboardAnalytics();
        if (tabId === 'tab-departments') window.fetchDeptManagement();
        if (tabId === 'tab-complaints') window.fetchComplaints();
        if (tabId === 'tab-staff') window.fetchStaff();
        if (tabId === 'tab-students') window.fetchStudents();
        if (tabId === 'tab-gallery') window.loadGallery();
        if (tabId === 'tab-slides') window.loadSlides();
        if (tabId === 'tab-dynamic-slides') window.loadDynamicSlides();
    }

    // Bind events to all data-tab elements
    document.querySelectorAll('[data-tab]').forEach(item => {
        item.addEventListener('click', () => {
            window.switchTab(item.dataset.tab);
        });
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
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
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
        category: null
    };

    window.loadDashboardAnalytics = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/dashboards/stats`, { credentials: 'include' });
            const data = await res.json();
            
            if (data.success) {
                renderTrendsChart(data.dailyTrends);
                renderStatusPieChart(data.statusDistribution);
                renderCategoryIntensityChart(data.categoryIntensity);
                renderPressureScale(data.departmentStats);
                
                // Summary Counts
                animateNumber('stat-total', data.summary.total);
                animateNumber('stat-sla', data.summary.sla_breaches);
                animateNumber('stat-students', data.summary.active_students);
                
                // Avg Time special handling (with units)
                const avgEl = document.getElementById('stat-avg-time');
                if (avgEl) avgEl.textContent = `${data.summary.avg_resolution_hours || 0}h`;

                // Legacy fallback support for tab switching logic
                animateNumber('stat-pending', data.summary.pending);
                animateNumber('stat-resolved', data.summary.resolved);
            }
        } catch (err) {
            console.error('Analytics fetch failed:', err);
        }
    };

    function renderTrendsChart(trends) {
        const ctx = document.getElementById('trendsChart').getContext('2d');
        if (dashboardCharts.trends) dashboardCharts.trends.destroy();

        const recentTrends = trends.length > 7 ? trends.slice(-7) : trends;

        dashboardCharts.trends = new Chart(ctx, {
            type: 'line',
            data: {
                labels: recentTrends.map(t => new Date(t.date).toLocaleDateString(undefined, {weekday:'short', day:'numeric'})),
                datasets: [{
                    label: 'Volume',
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
        const statusEl = document.getElementById('statusPieChart');
        const ctx = statusEl ? statusEl.getContext('2d') : null;
        if (!ctx) return;
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
                    legend: { position: 'bottom', labels: { color: '#adb5bd', padding: 15, font: { size: 9 } } }
                },
                cutout: '75%'
            }
        });
    }

    function renderCategoryIntensityChart(categories) {
        const catEl = document.getElementById('categoryChart');
        const ctx = catEl ? catEl.getContext('2d') : null;
        if (!ctx) return;
        if (dashboardCharts.category) dashboardCharts.category.destroy();

        dashboardCharts.category = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: categories.map(c => c.category),
                datasets: [{
                    data: categories.map(c => c.count),
                    backgroundColor: 'rgba(212, 175, 55, 0.6)',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, grid: { display: false }, ticks: { color: '#adb5bd', font: { size: 9 } } },
                    y: { grid: { display: false }, ticks: { color: '#adb5bd', font: { size: 9 } } }
                }
            }
        });
    }

    function renderPressureScale(stats) {
        const grid = document.getElementById('dept-pressure-grid');
        if (!grid) return;

        grid.innerHTML = stats.map(dept => {
            const score = dept.pressure_score || 0;
            const color = score > 60 ? '#ef4444' : score > 30 ? '#f59e0b' : '#10b981';
            const statusText = score > 60 ? 'CRITICAL' : score > 30 ? 'STRESSED' : 'HEALTHY';
            
            return `
                <div class="glass-panel" style="padding: 1rem; border-left: 4px solid ${color};">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                        <span style="font-weight: 600; font-size: 0.9rem;">${dept.name}</span>
                        <span style="font-size: 0.7rem; color: ${color}; font-weight: 700;">${statusText}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="flex: 1; height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden;">
                            <div style="width: ${score}%; height: 100%; background: ${color}; transition: width 1s ease;"></div>
                        </div>
                        <span style="font-size: 0.8rem; font-weight: 700;">${score}%</span>
                    </div>
                    <div style="margin-top: 5px; font-size: 0.7rem; opacity: 0.6;">
                        ${dept.pending_count} pending / ${dept.total_count} total
                    </div>
                </div>
            `;
        }).join('');
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
        if (!el) {
            console.warn(`[Admin] Element with ID '${id}' not found for animation.`);
            return;
        }
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

    window.fetchComplaints = async function() {
        try {
            const statusEl = document.getElementById('filter-status');
            const status = statusEl ? statusEl.value : '';
            const deptEl = document.getElementById('filter-dept');
            const dept = deptEl ? deptEl.value : '';
            
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
            
            // AI Status Indicators
            const aiStatusDot = c.ai_status === 'completed' 
                ? `<span class="ai-insight-dot" style="background:#10b981;" title="AI Analysis: Completed"></span>`
                : c.ai_status === 'processing'
                ? `<span class="ai-insight-dot" style="background:#3b82f6;" title="AI Analysis: Processing..."></span>`
                : c.ai_status === 'failed'
                ? `<span class="ai-insight-dot" style="background:#ef4444;" title="AI Analysis: Failed"></span>`
                : `<span class="ai-insight-dot" style="background:rgba(255,255,255,0.1);" title="AI Analysis: Pending"></span>`;

            const aiBadge = (c.priority === 'Emergency' || c.priority === 'High' || c.ai_is_emergency) 
                ? `<span class="ai-badge" title="AI Priority Engine">⚡ AI Escalate</span>` : '';
            
            const rowClass = (c.priority === 'Emergency' || c.ai_is_emergency) ? 'fade-in ai-glowing-row' : 'fade-in';

            // AI Insight Box
            const aiInsightBox = c.ai_status === 'completed' ? `
                <div class="ai-mini-report" title="${c.ai_reasoning || 'No details available'}">
                    <div class="ai-metric">
                        <small>Evidence Match:</small>
                        <div class="ai-bar-bg"><div class="ai-bar-fill" style="width: ${Math.round((c.ai_score || 0) * 100)}%;"></div></div>
                    </div>
                    <div style="display:flex; gap:4px; margin-top:2px;">
                        ${c.ai_is_emergency ? '<span class="ai-tag emergency">Emergency</span>' : ''}
                        ${c.ai_review ? '<span class="ai-tag review">Review Req</span>' : ''}
                    </div>
                </div>
            ` : '';

            return `
            <tr class="${rowClass}" onclick="openComplaintDetail(${JSON.stringify({id:c.id, title:c.title, student:c.student_name, desc:c.description, loc:c.location, cat:c.category, prio:c.priority, status:c.status}).replace(/"/g, '&quot;')})" style="cursor:pointer;">
                <td>#${c.id}</td>
                <td style="font-weight: 700; color: var(--gold);">
                    <div style="display:flex; align-items:center; gap:5px;">
                        ${aiStatusDot} ${c.title || 'Untitled'} ${aiBadge}
                    </div>
                    <div style="margin-top: 4px;"><span class="smart-priority-indicator ${prioClass}">${c.priority || 'Medium'}</span></div>
                    ${aiInsightBox}
                </td>
                <td>${c.student_name || 'Student #' + c.student_id}</td>
                <td><span style="font-size:0.8rem; opacity:0.8;">${c.category} @ ${c.location}</span></td>
                <td><span class="status-badge status-${c.status.toLowerCase().replace(' ', '')}">${c.status}</span></td>
                <td style="text-align:center;">
                    ${c.media_url ? `
                        <button class="action-btn" style="background:rgba(212,175,55,0.1); color:var(--gold); border: 1px solid var(--gold);" onclick="event.stopPropagation(); viewComplaintMedia('${c.media_url}', '${c.title || 'Complaint Media'}')">
                            <i class="fa-solid ${isVideo ? 'fa-video' : 'fa-image'}"></i> View
                        </button>
                    ` : `
                        <div class="admin-process-monitor">
                            ${c.processing_status === 'processing' ? '<i class="fa-solid fa-spinner fa-spin" style="color:#3a86ff;" title="Uploading..."></i>' : ''}
                            ${c.processing_status === 'pending_resync' ? '<i class="fa-solid fa-clock-rotate-left" style="color:var(--gold);" title="Syncing..."></i>' : ''}
                            ${c.processing_status === 'failed' ? '<i class="fa-solid fa-triangle-exclamation" style="color:var(--red);" title="Upload Failed"></i>' : ''}
                            ${!c.processing_status || c.processing_status === 'ready' ? '<span style="opacity:0.3;">None</span>' : ''}
                        </div>
                    `}
                </td>
                <td style="display:flex; gap:0.4rem; flex-wrap:wrap;">
                    ${c.status === 'SUBMITTED' ? `
                        <button class="action-btn" style="background:var(--primary-color); color:white;" onclick="event.stopPropagation(); openForwardModal(${c.id})">
                            <i class="fa-solid fa-share-from-square"></i> Forward
                        </button>
                        <button class="action-btn btn-reject" onclick="event.stopPropagation(); handleV2AdminAction(${c.id}, 'REJECTED_BY_ADMIN')">
                            <i class="fa-solid fa-ban"></i> Reject
                        </button>
                    ` : c.status === 'HOD_APPROVED' ? `
                        <button class="action-btn" style="background:var(--green); color:white;" onclick="event.stopPropagation(); handleV2AdminAction(${c.id}, 'CLOSED', 'Final closure by Admin')">
                            <i class="fa-solid fa-check-double"></i> Close Complaint
                        </button>
                    ` : `
                        <span style="font-size: 0.7rem; opacity: 0.5;">In Workflow Queue</span>
                    `}
                </td>
            </tr>
        `}).join('');
    }

    // 🔥 V2 ADMIN ACTION HANDLER
    window.handleV2AdminAction = async (id, status, reason = '', targetDeptId = null) => {
        try {
            const res = await fetch(`${API_BASE}/api/complaints/${id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, reason, targetDeptId }),
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

    window.updateStatus = async (id, status) => {
        if (!confirm(`Are you sure you want to mark complaint #${id} as ${status}?`)) return;

        try {
            const res = await fetch(`${API_BASE}/api/admin/complaints/${id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                showToast(`Complaint #${id} updated to ${status}`, 'success');
                fetchComplaints();
                if (window.loadDashboardAnalytics) window.loadDashboardAnalytics();
            } else {
                showToast(data.message || 'Update failed', 'error');
            }
        } catch (err) {
            console.error('[Admin] Update status error:', err);
            showToast('Network error updating status', 'error');
        }
    };

    window.fetchStats = () => {
        if (window.loadDashboardAnalytics) window.loadDashboardAnalytics();
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

    // 🤖 Phase 2: AI Suggestion & Detail View 🤖
    let currentDetailId = null;

    window.openComplaintDetail = async (complaint) => {
        currentDetailId = complaint.id;
        
        // Populate static fields
        document.getElementById('det-id').textContent = `#${complaint.id}`;
        document.getElementById('det-student').textContent = complaint.student || 'Unknown';
        document.getElementById('det-title').textContent = complaint.title || 'No Subject';
        document.getElementById('det-desc').textContent = complaint.desc || 'No description provided.';
        document.getElementById('det-location').textContent = complaint.loc || 'N/A';
        document.getElementById('det-category').textContent = complaint.cat;
        document.getElementById('det-prio').textContent = complaint.prio;

        // Reset AI Panel
        const aiPanel = document.getElementById('ai-suggestion-panel');
        const loading = document.getElementById('ai-loading-state');
        const content = document.getElementById('ai-content-state');
        const none = document.getElementById('ai-none-state');
        const badge = document.getElementById('ai-conf-badge');

        loading.style.display = 'block';
        content.style.display = 'none';
        none.style.display = 'none';
        badge.className = 'ai-confidence-tag';
        badge.textContent = 'Analyzing...';

        window.showModal('complaintDetailModal');

        // Fetch AI Analysis
        try {
            const res = await fetch(`${API_BASE}/api/admin/complaints/${complaint.id}/ai-analysis`, { credentials: 'include' });
            const data = await res.json();
            
            loading.style.display = 'none';
            
            if (data.success && data.analysis) {
                const a = data.analysis;
                content.style.display = 'block';
                
                document.getElementById('ai-sug-prio').textContent = a.suggested_priority;
                document.getElementById('ai-sug-cat').textContent = a.suggested_category;
                document.getElementById('ai-sug-reason').textContent = a.reasoning_summary;

                const score = Math.round(a.evidence_match_score * 100);
                badge.textContent = `${score}% Confidence`;
                badge.classList.remove('high', 'medium', 'low');
                if (score > 75) badge.classList.add('high');
                else if (score > 50) badge.classList.add('medium');
                else badge.classList.add('low');

            } else {
                none.style.display = 'block';
                badge.textContent = 'No Data';
            }
        } catch (err) {
            loading.style.display = 'none';
            none.style.display = 'block';
            badge.textContent = 'Error';
        }
    };

    window.applyAiSuggestion = async (type) => {
        if (!currentDetailId) return;
        
        const btn = document.getElementById(`btn-apply-ai-${type}`);
        const restore = setButtonLoading(btn, 'Applying...');

        try {
            const res = await fetch(`${API_BASE}/api/complaints/${currentDetailId}/apply-ai`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type }),
                credentials: 'include'
            });
            const data = await res.json();
            
            if (data.success) {
                showToast(data.message, 'success');
                // Refresh local detail UI
                if (type === 'priority' || type === 'both') document.getElementById('det-prio').textContent = data.applied_values.priority;
                if (type === 'category' || type === 'both') document.getElementById('det-category').textContent = data.applied_values.category;
                
                fetchComplaints(); // Refresh main table
            } else {
                showToast(data.message, 'error');
            }
        } catch (err) {
            showToast('Failed to apply suggestion.', 'error');
        } finally {
            restore();
        }
    };

    window.openForwardFromDetail = () => {
        if (!currentDetailId) return;
        window.closeModal('complaintDetailModal');
        window.openForwardModal(currentDetailId);
    };

    window.rejectFromDetail = () => {
        if (!currentDetailId) return;
        window.closeModal('complaintDetailModal');
        handleV2AdminAction(currentDetailId, 'REJECTED_BY_ADMIN');
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

        await handleV2AdminAction(forwardTargetId, 'FORWARDED', notes, deptId);
        
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-share-from-square"></i> Confirm Forward';
        closeForwardModal();
    };

    // ─────────────────────────────────────────────────────────────────────────

    // ── Department Management ─────────────────────────────────────────────────
    const ALL_CATEGORIES = ['Noise','Electricity','Mess','Harassment','Infrastructure','Security','Cleanliness','Technical','Faculty','Other'];
    let currentDeptId = null;

    window.fetchDeptManagement = async function() {
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
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
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
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
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
    window.fetchStaff = async function() {
        try {
            const res = await fetch(`${API_BASE}/api/admin/staff`, {
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                const tbody = document.getElementById('staff-tbody');
                if(!tbody) return;
                
                if (data.staff.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; opacity:0.6;">No staff records found.</td></tr>';
                } else {
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
            }
        } catch (err) { console.error(err); }
    }

    window.currentStudentPage = 1;
    let totalStudentPages = 1;

    window.changeStudentPage = (delta) => {
        const newPage = window.currentStudentPage + delta;
        if (newPage >= 1 && newPage <= totalStudentPages) {
            window.currentStudentPage = newPage;
            window.fetchStudents();
        }
    };

    window.fetchStudents = async function() {
        try {
            const res = await fetch(`${API_BASE}/api/admin/students?page=${window.currentStudentPage}&limit=50`, {
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                const tbody = document.getElementById('students-tbody');
                if(!tbody) return;

                if (data.students.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; opacity:0.6;">No students found in registry.</td></tr>';
                } else {
                    tbody.innerHTML = data.students.map(s => `
                        <tr>
                            <td><span style="font-weight: 600;">${s.roll_number}</span></td>
                            <td>
                                <div style="display:flex; flex-direction:column;">
                                    <span style="font-size:0.9rem;">${s.name || '<i>Not Activated</i>'}</span>
                                    <small style="opacity:0.6;">${s.email}</small>
                                </div>
                            </td>
                            <td>${s.department} (${s.year} Year)</td>
                            <td>${s.mobile_number}</td>
                            <td>
                                ${s.id_card_image ? 
                                    `<img src="${s.id_card_image}" class="id-card-thumb" onclick="viewID('${s.id_card_image}')" style="cursor:zoom-in;">` : 
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

                if (data.pagination) {
                    totalStudentPages = data.pagination.totalPages || 1;
                    const info = document.getElementById('student-page-info');
                    if (info) info.textContent = `Page ${window.currentStudentPage} of ${totalStudentPages}`;
                }
            }
        } catch (err) { console.error('[Admin] fetchStudents error:', err); }
    }

    window.loadDepartments = async function() {
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

    window.loadGallery = async function() {
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
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
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
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
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
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
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
                name: document.getElementById('stu-name').value,
                department: document.getElementById('stu-dept').value,
                year: document.getElementById('stu-year').value,
                mobile_number: document.getElementById('stu-mobile').value,
                email: document.getElementById('stu-email').value,
                id_card_image: document.getElementById('stu-id-url').value
            };

            try {
                const res = await fetch(`${API_BASE}/api/admin/add-student`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
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
                    credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
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
                aspectRatio: 16 / 9,
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
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
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
        window.closeConfirmModal();
    };

    // Generic Button Clicks (Testing purposes)
    document.querySelectorAll("button").forEach(btn => {
        if(!btn.dataset.uiWired) {
            btn.addEventListener("click", () => {
                // UI tracking placeholder 
            });
            btn.dataset.uiWired = "true";
        }
    });

    // ── 🏢 Bulk Ingestion Wizard ──────────────────────────────────────────────
    let bulkType = 'student'; 
    let parsedData = [];

    window.openBulkImport = (type) => {
        bulkType = type;
        document.getElementById('bulkModalTitle').textContent = `Bulk ${type.charAt(0).toUpperCase() + type.slice(1)} Ingestion`;
        resetBulkImport();
        window.showModal('bulkImportModal');
    };

    window.closeBulkModal = () => window.closeModal('bulkImportModal');

    window.resetBulkImport = () => {
        parsedData = [];
        document.getElementById('bulk-step-1').style.display = 'block';
        document.getElementById('bulk-step-2').style.display = 'none';
        document.getElementById('bulk-step-3').style.display = 'none';
        document.getElementById('bulk-file-input').value = '';
        document.getElementById('preview-errors').textContent = '';
        document.getElementById('processImportBtn').disabled = false;
        document.getElementById('processImportBtn').innerHTML = 'Process Import';
    };

    // File Input Listener
    document.getElementById('bulk-file-input').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Parse with headers: we expect standard headers in Row 1 or 4
                // We'll use standard header mapping equivalent to the backend studentImportService
                const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                
                if (rawRows.length === 0) {
                    alert('No data found in the selected sheet.');
                    return;
                }

                parsedData = rawRows;
                renderBulkPreview();
                
                document.getElementById('bulk-step-1').style.display = 'none';
                document.getElementById('bulk-step-2').style.display = 'block';
            } catch (err) {
                console.error('XLSX Parse Error:', err);
                UIUtils.showToast('Failed to parse file. Ensure it is a valid Excel or CSV.', 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    });

    function renderBulkPreview() {
        const thead = document.getElementById('bulk-preview-thead');
        const tbody = document.getElementById('bulk-preview-tbody');
        const countSpan = document.getElementById('preview-count');
        const errorSpan = document.getElementById('preview-errors');

        if (parsedData.length === 0) return;

        // Define expected columns based on type
        const studentCols = ['roll_number', 'name', 'email', 'department', 'year', 'mobile_number'];
        const staffCols = ['name', 'email', 'department', 'role', 'mobile'];
        const cols = bulkType === 'student' ? studentCols : staffCols;

        // Render Header
        thead.innerHTML = `<tr>${cols.map(c => `<th>${c.replace('_', ' ').toUpperCase()}</th>`).join('')}<th>STATUS</th></tr>`;

        // Validation Rules
        let errorCount = 0;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        tbody.innerHTML = parsedData.slice(0, 50).map((row, idx) => {
            let rowErrors = [];
            
            // Basic normalization to match expected column names
            // If the user's excel has "Roll No", we should try to match it
            const normalizedRow = {};
            Object.keys(row).forEach(k => {
                const cleanK = k.trim().toLowerCase().replace(/[\s_]/g, '');
                if (cleanK === 'rollno' || cleanK === 'rollnumber') normalizedRow.roll_number = row[k];
                else if (cleanK === 'name' || cleanK === 'fullname') normalizedRow.name = row[k];
                else if (cleanK === 'email' || cleanK === 'emailaddress') normalizedRow.email = row[k];
                else if (cleanK === 'dept' || cleanK === 'department') normalizedRow.department = row[k];
                else if (cleanK === 'year' || cleanK === 'semester') normalizedRow.year = row[k];
                else if (cleanK === 'role') normalizedRow.role = row[k];
                else if (cleanK === 'mobile' || cleanK === 'phone' || cleanK === 'mobilenumber') {
                    normalizedRow.mobile_number = row[k];
                    normalizedRow.mobile = row[k];
                }
            });

            // Re-assign back to data list for processing
            parsedData[idx] = normalizedRow;

            // Required Check
            cols.forEach(c => {
                if (!normalizedRow[c] && c !== 'mobile_number' && c !== 'mobile') {
                    rowErrors.push(`Missing ${c}`);
                }
            });

            if (normalizedRow.email && !emailRegex.test(normalizedRow.email)) {
                rowErrors.push('Invalid Email');
            }

            if (rowErrors.length > 0) errorCount++;

            return `
                <tr class="${rowErrors.length > 0 ? 'bg-danger-subtle' : ''}">
                    ${cols.map(c => `<td>${normalizedRow[c] || '<span class="text-danger">None</span>'}</td>`).join('')}
                    <td>${rowErrors.length > 0 ? `<span class="badge badge-high" title="${rowErrors.join(', ')}"><i class="fa-solid fa-circle-exclamation"></i> Error</span>` : '<span class="badge badge-resolved"><i class="fa-solid fa-check"></i> Ready</span>'}</td>
                </tr>
            `;
        }).join('');

        countSpan.textContent = `Rows Found: ${parsedData.length} (Showing top 50)`;
        if (errorCount > 0) {
            errorSpan.textContent = `⚠️ Detected ${errorCount} invalid rows. Please check data.`;
            document.getElementById('processImportBtn').disabled = true;
        } else {
            errorSpan.textContent = '';
            document.getElementById('processImportBtn').disabled = false;
        }
    }

    let lastImportSummary = null;

    window.downloadErrorReport = () => {
        if (!lastImportSummary || !lastImportSummary.failedRows || lastImportSummary.failedRows.length === 0) return;
        
        const worksheet = XLSX.utils.json_to_sheet(lastImportSummary.failedRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Errors");
        XLSX.writeFile(workbook, `${bulkType}_import_errors.xlsx`);
    };

    window.processBulkImport = async () => {
        const btn = document.getElementById('processImportBtn');
        const isDryRun = document.getElementById('isDryRunMode').checked;
        const filename = selectedFile ? selectedFile.name : 'upload.xlsx';

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

        const endpoint = bulkType === 'student' ? '/api/admin/bulk-import-students' : '/api/admin/bulk-import-staff';
        const payloadKey = bulkType === 'student' ? 'students' : 'staff';

        try {
            const response = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    [payloadKey]: parsedData,
                    isDryRun,
                    filename
                }),
                credentials: 'include'
            });

            const result = await response.json();

            if (result.success) {
                lastImportSummary = result.summary;
                document.getElementById('bulk-step-2').style.display = 'none';
                document.getElementById('bulk-step-3').style.display = 'block';
                
                const s = result.summary;
                document.getElementById('bulk-result-title').textContent = isDryRun ? 'Validation Complete' : 'Import Complete';
                document.getElementById('bulk-result-subtitle').textContent = isDryRun ? 'Pre-flight check finished. No data was modified.' : 'The registry has been updated successfully.';
                
                document.getElementById('bulk-result-details').innerHTML = `
                    <div class="row text-start mt-3">
                        <div class="col-6 mb-2">✅ Total Processed: <b>${s.total}</b></div>
                        <div class="col-6 mb-2">📌 Registered: <b>${s.inserted}</b></div>
                        <div class="col-6 mb-2">⏭️ Skipped (Dups): <b>${s.duplicates}</b></div>
                        <div class="col-6 mb-2">❌ Invalid/Failed: <b>${s.invalid}</b></div>
                        ${s.emailsQueued ? `<div class="col-12 mt-2" style="color: var(--gold);"><i class="fa-solid fa-envelope"></i> ${s.emailsQueued} activation emails queued.</div>` : ''}
                    </div>
                `;

                // Show error action if failures exist
                if (s.invalid > 0 || s.duplicates > 0) {
                    document.getElementById('failed-rows-action').style.display = 'block';
                } else {
                    document.getElementById('failed-rows-action').style.display = 'none';
                }

                // Reload tables if they are visible
                if (window.fetchStudents && bulkType === 'student') window.fetchStudents();
                if (window.fetchStaff && bulkType === 'staff') window.fetchStaff();
                
                // Refresh Analytics
                loadDashboardAnalytics();

            } else {
                UIUtils.showToast(`Import Failed: ${result.message}`, 'error');
                btn.disabled = false;
                btn.innerHTML = 'Process Import';
            }
        } catch (err) {
            console.error('Import POST error:', err);
            UIUtils.showToast('Server error during import.', 'error');
            btn.disabled = false;
            btn.innerHTML = 'Process Import';
        }
    };

    window.closeBulkImportModal = () => {
        window.closeModal('bulkImportModal');
        resetBulkImport();
    };

    window.resetBulkImport = () => {
        parsedData = [];
        lastImportSummary = null;
        document.getElementById('bulk-step-1').style.display = 'block';
        document.getElementById('bulk-step-2').style.display = 'none';
        document.getElementById('bulk-step-3').style.display = 'none';
        document.getElementById('bulk-file-input').value = '';
        document.getElementById('isDryRunMode').checked = false;
    };

    window.downloadSampleTemplate = () => {
        const studentSample = [
            ['roll_number', 'name', 'email', 'department', 'year', 'mobile_number'],
            ['202201', 'John Doe', 'john@college.edu', 'Computer Science', '1st Year', '9876543210'],
            ['202202', 'Jane Smith', 'jane@college.edu', 'Electronics', '2nd Year', '9876543211']
        ];
        const staffSample = [
            ['name', 'email', 'department', 'role', 'mobile'],
            ['Dr. Sharma', 'sharma@college.edu', 'Physics', 'staff', '9988776655'],
            ['Anjali HOD', 'anjali@college.edu', 'Computer Science', 'hod', '9988776644']
        ];
        
        const content = bulkType === 'student' ? studentSample : staffSample;
        const worksheet = XLSX.utils.aoa_to_sheet(content);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Sample");
        XLSX.writeFile(workbook, `${bulkType}_import_template.xlsx`);
    };

    // ── Hero Slider Management ──────────────────────────────────────────────
    
    window.loadSlides = async function() {
        try {
            const res = await fetch(`${API_BASE}/api/admin/slides`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                renderSlidesTable(data.slides);
            }
        } catch (err) {
            console.error('Failed to load slides', err);
        }
    };

    function renderSlidesTable(slides) {
        const tbody = document.getElementById('slides-tbody');
        if (!tbody) return;

        tbody.innerHTML = slides.map(s => `
            <tr class="fade-in">
                <td style="font-weight: bold; width: 80px;">${s.display_order}</td>
                <td style="width: 120px;">
                    <img src="${s.image_url}" alt="${s.title}" style="height: 50px; width: 90px; object-fit: cover; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);">
                </td>
                <td>
                    <div style="font-weight: bold; color: var(--gold);">${s.title}</div>
                    <div style="font-size: 0.8rem; opacity: 0.7; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${s.description || 'No description'}</div>
                </td>
                <td>
                    <label class="switch">
                        <input type="checkbox" onchange="toggleSlide(${s.id}, this.checked)" ${s.is_active ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                </td>
                <td>
                    <button class="action-btn" style="background: rgba(84,160,255,0.1); color: #54a0ff; border: 1px solid rgba(84,160,255,0.3);" onclick='openSlideModal(${JSON.stringify(s).replace(/'/g, "&#39;")})'>
                        <i class="fa-solid fa-pen"></i> Edit
                    </button>
                    <button class="action-btn" style="background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); margin-left: 5px;" onclick="deleteSlide(${s.id})">
                        <i class="fa-solid fa-trash"></i> Delete
                    </button>
                </td>
            </tr>
        `).join('');
    }

    window.openSlideModal = (slide = null) => {
        const titleInput = document.getElementById('slide-title');
        const descInput = document.getElementById('slide-description');
        const orderInput = document.getElementById('slide-order');
        const activeInput = document.getElementById('slide-active');
        const idInput = document.getElementById('slide-id');
        const imgInput = document.getElementById('slide-image');

        if (slide) {
            document.getElementById('slideModalTitle').innerText = 'Edit Slide';
            idInput.value = slide.id;
            titleInput.value = slide.title;
            descInput.value = slide.description || '';
            orderInput.value = slide.display_order;
            activeInput.checked = slide.is_active;
            imgInput.required = false;
        } else {
            document.getElementById('slideModalTitle').innerText = 'Add New Slide';
            document.getElementById('slide-form').reset();
            idInput.value = '';
            orderInput.value = 0;
            activeInput.checked = true;
            imgInput.required = true;
        }
        window.showModal('slideModal');
    };

    window.closeSlideModal = () => {
        window.closeModal('slideModal');
        const wrapper = document.getElementById('slide-preview-wrapper');
        const img = document.getElementById('slide-image-preview');
        if (wrapper && img) {
            wrapper.style.display = 'none';
            img.src = '';
        }
    };

    window.previewSlideImage = (input) => {
        const wrapper = document.getElementById('slide-preview-wrapper');
        const img = document.getElementById('slide-image-preview');
        
        if (input.files && input.files[0]) {
            const file = input.files[0];
            
            // Validate size (5MB max) and type
            if (file.size > 5 * 1024 * 1024) {
                showToast('Image size must be less than 5MB', 'error');
                input.value = '';
                wrapper.style.display = 'none';
                return;
            }
            if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
                showToast('Only JPEG, PNG, or WebP allowed', 'error');
                input.value = '';
                wrapper.style.display = 'none';
                return;
            }
            
            const reader = new FileReader();
            reader.onload = function(e) {
                img.src = e.target.result;
                wrapper.style.display = 'block';
            }
            reader.readAsDataURL(file);
        } else {
            wrapper.style.display = 'none';
        }
    };

    window.saveSlide = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('saveSlideBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

        const id = document.getElementById('slide-id').value;
        const form = document.getElementById('slide-form');
        const formData = new FormData();

        const imageFile = document.getElementById('slide-image').files[0];
        if (imageFile) {
            if (imageFile.size > 5 * 1024 * 1024) {
                showToast('Image size exceeds 5MB limit', 'error');
                btn.disabled = false;
                btn.innerHTML = 'Save Slide';
                return;
            }
            formData.append('image', imageFile);
        } else if (!id) {
            showToast('Image is required to create a new slide', 'error');
            btn.disabled = false;
            btn.innerHTML = 'Save Slide';
            return;
        }

        formData.append('title', document.getElementById('slide-title').value);
        formData.append('description', document.getElementById('slide-description').value);
        formData.append('display_order', document.getElementById('slide-order').value);
        formData.append('is_active', document.getElementById('slide-active').checked);

        const url = id ? `${API_BASE}/api/admin/slides/${id}` : `${API_BASE}/api/admin/slides`;
        const method = id ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method,
                body: formData,
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                showToast(data.message, 'success');
                closeSlideModal();
                loadSlides();
            } else {
                showToast(data.message || 'Failed to save slide', 'error');
            }
        } catch (err) {
            showToast('Network error while saving slide', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Save Slide';
        }
    };

    window.toggleSlide = async (id, isActive) => {
        try {
            const res = await fetch(`${API_BASE}/api/admin/slides/${id}/toggle`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: isActive }),
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                showToast('Slide status updated', 'success');
            } else {
                showToast('Failed to toggle status', 'error');
                loadSlides(); // revert
            }
        } catch (err) {
            showToast('Network error', 'error');
            loadSlides(); // revert
        }
    };

    window.deleteSlide = (id) => {
        showConfirmModal('Delete Slide', 'Are you sure you want to delete this slide? The image will be permanently removed.', async () => {
            try {
                const res = await fetch(`${API_BASE}/api/admin/slides/${id}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                const data = await res.json();
                if (data.success) {
                    showToast('Slide deleted successfully', 'success');
                    loadSlides();
                } else {
                    showToast(data.message || 'Delete failed', 'error');
                }
            } catch (err) {
                showToast('Network error', 'error');
            } finally {
                closeConfirmModal();
            }
        });
    };

    // =============================================
    // DYNAMIC SLIDES MANAGEMENT (Parallel System)
    // =============================================

    // --- Load & Render ---
    window.loadDynamicSlides = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/admin/dynamic-slides`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                renderDynamicSlidesTable(data.slides);
            } else {
                showToast('Failed to load dynamic slides', 'error');
            }
        } catch (err) {
            console.error('Failed to load dynamic slides', err);
            showToast('Network error loading slides', 'error');
        }
    };

    function renderDynamicSlidesTable(slides) {
        const tbody = document.getElementById('dynamic-slides-tbody');
        if (!tbody) return;
        if (!slides || slides.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; opacity:0.5;">No dynamic slides yet. Click "Add Dynamic Slide" to get started.</td></tr>`;
            return;
        }
        tbody.innerHTML = slides.map(s => {
            const isVideo = s.media_type === 'video';
            const mediaPreview = isVideo
                ? `<video src="${s.media_url}" style="width:80px;height:50px;object-fit:cover;border-radius:6px;" muted></video>`
                : `<img src="${s.media_url}" style="width:80px;height:50px;object-fit:cover;border-radius:6px;" alt="${s.title}">`;

            const typeBadge = isVideo
                ? `<span class="status-badge" style="background:rgba(139,92,246,0.15);color:#a78bfa;border:1px solid rgba(139,92,246,0.3);">🎬 Video</span>`
                : `<span class="status-badge" style="background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);">🖼 Image</span>`;

            return `
            <tr class="fade-in">
                <td style="text-align:center; font-weight:600; color:var(--gold);">${s.display_order}</td>
                <td>${mediaPreview}</td>
                <td>${typeBadge}</td>
                <td>
                    <div style="font-weight:600;">${s.title}</div>
                    <div style="font-size:0.75rem;opacity:0.6;margin-top:3px;">${s.description || '—'}</div>
                </td>
                <td>
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                        <input type="checkbox" ${s.is_active ? 'checked' : ''} 
                               onchange="toggleDynamicSlide(${s.id}, this.checked)"
                               style="width:18px;height:18px;cursor:pointer;">
                        <span style="font-size:0.8rem;color:${s.is_active ? '#10b981' : '#ef4444'};">
                            ${s.is_active ? 'Active' : 'Inactive'}
                        </span>
                    </label>
                </td>
                <td>
                    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                        <button class="action-btn" style="background:rgba(212,175,55,0.1);color:var(--gold);border:1px solid rgba(212,175,55,0.3);" 
                                onclick="openDynamicSlideModal(${s.id})">
                            <i class="fa-solid fa-pen-to-square"></i> Edit
                        </button>
                        <button class="action-btn btn-reject" onclick="deleteDynamicSlide(${s.id})">
                            <i class="fa-solid fa-trash"></i> Delete
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    // --- Modal Open/Close ---
    window.openDynamicSlideModal = async (id = null) => {
        document.getElementById('dynamic-slide-id').value = id || '';
        document.getElementById('dynamicSlideModalTitle').textContent = id ? 'Edit Dynamic Slide' : 'Add Dynamic Slide';
        document.getElementById('dynamic-slide-media').value = '';
        document.getElementById('dynamic-slide-preview-wrapper').style.display = 'none';
        document.getElementById('dynamic-slide-media-preview-container').innerHTML = '';
        document.getElementById('dynamic-slide-title').value = '';
        document.getElementById('dynamic-slide-description').value = '';
        document.getElementById('dynamic-slide-order').value = '0';
        document.getElementById('dynamic-slide-active').checked = true;

        if (id) {
            try {
                const res = await fetch(`${API_BASE}/api/admin/dynamic-slides`, { credentials: 'include' });
                const data = await res.json();
                if (data.success) {
                    const slide = data.slides.find(s => s.id === id);
                    if (slide) {
                        document.getElementById('dynamic-slide-title').value = slide.title;
                        document.getElementById('dynamic-slide-description').value = slide.description || '';
                        document.getElementById('dynamic-slide-order').value = slide.display_order;
                        document.getElementById('dynamic-slide-active').checked = slide.is_active;

                        // Show current media preview
                        const previewContainer = document.getElementById('dynamic-slide-media-preview-container');
                        if (slide.media_type === 'video') {
                            previewContainer.innerHTML = `<video src="${slide.media_url}" style="width:100%;max-height:200px;object-fit:contain;" controls muted></video>`;
                        } else {
                            previewContainer.innerHTML = `<img src="${slide.media_url}" style="width:100%;max-height:200px;object-fit:cover;" alt="Current">`;
                        }
                        document.getElementById('dynamic-slide-preview-wrapper').style.display = 'block';
                    }
                }
            } catch (err) {
                console.error('Error loading slide for edit:', err);
            }
        }

        window.showModal('dynamicSlideModal');
    };

    window.closeDynamicSlideModal = () => {
        window.closeModal('dynamicSlideModal');
    };

    // --- Preview media before upload ---
    window.previewDynamicSlideMedia = (input) => {
        const file = input.files[0];
        if (!file) return;

        const wrapper = document.getElementById('dynamic-slide-preview-wrapper');
        const container = document.getElementById('dynamic-slide-media-preview-container');
        container.innerHTML = '';

        const url = URL.createObjectURL(file);
        if (file.type.startsWith('video/')) {
            container.innerHTML = `<video src="${url}" style="width:100%;max-height:200px;object-fit:contain;" controls muted playsinline></video>`;
        } else {
            container.innerHTML = `<img src="${url}" style="width:100%;max-height:200px;object-fit:cover;" alt="Preview">`;
        }
        wrapper.style.display = 'block';
    };

    // --- Save (Create or Update) ---
    window.saveDynamicSlide = async (event) => {
        event.preventDefault();
        const id = document.getElementById('dynamic-slide-id').value;
        const title = document.getElementById('dynamic-slide-title').value.trim();
        const description = document.getElementById('dynamic-slide-description').value.trim();
        const display_order = document.getElementById('dynamic-slide-order').value;
        const is_active = document.getElementById('dynamic-slide-active').checked;
        const mediaFile = document.getElementById('dynamic-slide-media').files[0];

        if (!id && !mediaFile) {
            showToast('Please select a media file (image or video)', 'error');
            return;
        }

        const btn = document.getElementById('saveDynamicSlideBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

        try {
            const formData = new FormData();
            formData.append('title', title);
            formData.append('description', description);
            formData.append('display_order', display_order);
            formData.append('is_active', is_active);
            if (mediaFile) formData.append('media', mediaFile);

            const url = id
                ? `${API_BASE}/api/admin/dynamic-slides/${id}`
                : `${API_BASE}/api/admin/dynamic-slides`;
            const method = id ? 'PUT' : 'POST';

            const res = await fetch(url, { method, body: formData, credentials: 'include' });
            const data = await res.json();

            if (data.success) {
                showToast(id ? 'Slide updated successfully!' : 'Slide created successfully!', 'success');
                closeDynamicSlideModal();
                window.loadDynamicSlides();
            } else {
                showToast(data.message || 'Failed to save slide', 'error');
            }
        } catch (err) {
            console.error('Error saving dynamic slide:', err);
            showToast('Network error saving slide', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Save Slide';
        }
    };

    // --- Toggle Active ---
    window.toggleDynamicSlide = async (id, isActive) => {
        try {
            const res = await fetch(`${API_BASE}/api/admin/dynamic-slides/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: isActive }),
                credentials: 'include'
            });
            // Note: We need title to do a PUT, so we fetch first
            const listRes = await fetch(`${API_BASE}/api/admin/dynamic-slides`, { credentials: 'include' });
            const listData = await listRes.json();
            if (listData.success) {
                const slide = listData.slides.find(s => s.id === id);
                if (slide) {
                    const toggleRes = await fetch(`${API_BASE}/api/admin/dynamic-slides/${id}`, {
                        method: 'PUT',
                        credentials: 'include',
                        body: (() => {
                            const fd = new FormData();
                            fd.append('title', slide.title);
                            fd.append('description', slide.description || '');
                            fd.append('display_order', slide.display_order);
                            fd.append('is_active', isActive);
                            return fd;
                        })()
                    });
                    const toggleData = await toggleRes.json();
                    if (toggleData.success) {
                        showToast(`Slide ${isActive ? 'activated' : 'deactivated'}`, 'success');
                    } else {
                        showToast('Failed to toggle status', 'error');
                        window.loadDynamicSlides();
                    }
                }
            }
        } catch (err) {
            showToast('Network error', 'error');
            window.loadDynamicSlides();
        }
    };

    // --- Delete ---
    window.deleteDynamicSlide = (id) => {
        showConfirmModal('Delete Dynamic Slide', 'Are you sure? This will permanently delete the slide and its media from Cloudinary.', async () => {
            try {
                const res = await fetch(`${API_BASE}/api/admin/dynamic-slides/${id}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                const data = await res.json();
                if (data.success) {
                    showToast('Dynamic slide deleted', 'success');
                    window.loadDynamicSlides();
                } else {
                    showToast(data.message || 'Delete failed', 'error');
                }
            } catch (err) {
                showToast('Network error', 'error');
            } finally {
                closeConfirmModal();
            }
        });
    };
    // --- SAFE INITIALIZATION OF DASHBOARD MODULES ---
    // Executed at the very end after all functions and event listeners are registered.
    const safeInit = async () => {
        const initTasks = [
            { name: 'fetchStats', fn: typeof fetchStats === 'function' ? fetchStats : window.fetchStats },
            { name: 'loadDashboardAnalytics', fn: typeof loadDashboardAnalytics === 'function' ? loadDashboardAnalytics : window.loadDashboardAnalytics },
            { name: 'fetchComplaints', fn: typeof fetchComplaints === 'function' ? fetchComplaints : window.fetchComplaints },
            { name: 'fetchStaff', fn: typeof fetchStaff === 'function' ? fetchStaff : window.fetchStaff },
            { name: 'fetchStudents', fn: typeof fetchStudents === 'function' ? fetchStudents : window.fetchStudents },
            { name: 'loadDepartments', fn: typeof loadDepartments === 'function' ? loadDepartments : window.loadDepartments },
            { name: 'fetchDeptManagement', fn: typeof fetchDeptManagement === 'function' ? fetchDeptManagement : window.fetchDeptManagement },
            { name: 'loadGallery', fn: typeof loadGallery === 'function' ? loadGallery : window.loadGallery }
        ];

        for (const task of initTasks) {
            if (typeof task.fn === 'function') {
                try {
                    const res = task.fn();
                    if (res && typeof res.then === 'function') await res;
                } catch (err) {
                    console.error(`[Admin Dashboard] SafeInit error in module ${task.name}:`, err);
                }
            } else {
                console.warn(`[Admin Dashboard] SafeInit warning: ${task.name} is not a valid function.`);
            }
        }
        
        // 🚨 Fallback: Ensure Dashboard tab is active by default after init
        if (typeof window.switchTab === 'function') {
            window.switchTab('tab-dashboard');
        }
    };

    safeInit();

});
