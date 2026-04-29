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

        if (!modal.dataset.overlayListenerAdded) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    window.closeModal(id);
                }
            });
            modal.dataset.overlayListenerAdded = 'true';
        }
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
        if (data.success && data.user && allowedRoles.map(r => r.toLowerCase()).includes(String(data.user.role).toLowerCase())) {
            // Success: Reveal the UI
            document.body.style.display = '';
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

// ─────────────────────────────────────────────────────────────────────────────
// SILENT TOKEN REFRESH INTERCEPTOR
// ─────────────────────────────────────────────────────────────────────────────
// The accessToken cookie expires every 15 minutes. This interceptor wraps the
// native fetch to transparently call /api/auth/refresh on a 401, then retry
// the original request once. If refresh also fails → redirect to login.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
    const _nativeFetch = window.fetch.bind(window);
    let _isRefreshing = false;
    let _refreshQueue = []; // pending requests while refresh is in-flight

    async function _doRefresh() {
        const res = await _nativeFetch(`${window.API_BASE}/api/auth/refresh`, {
            method: 'POST',
            credentials: 'include'
        });
        if (!res.ok) throw new Error('Refresh failed');
    }

    window.fetch = async function (input, init = {}) {
        // Always forward credentials for same-origin API calls
        if (typeof input === 'string' && input.includes('/api/')) {
            init = { ...init, credentials: init.credentials || 'include' };
        }

        const response = await _nativeFetch(input, init);

        // Only intercept 401s on protected API calls; skip auth endpoints themselves
        const url = (typeof input === 'string') ? input : (input.url || '');
        const isAuthCall = url.includes('/api/auth/login') ||
                           url.includes('/api/auth/refresh') ||
                           url.includes('/api/auth/logout');

        if (response.status === 401 && !isAuthCall) {
            // If a refresh is already happening, queue this retry
            if (_isRefreshing) {
                return new Promise((resolve, reject) => {
                    _refreshQueue.push({ resolve, reject, input, init });
                });
            }

            _isRefreshing = true;

            try {
                await _doRefresh();
                _isRefreshing = false;

                // Flush queued requests
                _refreshQueue.forEach(({ resolve, input: i, init: o }) =>
                    resolve(_nativeFetch(i, o))
                );
                _refreshQueue = [];

                // Retry the original request
                return _nativeFetch(input, init);

            } catch (err) {
                _isRefreshing = false;
                _refreshQueue.forEach(({ reject }) => reject(err));
                _refreshQueue = [];

                console.warn('[Session] Token refresh failed — redirecting to login.');
                localStorage.removeItem('scrs_user');
                window.location.href = 'login.html?error=session_expired';
                return response; // return original 401 so caller doesn't hang
            }
        }

        return response;
    };
})();


