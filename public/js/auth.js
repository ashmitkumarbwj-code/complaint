document.addEventListener("DOMContentLoaded", () => {
    const roleBtns = document.querySelectorAll('.role-btn');
    const identifierLabel = document.getElementById('identifier-label');
    const identifierInput = document.getElementById('identifier-input');
    const passwordInput = document.getElementById('password-input');
    const authForm = document.getElementById('auth-form');
    const btnLogin = document.getElementById('btn-login');
    const activationArea = document.getElementById('activation-area');
    const forgotLink = document.getElementById('forgot-link');
    const authHeaderDesc = document.querySelector('.auth-header p');

    let currentRole = window.RoleManager.STUDENT;

    /**
     * Updates the UI based on the selected role
     */
    function setRoleUI(role) {
        currentRole = window.RoleManager.normalize(role);
        
        // 1. Update Tabs
        roleBtns.forEach(btn => {
            const btnRole = window.RoleManager.normalize(btn.getAttribute('data-role') || btn.textContent);
            if (btnRole === currentRole) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // 2. Update Identifier Labels
        switch (currentRole) {
            case window.RoleManager.STUDENT:
                identifierLabel.textContent = 'Roll Number';
                identifierInput.placeholder = 'e.g. 21DCS010';
                break;
            case window.RoleManager.STAFF:
                identifierLabel.textContent = 'Staff ID / Email';
                identifierInput.placeholder = 'e.g. faculty@gdc.edu';
                break;
            case window.RoleManager.ADMIN:
                identifierLabel.textContent = 'Admin ID';
                identifierInput.placeholder = 'e.g. admin_portal';
                break;
            case window.RoleManager.PRINCIPAL:
                identifierLabel.textContent = 'Principal ID';
                identifierInput.placeholder = 'e.g. principal_gdc';
                break;
        }

        // 3. Update Activation Link
        const activationPage = window.RoleManager.getActivationPage(currentRole);
        const displayName = window.RoleManager.getDisplayName(currentRole);
        
        // Clean and rebuild activation area to prevent duplicates
        activationArea.innerHTML = `
            <p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 0.4rem;">
                <a href="${activationPage}" style="color: var(--primary-color); text-decoration: none; font-weight: 600;">
                    ${displayName}? Activate Account
                </a>
            </p>
        `;

        // 4. Update Forgot Link
        forgotLink.href = window.RoleManager.getForgotPage(currentRole);

        // 5. Update Header Text
        if (authHeaderDesc) {
            authHeaderDesc.textContent = `Verify your identity to access the ${displayName} portal.`;
        }

        // 6. Sync URL (Silent)
        const url = new URL(window.location);
        url.searchParams.set('role', currentRole);
        window.history.replaceState({}, '', url);
        
        console.log(`[Auth UI] Role synchronized: ${currentRole}`);
    }

    // Role Selection Click Handlers
    roleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const role = btn.getAttribute('data-role') || btn.textContent;
            setRoleUI(role);
        });
    });

    // Handle Login Submit
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
                const userContext = {
                    id: data.user.id,
                    name: data.user.username || data.user.name,
                    role: data.user.role,
                    student_id: data.user.student_id,
                    staff_id: data.user.staff_id,
                    department_id: data.user.department_id,
                    profile_image: data.user.profile_image
                };
                localStorage.setItem('scrs_user', JSON.stringify(userContext));
                
                if (data.redirect) {
                    window.location.href = data.redirect;
                } else {
                    showToast('Redirect failed. Contact admin.', 'error');
                }
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

    // Initial Role Detection
    const urlParams = new URLSearchParams(window.location.search);
    const initialRole = urlParams.get('role') || window.RoleManager.STUDENT;
    setRoleUI(initialRole);
});
