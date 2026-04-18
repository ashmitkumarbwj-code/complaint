window.showToast = (message, type = 'info') => {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `glowing-toast`; // Uses hackathon polished CSS
    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-circle-xmark';
    
    toast.innerHTML = `
        <i class="fa-solid ${icon}" style="font-size: 1.5rem; color: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#f59e0b'}"></i>
        <div style="flex: 1; font-weight: 500;">${message}</div>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 5500);
};

window.setButtonLoading = (btn, text = 'Loading...') => {
    if (!btn) return null;
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${text}`;
    return () => {
        btn.disabled = false;
        btn.innerHTML = origHtml;
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// BULLETPROOF MODAL MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

window.showModal = (id) => {
    // Optional: Cleanup others if single-modal policy
    // window.forceCleanupModals(); 

    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
};

window.closeModal = (id) => {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('active');
        // Only unlock if no other modals are active (optional complexity)
        if (!document.querySelector('.modal.active')) {
            document.body.style.overflow = 'auto';
        }
    }
};

window.forceCleanupModals = () => {
    document.querySelectorAll('.modal').forEach(m => {
        m.classList.remove('active');
    });
    document.body.style.overflow = 'auto';
};

// Global Escape Key Listener
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.forceCleanupModals();
    }
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SESSION VALIDATION (SECURITY HARDENING)
 * ─────────────────────────────────────────────────────────────────────────────
 * Enforces server-side role verification before revealing the UI.
 * Prevents localStorage role-tampering bypasses.
 * @param {string|string[]} requiredRole - A single role name or an array of allowed roles.
 */
window.validateSession = async (requiredRole) => {
    try {
        const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
        
        // We use the profile endpoint which is protected by authMiddleware
        const res = await fetch(`${window.API_BASE}/api/users/profile`, {
            credentials: 'include'
        });

        if (!res.ok) {
            console.warn('[Security] Session invalid or expired.');
            throw new Error('Unauthorized');
        }

        const data = await res.json();
        
        // Final sanity check: Role must match one of the allowed roles
        if (data.success && data.user && allowedRoles.includes(data.user.role)) {
            // Success: Reveal the UI
            document.body.style.display = 'block';
            return data.user;
        } else {
            console.error('[Security] Role mismatch detected!', { 
                expected: allowedRoles, 
                received: (data.user && data.user.role) 
            });
            throw new Error('Forbidden');
        }
    } catch (err) {
        // Clear local storage on failure to prevent stale data usage
        localStorage.removeItem('scrs_user');
        localStorage.removeItem('scrs_token');
        
        // Redirect to login with a security warning or just silent kick
        window.location.href = 'login.html?error=unauthorized';
        return null;
    }
};

