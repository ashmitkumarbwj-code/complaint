const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const v = require('../middleware/validators');

// ── Per-route Rate Limiters ───────────────────────────────────────────────────

// Login: max 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many login attempts. Please try again after 15 minutes.' }
});

// OTP send: max 5 requests per 15 minutes per IP (prevents SMS bill abuse)
const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Too many OTP requests. Please wait 15 minutes before requesting another.' }
});

// Password reset: max 5 attempts per 15 minutes per IP
const resetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Too many reset attempts. Please try again after 15 minutes.' }
});

// ── Routes ────────────────────────────────────────────────────────────────────

router.post('/login',               loginLimiter,  v.validateLogin,               authController.login);

// Role-Based Activation (Parallel System)
router.post('/student/request-activation',   otpLimiter, v.validateRequestActivation,  authController.requestStudentActivation);
router.post('/student/complete-activation',              v.validateCompleteActivation, authController.completeStudentActivation);

router.post('/staff/request-activation',     otpLimiter, v.validateRequestActivation,  authController.requestStaffActivation);
router.post('/staff/complete-activation',                v.validateCompleteActivation, authController.completeStaffActivation);

router.post('/admin/request-activation',     otpLimiter, v.validateRequestActivation,  authController.requestAdminActivation);
router.post('/admin/complete-activation',                v.validateCompleteActivation, authController.completeAdminActivation);

router.post('/principal/request-activation', otpLimiter, v.validateRequestActivation,  authController.requestPrincipalActivation);
router.post('/principal/complete-activation',            v.validateCompleteActivation, authController.completePrincipalActivation);

// Legacy/Compatibility Endpoints (Do not remove)
router.post('/request-activation',  otpLimiter,    v.validateRequestActivation,   authController.requestActivation);
router.post('/complete-activation',                v.validateCompleteActivation,  authController.completeActivation);

router.post('/request-reset',       resetLimiter,  v.validateRequestReset,        authController.requestPasswordReset);
router.post('/reset-password',      resetLimiter,  v.validateResetPassword,       authController.resetPassword);

router.post('/request-otp',         otpLimiter,    authController.requestOTP);
router.post('/verify-otp',          otpLimiter,    v.validateVerifyOTP,           authController.verifyOTP);
router.post('/resend-otp',          otpLimiter,    authController.resendOTP);

router.post('/activate-staff',               otpLimiter,    v.validateActivateStaff,       authController.activateStaff);
router.post('/verify-firebase',              loginLimiter,  v.validateVerifyFirebase,      authController.verifyFirebase);
router.post('/firebase-complete-activation', loginLimiter,                                 authController.firebaseCompleteActivation);

router.post('/refresh',             authController.refreshToken);
router.post('/logout',              authController.logout);

module.exports = router;
