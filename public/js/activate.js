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
        const payload = { role: role, method: selectedMethod, tenant_id: 1 };

        if (selectedMethod === 'email') {
            const email = document.getElementById('email').value.trim();
            if (!email) return alert('Please enter your Registered College Email');
            payload.email = email;
            savedIdentifier = email;

            try {
                const response = await fetch(`${API_BASE}/api/auth/request-activation`, {
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
        } else {
            // FIREBASE SMS FLOW
            const mobile = document.getElementById('mobile-number').value.trim();
            const rollNumber = document.getElementById('roll-number').value.trim();
            if (!mobile || !rollNumber) return alert('Please enter both Roll Number and Mobile Number');
            
            // 1. Validate against DB first
            try {
                const checkRes = await fetch(`${API_BASE}/api/auth/validate-activation`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role, mobile_number: mobile, roll_number: rollNumber, tenant_id: 1 })
                });
                const checkData = await checkRes.json();
                if (!checkData.success) return alert(checkData.message);

                // 2. Trigger Firebase SMS
                const appVerifier = window.recaptchaVerifier;
                confirmationResult = await firebase.auth().signInWithPhoneNumber(mobile, appVerifier);
                transitionToStep(2, "Enter SMS Code", "66.66%");
            } catch (err) {
                console.error('Firebase Auth Error:', err);
                alert('Failed to send SMS. Make sure the number has a country code (e.g. +91).');
            }
        }
    } else if (step === 2) {
        const otp = document.getElementById('otp-code').value.trim();
        if (!otp) return alert('Please enter OTP');

        if (selectedMethod === 'email') {
            const email = document.getElementById('email').value.trim();
            try {
                const response = await fetch(`${API_BASE}/api/auth/verify-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ method: 'email', email, otp, tenant_id: 1 })
                });
                const data = await response.json();
                if (data.success) transitionToStep(3, "Secure Your Account", "100%");
                else alert(data.message);
            } catch (err) {
                alert('Verification failed');
            }
        } else {
            // Verify Firebase SMS Code
            try {
                await confirmationResult.confirm(otp);
                transitionToStep(3, "Secure Your Account", "100%");
            } catch (err) {
                alert('Invalid SMS Code. Please try again.');
            }
        }
    }
}

async function finishActivation() {
    const role = window.SCRS_ROLE || 'Student';
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (!password || password.length < 8) return alert('Password must be at least 8 characters');
    if (password !== confirmPassword) return alert('Passwords do not match');

    const payload = { role, password, method: selectedMethod, tenant_id: 1 };

    try {
        if (selectedMethod === 'sms') {
            // Get ID Token from Firebase
            const user = firebase.auth().currentUser;
            if (!user) return alert('Session expired. Please restart activation.');
            payload.firebaseToken = await user.getIdToken();
        } else {
            payload.email = document.getElementById('email').value.trim();
            payload.otp = document.getElementById('otp-code').value.trim();
        }

        const response = await fetch(`${API_BASE}/api/auth/complete-activation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.success) {
            alert('Account activated successfully!');
            window.location.href = `login.html?role=${role}`;
        } else {
            alert(data.message);
        }
    } catch (err) {
        alert('Activation failed');
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
