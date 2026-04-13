document.addEventListener("DOMContentLoaded", () => {
    const roleBtns = document.querySelectorAll('.role-btn');
    const identifierLabel = document.getElementById('identifier-label');
    const identifierInput = document.getElementById('identifier-input');
    const passwordInput = document.getElementById('password-input');
    const authForm = document.getElementById('auth-form');
    const btnLogin = document.getElementById('btn-login');

    let currentRole = 'Student';

    // Role Selection
    roleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            roleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            let roleText = btn.textContent.trim();

            if (roleText === 'Student') {
                currentRole = 'Student';
                identifierLabel.textContent = 'Roll Number / Email';
                identifierInput.placeholder = 'e.g. 21DCS010';
            } else if (roleText === 'Staff/Faculty') {
                currentRole = 'Staff';
                identifierLabel.textContent = 'Email / Username';
                identifierInput.placeholder = 'e.g. facult@gdc.edu';
            } else if (roleText === 'Admin') {
                currentRole = 'Admin';
                identifierLabel.textContent = 'Admin ID';
                identifierInput.placeholder = 'e.g. admin_01';
            } else if (roleText === 'Principal') {
                currentRole = 'Principal';
                identifierLabel.textContent = 'Email / Official ID';
                identifierInput.placeholder = 'e.g. principal@gdc.edu';
            }
        });
    });

    // Handle Login
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const identifier = identifierInput.value.trim();
        const password = passwordInput.value;

        if (!identifier || !password) {
            showToast('Please fill in all fields.', 'error');
            return;
        }

        const origHtml = btnLogin.innerHTML;
        btnLogin.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging in...';
        btnLogin.disabled = true;

        try {
            const response = await fetch(`${API_BASE}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' , credentials: 'include' },
                credentials: 'include', // 🔥 Mandatory for HttpOnly cookies
                body: JSON.stringify({ 
                    role: currentRole, 
                    identifier, 
                    password,
                    tenant_id: 1 // Default to Main Campus for now
                })
            });

            const data = await response.json();

            if (data.success) {
                // Store only UI-friendly metadata. 
                // Sensitive data/roles are now verified via server handshake on every load.
                const uiUser = {
                    name: data.user.username || data.user.name,
                    avatar: data.user.profile_image,
                    dept: data.user.department_name
                };
                localStorage.setItem('scrs_user', JSON.stringify(uiUser));
                
                // Keep a small hint for redirection logic, but it's not used for access control
                localStorage.setItem('scrs_role_hint', data.user.role);
                
                // Redirect using server-provided path
                window.location.href = data.redirect || 'admin.html';
            } else {
                showToast(data.message || 'Login failed', 'error');
                btnLogin.innerHTML = origHtml;
                btnLogin.disabled = false;
            }
        } catch (error) {
            console.error('Login error:', error);
            showToast('An error occurred during login.', 'error');
            btnLogin.innerHTML = origHtml;
            btnLogin.disabled = false;
        }
    });

    // Support Role Pre-selection from URL (e.g. login.html?role=staff)
    const urlParams = new URLSearchParams(window.location.search);
    const preSelectRole = urlParams.get('role');
    if (preSelectRole) {
        const targetBtn = Array.from(roleBtns).find(btn => 
            btn.textContent.trim().toLowerCase().includes(preSelectRole.toLowerCase())
        );
        if (targetBtn) targetBtn.click();
    }
});
