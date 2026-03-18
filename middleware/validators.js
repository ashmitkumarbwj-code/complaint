const { body, param, validationResult } = require('express-validator');

// ─────────────────────────────────────────────────────────────────
// Helper: Collect validation errors and return 422 if any exist
// ─────────────────────────────────────────────────────────────────
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({
            success: false,
            message: errors.array()[0].msg, // Return the first error message
            errors: errors.array()
        });
    }
    next();
};

// ─────────────────────────────────────────────────────────────────
// Reusable Field Rules
// ─────────────────────────────────────────────────────────────────

const rollNumberRule = (field = 'roll_number') =>
    body(field)
        .trim()
        .notEmpty().withMessage('Roll number is required.')
        .matches(/^[A-Za-z0-9\-\/]{3,20}$/).withMessage('Roll number must be 3–20 alphanumeric characters (hyphens/slashes allowed).');

const mobileRule = (field = 'mobile_number') =>
    body(field)
        .trim()
        .notEmpty().withMessage('Mobile number is required.')
        .matches(/^[6-9]\d{9}$/).withMessage('Mobile number must be a valid 10-digit Indian mobile number.');

const emailRuleOptional = (field = 'email') =>
    body(field)
        .optional({ checkFalsy: true })
        .trim()
        .isEmail().withMessage('Please enter a valid email address.')
        .normalizeEmail();

const mobileRuleOptional = (field = 'mobile_number') =>
    body(field)
        .optional({ checkFalsy: true })
        .trim()
        .matches(/^[6-9]\d{9}$/).withMessage('Mobile number must be a valid 10-digit Indian mobile number.');

const rollNumberRuleOptional = (field = 'roll_number') =>
    body(field)
        .optional({ checkFalsy: true })
        .trim()
        .matches(/^[A-Za-z0-9\-\/]{3,20}$/).withMessage('Roll number must be 3–20 alphanumeric characters.');

const methodRule = () => 
    body('method')
        .optional({ checkFalsy: true })
        .trim()
        .isIn(['email', 'sms']).withMessage('Method must be email or sms.');

const passwordRule = (field = 'password') =>
    body(field)
        .notEmpty().withMessage('Password is required.')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
        .matches(/[A-Za-z]/).withMessage('Password must contain at least one letter.')
        .matches(/\d/).withMessage('Password must contain at least one number.');

const otpRule = (field = 'otp') =>
    body(field)
        .trim()
        .notEmpty().withMessage('OTP is required.')
        .matches(/^\d{4,8}$/).withMessage('OTP must be a 4–8 digit number.');

// ─────────────────────────────────────────────────────────────────
// Auth Validators
// ─────────────────────────────────────────────────────────────────

// POST /api/auth/login
exports.validateLogin = [
    body('identifier')
        .trim()
        .notEmpty().withMessage('Username, email, or mobile number is required.')
        .isLength({ max: 100 }).withMessage('Identifier is too long.'),
    body('password')
        .notEmpty().withMessage('Password is required.')
        .isLength({ max: 128 }).withMessage('Password is too long.'),
    validate
];

// POST /api/auth/request-activation
exports.validateRequestActivation = [
    body('role')
        .trim()
        .notEmpty().withMessage('Role is required.')
        .isIn(['Student', 'Staff', 'HOD', 'Admin', 'Principal']).withMessage('Invalid role specified.'),
    methodRule(),
    emailRuleOptional('email'),
    mobileRuleOptional('mobile_number'),
    rollNumberRuleOptional('roll_number'),
    validate
];

// POST /api/auth/verify-otp
exports.validateVerifyOTP = [
    methodRule(),
    emailRuleOptional('email'),
    mobileRuleOptional('mobile_number'),
    otpRule('otp'),
    validate
];

// POST /api/auth/complete-activation
exports.validateCompleteActivation = [
    methodRule(),
    emailRuleOptional('email'),
    mobileRuleOptional('mobile_number'),
    otpRule('otp'),
    passwordRule('password'),
    body('role')
        .trim()
        .notEmpty().withMessage('Role is required.')
        .isIn(['Student', 'Staff', 'HOD', 'Admin', 'Principal', 'student', 'staff', 'hod', 'admin', 'principal']).withMessage('Invalid role.'),
    validate
];

