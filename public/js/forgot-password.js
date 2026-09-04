let currentStep = 1;
let selectedMethod = 'email';

async function nextStep(step) {
    if (step === 1) {
        selectedMethod = 'email';
        const email = document.getElementById('email').value.trim();
        const btn = document.querySelector('#step-1 .btn-activate');
        
        if (!email) {
            showToast('Please enter your Registered Official Email', 'error');
            return;
        }
        
        const payload = { 
            method: 'email', 
            email: email, 
            identifier: email,
            role: 'student', 
            tenant_id: 1 
        };

        try {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending OTP...';
            btn.disabled = true;

            const response = await fetch(`${API_BASE}/api/auth/request-reset`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (data.success) {
                showToast(data.message || 'Reset code sent to your email.', 'success');
                transitionToStep(2, "Enter Verification Code", "66.66%");

                // STRICT: only display demoOtp if backend explicitly flagged mock mode
                if (data.isMock && data.demoOtp) {
                    document.getElementById('otp-code').value = data.demoOtp;
                    showToast(`⚡ Demo Mode: OTP is ${data.demoOtp}`, 'info');
                }
            } else {
                console.warn('[PasswordReset] Reset request rejected:', data.error || data.message);
                const userMsg = (data.error === 'SMTP_CONFIG_ERROR')
                    ? 'Unable to send the reset email right now. Please try again later.'
                    : (data.message || 'Unable to send the reset email right now. Please try again later.');
                showToast(userMsg, 'error');
            }
        } catch (err) {
            console.error('[PasswordReset] Network/Server failure:', err);
            showToast('Unable to send the reset email right now. Please try again later.', 'error');
        } finally {
            btn.innerHTML = 'Send Reset OTP <i class="fa-solid fa-paper-plane"></i>';
            btn.disabled = false;
        }
    } else if (step === 2) {
        const otp = document.getElementById('otp-code').value.trim();
        const identifier = document.getElementById('email').value.trim();
        const btn = document.querySelector('#step-2 .btn-activate');

        if (!otp) {
            showToast('Please enter OTP', 'error');
            return;
        }
        if (otp.length < 4 || otp.length > 8) {
            showToast('Please enter a valid OTP code', 'error');
            return;
        }

        try {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';
            btn.disabled = true;

            const response = await fetch(`${API_BASE}/api/auth/verify-reset`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier, email: identifier, method: 'email', otp, tenant_id: 1 })
            });

            const data = await response.json();
            if (data.success) {
                showToast('OTP verified successfully.', 'success');
                transitionToStep(3, "Create New Password", "100%");
            } else {
                showToast(data.message || 'Invalid or expired OTP.', 'error');
            }
        } catch (err) {
            showToast('Verification failed. Please try again.', 'error');
        } finally {
            btn.innerHTML = 'Verify OTP <i class="fa-solid fa-check-double"></i>';
            btn.disabled = false;
        }
    }
}

async function finishReset() {
    const otp = document.getElementById('otp-code').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const btn = document.querySelector('#step-3 .btn-activate');

    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
    if (!password || !passwordRegex.test(password)) {
        showToast('Password must be at least 8 characters and include both letters and numbers.', 'error');
        return;
    }

    if (password !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }

    const identifier = document.getElementById('email').value.trim();

    const payload = {
        method: 'email',
        email: identifier,
        identifier: identifier,
        otp: otp,
        password: password,
        role: 'student',
        tenant_id: 1
    };

    try {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resetting...';
        btn.disabled = true;

        const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.success) {
            showToast(data.message || 'Password reset successfully! Redirecting to login...', 'success');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
        } else {
            showToast(data.message || 'Password reset failed.', 'error');
            btn.innerHTML = 'Reset Password <i class="fa-solid fa-bolt"></i>';
            btn.disabled = false;
        }
    } catch (err) {
        showToast('Reset failed. Please try again.', 'error');
        btn.innerHTML = 'Reset Password <i class="fa-solid fa-bolt"></i>';
        btn.disabled = false;
    }
}

function transitionToStep(step, desc, progressWidth) {
    gsap.to(`#step-${currentStep}`, {
        duration: 0.3,
        x: -20,
        opacity: 0,
        onComplete: () => {
            document.getElementById(`step-${currentStep}`).classList.remove('active');
            document.getElementById(`step-${step}`).classList.add('active');
            document.getElementById('step-desc').textContent = desc;
            document.getElementById('progress-fill').style.width = progressWidth;

            gsap.fromTo(`#step-${step}`,
                { x: 20, opacity: 0 },
                { duration: 0.3, x: 0, opacity: 1 }
            );
            currentStep = step;
        }
    });
}