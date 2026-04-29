'use strict';

/**
 * Admin User Management Logic
 */

let mgmtUsers = [];
let sortField = 'name';
let sortOrder = 'asc';

// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Initialize Tab Logic
 */
document.addEventListener('DOMContentLoaded', () => {
    // Listen for tab changes
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (item.getAttribute('data-tab') === 'tab-user-mgmt') {
                initUserMgmt();
            }
        });
    });
});

async function initUserMgmt() {
    await fetchMgmtDepts();
    await fetchMgmtUsers();
    await fetchMgmtAuditLogs();
}

/**
 * Fetch Departments for Dropdowns
 */
async function fetchMgmtDepts() {
    try {
        const res = await fetch('/api/admin/departments', { credentials: 'include' });
        const data = await res.json();
        if (data.success) {
            const filterDept = document.getElementById('mgmt-filter-dept');
            const formDept = document.getElementById('mgmt-user-dept-id');
            
            let options = '<option value="">All Departments</option>';
            let formOptions = '<option value="">Select Department</option>';
            
            data.departments.forEach(d => {
                options += `<option value="${d.id}">${d.name}</option>`;
                formOptions += `<option value="${d.id}">${d.name}</option>`;
            });
            
            filterDept.innerHTML = options;
            formDept.innerHTML = formOptions;
        }
    } catch (e) {
        console.error('Failed to fetch departments:', e);
    }
}

/**
 * Fetch Users with Filters
 */
async function fetchMgmtUsers() {
    const role = document.getElementById('mgmt-filter-role').value;
    const dept = document.getElementById('mgmt-filter-dept').value;
    const search = document.getElementById('mgmt-search').value;
    const status = document.getElementById('mgmt-filter-status').value;

    const params = new URLSearchParams({
        role,
        department_id: dept,
        search,
        sortField,
        sortOrder
    });

    try {
        const res = await fetch(`/api/admin/users?${params.toString()}`, { credentials: 'include' });
        const data = await res.json();
        if (data.success) {
            mgmtUsers = data.users;
            renderMgmtUsers(status);
        }
    } catch (e) {
        window.showToast('Failed to load users', 'error');
    }
}

/**
 * Render User Table
 */
