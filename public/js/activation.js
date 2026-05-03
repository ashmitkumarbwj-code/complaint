/**
 * Smart Campus SCRS - Unified Activation Logic
 * Shared across Student, Staff, Admin, and Principal pages.
 */

let currentStep = 1;
let selectedMethod = 'email';
let savedIdentifier = '';

// The ROLE constant must be defined in the HTML file calling this script
// Example: <script>const ROLE = 'student';</script>

// Detect and Normalize role immediately
const CANONICAL_ROLE = window.RoleManager ? window.RoleManager.normalize(typeof ROLE !== 'undefined' ? ROLE : 'student') : (typeof ROLE !== 'undefined' ? ROLE.toLowerCase() : 'student');

console.log(`[Activation] Initialized for Role: ${CANONICAL_ROLE}`);

// Initialize OTP digit listeners
document.addEventListener('DOMContentLoaded', () => {
    initOTPFields();
});

function initOTPFields() {
    const inputs = document.querySelectorAll('.otp-digit');
    const hiddenInput = document.getElementById('otp-code');

    if (!inputs.length || !hiddenInput) return;

    inputs.forEach((input, index) => {
        // Handle input
        input.addEventListener('input', (e) => {
            if (e.inputType === 'deleteContentBackward') return;
            
            const value = e.target.value;
            if (value && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
            updateCombinedOTP();
        });

        // Handle backspace
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                inputs[index - 1].focus();
            }
        });

        // Handle paste
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const data = e.clipboardData.getData('text').slice(0, 6);
            if (!/^\d+$/.test(data)) return;

            data.split('').forEach((char, i) => {
                if (inputs[index + i]) {
                    inputs[index + i].value = char;
                }
            });
            
            const nextIndex = Math.min(index + data.length, inputs.length - 1);
            inputs[nextIndex].focus();
            updateCombinedOTP();
        });
    });

    function updateCombinedOTP() {
        let combined = '';
        inputs.forEach(input => {
            combined += input.value;
            if (input.value) input.classList.add('filled');
            else input.classList.remove('filled');
        });
        hiddenInput.value = combined;
    }
}

async function nextStep(step) {
    if (step === 1) {
        // PHASE 1: Forced Email Method
        selectedMethod = 'email';
        const email = document.getElementById('email').value.trim();
        const mobile = document.getElementById('mobile-number') ? document.getElementById('mobile-number').value.trim() : '';
        
        // Handle Identifier
        savedIdentifier = email;
        if (!savedIdentifier) return showToast(`Please enter your registered Official Email`, 'error');

        // Prepare Payload
        const payload = { 
            method: selectedMethod, 
            email: email, 
            mobile_number: mobile,
            role: CANONICAL_ROLE, // Pass canonical role to backend
            tenant_id: 1 
        };

        const btn = document.querySelector('#step-1 .btn-activate');
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Verifying...';
        btn.disabled = true;

        try {
            console.log(`[AUTH] Requesting activation for ${CANONICAL_ROLE} via ${selectedMethod}`);
            
            // ROLE-SPECIFIC ENDPOINT (STRICT)
            const endpoint = `/api/auth/${CANONICAL_ROLE}/request-activation`;
            
            const response = await fetch(endpoint, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (data.success) {
                showToast(data.message || 'OTP sent successfully', 'success');
                transitionToStep(2, "Enter Verification Code", "66.66%");
                
                if (data.demoOtp) {
                    const inputs = document.querySelectorAll('.otp-digit');
                    const digits = data.demoOtp.split('');
                    inputs.forEach((input, i) => {
                        if (digits[i]) input.value = digits[i];
                    });
                    document.getElementById('otp-code').value = data.demoOtp;
                    showToast("⚡ Demo Mode: OTP auto-filled", "info");
                }
            } else {
                console.log("❌ USER NOT FOUND OR REJECTED");
                showToast(data.message || 'Sorry, you are not part of our college.', 'error');
            }
        } catch (err) {
            console.error('Fetch Error:', err);
            showToast('Connection error. Please try again.', 'error');
        } finally {
            btn.innerHTML = 'Send Activation OTP <i class="fa-solid fa-paper-plane"></i>';
            btn.disabled = false;
        }

    } else if (step === 2) {
        const otp = document.getElementById('otp-code').value.trim();
        if (!otp) return showToast('Please enter OTP', 'error');
        if (otp.length !== 6) return showToast('Please enter 6-digit OTP', 'error');

        transitionToStep(3, "Secure Your Account", "100%");
    }
}

async function finishActivation() {
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const otp = document.getElementById('otp-code').value.trim();

    if (!password || password.length < 8) return showToast('Password must be at least 8 characters', 'error');
    if (password !== confirmPassword) return showToast('Passwords do not match', 'error');

    const email = document.getElementById('email').value.trim();
    const mobile = document.getElementById('mobile-number') ? document.getElementById('mobile-number').value.trim() : '';

    const payload = { 
        password, 
        method: selectedMethod, 
        email: email,
        mobile_number: mobile,
        otp: otp,
        role: CANONICAL_ROLE,
        tenant_id: 1 
    };

    const btn = document.querySelector('#step-3 .btn-activate');
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Activating...';
    btn.disabled = true;

    try {
        // ROLE-SPECIFIC ENDPOINT (STRICT)
        const endpoint = `/api/auth/${CANONICAL_ROLE}/complete-activation`;

        const response = await fetch(endpoint, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.success) {
            showToast('Account activated successfully!', 'success');
            setTimeout(() => {
                window.location.href = `login.html?role=${CANONICAL_ROLE}`;
            }, 2000);
        } else {
            showToast(data.message || 'Activation failed', 'error');
        }
    } catch (err) {
        showToast('Activation failed. Server error.', 'error');
    } finally {
        const displayName = CANONICAL_ROLE.charAt(0).toUpperCase() + CANONICAL_ROLE.slice(1);
        btn.innerHTML = `Activate ${displayName} Account <i class="fa-solid fa-bolt"></i>`;
        btn.disabled = false;
    }
}

function transitionToStep(step, desc, progressWidth) {
    const fromId = `#step-${currentStep}`;
    const toId = `#step-${step}`;

    gsap.to(fromId, {
        duration: 0.3, 
        opacity: 0, 
        x: -20,
        onComplete: () => {
            document.querySelector(fromId).classList.remove('active');
            document.querySelector(toId).classList.add('active');
            document.getElementById('step-desc').textContent = desc;
            document.getElementById('progress-fill').style.width = progressWidth;
            
            gsap.fromTo(toId, { opacity: 0, x: 20 }, { duration: 0.3, opacity: 1, x: 0 });
            currentStep = step;
        }
    });
}

function toggleMethod() {
    selectedMethod = document.querySelector('input[name="method"]:checked').value;
    if (selectedMethod === 'email') {
        document.getElementById('email-section').style.display = 'block';
        document.getElementById('sms-section').style.display = 'none';
    } else {
        document.getElementById('email-section').style.display = 'none';
        document.getElementById('sms-section').style.display = 'block';
    }
}