// POST /api/auth/request-reset
exports.validateRequestReset = [
    methodRule(),
    emailRuleOptional('email'),
    mobileRuleOptional('mobile_number'),
    body('role')
        .optional()
        .trim()
        .isIn(['Student', 'Staff', 'HOD', 'Admin', 'Principal']).withMessage('Invalid role specified.'),
    validate
];

// POST /api/auth/verify-reset
exports.validateVerifyReset = [
    methodRule(),
    emailRuleOptional('email'),
    mobileRuleOptional('mobile_number'),
    otpRule('otp'),
    validate
];

// POST /api/auth/reset-password
exports.validateResetPassword = [
    methodRule(),
    emailRuleOptional('email'),
    mobileRuleOptional('mobile_number'),
    otpRule('otp'),
    passwordRule('password'),
    validate
];

// POST /api/auth/activate-staff
exports.validateActivateStaff = [
    emailRuleOptional('email'),
    body('token')
        .trim()
        .notEmpty().withMessage('Activation token is required.')
        .isLength({ min: 10, max: 256 }).withMessage('Invalid activation token format.'),
    passwordRule('password'),
    validate
];

// POST /api/auth/verify-firebase
exports.validateVerifyFirebase = [
    body('uid')
        .trim()
        .notEmpty().withMessage('Firebase UID is required.')
        .isLength({ max: 128 }).withMessage('Firebase UID is too long.'),
    mobileRule('mobile_number'),
    validate
];

// ─────────────────────────────────────────────────────────────────
// Complaint Validators
// ─────────────────────────────────────────────────────────────────

// POST /api/complaints/submit
exports.validateSubmitComplaint = [
    body('student_id')
        .notEmpty().withMessage('Student ID is required.')
        .isInt({ min: 1 }).withMessage('Student ID must be a positive integer.'),
    body('category')
        .trim()
        .notEmpty().withMessage('Complaint category is required.')
        .isIn(['Noise', 'Electricity', 'Infrastructure', 'Mess', 'Security', 'Harassment', 'Faculty', 'Other'])
        .withMessage('Invalid category. Please select a valid complaint category.'),
    body('description')
        .trim()
        .notEmpty().withMessage('Complaint description is required.')
        .isLength({ min: 20, max: 2000 }).withMessage('Description must be between 20 and 2000 characters.'),
    body('location')
        .trim()
        .notEmpty().withMessage('Location is required.')
        .isLength({ min: 3, max: 200 }).withMessage('Location must be between 3 and 200 characters.'),
    body('priority')
        .optional()
        .trim()
        .isIn(['Low', 'Medium', 'High', 'Emergency']).withMessage('Invalid priority level.'),
    validate
];

// PATCH /api/complaints/status/:complaint_id
exports.validateUpdateStatus = [
    param('complaint_id')
        .isInt({ min: 1 }).withMessage('Complaint ID must be a positive integer.'),
    body('status')
        .trim()
        .notEmpty().withMessage('Status is required.')
        .isIn(['Pending', 'In Progress', 'Resolved', 'Rejected']).withMessage('Invalid status value.'),
    body('admin_notes')
        .optional()
        .trim()
        .isLength({ max: 1000 }).withMessage('Admin notes must not exceed 1000 characters.'),
    validate
];

// GET /api/complaints/student/:student_id
exports.validateStudentId = [
    param('student_id')
        .isInt({ min: 1 }).withMessage('Student ID must be a positive integer.'),
    validate
];

// ─────────────────────────────────────────────────────────────────
// File Upload Validator (called after multer runs)
// Validates that if a file is uploaded, it meets requirements.
// ─────────────────────────────────────────────────────────────────
exports.validateFileUpload = (req, res, next) => {
    if (!req.file) return next(); // File is optional

    // Only JPEG and PNG are permitted
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedMimes.includes(req.file.mimetype)) {
        return res.status(422).json({
            success: false,
            message: 'Invalid file type. Only JPG and PNG images are allowed.'
        });
    }

    // Hard 5 MB ceiling (belt-and-suspenders over multer limits)
    const maxSizeBytes = 5 * 1024 * 1024;
    if (req.file.size > maxSizeBytes) {
        return res.status(422).json({
            success: false,
            message: 'File size exceeds the 5 MB limit. Please upload a smaller image.'
        });
    }

    next();
};
