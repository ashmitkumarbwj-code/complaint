document.addEventListener('DOMContentLoaded', () => {
    // 1. Check Authentication
    const user = JSON.parse(localStorage.getItem('scrs_user'));
    const token = localStorage.getItem('scrs_token');

    if (!token || !user || user.role !== 'Principal') {
        window.location.href = 'login.html?role=Principal';
        return;
    }

    // 2. Wire up navigation
    setupNav();

    // 2.1 Init Storytelling Animation
    initDashboardStorytelling();

    // 3. Initial Data Fetch for Overview + Alerts
    fetchDashboardStats();
    fetchCriticalComplaints();

    // 4. Socket.io setup
    const socket = io();
    socket.emit('join', 'principal_room');

    socket.on('emergency_alert', (data) => {
        showToast(data);
        fetchDashboardStats();
        fetchCriticalComplaints();
        fetchEmergencyAlerts();
    });

    socket.on('new_escalation', (data) => {
        console.log('New escalation alert:', data);
        fetchDashboardStats();
        fetchCriticalComplaints();
        fetchEmergencyAlerts();
    });

    // Preload alerts and analytics in background
    fetchAllComplaintsForPrincipal();
    fetchDeptPerformance();
    fetchPrincipalAnalytics();
    fetchEmergencyAlerts();
    
    // Initial Chart Setup
    initCharts();
    
    // Initial Profile Load
    loadPrincipalProfile();
});

function setupNav() {
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    navItems.forEach(item => {
        const sectionKey = item.getAttribute('data-section');
        if (!sectionKey) return;
        item.addEventListener('click', (e) => {
            e.preventDefault();
            // active nav
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            // active section
            document.querySelectorAll('.pd-section').forEach(sec => sec.classList.remove('active'));
            const target = document.getElementById(`section-${sectionKey}`);
            if (target) target.classList.add('active');

            // Lazy-load per section
            if (sectionKey === 'all') {
                fetchAllComplaintsForPrincipal();
            } else if (sectionKey === 'departments') {
                fetchDeptPerformance();
            } else if (sectionKey === 'analytics') {
                fetchPrincipalAnalytics();
            } else if (sectionKey === 'alerts') {
                fetchEmergencyAlerts();
            } else if (sectionKey === 'settings') {
                loadPrincipalProfile();
            }
            
            // Trigger storytelling transition based on section
            transitionStory(sectionKey);
        });
    });

    // Filter change for All Complaints
    const filterSelect = document.getElementById('all-filter-status');
    if (filterSelect) {
        filterSelect.addEventListener('change', () => {
            renderAllComplaints(window.__principalAllComplaints || []);
        });
    }
}

async function fetchDashboardStats() {
    try {
        const token = localStorage.getItem('scrs_token');
        const res = await fetch('/api/dashboards/principal/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            const stats = data.stats;
            document.getElementById('total-today').textContent = stats.total_today;
            document.getElementById('pending-count').textContent = stats.pending;
            document.getElementById('escalated-count').textContent = stats.escalated;
            document.getElementById('resolved-today').textContent = stats.resolved_today;
        }
    } catch (error) {
        console.error('Error fetching stats:', error);
    }
}

