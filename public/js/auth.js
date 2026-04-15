document.addEventListener("DOMContentLoaded", () => {
    const roleBtns = document.querySelectorAll('.role-btn');
    const identifierLabel = document.getElementById('identifier-label');
    const identifierInput = document.getElementById('identifier-input');
    const passwordInput = document.getElementById('password-input');
    const authForm = document.getElementById('auth-form');
    const btnLogin = document.getElementById('btn-login');

    let currentRole = window.RoleManager.STUDENT;

    // Role Selection
    roleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            roleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const rawRole = btn.textContent.trim();
            currentRole = window.RoleManager.normalize(rawRole);
            
            console.log(`[Auth] Role Selected: ${rawRole} -> Canonical: ${currentRole}`);

            if (currentRole === window.RoleManager.STUDENT) {
                identifierLabel.textContent = 'Roll Number / Email';
                identifierInput.placeholder = 'e.g. 21DCS010';
            } else if (currentRole === window.RoleManager.STAFF) {
                identifierLabel.textContent = 'Email / Username';
                identifierInput.placeholder = 'e.g. facult@gdc.edu';
            } else if (currentRole === window.RoleManager.ADMIN) {
                identifierLabel.textContent = 'Admin ID';
                identifierInput.placeholder = 'e.g. admin_01';
            } else if (currentRole === window.RoleManager.PRINCIPAL) {
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
            console.log(`[Auth] Attempting login as: ${currentRole}`);
            const response = await fetch(`${API_BASE}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ 
                    role: currentRole, 
                    identifier, 
                    password,
                    tenant_id: 1 
                })
            });

            const data = await response.json();

            if (data.success) {
                const uiUser = {
                    name: data.user.username || data.user.name,
                    avatar: data.user.profile_image,
                    dept: data.user.department_name
                };
                localStorage.setItem('scrs_user', JSON.stringify(uiUser));
                localStorage.setItem('scrs_role_hint', data.user.role);
                
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
    const preSelectRoleRaw = urlParams.get('role');
    if (preSelectRoleRaw) {
        const normalized = window.RoleManager.normalize(preSelectRoleRaw);
        console.log(`[Auth] Pre-selection URL role: ${preSelectRoleRaw} -> Normalized: ${normalized}`);
        
        const targetBtn = Array.from(roleBtns).find(btn => 
            window.RoleManager.normalize(btn.textContent.trim()) === normalized
        );
        if (targetBtn) targetBtn.click();
    } else {
        // Default UI state
        const studentBtn = Array.from(roleBtns).find(btn => btn.textContent.trim() === 'Student');
        if (studentBtn) studentBtn.click();
    }
});
