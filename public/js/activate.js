let currentStep = 1;
let selectedMethod = 'email';
let savedIdentifier = '';
let confirmationResult = null;

// Initialize Firebase ReCaptcha
window.onload = function() {
    if (typeof firebase !== 'undefined') {
        window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
            'size': 'invisible'
        });
    }
};

async function nextStep(step) {
    const role = window.SCRS_ROLE || 'Student';
    
    if (step === 1) {
        selectedMethod = document.getElementById('verification-method').value;
        const mobile = document.getElementById('mobile-number').value.trim();
        const email = document.getElementById('email').value.trim();
        const rollNumber = document.getElementById('roll-number').value.trim();

        if (selectedMethod === 'email' && !email) return showToast('Please enter your Registered College Email', 'error');
        if (selectedMethod === 'sms' && (!mobile || !rollNumber)) return showToast('Please enter both Roll Number and Mobile Number', 'error');

        savedIdentifier = selectedMethod === 'email' ? email : mobile;
        const payload = { 
            role: role, 
            method: selectedMethod, 
            email: email, 
            mobile_number: mobile, 
            roll_number: rollNumber,
            tenant_id: 1 
        };

        try {
            const response = await fetch(`${API_BASE}/api/auth/request-activation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' , credentials: 'include' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (data.success) {
                transitionToStep(2, `Enter ${selectedMethod.toUpperCase()} Code`, "66.66%");
                
                if (data.demoOtp) {
                    const otpInput = document.getElementById('otp-code');
                    otpInput.value = data.demoOtp;
                    otpInput.classList.add('glow-success');
                    showToast("⚡ Demo Mode Active: OTP auto-filled", "success");
                } else {
                    showToast(data.message, 'success');
                }
            } else {
                showToast(data.message, 'error');
            }
        } catch (err) {
            console.error('Request Error:', err);
            showToast('Request failed. Please try again.', 'error');
        }
    } else if (step === 2) {
        const otp = document.getElementById('otp-code').value.trim();
        if (!otp) return showToast('Please enter OTP', 'error');

        try {
            const response = await fetch(`${API_BASE}/api/auth/validate-activation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' , credentials: 'include' },
                body: JSON.stringify({ 
                    identifier: savedIdentifier, 
                    otp, 
                    tenant_id: 1 
                })
            });
            const data = await response.json();
            if (data.success) {
                transitionToStep(2, "Enter Verification Code", "66.66%");
                
                if (data.demoOtp) {
                    const otpInput = document.getElementById('otp-code');
                    otpInput.value = data.demoOtp;
                    otpInput.classList.add('glow-success');
                    showToast("⚡ Demo Mode Active: OTP auto-filled", "success");
                } else {
                    showToast(data.message, 'success');
                }
            } else {
                showToast(data.message, 'error');
            }
        } catch (err) {
            showToast('Verification failed', 'error');
        }
    }
}

async function finishActivation() {
    const role = window.SCRS_ROLE || 'Student';
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (!password || password.length < 8) return showToast('Password must be at least 8 characters', 'error');
    if (password !== confirmPassword) return showToast('Passwords do not match', 'error');

    const payload = { 
        role, 
        password, 
        method: selectedMethod, 
        email: document.getElementById('email').value.trim(),
        mobile_number: document.getElementById('mobile-number').value.trim(),
        otp: document.getElementById('otp-code').value.trim(),
        tenant_id: 1 
    };

    try {
        const response = await fetch(`${API_BASE}/api/auth/complete-activation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' , credentials: 'include' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.success) {
            showToast('Account activated successfully!', 'success');
            window.location.href = `login.html?role=${role}`;
        } else {
            alert(data.message);
        }
    } catch (err) {
        showToast('Activation failed', 'error');
    }
}

function transitionToStep(step, desc, progressWidth) {
    gsap.to(`#step-${currentStep}`, {
        duration: 0.3, x: -20, opacity: 0,
        onComplete: () => {
            document.getElementById(`step-${currentStep}`).classList.remove('active');
            document.getElementById(`step-${step}`).classList.add('active');
            document.getElementById('step-desc').textContent = desc;
            document.getElementById('progress-fill').style.width = progressWidth;
            gsap.fromTo(`#step-${step}`, { x: 20, opacity: 0 }, { duration: 0.3, x: 0, opacity: 1 });
            currentStep = step;
        }
    });
}