async function fetchCriticalComplaints() {
    try {
        const token = localStorage.getItem('scrs_token');
        const res = await fetch('/api/dashboards/principal/critical', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            const complaints = data.complaints;
            const tbody = document.getElementById('critical-body');
            tbody.innerHTML = '';

            // Initialize Review Queue
            window.__reviewQueue = new ComplaintQueue(complaints);

            complaints.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>#${item.id}</td>
                    <td>${item.description}</td>
                    <td>${item.department_name}</td>
                    <td>
                        <span class="status-badge ${item.status === 'Escalated' ? 'status-escalated' : 'status-pending'}">${item.status}</span>
                        ${item.priority === 'Emergency' ? '<span class="status-badge" style="background:rgba(239,68,68,0.2); color:#ef4444; margin-left:0.5rem;">EMERGENCY</span>' : ''}
                    </td>
                    <td><button class="btn btn-glass" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="startSequentialReview(${item.id})">Review</button></td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error('Error fetching complaints:', error);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sequential Review Flow (Linked-List Based)
// ─────────────────────────────────────────────────────────────────────────────

class ComplaintNode {
    constructor(complaint) {
        this.data = complaint;
        this.next = null;
        this.prev = null;
    }
}

class ComplaintQueue {
    constructor(complaints) {
        this.head = null;
        this.tail = null;
        this.size = 0;
        this.currentIndex = 0;
        this.totalInitial = complaints.length;

        complaints.forEach(c => this.add(c));
    }

    add(complaint) {
        const newNode = new ComplaintNode(complaint);
        if (!this.head) {
            this.head = newNode;
            this.tail = newNode;
        } else {
            this.tail.next = newNode;
            newNode.prev = this.tail;
            this.tail = newNode;
        }
        this.size++;
    }

    find(id) {
        let curr = this.head;
        let idx = 0;
        while (curr) {
            if (curr.data.id === id) {
                this.currentIndex = idx;
                return curr;
            }
            curr = curr.next;
            idx++;
        }
        return null;
    }

    remove(node) {
        if (!node) return null;
        if (node.prev) node.prev.next = node.next;
        if (node.next) node.next.prev = node.prev;
        if (node === this.head) this.head = node.next;
        if (node === this.tail) this.tail = node.prev;
        this.size--;
        return node.next || this.head; // Loop back if at end or return next
    }
}

let activeNode = null;

window.startSequentialReview = function(id) {
    if (!window.__reviewQueue || window.__reviewQueue.size === 0) {
        alert('No pending complaints to review.');
        return;
    }

    activeNode = window.__reviewQueue.find(id);
    if (!activeNode) {
        activeNode = window.__reviewQueue.head;
    }

    document.getElementById('review-modal').classList.add('active');
    renderActiveComplaint();
};

window.closeReviewModal = function() {
    document.getElementById('review-modal').classList.remove('active');
};

function renderActiveComplaint() {
    if (!activeNode) {
        closeReviewModal();
        alert('All selected complaints have been reviewed!');
        return;
    }

    const c = activeNode.data;
    const queue = window.__reviewQueue;

    // Update Progress
    const currentPos = queue.currentIndex + 1;
    const total = queue.totalInitial;
    const pct = Math.round((currentPos / total) * 100);

    document.getElementById('review-progress-text').textContent = `Reviewing ${currentPos} of ${total}`;
    document.getElementById('review-percentage').textContent = `${pct}%`;
    document.getElementById('review-progress-bar').style.width = `${pct}%`;

    // Update Content with animation
    const content = document.getElementById('review-content');
    gsap.fromTo(content, { opacity: 0, x: 50 }, { opacity: 1, x: 0, duration: 0.5 });

    document.getElementById('review-id-badge').textContent = `#${c.id}`;
    document.getElementById('review-category').textContent = c.category;
    document.getElementById('review-student').textContent = c.student_name || 'Anonymous Student';
    document.getElementById('review-dept').textContent = c.department_name;
    document.getElementById('review-description').textContent = c.description;
    
    const priorityBadge = document.getElementById('review-priority');
    priorityBadge.textContent = c.priority;
    priorityBadge.className = `status-badge ${c.priority === 'Emergency' || c.priority === 'High' ? 'priority-high' : 'status-pending'}`;

    // Media Preview (Instant)
    const mediaContainer = document.getElementById('review-media-container') || document.createElement('div');
    if (!document.getElementById('review-media-container')) {
        mediaContainer.id = 'review-media-container';
        mediaContainer.style.marginTop = '1.5rem';
        document.getElementById('review-description').after(mediaContainer);
    }
    
    if (c.media_url) {
        mediaContainer.innerHTML = `
            <div style="font-weight:700; font-size:0.75rem; text-transform:uppercase; color:var(--gold-color); margin-bottom:0.5rem; opacity:0.8;">Evidence / Media</div>
            ${MediaUtils.render(c.media_url)}
        `;
    } else {
        mediaContainer.innerHTML = '';
    }


    // Load History for this complaint
    loadComplaintHistory(c.id);
}

async function loadComplaintHistory(id) {
    const historyList = document.getElementById('review-history-list');
    if (!historyList) return;
    historyList.innerHTML = '<li style="color:var(--text-muted); font-size:0.75rem;">Loading history...</li>';

    try {
        const token = localStorage.getItem('scrs_token');
        const res = await fetch(`/api/complaints/${id}/history`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success && data.history.length > 0) {
            historyList.innerHTML = data.history.map(h => `
                <li style="margin-bottom:0.8rem; position:relative; padding-left:1rem; border-left:1px dashed rgba(255,255,255,0.2);">
                    <div style="font-weight:600; color:${h.is_current ? 'var(--gold-color)' : 'white'}; font-size:0.8rem;">
                        ${h.department_name} ${h.is_current ? '<span style="font-size:0.6rem; opacity:0.8; vertical-align:middle;">● CURRENT</span>' : ''}
                    </div>
                    <div style="color:rgba(255,255,255,0.4); font-size:0.7rem;">
                        ${new Date(h.assigned_at).toLocaleString()} • by ${h.assigned_by_name || 'System'}
                    </div>
                    ${h.notes ? `<div style="color:rgba(255,255,255,0.6); font-size:0.75rem; margin-top:0.2rem; font-style:italic;">"${h.notes}"</div>` : ''}
                </li>
            `).join('');
        } else {
            historyList.innerHTML = '<li style="color:var(--text-muted); font-size:0.75rem;">No movement recorded.</li>';
        }
    } catch (err) {
        historyList.innerHTML = 'Error loading history.';
    }
}

// Logic for "Resolve & Next"
document.getElementById('btn-clear-next').addEventListener('click', async () => {
    if (!activeNode) return;

    const btn = document.getElementById('btn-clear-next');
    const originalText = btn.innerHTML;
    const complaintId = activeNode.data.id;

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Clearing...';

        const token = localStorage.getItem('scrs_token');
        const res = await fetch(`/api/complaints/status/${complaintId}`, {
            method: 'PATCH',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'Resolved', admin_notes: 'Resolved by Principal during sequential review.' })
        });

        const data = await res.json();
        if (data.success) {
            // Animate card out
            gsap.to("#review-content", { opacity: 0, x: -50, duration: 0.3, onComplete: () => {
                // Move to next node in linked list
                activeNode = window.__reviewQueue.remove(activeNode);
                renderActiveComplaint();
                
                // Refresh background lists
                fetchDashboardStats();
                fetchCriticalComplaints();
            }});
        } else {
            alert('Failed to update status');
        }
    } catch (err) {
        console.error('Clear error:', err);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

// Logic for "Skip"
document.getElementById('btn-skip-next').addEventListener('click', () => {
    if (!activeNode) return;

    gsap.to("#review-content", { opacity: 0, x: -50, duration: 0.3, onComplete: () => {
        activeNode = activeNode.next || window.__reviewQueue.head;
        if (activeNode) {
            // Update index tracking
            let curr = window.__reviewQueue.head;
            let idx = 0;
            while(curr !== activeNode) { curr = curr.next; idx++; }
            window.__reviewQueue.currentIndex = idx;
        }
        renderActiveComplaint();
    }});
});

function showToast(data) {
    // Toast notification logic
    console.log('Emergency Alert:', data);
}

// ─────────────────────────────────────────────────────────────────────────────
// Storytelling & Animations
// ─────────────────────────────────────────────────────────────────────────────

function initDashboardStorytelling() {
    // Initial Reveal
    gsap.from(".sidebar", { x: -100, opacity: 0, duration: 1, ease: "power3.out" });
    gsap.from(".top-bar", { y: -50, opacity: 0, duration: 1, ease: "power3.out", delay: 0.3 });
    
    // Reveal current section
    animateSectionReveal(document.querySelector('.pd-section.active'));
}

function animateSectionReveal(section) {
    if (!section) return;
    
    const reveals = section.querySelectorAll('.gsap-reveal');
    if (reveals.length > 0) {
        gsap.fromTo(reveals, 
            { y: 30, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: "power2.out" }
        );
    } else {
        gsap.fromTo(section, 
            { opacity: 0, x: 20 },
            { opacity: 1, x: 0, duration: 0.6, ease: "power2.out" }
        );
    }
}

function transitionStory(sectionKey) {
    const layers = {
        town: document.querySelector('.layer-town'),
        college: document.querySelector('.layer-college'),
        mountains: document.querySelector('.layer-mountains')
    };

    if (!layers.town) return;

    function bg(key) {
        Object.keys(layers).forEach(k => {
            if (k === key) layers[k].classList.add('active');
            else layers[k].classList.remove('active');
        });
    }

    // Storytelling Logic: Mapping sections to background scenes
    switch(sectionKey) {
        case 'overview':
            bg('town'); // Overview = Starting the journey
            break;
        case 'all':
            bg('admin'); // All Complaints = Administrative oversight
            break;
        case 'departments':
            bg('college'); // Departments = Campus infrastructure
            break;
        case 'analytics':
            bg('governance'); // Analytics = Data-driven governance
            break;
        case 'alerts':
            bg('mountains'); // Emergency Alerts = High-level critical status
            break;
        case 'settings':
            bg('student'); // Settings = Personal interface / Community feel
            break;
    }

    // Animate the new active section
    const activeSection = document.getElementById(`section-${sectionKey}`);
    animateSectionReveal(activeSection);
}

// ─────────────────────────────────────────────────────────────────────────────
// Charts & Visualizations (Senior Level Premium UI)
// ─────────────────────────────────────────────────────────────────────────────
let efficiencyChart = null;
let distributionChart = null;

function initCharts() {
    const effCtx = document.getElementById('efficiencyChart');
    const distCtx = document.getElementById('distributionChart');
    if (!effCtx || !distCtx) return;

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                max: 100,
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } }
            },
            x: {
                grid: { display: false },
                ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 10 } }
            }
        }
    };

    efficiencyChart = new Chart(effCtx, {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Efficiency %', data: [], backgroundColor: '#d4af37', borderRadius: 5 }] },
        options: chartOptions
    });

    distributionChart = new Chart(distCtx, {
        type: 'doughnut',
        data: { 
            labels: [], 
            datasets: [{ 
                data: [], 
                backgroundColor: ['#d4af37', '#b8860b', '#daa520', '#ffd700', '#f0e68c', '#bdb76b'],
                borderWidth: 0,
                hoverOffset: 10
            }] 
        },
        options: {
            ...chartOptions,
            scales: {}, // remove scales for doughnut
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { color: 'rgba(255,255,255,0.7)', font: { size: 10 }, usePointStyle: true, padding: 15 }
                }
            }
        }
    });
}

