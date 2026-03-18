/**
 * Admin Dashboard - Smart Campus Response System
 * Govt. College Dharamshala
 */

document.addEventListener("DOMContentLoaded", () => {
    // 1. Auth & Initial Checks
    const user = JSON.parse(localStorage.getItem('scrs_user'));
    const token = localStorage.getItem('scrs_token');
    
    if (!user || user.role !== 'Admin' || !token) {
        window.location.href = 'login.html';
        return;
    }

    // 2. Initialize Three.js Background
    initThreeJSBackground();

    // 3. Initialize Socket.io
    const socket = io();
    socket.emit('join', 'admin');

    socket.on('new_complaint', (data) => {
        showToast('New complaint received!');
        fetchStats();
        fetchComplaints();
    });

    socket.on('status_updated', (data) => {
        fetchStats();
        fetchComplaints();
    });

    // 4. Initial Fetches
    fetchStats();
    fetchComplaints();
    fetchStaff();
    fetchStudents();
    loadDepartments();
    fetchDeptManagement();
    loadGallery();

    // 5. Global Functions
    window.logout = () => {
        localStorage.removeItem('scrs_token');
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
        img.src = url;
        modal.style.display = 'flex';
    };

    // 5.1 Gallery Cropping Logic
    let cropper = null;
    let selectedFile = null;

    window.closeCropModal = () => {
        document.getElementById('cropModal').style.display = 'none';
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
            const token = localStorage.getItem('scrs_token');
            const res = await fetch(`/api/admin/complaints/${id}/status`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
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
        document.getElementById('confirmModal').style.display = 'flex';
        document.getElementById('confirmActionBtn').onclick = onConfirm;
    };

    window.closeConfirmModal = () => {
        document.getElementById('confirmModal').style.display = 'none';
    };

    window.showToast = (message, type = 'info') => {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `glass-panel toast toast-${type}`;
        toast.style.padding = '1rem 1.5rem';
        toast.style.marginBottom = '1rem';
        toast.style.borderLeft = `4px solid ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#f59e0b'}`;
        toast.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-xmark' : 'fa-circle-info'}"></i>
                <span>${message}</span>
            </div>
        `;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    };

    // 8. Fetch Functions
    async function fetchStats() {
        try {
            const token = localStorage.getItem('scrs_token');
            const statsRes = await fetch('/api/stats/admin', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const stats = await statsRes.json();
            if (stats.success) {
                animateNumber('stat-total', stats.stats.total);
                animateNumber('stat-pending', stats.stats.pending);
                animateNumber('stat-resolved', stats.stats.resolved);
            }
        } catch (err) { console.error(err); }
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

    async function fetchComplaints() {
        try {
            const token = localStorage.getItem('scrs_token');
            const compRes = await fetch('/api/complaints/all', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const compData = await compRes.json();
            if (compData.success) {
                renderTable(compData.complaints);
            }
        } catch (err) { console.error(err); }
    }

    function renderTable(complaints) {
        const tbody = document.getElementById('complaints-tbody');
        tbody.innerHTML = complaints.map(c => `
            <tr class="fade-in">
                <td>#${c.id}</td>
                <td>${c.student_name || 'Student #' + c.student_id}</td>
                <td>${c.category}</td>
                <td>${c.location}</td>
                <td><span class="status-badge status-${c.status.toLowerCase().replace(' ', '')}">${c.status}</span></td>
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
        `).join('');
    }

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
            const token = localStorage.getItem('scrs_token');
            fetch('/api/admin/departments', { headers: { 'Authorization': `Bearer ${token}` } })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        deptSelect.innerHTML = data.departments
                            .map(d => `<option value="${d.id}">${d.name}</option>`)
                            .join('');
                    }
                });
        }

        document.getElementById('forwardModal').style.display = 'flex';
    };

    window.closeForwardModal = () => {
        document.getElementById('forwardModal').style.display = 'none';
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
            const res = await fetch(`/api/admin/complaints/${forwardTargetId}/forward`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
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
            const token = localStorage.getItem('scrs_token');
            const res = await fetch('/api/departments', {
                headers: { 'Authorization': `Bearer ${token}` }
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
                const token = localStorage.getItem('scrs_token');
                const res = await fetch(`/api/departments/${deptId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
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

        modal.style.display = 'flex';
    };

    window.closeDeptModal = () => {
        document.getElementById('deptModal').style.display = 'none';
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
            const token = localStorage.getItem('scrs_token');
            const method = currentDeptId ? 'PUT' : 'POST';
            const url = currentDeptId ? `/api/departments/${currentDeptId}` : '/api/departments';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
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

    window.openForwardModal = async (id) => {
        document.getElementById('forward-complaint-id').value = id;
        document.getElementById('forward-modal-title').textContent = `Forward Complaint #${id}`;
        
        // Load history
        const historyList = document.getElementById('forward-history-list');
        if (historyList) {
            historyList.innerHTML = '<li style="color:var(--text-muted); font-size:0.8rem;">Loading history...</li>';
            try {
                const token = localStorage.getItem('scrs_token');
                const res = await fetch(`/api/complaints/${id}/history`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (data.success && data.history.length > 0) {
                    historyList.innerHTML = data.history.map(h => `
                        <li style="margin-bottom:0.5rem; font-size:0.8rem; border-left:2px solid ${h.is_current ? 'var(--gold-color)' : 'rgba(255,255,255,0.1)'}; padding-left:0.5rem;">
                            <div style="font-weight:600; color:${h.is_current ? 'var(--gold-color)' : 'white'};">${h.department_name} ${h.is_current ? '(Current)' : ''}</div>
                            <div style="color:var(--text-secondary); font-size:0.75rem;">${new Date(h.assigned_at).toLocaleString()} by ${h.assigned_by_name || 'System'}</div>
                            <div style="font-style:italic; color:rgba(255,255,255,0.5);">${h.notes || 'No notes'}</div>
                        </li>
                    `).join('');
                } else {
                    historyList.innerHTML = '<li style="color:var(--text-muted); font-size:0.8rem;">No reassignment history</li>';
                }
            } catch (err) { historyList.innerHTML = 'Error loading history'; }
        }

        document.getElementById('forwardModal').style.display = 'flex';
    };    

    window.openMembersModal = (deptId, deptName) => {
        activeDeptIdForMembers = deptId;
        document.getElementById('membersModalTitle').textContent = `Manage Staff - ${deptName}`;
        document.getElementById('membersModal').style.display = 'flex';
        
        fetchDeptMembers(deptId);
        populateAvailableStaff();
    };

    window.closeMembersModal = () => {
        document.getElementById('membersModal').style.display = 'none';
        activeDeptIdForMembers = null;
    };

    async function fetchDeptMembers(deptId) {
        const tbody = document.getElementById('members-tbody');
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1rem;">Loading...</td></tr>';

        try {
            const token = localStorage.getItem('scrs_token');
            const res = await fetch(`/api/departments/${deptId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
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
            const token = localStorage.getItem('scrs_token');
            const res = await fetch('/api/departments/available-staff', {
                headers: { 'Authorization': `Bearer ${token}` }
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
            const token = localStorage.getItem('scrs_token');
            const res = await fetch(`/api/departments/${activeDeptIdForMembers}/members`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
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
            const token = localStorage.getItem('scrs_token');
            const res = await fetch(`/api/departments/${deptId}/members/${userId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
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
            const token = localStorage.getItem('scrs_token');
            const res = await fetch('/api/admin/staff', {
                headers: { 'Authorization': `Bearer ${token}` }
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
            const token = localStorage.getItem('scrs_token');
            const res = await fetch('/api/admin/students', {
                headers: { 'Authorization': `Bearer ${token}` }
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
            const token = localStorage.getItem('scrs_token');
            const res = await fetch('/api/admin/departments', {
                headers: { 'Authorization': token ? `Bearer ${token}` : '' }
            });
            const data = await res.json();
            if (data.success) {
                const deptSelect = document.getElementById('staff-dept');
                if(!deptSelect) return;
                deptSelect.innerHTML = '<option value="">No Department / General</option>' + 
                    data.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
            }
        } catch (err) { console.error(err); }
    }

    async function loadGallery() {
        try {
            const res = await fetch('/api/gallery');
            const data = await res.json();
            if (data.success) {
                const grid = document.getElementById('gallery-grid');
                if(!grid) return;
                grid.innerHTML = data.images.map(img => `
                    <div class="glass-panel fade-in" style="padding: 12px; position: relative; display: flex; flex-direction: column; gap: 10px;">
                        <div style="height: 150px; border-radius: 8px; overflow: hidden;">
                            <img src="${img.url}" style="width: 100%; height: 100%; object-fit: cover;">
                        </div>
                        <div class="form-group" style="margin: 0;">
                            <input type="text" class="form-control" value="${img.title || ''}" 
                                placeholder="Add image title..." 
                                onchange="updateGalleryTitle(${img.id}, this.value)"
                                style="font-size: 0.85rem; padding: 5px 8px; background: rgba(0,0,0,0.2);">
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 5px; border-top: 1px solid rgba(255,255,255,0.05);">
                            <span style="font-size: 0.70rem; color: var(--text-muted);">${new Date(img.created_at).toLocaleDateString()}</span>
                            <button class="action-btn btn-reject" onclick="deleteGalleryImage(${img.id})" style="padding: 4px 8px; font-size: 0.75rem;">
                                <i class="fa-solid fa-trash"></i> Delete
                            </button>
                        </div>
                    </div>
                `).join('');
            }
        } catch (err) { console.error(err); }
    }

    window.updateGalleryTitle = async (id, title) => {
        try {
            const token = localStorage.getItem('scrs_token');
            const res = await fetch(`/api/gallery/${id}/title`, {
                method: 'PATCH',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
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
                const token = localStorage.getItem('scrs_token');
                const res = await fetch('/api/admin/add-student', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
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
                const token = localStorage.getItem('scrs_token');
                const res = await fetch('/api/admin/add-staff', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
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
            document.getElementById('cropModal').style.display = 'flex';
            
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
                    const token = localStorage.getItem('scrs_token');
                    const res = await fetch('/api/gallery/upload', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
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

    window.deleteGalleryImage = async (id) => {
        if (!confirm(`Are you sure you want to delete this image?`)) return;
        try {
            const token = localStorage.getItem('scrs_token');
            const res = await fetch(`/api/gallery/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                showToast('Image removed from gallery', 'success');
                loadGallery();
            }
        } catch (err) { showToast('Delete failed', 'error'); }
    };
});
