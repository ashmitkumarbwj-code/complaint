const express = require('express');
const router = express.Router();
const { 
    loginLimiter, 
    otpLimiter, 
    activationLimiter 
} = require('../middleware/rateLimiter');
const authController = require('../controllers/authController');
const v = require('../middleware/validators');

// ── Routes ────────────────────────────────────────────────────────────────────

router.post('/login',               loginLimiter,  v.validateLogin,               authController.login);

// Role-Based Activation (Parallel System) - Upgraded to activationLimiter (5/hr)
router.post('/student/request-activation',   activationLimiter, v.validateRequestActivation,  authController.requestStudentActivation);
router.post('/student/complete-activation',                     v.validateCompleteActivation, authController.completeStudentActivation);

router.post('/staff/request-activation',     activationLimiter, v.validateRequestActivation,  authController.requestStaffActivation);
router.post('/staff/complete-activation',                       v.validateCompleteActivation, authController.completeStaffActivation);

router.post('/admin/request-activation',     activationLimiter, v.validateRequestActivation,  authController.requestAdminActivation);
router.post('/admin/complete-activation',                       v.validateCompleteActivation, authController.completeAdminActivation);

router.post('/principal/request-activation', activationLimiter, v.validateRequestActivation,  authController.requestPrincipalActivation);
router.post('/principal/complete-activation',                   v.validateCompleteActivation, authController.completePrincipalActivation);

// Legacy/Compatibility Endpoints (Do not remove)
router.post('/request-activation',  activationLimiter, v.validateRequestActivation,   authController.requestActivation);
router.post('/complete-activation',                     v.validateCompleteActivation,  authController.completeActivation);

router.post('/request-reset',       otpLimiter,         v.validateRequestReset,        authController.requestPasswordReset);
router.post('/reset-password',      otpLimiter,         v.validateResetPassword,       authController.resetPassword);


router.post('/request-otp',         otpLimiter,    authController.requestOTP);
router.post('/verify-otp',          otpLimiter,    v.validateVerifyOTP,           authController.verifyOTP);
router.post('/resend-otp',          otpLimiter,    authController.resendOTP);

router.post('/activate-staff',               otpLimiter,    v.validateActivateStaff,       authController.activateStaff);
router.post('/verify-firebase',              loginLimiter,  v.validateVerifyFirebase,      authController.verifyFirebase);
router.post('/firebase-complete-activation', loginLimiter,                                 authController.firebaseCompleteActivation);

router.post('/refresh',             authController.refreshToken);
router.post('/logout',              authController.logout);

module.exports = router;
