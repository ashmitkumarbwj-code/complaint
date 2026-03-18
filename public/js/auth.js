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
            alert('Please fill in all fields.');
            return;
        }

        btnLogin.textContent = 'Logging in...';
        btnLogin.disabled = true;

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: currentRole, identifier, password })
            });

            const data = await response.json();

            if (data.success) {
                // Store user info and token
                localStorage.setItem('scrs_user', JSON.stringify(data.user));
                localStorage.setItem('scrs_token', data.token);
                
                // Redirect
                window.location.href = data.redirect;
            } else {
                alert(data.message || 'Login failed');
                btnLogin.textContent = 'Login to Portal';
                btnLogin.disabled = false;
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('An error occurred during login.');
            btnLogin.textContent = 'Login to Portal';
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
