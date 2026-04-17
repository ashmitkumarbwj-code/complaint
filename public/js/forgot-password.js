let currentStep = 1;
let selectedMethod = 'email';

async function nextStep(step) {
    if (step === 1) {
        // PHASE 1: Forced Email Method
        selectedMethod = 'email';
        const email = document.getElementById('email').value.trim();
        
        if (!email) {
            showToast('Please enter your Registered Official Email', 'error');
            return;
        }
        
        const payload = { 
            method: 'email', 
            email: email, 
            role: 'student', 
            tenant_id: 1 
        };

        try {
            const response = await fetch(`${API_BASE}/api/auth/request-reset`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (data.success) {
                transitionToStep(2, "Enter Verification Code", "66.66%");
            } else {
                alert(data.message);
            }
        } catch (err) {
            showToast('Request failed. Please try again.', 'error');
        }
    } else if (step === 2) {
        const otp = document.getElementById('otp-code').value.trim();
        const identifier = document.getElementById('email').value.trim();

        if (!otp) {
            showToast('Please enter OTP', 'error');
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/api/auth/validate-activation`, { // Re-using standard validation endpoint
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier, otp, tenant_id: 1 })
            });

            const data = await response.json();
            if (data.success) {
                transitionToStep(3, "Create New Password", "100%");
            } else {
                showToast(data.message, 'error');
            }
        } catch (err) {
            showToast('Verification failed', 'error');
        }
    }
}

async function finishReset() {
    const otp = document.getElementById('otp-code').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (!password || password.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
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
        otp: otp,
        password: password,
        tenant_id: 1
    };

    try {
        const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.success) {
            showToast('Password reset successfully! Redirecting to login...', 'success');
            window.location.href = 'login.html';
        } else {
            alert(data.message);
        }
    } catch (err) {
        showToast('Reset failed', 'error');
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