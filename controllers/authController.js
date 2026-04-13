const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const otpService = require('../utils/otpService');
const notifier = require('../utils/notificationService');
const authService = require('../services/authService');

async function logLoginAttempt(req, { tenantId, userId, identifier, success, reason }) {
    try {
        const ip =
            req.ip ||
            req.headers['x-forwarded-for'] ||
            (req.connection && req.connection.remoteAddress) ||
            null;
        const ua = req.get ? req.get('user-agent') || '' : '';
        const finalTenantId = tenantId || db.getTenantId(req);

        await db.execute(
            'INSERT INTO login_audit (tenant_id, user_id, identifier, success, reason, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [finalTenantId, userId || null, identifier, success ? 1 : 0, reason || null, ip, ua]
        );
    } catch (e) {
        console.error('Login audit log failed:', e.message);
    }
}

/**
 * Request Account Activation (Step 1)
 */
exports.requestActivation = async (req, res) => {
    const { email, mobile_number, roll_number, method, role } = req.body;

    try {
        const tenantId = db.getTenantId(req) || 1;
        let entry;
        let identifier = method === 'email' ? email : mobile_number;
        const normalizedRole = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();

        if (!identifier) {
            return res.status(400).json({ success: false, message: `${method === 'email' ? 'Email' : 'Mobile number'} is required.` });
        }

        if (normalizedRole === 'Student') {
            const query = method === 'email' 
                ? 'SELECT * FROM verified_students WHERE email = $1 AND tenant_id = $2' 
                : 'SELECT * FROM verified_students WHERE roll_number = $1 AND mobile_number = $2 AND tenant_id = $3';
            const params = method === 'email' ? [identifier, tenantId] : [roll_number, identifier, tenantId];
            
            const [rows] = await db.execute(query, params);
            if (rows.length === 0) return res.status(400).json({ success: false, message: 'No registered student account found with these details.' });
            entry = rows[0];
        } else {
            const field = method === 'email' ? 'email' : 'mobile_number';
            const [rows] = await db.execute(`SELECT * FROM verified_staff WHERE ${field} = $1 AND LOWER(role) = LOWER($2) AND tenant_id = $3`, [identifier, normalizedRole, tenantId]);
            if (rows.length === 0) return res.status(400).json({ success: false, message: `No registered ${normalizedRole} account found with these details.` });
            entry = rows[0];
        }

        if (entry.is_account_created) {
            return res.status(400).json({ success: false, message: 'Account already activated. Please login.' });
        }

        const canSend = await otpService.checkRateLimit(identifier);
        if (!canSend) {
            return res.status(429).json({ success: false, message: 'Too many OTP requests. Try again after 10 minutes.' });
        }

        const otp = otpService.generateOTP();
        await otpService.saveOTP(identifier, otp);

        if (method === 'email') {
            const emailSent = await notifier.sendOTPEmail(identifier, otp);
            if (!emailSent) return res.status(500).json({ success: false, message: 'Failed to send activation OTP email.' });
            
            return res.json({ 
                success: true, 
                message: process.env.OTP_MODE === 'mock' ? 'OTP sent (mock mode)' : 'Activation OTP sent to your registered email address.',
                demoOtp: process.env.OTP_MODE === 'mock' ? otp : undefined
            });
        } else {
            const message = `Your Smart Campus activation OTP is: ${otp}. Valid for 5 minutes.`;
            const smsSent = await notifier.sendSMS(identifier, message);
            if (!smsSent) return res.status(500).json({ success: false, message: 'Failed to send activation OTP SMS.' });
            
            return res.json({ 
                success: true, 
                message: process.env.OTP_MODE === 'mock' ? 'OTP sent (mock mode)' : 'Activation OTP sent to your registered mobile number.',
                demoOtp: process.env.OTP_MODE === 'mock' ? otp : undefined
            });
        }
    } catch (error) {
        console.error('Activation request error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Validate Activation OTP (Step 2)
 */
exports.validateActivation = async (req, res) => {
    const { identifier, otp } = req.body;
    try {
        const result = await otpService.verifyOTP(identifier, otp);
        if (result === 'valid') {
            res.json({ success: true, message: 'OTP verified successfully.' });
        } else {
            res.status(400).json({ success: false, message: 'Invalid or expired OTP.' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Complete Activation / Set Password (Step 3)
 */
exports.completeActivation = async (req, res) => {
    const { method, email, mobile_number, otp, password, role } = req.body;

    try {
        const identifier = method === 'email' ? email : mobile_number;
        if (!identifier || !otp) {
            return res.status(400).json({ success: false, message: 'Identifier and OTP are required.' });
        }

        // Unified OTP Verification
        const result = await otpService.verifyOTP(identifier, otp);
        if (result === 'locked') return res.status(429).json({ success: false, message: 'Too many failed attempts. Identity verification locked.' });
        if (result === 'expired') return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
        if (result !== 'valid') return res.status(400).json({ success: false, message: 'Invalid OTP code.' });

        if (password.length < 8) {
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
        }

        const normalizedRole = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
        const hashedPassword = await bcrypt.hash(password, 10);
        let userId;

        if (normalizedRole === 'Student') {
            const tenantId = db.getTenantId(req) || 1;
            const query = method === 'email' ? 'SELECT * FROM verified_students WHERE email = $1 AND tenant_id = $2' : 'SELECT * FROM verified_students WHERE mobile_number = $1 AND tenant_id = $2';
            const [vRows] = await db.execute(query, [identifier, tenantId]);
            if (vRows.length === 0) return res.status(400).json({ success: false, message: 'Student verification data missing.' });
            const vData = vRows[0];

            const [uRows] = await db.execute(
                'INSERT INTO users (tenant_id, username, email, mobile_number, password_hash, role, is_verified) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
                [vData.tenant_id, vData.roll_number, vData.email, vData.mobile_number, hashedPassword, 'Student', true]
            );
            userId = uRows[0].id;

            const deptId = vData.department_id || 7;
            await db.execute(
                'INSERT INTO students (tenant_id, user_id, roll_number, department_id, mobile_number, id_card_image) VALUES ($1, $2, $3, $4, $5, $6)',
                [vData.tenant_id, userId, vData.roll_number, deptId, vData.mobile_number, vData.id_card_image]
            );

            await db.execute('UPDATE verified_students SET is_account_created = TRUE WHERE id = $1', [vData.id]);
        } else {
            const tenantId = db.getTenantId(req) || 1;
            const query = method === 'email' ? 'SELECT * FROM verified_staff WHERE email = $1 AND LOWER(role) = LOWER($2) AND tenant_id = $3' : 'SELECT * FROM verified_staff WHERE mobile_number = $1 AND LOWER(role) = LOWER($2) AND tenant_id = $3';
            const [vRows] = await db.execute(query, [identifier, normalizedRole, tenantId]);
            
            if (vRows.length === 0) {
                return res.status(400).json({ success: false, message: `No verified ${normalizedRole} account found.` });
            }
            const vData = vRows[0];

            if (vData.is_account_created) {
                return res.status(400).json({ success: false, message: 'Account is already activated.' });
            }

            const [uRows] = await db.execute(
                'INSERT INTO users (tenant_id, username, email, mobile_number, password_hash, role, is_verified) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
                [vData.tenant_id, vData.name, vData.email, vData.mobile_number, hashedPassword, normalizedRole, true]
            );
            userId = uRows[0].id;

            await db.execute(
                'INSERT INTO staff (tenant_id, user_id, department_id, designation, mobile_number) VALUES ($1, $2, $3, $4, $5)',
                [vData.tenant_id, userId, vData.department_id, vData.role, vData.mobile_number]
            );

            await db.execute('UPDATE verified_staff SET is_account_created = TRUE WHERE id = $1', [vData.id]);
        }

        await otpService.clearOTPs(identifier);
        
        res.json({ success: true, message: `${normalizedRole} account activated successfully! You can now login.` });
    } catch (error) {
        console.error('Activation completion error:', error);
        res.status(500).json({ success: false, message: 'Activation failed due to server error' });
    }
};

/**
 * Request Password Reset (Step 1)
 * Validates that mobile belongs to a user of the submitted role (prevents cross-role abuse).
 */
exports.requestPasswordReset = async (req, res) => {
    const { email, mobile_number, method, role } = req.body;
    const identifier = method === 'email' ? email : mobile_number;

    if (!identifier) {
        return res.status(400).json({ success: false, message: 'Identifier is required.' });
    }

    try {
        const tenantId = db.getTenantId(req);
        const query = method === 'email' ? 'SELECT * FROM users WHERE email = $1 AND tenant_id = $2' : 'SELECT * FROM users WHERE mobile_number = $1 AND tenant_id = $2';
        const [users] = await db.execute(query, [identifier, tenantId]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'No registered account found. Please contact Admin.' });
        }

        const user = users[0];

        if (role) {
            const normalizedRole = role.toLowerCase();
            const userRole = user.role.toLowerCase();
            const isStaffPortal = ['staff', 'hod', 'admin', 'principal'].includes(normalizedRole);
            const isStudentPortal = normalizedRole === 'student';

            if (isStudentPortal && userRole !== 'student') {
                return res.status(403).json({ success: false, message: 'This identifier belongs to a Staff/Admin account. Use the Staff portal.' });
            }
            if (isStaffPortal && userRole === 'student') {
                return res.status(403).json({ success: false, message: 'This identifier belongs to a Student account. Use the Student portal.' });
            }
        }

        const canSend = await otpService.checkRateLimit(identifier);
        if (!canSend) {
            return res.status(429).json({ success: false, message: 'Too many OTP requests. Try again in 1 hour.' });
        }

        const otp = otpService.generateOTP();
        await otpService.saveOTP(identifier, otp, user.id);

        if (method === 'email') {
            const emailSent = await notifier.sendOTPEmail(identifier, otp);
            if (!emailSent) return res.status(500).json({ success: false, message: 'Failed to send OTP email. Contact Admin.' });
            
            return res.json({ 
                success: true, 
                message: process.env.OTP_MODE === 'mock' ? 'OTP sent (mock mode)' : 'Password reset OTP sent to your registered email address.',
                demoOtp: process.env.OTP_MODE === 'mock' ? otp : undefined
            });
        } else {
            const message = `Your Smart Campus password reset OTP is: ${otp}. Valid for 5 minutes.`;
            const smsSent = await notifier.sendSMS(identifier, message);
            if (!smsSent) return res.status(500).json({ success: false, message: 'Failed to send OTP SMS. Contact Admin.' });
            
            return res.json({ 
                success: true, 
                message: process.env.OTP_MODE === 'mock' ? 'OTP sent (mock mode)' : 'Password reset OTP sent to your registered mobile number.',
                demoOtp: process.env.OTP_MODE === 'mock' ? otp : undefined
            });
        }
    } catch (error) {
        console.error('Password reset request error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};



/**
 * Reset Password (Step 3) — Verifies OTP again as final confirmation before writing new password.
 */
exports.resetPassword = async (req, res) => {
    const { email, mobile_number, method, otp, password } = req.body;
    const identifier = method === 'email' ? email : mobile_number;

    try {
        const result = await otpService.verifyOTP(identifier, otp);
        if (result === 'locked') {
            return res.status(429).json({ success: false, message: 'OTP is locked due to too many attempts. Please request a new reset.' });
        }
        if (result === 'expired') {
            return res.status(400).json({ success: false, message: 'Session expired. Please restart the reset process.' });
        }
        if (result !== 'valid') {
            return res.status(400).json({ success: false, message: 'Incorrect OTP. Please check and try again.' });
        }

        if (!password || password.length < 8) {
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const query = method === 'email' ? 
            'UPDATE users SET password_hash = $1, failed_attempts = 0, locked_until = NULL WHERE email = $2' :
            'UPDATE users SET password_hash = $1, failed_attempts = 0, locked_until = NULL WHERE mobile_number = $2';
        
        const [dbRows, dbResult] = await db.execute(query, [hashedPassword, identifier]);

        if (dbResult.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        await otpService.clearOTPs(identifier);
        res.json({ success: true, message: 'Password reset successfully. You may now login.' });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ success: false, message: 'Failed to reset password' });
    }
};

/**
 * Secure Login with Account Locking
 */
exports.login = async (req, res) => {
    const { identifier, password } = req.body;

    try {
        const tenantId = db.getTenantId(req) || 1;
        const [users] = await db.execute(
            'SELECT * FROM users WHERE (username = $1 OR email = $2 OR mobile_number = $3) AND tenant_id = $4',
            [identifier, identifier, identifier, tenantId]
        );

        if (users.length === 0) {
            await logLoginAttempt(req, {
                tenantId: db.getTenantId(req),
                userId: null,
                identifier,
                success: false,
                reason: 'user_not_found'
            });
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const user = users[0];

        // Check if locked
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            await logLoginAttempt(req, {
                tenantId: user.tenant_id,
                userId: user.id,
                identifier,
                success: false,
                reason: 'account_locked'
            });
            return res.status(403).json({ 
                success: false, 
                message: `Account is temporarily locked. Try again after ${new Date(user.locked_until).toLocaleTimeString()}` 
            });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            const newAttempts = (user.failed_attempts || 0) + 1;
            if (newAttempts >= 5) {
                const lockTime = new Date(Date.now() + 15 * 60 * 1000); // 15 mins lock
                await db.execute('UPDATE users SET failed_attempts = 0, locked_until = $1 WHERE id = $2', [lockTime, user.id]);
                await logLoginAttempt(req, {
                    tenantId: user.tenant_id,
                    userId: user.id,
                    identifier,
                    success: false,
                    reason: 'invalid_password_lock'
                });
                return res.status(403).json({ success: false, message: 'Too many failed attempts. Account locked for 15 minutes.' });
            } else {
                await db.execute('UPDATE users SET failed_attempts = $1 WHERE id = $2', [newAttempts, user.id]);
                await logLoginAttempt(req, {
                    tenantId: user.tenant_id,
                    userId: user.id,
                    identifier,
                    success: false,
                    reason: 'invalid_password'
                });
                return res.status(401).json({ success: false, message: `Invalid password. ${5 - newAttempts} attempts remaining.` });
            }
        }

        // Success: Reset failed attempts
        await db.execute('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);

        await logLoginAttempt(req, {
            tenantId: user.tenant_id,
            userId: user.id,
            identifier,
            success: true,
            reason: 'ok'
        });

        // Fetch detailed info
        let roleInfo = {};
        if (user.role === 'Student') {
            const [students] = await db.execute('SELECT s.id as student_real_id, s.roll_number FROM students s WHERE s.user_id = $1 AND s.tenant_id = $2', [user.id, user.tenant_id]);
            if (students.length > 0) {
                roleInfo = { student_id: students[0].student_real_id, roll_number: students[0].roll_number };
            }
        } else {
            const [staff] = await db.execute('SELECT s.id as staff_id, s.department_id FROM staff s WHERE s.user_id = $1 AND s.tenant_id = $2', [user.id, user.tenant_id]);
            if (staff.length > 0) {
                roleInfo = { staff_id: staff[0].staff_id, department_id: staff[0].department_id };
            }
        }

        const userData = {
            id: user.id,
            username: user.username,
            role: user.role,
            ...roleInfo
        };

        const tokens = await authService.generateTokens(userData);

        // Set Secure HttpOnly Cookies
        const cookieOptions = {
            httpOnly: true,
            secure: true, // Required for SameSite: 'None'
            sameSite: 'None',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days (matching typical refresh token)
        };

        res.cookie('accessToken', tokens.accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 }); // 15 mins
        res.cookie('refreshToken', tokens.refreshToken, cookieOptions);

        return res.json({
            success: true,
            message: 'Login successful',
            // token: tokens.accessToken, // REMOVED - Using Cookies
            // refreshToken: tokens.refreshToken, // REMOVED - Using Cookies
            redirect: getRedirectPath(user.role),
            user: userData
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Staff Activation (from email link)
 */
exports.activateStaff = async (req, res) => {
    const { email, token, password } = req.body;

    try {
        const tenantId = db.getTenantId(req);
        // 1. Verify token in verified_staff
        const [rows] = await db.execute(
            'SELECT * FROM verified_staff WHERE email = $1 AND activation_token = $2 AND is_account_created = 0 AND tenant_id = $3',
            [email, token, tenantId]
        );

        if (rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid or expired activation link' });
        }

        const staffData = rows[0];
        const hashedPassword = await bcrypt.hash(password, 10);

        // 2. Create entry in users table
        const [uResult] = await db.execute(
            'INSERT INTO users (tenant_id, username, email, mobile_number, password_hash, role, is_verified) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
            [staffData.tenant_id || 1, email, email, staffData.mobile_number, hashedPassword, staffData.role, 1]
        );
        const userId = uResult.rows[0].id;

        // 3. Create entry in staff table
        await db.execute(
            'INSERT INTO staff (tenant_id, user_id, department_id, designation) VALUES ($1, $2, $3, $4)',
            [staffData.tenant_id || 1, userId, staffData.department_id, staffData.role]
        );

        // 4. Update verified_staff
        await db.execute('UPDATE verified_staff SET is_account_created = 1, activation_token = NULL WHERE id = $1', [staffData.id]);

        const deptName = staffData.department_name || 'General';
        const userData = { id: userId, username: email, role: staffData.role, staff_id: staffData.id, department_id: deptName };
        const tokens = await authService.generateTokens(userData);

        res.json({
            success: true,
            message: 'Account activated successfully! You can now login.',
            token: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            redirect: getRedirectPath(staffData.role),
            user: userData
        });
    } catch (error) {
        console.error('Staff activation error:', error);
        res.status(500).json({ success: false, message: 'Server error during activation' });
    }
};

/**
 * Verify Firebase UID and handle local session
 */
exports.verifyFirebase = async (req, res) => {
    const { firebaseToken } = req.body;
    const admin = require('../config/firebase');

    try {
        // 1. Verify ID Token securely
        const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
        const uid = decodedToken.uid;
        const mobile_number = decodedToken.phone_number;

        if (!mobile_number) {
            return res.status(400).json({ success: false, message: 'Firebase token missing verified phone number' });
        }
        
        const tenantId = db.getTenantId(req);

        // 1. Check if user already exists in users table by mobile
        const [users] = await db.execute('SELECT * FROM users WHERE mobile_number = $1 AND tenant_id = $2', [mobile_number, tenantId]);
        
        let user;
        if (users.length === 0) {
            // Check if they are in verification master
            const [vStudents] = await db.execute('SELECT * FROM verified_students WHERE mobile_number = $1 AND tenant_id = $2', [mobile_number, tenantId]);
            const [vStaff] = await db.execute('SELECT * FROM verified_staff WHERE mobile_number = $1 AND tenant_id = $2', [mobile_number, tenantId]);

            if (vStudents.length === 0 && vStaff.length === 0) {
                return res.status(403).json({ success: false, message: 'Your number is not registered. Contact Admin.' });
            }

            // Create basic user profile if first time
            const role = vStudents.length > 0 ? 'Student' : (vStaff.length > 0 ? vStaff[0].role : 'Student');
            const email = vStudents.length > 0 ? vStudents[0].email : vStaff[0].email;
            const username = vStudents.length > 0 ? vStudents[0].roll_number : vStaff[0].name;

            const [result] = await db.execute(
                'INSERT INTO users (tenant_id, username, email, mobile_number, firebase_uid, role, is_verified) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
                [tenantId, username, email, mobile_number, uid, role, 1]
            );
            
            const userId = result.rows[0].id;
            if (role === 'Student') {
                await db.execute(
                    'INSERT INTO students (tenant_id, user_id, roll_number, mobile_number) VALUES ($1, $2, $3, $4)',
                    [tenantId, userId, username, mobile_number]
                );
            } else {
                await db.execute(
                    'INSERT INTO staff (tenant_id, user_id, designation, mobile_number) VALUES ($1, $2, $3, $4)',
                    [tenantId, userId, role, mobile_number]
                );
            }
            
            const [rows] = await db.execute('SELECT * FROM users WHERE id = $1', [userId]);
            user = rows[0];
        } else {
            user = users[0];
            // Update UID if missing
            if (!user.firebase_uid) {
                await db.execute('UPDATE users SET firebase_uid = $1 WHERE id = $2', [uid, user.id]);
            }
        }

        // Fetch detailed info for token
        let roleInfo = {};
        if (user.role === 'Student') {
            const [students] = await db.execute('SELECT s.id as student_real_id, s.roll_number FROM students s WHERE s.user_id = $1', [user.id]);
            if (students.length > 0) roleInfo = { student_id: students[0].student_real_id, roll_number: students[0].roll_number };
        } else {
            const [staff] = await db.execute('SELECT s.id as staff_id FROM staff s WHERE s.user_id = $1', [user.id]);
            if (staff.length > 0) roleInfo = { staff_id: staff[0].staff_id };
        }

        const userData = { id: user.id, username: user.username, role: user.role, ...roleInfo };
        
        const tokens = await authService.generateTokens(userData);

        res.json({
            success: true,
            message: 'Firebase verification successful',
            token: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: userData,
            redirect: getRedirectPath(user.role)
        });

    } catch (error) {
        console.error('Firebase verify error:', error);
        res.status(500).json({ success: false, message: 'Authentication bridge failed' });
    }
};

/**
 * Role-based redirect path.
 * FIX: Normalizes role to lowercase before matching — prevents case-sensitivity bugs.
 * FIX: HOD now has an explicit case (mapped to department.html same as Staff,
 *      but kept separate so it's easy to change to a dedicated HOD dashboard later).
 */
function getRedirectPath(role) {
    switch ((role || '').toLowerCase()) {
        case 'student':     return 'student.html';
        case 'staff':       return 'department.html';
        case 'hod':         return 'department.html'; // HOD sees department dashboard; separate case for future HOD-specific page
        case 'admin':       return 'admin.html';
        case 'principal':   return 'principal_dashboard.html';
        default:            return 'index.html';
    }
}

/**
 * POST /api/auth/validate-activation
 * Pre-check if user exists in verified registry before sending Firebase SMS
 */
exports.validateActivation = async (req, res) => {
    const { role, mobile_number, roll_number } = req.body;
    try {
        const tenantId = db.getTenantId(req);
        if (role === 'Student') {
            const [rows] = await db.execute(
                'SELECT id FROM verified_students WHERE roll_number = $1 AND mobile_number = $2 AND tenant_id = $3',
                [roll_number, mobile_number, tenantId]
            );
            if (rows.length === 0) return res.status(404).json({ success: false, message: 'Student not found.' });
        } else {
            const [rows] = await db.execute(
                'SELECT id FROM verified_staff WHERE mobile_number = $1 AND role = $2 AND tenant_id = $3',
                [mobile_number, role, tenantId]
            );
            if (rows.length === 0) return res.status(404).json({ success: false, message: 'Staff with this mobile/role not found.' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Validation error:', error);
        res.status(500).json({ success: false, message: 'Server error during validation' });
    }
};

/**
 * POST /api/auth/request-otp
 * Generic OTP request (used for activation or login verification)
 */
exports.requestOTP = async (req, res) => {
    const { email, mobile_number, method } = req.body;
    const identifier = method === 'email' ? email : mobile_number;
    
    if (!identifier) return res.status(400).json({ success: false, message: 'Identifier is required' });

    try {
        const canRequest = await otpService.checkRateLimit(identifier);
        if (!canRequest) {
            return res.status(429).json({ success: false, message: 'Too many OTP requests. Try again after 1 hour.' });
        }

        const tenantId = db.getTenantId(req);
        const query = method === 'email' ? 'SELECT id FROM users WHERE email = $1 AND tenant_id = $2' : 'SELECT id FROM users WHERE mobile_number = $1 AND tenant_id = $2';
        const [users] = await db.execute(query, [identifier, tenantId]);
        const userId = users.length > 0 ? users[0].id : null;

        const otp = otpService.generateOTP();
        await otpService.saveOTP(identifier, otp, userId);

        if (method === 'email') {
            const emailSent = await notifier.sendOTPEmail(identifier, otp);
            if (!emailSent) return res.status(500).json({ success: false, message: 'Failed to send OTP email.' });
            res.json({ success: true, message: 'OTP sent to email successfully' });
        } else {
            const smsSent = await notifier.sendSMS(identifier, `Your Smart Campus OTP is: ${otp}. Valid for 5 minutes.`);
            if (!smsSent) return res.status(500).json({ success: false, message: 'Failed to send OTP SMS.' });
            res.json({ success: true, message: 'OTP sent to mobile successfully' });
        }
    } catch (error) {
        console.error('Request OTP error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * POST /api/auth/verify-otp
 * Generic OTP verification
 */
exports.verifyOTP = async (req, res) => {
    const { email, mobile_number, method, otp } = req.body;
    const identifier = method === 'email' ? email : mobile_number;
    
    if (!identifier || !otp) return res.status(400).json({ success: false, message: 'Identifier and OTP are required' });

    try {
        const result = await otpService.verifyOTP(identifier, otp);

        if (result === 'valid') {
            return res.json({ success: true, message: 'OTP verified successfully' });
        }
        if (result === 'locked') {
            return res.status(403).json({ success: false, message: 'Too many attempts. This OTP is now invalid.' });
        }
        if (result === 'expired') {
            return res.status(400).json({ success: false, message: 'OTP expired' });
        }
        
        return res.status(400).json({ success: false, message: 'Invalid OTP' });
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * POST /api/auth/resend-otp
 * Resend logic with rate limiting
 */
exports.resendOTP = async (req, res) => {
    // Reusing request-otp logic but specifically for resend flow
    return exports.requestOTP(req, res);
};

/**
 * POST /api/auth/refresh
 * Refresh the access token using a valid refresh token
 */
exports.refreshToken = async (req, res) => {
    // Priority: Cookie first, then body (for testing)
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
    
    if (!refreshToken) {
        return res.status(400).json({ success: false, message: 'Refresh token is required' });
    }

    try {
        const tokens = await authService.refreshAccessToken(refreshToken);
        
        const cookieOptions = {
            httpOnly: true,
            secure: true,
            sameSite: 'None',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        };

        res.cookie('accessToken', tokens.accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
        res.cookie('refreshToken', tokens.refreshToken, cookieOptions);

        res.json({
            success: true,
            message: 'Token refreshed successfully'
            // token: tokens.accessToken, // REMOVED
            // refreshToken: tokens.refreshToken // REMOVED
        });
    } catch (error) {
        return res.status(401).json({ success: false, message: error.message || 'Invalid refresh token' });
    }
};

/**
 * POST /api/auth/logout
 */
exports.logout = async (req, res) => {
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
    
    if (refreshToken) {
        try {
            await authService.revokeToken(refreshToken);
        } catch (err) {
            console.error('Error during logout/revoke:', err);
        }
    }

    // Clear cookies with exact same options as they were set
    const clearOptions = {
        httpOnly: true,
        secure: true,
        sameSite: 'None'
    };

    res.clearCookie('accessToken', clearOptions);
    res.clearCookie('refreshToken', clearOptions);

    res.json({ success: true, message: 'Logged out successfully' });
};

/**
 * POST /api/auth/firebase-complete-activation
 * ─────────────────────────────────────────────────────────────────────────────
 * Called by activate.html AFTER the Firebase Client SDK has successfully
 * applied the password-reset action code (oobCode) and the user is signed in.
 *
 * Flow:
 *   1. Client sends Firebase ID token in body
 *   2. We verify token via Firebase Admin → extract email + uid
 *   3. Look up email in verified_students or verified_staff (tenant-scoped)
 *   4. Create users + role profile records in a transaction
 *   5. Mark registry as is_account_created = TRUE
 *   6. Enable the Firebase user (it was created as disabled)
 *   7. Return JWT tokens for immediate session
 * ─────────────────────────────────────────────────────────────────────────────
 */
exports.firebaseCompleteActivation = async (req, res) => {
    const { firebaseToken } = req.body;

    if (!firebaseToken) {
        return res.status(400).json({ success: false, message: 'Firebase ID token is required.' });
    }

    let admin;
    try {
        admin = require('../config/firebase');
        if (!admin.apps || admin.apps.length === 0) {
            return res.status(503).json({ success: false, message: 'Firebase not configured on this server.' });
        }
    } catch {
        return res.status(503).json({ success: false, message: 'Firebase unavailable.' });
    }

    const conn = await db.getTransaction();
    try {
        await conn.beginTransaction();

        // 1. Verify Firebase ID token
        const decoded = await admin.auth().verifyIdToken(firebaseToken);
        const { email, uid } = decoded;

        if (!email) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'Firebase token is missing email claim.' });
        }

        const tenantId = db.getTenantId(req);

        // 2. Check users table — prevent double-activation
        const [existing] = await conn.execute(
            'SELECT id FROM users WHERE email = $1 AND tenant_id = $2',
            [email, tenantId]
        );

        if (existing.length > 0) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: 'Account already activated. Please login normally.'
            });
        }

        // 3a. Check verified_students
        const [vstudents] = await conn.execute(
            'SELECT * FROM verified_students WHERE email = $1 AND tenant_id = $2',
            [email, tenantId]
        );

        // 3b. Check verified_staff
        const [vstaff] = await conn.execute(
            'SELECT * FROM verified_staff WHERE email = $1 AND tenant_id = $2',
            [email, tenantId]
        );

        if (vstudents.length === 0 && vstaff.length === 0) {
            await conn.rollback();
            return res.status(403).json({
                success: false,
                message: 'This email is not registered in the campus registry. Contact Admin.'
            });
        }

        let userId, userData;
        const isStudent = vstudents.length > 0;

        if (isStudent) {
            const vd = vstudents[0];

            // 4a. Create users record
            const [uResult] = await conn.execute(
                `INSERT INTO users (tenant_id, username, email, mobile_number, role, is_verified, firebase_uid, status)
                 VALUES ($1, $2, $3, $4, 'Student', TRUE, $5, 'active') RETURNING id`,
                [tenantId, vd.roll_number, email, vd.mobile_number || null, uid]
            );
            userId = uResult.rows[0].id;

            // Resolve department_id (verified_students stores name, not id)
            let deptId = null;
            if (vd.department) {
                const [deptRows] = await conn.execute(
                    'SELECT id FROM departments WHERE LOWER(name) = LOWER($1) AND tenant_id = $2 LIMIT 1',
                    [vd.department, tenantId]
                );
                if (deptRows.length > 0) deptId = deptRows[0].id;
            }

            // 4b. Create students profile
            await conn.execute(
                `INSERT INTO students (tenant_id, user_id, roll_number, department_id, mobile_number)
                 VALUES ($1, $2, $3, $4, $5)`,
                [tenantId, userId, vd.roll_number, deptId, vd.mobile_number || null]
            );

            // 5. Mark as activated
            await conn.execute(
                'UPDATE verified_students SET is_account_created = TRUE WHERE id = $1',
                [vd.id]
            );

            // Get student profile id for token
            const [sRows] = await conn.execute('SELECT id FROM students WHERE user_id = $1', [userId]);
            userData = {
                id: userId,
                username: vd.roll_number,
                role: 'Student',
                student_id: sRows[0]?.id,
                roll_number: vd.roll_number,
                tenant_id: tenantId
            };

        } else {
            const vd = vstaff[0];

            // 4a. Create users record
            const [uResult] = await conn.execute(
                `INSERT INTO users (tenant_id, username, email, mobile_number, role, is_verified, firebase_uid, status)
                 VALUES ($1, $2, $3, $4, $5, TRUE, $6, 'active') RETURNING id`,
                [tenantId, vd.name, email, vd.mobile || null, vd.role, uid]
            );
            userId = uResult.rows[0].id;

            // 4b. Create staff profile
            await conn.execute(
                `INSERT INTO staff (tenant_id, user_id, department_id, designation)
                 VALUES ($1, $2, $3, $4)`,
                [tenantId, userId, vd.department_id || null, vd.role]
            );

            // 5. Mark as activated
            await conn.execute(
                'UPDATE verified_staff SET is_account_created = TRUE WHERE id = $1',
                [vd.id]
            );

            const [sRows] = await conn.execute('SELECT id FROM staff WHERE user_id = $1', [userId]);
            userData = {
                id: userId,
                username: vd.name,
                role: vd.role,
                staff_id: sRows[0]?.id,
                tenant_id: tenantId
            };
        }

        await conn.commit();

        // 6. Enable the Firebase user account (it was disabled at enrollment)
        try {
            await admin.auth().updateUser(uid, { disabled: false });
        } catch (fbErr) {
            // Non-critical: user can still login via Firebase SDK after this
            console.warn('[firebaseCompleteActivation] Could not enable Firebase user:', fbErr.message);
        }

        // 7. Issue JWT tokens
        const tokens = await authService.generateTokens(userData);

        return res.json({
            success: true,
            message: 'Account activated successfully! Welcome to Smart Campus.',
            token: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: userData,
            redirect: getRedirectPath(userData.role)
        });

    } catch (err) {
        await conn.rollback();
        console.error('[firebaseCompleteActivation] Error:', err);

        if (err.code === 'auth/id-token-expired') {
            return res.status(401).json({ success: false, message: 'Session expired. Please try the activation link again.' });
        }
        if (err.code === 'auth/argument-error' || err.code === 'auth/invalid-id-token') {
            return res.status(401).json({ success: false, message: 'Invalid Firebase token.' });
        }

        res.status(500).json({ success: false, message: 'Activation failed due to a server error.' });
    } finally {
        conn.release();
    }
};