function renderMgmtUsers(statusFilter) {
    const tbody = document.getElementById('mgmt-users-tbody');
    let filtered = mgmtUsers;
    
    if (statusFilter === 'active') filtered = mgmtUsers.filter(u => u.is_active);
    if (statusFilter === 'inactive') filtered = mgmtUsers.filter(u => !u.is_active);

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; opacity:0.6;">No users found matching filters.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(u => `
        <tr class="${!u.is_active ? 'row-inactive' : ''}">
            <td style="font-weight: 600;">${u.name}</td>
            <td style="font-size: 0.85rem; opacity: 0.8;">${u.identifier}</td>
            <td>${u.mobile}</td>
            <td><span class="status-badge status-${u.role.toLowerCase()}">${u.role}</span></td>
            <td style="font-size: 0.85rem;">${u.dept_name || '-'}</td>
            <td>
                <span class="status-dot ${u.is_active ? 'dot-active' : 'dot-inactive'}"></span>
                ${u.is_active ? 'Active' : 'Deactivated'}
            </td>
            <td>
                <div style="display: flex; gap: 8px;">
                    <button class="btn-icon-small" onclick="openEditUserModal('${u.type}', ${u.id})" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
                    ${u.is_active ? 
                        `<button class="btn-icon-small text-red" onclick="deactivateUser('${u.type}', ${u.id})" title="Deactivate"><i class="fa-solid fa-user-slash"></i></button>` :
                        `<button class="btn-icon-small text-green" onclick="activateUser('${u.type}', ${u.id})" title="Activate"><i class="fa-solid fa-user-check"></i></button>`
                    }
                </div>
            </td>
        </tr>
    `).join('');
}

/**
 * Fetch Audit Logs
 */
async function fetchMgmtAuditLogs() {
    try {
        const res = await fetch('/api/admin/audit-logs', { credentials: 'include' });
        const data = await res.json();
        if (data.success) {
            const tbody = document.getElementById('mgmt-audit-tbody');
            tbody.innerHTML = data.logs.map(l => `
                <tr>
                    <td style="white-space: nowrap;">${new Date(l.created_at).toLocaleString()}</td>
                    <td><b>${l.admin_name}</b></td>
                    <td><span class="action-tag">${l.action}</span></td>
                    <td>${l.target_type} [${l.target_id}]</td>
                    <td><pre style="font-size: 0.7rem; max-width: 300px; overflow: hidden; text-overflow: ellipsis;">${JSON.stringify(l.details)}</pre></td>
                </tr>
            `).join('');
        }
    } catch (e) {
        console.error('Audit logs error:', e);
    }
}

/**
 * Modal Controls
 */
function openAddUserModal() {
    document.getElementById('userMgmtModalTitle').innerText = 'Add New User';
    document.getElementById('user-mgmt-form').reset();
    document.getElementById('mgmt-user-id').value = '';
    document.getElementById('mgmt-user-type').value = '';
    document.getElementById('mgmt-submit-btn').innerText = 'Add User';
    toggleMgmtFields();
    window.openModal('userMgmtModal');
}

function openEditUserModal(type, id) {
    const user = mgmtUsers.find(u => u.type === type && u.id === id);
    if (!user) return;

    document.getElementById('userMgmtModalTitle').innerText = 'Edit User';
    document.getElementById('mgmt-user-id').value = id;
    document.getElementById('mgmt-user-type').value = type;
    document.getElementById('mgmt-user-name').value = user.name;
    document.getElementById('mgmt-user-mobile').value = user.mobile;
    document.getElementById('mgmt-user-email').value = user.email;
    document.getElementById('mgmt-user-role').value = user.role;
    document.getElementById('mgmt-user-active').checked = user.is_active;

    if (type === 'student') {
        document.getElementById('mgmt-user-roll').value = user.identifier;
        document.getElementById('mgmt-user-dept-text').value = user.dept_name;
    } else {
        document.getElementById('mgmt-user-dept-id').value = user.department_id || '';
    }

    document.getElementById('mgmt-submit-btn').innerText = 'Update User';
    toggleMgmtFields();
    window.openModal('userMgmtModal');
}

function closeUserMgmtModal() {
    window.closeModal('userMgmtModal');
}

function toggleMgmtFields() {
    const role = document.getElementById('mgmt-user-role').value;
    const studentFields = document.getElementById('mgmt-student-fields');
    const staffFields = document.getElementById('mgmt-staff-fields');

    if (role === 'Student') {
        studentFields.style.display = 'block';
        staffFields.style.display = 'none';
    } else {
        studentFields.style.display = 'none';
        staffFields.style.display = 'block';
    }
}

/**
 * Form Submission
 */
async function handleUserSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('mgmt-user-id').value;
    const type = document.getElementById('mgmt-user-type').value;
    const role = document.getElementById('mgmt-user-role').value;

    const payload = {
        name: document.getElementById('mgmt-user-name').value,
        mobile: document.getElementById('mgmt-user-mobile').value,
        email: document.getElementById('mgmt-user-email').value,
        role: role,
        is_active: document.getElementById('mgmt-user-active').checked
    };

    if (role === 'Student') {
        payload.roll_number = document.getElementById('mgmt-user-roll').value;
        payload.dept_name = document.getElementById('mgmt-user-dept-text').value;
    } else {
        payload.department_id = document.getElementById('mgmt-user-dept-id').value;
    }

    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/admin/users/${type}/${id}` : '/api/admin/users';

    try {
        const res = await fetch(url, {
            method,
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success) {
            window.showToast(data.message || 'Success!', 'success');
            closeUserMgmtModal();
            fetchMgmtUsers();
            fetchMgmtAuditLogs();
        } else {
            window.showToast(data.message || 'Operation failed', 'error');
        }
    } catch (e) {
        window.showToast('Network error', 'error');
    }
}

/**
 * Deactivate / Activate
 */
async function deactivateUser(type, id) {
    if (!confirm('Are you sure you want to deactivate this user? They will not be able to login.')) return;
    try {
        const res = await fetch(`/api/admin/users/${type}/${id}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: false })
        });
        if ((await res.json()).success) {
            fetchMgmtUsers();
            fetchMgmtAuditLogs();
        }
    } catch (e) {}
}

async function activateUser(type, id) {
    try {
        const res = await fetch(`/api/admin/users/${type}/${id}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: true })
        });
        if ((await res.json()).success) {
            fetchMgmtUsers();
            fetchMgmtAuditLogs();
        }
    } catch (e) {}
}

/**
 * Sorting
 */
function sortMgmt(field) {
    if (sortField === field) {
        sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        sortField = field;
        sortOrder = 'asc';
    }
    fetchMgmtUsers();
}