function updateCharts(departments) {
    if (!efficiencyChart || !distributionChart) return;

    const labels = departments.map(d => d.name.length > 15 ? d.name.substring(0,12)+'...' : d.name);
    const efficiencies = departments.map(d => d.resolution_pct || 0);
    const distributions = departments.map(d => d.total_complaints || 0);

    // Update Efficiency Chart (Bar)
    efficiencyChart.data.labels = labels;
    efficiencyChart.data.datasets[0].data = efficiencies;
    efficiencyChart.data.datasets[0].backgroundColor = efficiencies.map(p => 
        p > 80 ? '#10b981' : p > 50 ? '#f59e0b' : '#ef4444'
    );
    efficiencyChart.update();

    // Update Distribution Chart (Doughnut)
    distributionChart.data.labels = labels;
    distributionChart.data.datasets[0].data = distributions;
    distributionChart.update();
}

// ─────────────────────────────────────────────────────────────────────────────
// All Complaints (Principal view)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAllComplaintsForPrincipal() {
    try {
        const token = localStorage.getItem('scrs_token');
        const res = await fetch('/api/complaints/all', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            window.__principalAllComplaints = data.complaints || [];
            renderAllComplaints(window.__principalAllComplaints);
        }
    } catch (err) {
        console.error('Error fetching all complaints for principal:', err);
    }
}

