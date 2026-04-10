let currentStep = 1;
let selectedMethod = 'email';

async function nextStep(step) {
    if (step === 1) {
        selectedMethod = document.getElementById('verification-method').value;
        const payload = { method: selectedMethod, role: 'Student', tenant_id: 1 };

        if (selectedMethod === 'email') {
            const email = document.getElementById('email').value.trim();
            if (!email) {
                alert('Please enter your Registered College Email');
                return;
            }
            payload.email = email;
        } else {
            const mobile = document.getElementById('mobile-number').value.trim();
            if (!mobile) {
                alert('Please enter your Registered Mobile Number');
                return;
            }
            payload.mobile_number = mobile;
        }

        try {
            const response = await fetch('/api/auth/request-reset', {
                method: 'POST',
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
            alert('Request failed. Please try again.');
        }
    } else if (step === 2) {
        const otp = document.getElementById('otp-code').value.trim();

        if (!otp) {
            alert('Please enter OTP');
            return;
        }

        const payload = { method: selectedMethod, otp: otp, tenant_id: 1 };
        if (selectedMethod === 'email') {
            payload.email = document.getElementById('email').value.trim();
        } else {
            payload.mobile_number = document.getElementById('mobile-number').value.trim();
        }

        try {
            const response = await fetch('/api/auth/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (data.success) {
                transitionToStep(3, "Create New Password", "100%");
            } else {
                alert(data.message);
            }
        } catch (err) {
            alert('Verification failed');
        }
    }
}

async function finishReset() {
    const otp = document.getElementById('otp-code').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (!password || password.length < 8) {
        alert('Password must be at least 8 characters');
        return;
    }

    if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }

    const payload = {
        method: selectedMethod,
        otp: otp,
        password: password,
        tenant_id: 1
    };

    if (selectedMethod === 'email') {
        payload.email = document.getElementById('email').value.trim();
    } else {
        payload.mobile_number = document.getElementById('mobile-number').value.trim();
    }

    try {
        const response = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.success) {
            alert('Password reset successfully! Redirecting to login...');
            window.location.href = 'login.html';
        } else {
            alert(data.message);
        }
    } catch (err) {
        alert('Reset failed');
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