function renderAllComplaints(complaints) {
    const tbody = document.getElementById('principal-all-tbody');
    if (!tbody) return;
    const filter = (document.getElementById('all-filter-status') || {}).value || '';

    const filtered = filter
        ? complaints.filter(c => c.status === filter)
        : complaints;

    tbody.innerHTML = filtered.map(c => `
        <tr>
            <td>#${c.id}</td>
            <td style="font-weight:700; color:var(--gold-color);">${c.title || 'Untitled'}</td>
            <td>${c.student_name || 'Student #' + c.student_id}</td>
            <td>${c.department_name}</td>
            <td>${c.category}</td>
            <td><span class="status-badge status-${c.status.toLowerCase().replace(' ', '')}">${c.status}</span></td>
            <td><span class="status-badge" style="background:rgba(255,255,255,0.05);">${c.priority}</span></td>
            <td>${new Date(c.created_at).toLocaleDateString()}</td>
        </tr>
    `).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Departments & Analytics (uses /api/dashboards/admin/stats, allowed for Principal)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchDeptPerformance() {
    try {
        const token = localStorage.getItem('scrs_token');
        const res = await fetch('/api/departments/stats/all', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success || !data.departments) return;

        const departments = data.departments;

        // 1. Update Full Department List Section
        const tbody = document.getElementById('principal-dept-tbody');
        if (tbody) {
            tbody.innerHTML = departments.map(d => {
                const total = d.total_complaints || 0;
                const resolved = d.resolved || 0;
                const pct = d.resolution_pct || 0;
                const cats = d.categories || [];
                
                return `
                    <tr class="fade-in">
                        <td style="font-weight:600;">${d.name}</td>
                        <td>
                            <div style="display:flex; flex-wrap:wrap; gap:0.3rem;">
                                ${cats.map(c => `<span class="status-badge" style="background:rgba(255,215,0,0.1); color:var(--gold-color); font-size:0.7rem; padding:0.1rem 0.5rem; border-radius:4px;">${c}</span>`).join('')}
                                ${cats.length === 0 ? '<span style="color:var(--text-muted); font-size:0.8rem;">None</span>' : ''}
                            </div>
                        </td>
                        <td style="text-align:center;"><span style="font-weight:bold;">${d.staff_count}</span></td>
                        <td style="text-align:center;"><span style="color:#f59e0b;">${d.pending || 0}</span></td>
                        <td style="text-align:center;"><span style="color:#3498db;">${d.in_progress || 0}</span></td>
                        <td style="text-align:center;"><span style="color:#10b981;">${d.resolved || 0}</span></td>
                        <td style="text-align:center;">
                            <div style="font-weight:bold; color:${pct > 80 ? '#10b981' : pct > 50 ? '#f59e0b' : '#ef4444'};">${pct}%</div>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        // 2. Update Overview Efficiency Card (Mini bars)
        const overviewContainer = document.getElementById('overview-dept-efficiency');
        if (overviewContainer) {
            overviewContainer.innerHTML = departments.slice(0, 4).map(d => {
                const pct = d.resolution_pct || 0;
                let color = '#ef4444';
                if (pct > 80) color = '#10b981';
                else if (pct > 50) color = '#f59e0b';

                return `
                    <div style="margin-bottom:0.8rem;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.3rem; font-size: 0.85rem;">
                            <span>${d.name}</span>
                            <span>${pct}%</span>
                        </div>
                        <div style="height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px;">
                            <div style="width: ${pct}%; height: 100%; background: ${color}; border-radius: 2px; transition: width 1s ease;"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 3. Update Visual Charts
        updateCharts(departments);

    } catch (err) {
        console.error('Error fetching department performance:', err);
    }
}

async function fetchPrincipalAnalytics() {
    try {
        const token = localStorage.getItem('scrs_token');
        const res = await fetch('/api/dashboards/admin/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success || !data.stats) return;

        document.getElementById('analytics-total').textContent = data.stats.total;
        document.getElementById('analytics-pending').textContent = data.stats.pending;
        document.getElementById('analytics-resolved').textContent = data.stats.resolved;
    } catch (err) {
        console.error('Error fetching principal analytics:', err);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Emergency Alerts list
// ─────────────────────────────────────────────────────────────────────────────

async function fetchEmergencyAlerts() {
    try {
        const token = localStorage.getItem('scrs_token');
        const res = await fetch('/api/dashboards/principal/critical', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) return;
        const tbody = document.getElementById('principal-alerts-tbody');
        if (!tbody) return;
        tbody.innerHTML = data.complaints.map(c => `
            <tr>
                <td>#${c.id}</td>
                <td>${c.description}</td>
                <td>${c.department_name}</td>
                <td><span class="status-badge status-${c.status.toLowerCase().replace(' ', '')}">${c.status}</span></td>
                <td>${c.priority}</td>
                <td>${new Date(c.created_at).toLocaleString()}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Error fetching emergency alerts:', err);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile & Settings
// ─────────────────────────────────────────────────────────────────────────────

async function loadPrincipalProfile() {
    try {
        const token = localStorage.getItem('scrs_token');
        const res = await fetch('/api/users/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (data.success) {
            const user = data.user;
            
            // Update Top Bar & Settings inputs
            const welcomeName = document.getElementById('welcome-name');
            if (welcomeName) welcomeName.textContent = `Welcome, ${user.username}`;

            const nameInput = document.getElementById('profile-name');
            if (nameInput) nameInput.value = user.username;
            
            const nameDisplay = document.getElementById('display-name');
            if (nameDisplay) nameDisplay.textContent = user.username;
            
            const emailDisplay = document.getElementById('display-email');
            if (emailDisplay) emailDisplay.textContent = user.email;

            // Handle Profile Images (Top Bar & Settings)
            updateProfileUI(user);
        }
    } catch (err) {
        console.error('Error loading principal profile:', err);
    }
}

function updateProfileUI(user) {
    const topBarImg = document.getElementById('top-bar-profile-img');
    const settingsImg = document.getElementById('settings-profile-img');
    const initial = (user.username || 'P').charAt(0).toUpperCase();

    if (user.profile_image) {
        if (topBarImg) topBarImg.innerHTML = `<img src="${user.profile_image}" style="width:100%; height:100%; object-fit:cover;">`;
        if (settingsImg) settingsImg.innerHTML = `<img src="${user.profile_image}" style="width:100%; height:100%; object-fit:cover;">`;
    } else {
        if (topBarImg) topBarImg.innerHTML = `<span id="profile-initials">${initial}</span>`;
        if (settingsImg) settingsImg.innerHTML = `<span id="settings-initials">${initial}</span>`;
    }
}

// Global preview function (called via HTML onchange)
window.previewProfileImage = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const settingsImg = document.getElementById('settings-profile-img');
            if (settingsImg) {
                settingsImg.innerHTML = `<img src="${e.target.result}" style="width:100%; height:100%; object-fit:cover;">`;
            }
        };
        reader.readAsDataURL(input.files[0]);
    }
};

// Handle Form Submission
const profileForm = document.getElementById('profile-edit-form');
if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const saveBtn = document.getElementById('save-profile-btn');
        const originalText = saveBtn.innerHTML;
        
        const name = document.getElementById('profile-name').value;
        const password = document.getElementById('profile-password').value;
        const confirmMsg = document.getElementById('profile-confirm-password').value;
        const fileInput = document.getElementById('profile-upload');

        // Validation
        if (password && password.length < 8) {
            alert('Password must be at least 8 characters');
            return;
        }
        if (password && password !== confirmMsg) {
            alert('Passwords do not match');
            return;
        }

        try {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

            const formData = new FormData();
            if (name) formData.append('username', name);
            if (password) formData.append('password', password);
            if (fileInput.files[0]) formData.append('profile_image', fileInput.files[0]);

            const token = localStorage.getItem('scrs_token');
            const res = await fetch('/api/users/profile', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            const data = await res.json();
            if (data.success) {
                // Update LocalStorage user info if needed
                const localUser = JSON.parse(localStorage.getItem('scrs_user'));
                localUser.username = data.user.username;
                localStorage.setItem('scrs_user', JSON.stringify(localUser));

                // Update UI
                updateProfileUI(data.user);
                const welcomeName = document.getElementById('welcome-name');
                if (welcomeName) welcomeName.textContent = `Welcome, ${data.user.username}`;
                document.getElementById('display-name').textContent = data.user.username;
                
                // Clear password fields
                document.getElementById('profile-password').value = '';
                document.getElementById('profile-confirm-password').value = '';
                
                alert('Profile updated successfully!');
            } else {
                alert(data.message || 'Update failed');
            }
        } catch (err) {
            console.error('Submit error:', err);
            alert('Server error occurred');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        }
    });
}
