const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const otpService = require('../utils/otpService');
const notifier = require('../utils/notificationService');

async function logLoginAttempt(req, { userId, identifier, success, reason }) {
    try {
        const ip =
            req.ip ||
            req.headers['x-forwarded-for'] ||
            (req.connection && req.connection.remoteAddress) ||
            null;
        const ua = req.get ? req.get('user-agent') || '' : '';

        await db.execute(
            'INSERT INTO login_audit (user_id, identifier, success, reason, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
            [userId || null, identifier, success ? 1 : 0, reason || null, ip, ua]
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
        let entry;
        let identifier;
        const normalizedRole = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();

        if (method === 'email') {
            identifier = email;
            if (!identifier) return res.status(400).json({ success: false, message: 'Email is required.' });

            if (normalizedRole === 'Student') {
                const [rows] = await db.execute('SELECT * FROM verified_students WHERE email = ?', [identifier]);
                if (rows.length === 0) return res.status(400).json({ success: false, message: 'No registered student account found with this email.' });
                entry = rows[0];
            } else {
                const [rows] = await db.execute('SELECT * FROM verified_staff WHERE email = ? AND LOWER(role) = LOWER(?)', [identifier, normalizedRole]);
                if (rows.length === 0) return res.status(400).json({ success: false, message: `No registered ${normalizedRole} account found with this email.` });
                entry = rows[0];
            }
        } else if (method === 'sms') {
            if (normalizedRole === 'Student') {
                identifier = mobile_number;
                if (!roll_number || !identifier) return res.status(400).json({ success: false, message: 'Roll number and mobile number are required for SMS.' });
                
                const [rows] = await db.execute('SELECT * FROM verified_students WHERE roll_number = ? AND mobile = ?', [roll_number, identifier]);
                if (rows.length === 0) return res.status(400).json({ success: false, message: 'Invalid Roll Number or Mobile Number.' });
                entry = rows[0];
            } else {
                identifier = mobile_number;
                if (!identifier) return res.status(400).json({ success: false, message: 'Mobile number is required for SMS.' });

                const [rows] = await db.execute('SELECT * FROM verified_staff WHERE mobile = ? AND LOWER(role) = LOWER(?)', [identifier, normalizedRole]);
                if (rows.length === 0) return res.status(400).json({ success: false, message: `No registered ${normalizedRole} account found for this mobile number.` });
                entry = rows[0];
            }
        } else {
            return res.status(400).json({ success: false, message: 'Invalid verification method selected.' });
        }

        if (entry.is_account_created) {
            return res.status(400).json({ success: false, message: 'Account already activated. Please login.' });
        }

        const canSend = await otpService.checkRateLimit(identifier);
        if (!canSend) {
            return res.status(429).json({ success: false, message: 'Too many OTP requests. Try again later.' });
        }

        const otp = otpService.generateOTP();
        await otpService.saveOTP(identifier, otp);

        if (method === 'email') {
            const emailSent = await notifier.sendOTPEmail(identifier, otp);
            if (!emailSent) return res.status(500).json({ success: false, message: 'Failed to send activation OTP email.' });
            res.json({ success: true, message: 'Activation OTP sent to your registered email address.' });
        } else {
            const message = `Your Smart Campus activation OTP is: ${otp}. Valid for 5 minutes.`;
            const smsSent = await notifier.sendSMS(identifier, message);
            if (!smsSent) return res.status(500).json({ success: false, message: 'Failed to send activation OTP SMS.' });
            res.json({ success: true, message: 'Activation OTP sent to your registered mobile number.' });
        }
    } catch (error) {
        console.error('Activation request error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};



/**
 * Complete Activation / Set Password (Step 3)
 */
exports.completeActivation = async (req, res) => {
    const { email, mobile_number, method, otp, password, role } = req.body;
    const identifier = method === 'email' ? email : mobile_number;

    if (!identifier || !otp || !password || !role) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    if (password.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const normalizedRole = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();

    try {
        const result = await otpService.verifyOTP(identifier, otp);
        if (result === 'locked') {
            return res.status(429).json({ success: false, message: 'OTP is locked due to too many attempts. Please request a new one.' });
        }
        if (result === 'expired') {
            return res.status(400).json({ success: false, message: 'OTP has expired. Please restart activation.' });
        }
        if (result !== 'valid') {
            return res.status(400).json({ success: false, message: 'Incorrect OTP. Please check and try again.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        let userId;

        if (normalizedRole === 'Student') {
            const query = method === 'email' ? 'SELECT * FROM verified_students WHERE email = ?' : 'SELECT * FROM verified_students WHERE mobile = ?';
            const [vRows] = await db.execute(query, [identifier]);
            if (vRows.length === 0) return res.status(400).json({ success: false, message: 'Student verification data missing for this identifier.' });
            const vData = vRows[0];

            const [uResult] = await db.execute(
                'INSERT INTO users (username, email, mobile_number, password_hash, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
                [vData.roll_number, vData.email, vData.mobile, hashedPassword, 'Student', 1]
            );
            userId = uResult.insertId;

            // Mapping no longer needed as we use department_id directly
            const deptId = vData.department_id || 7;

            await db.execute(
                'INSERT INTO students (user_id, roll_number, department_id, mobile, id_card_image) VALUES (?, ?, ?, ?, ?)',
                [userId, vData.roll_number, deptId, vData.mobile, vData.id_card_image]
            );

            await db.execute('UPDATE verified_students SET is_account_created = 1 WHERE id = ?', [vData.id]);
        } else {
            const query = method === 'email' ? 'SELECT * FROM verified_staff WHERE email = ? AND LOWER(role) = LOWER(?)' : 'SELECT * FROM verified_staff WHERE mobile = ? AND LOWER(role) = LOWER(?)';
            const [vRows] = await db.execute(query, [identifier, normalizedRole]);
            
            if (vRows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: `No verified ${normalizedRole} account found with this identifier. Contact Admin.`
                });
            }
            const vData = vRows[0];

            if (vData.is_account_created) {
                return res.status(400).json({ success: false, message: 'Account is already activated. Please login.' });
            }

            const [uResult] = await db.execute(
                'INSERT INTO users (username, email, mobile_number, password_hash, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
                [vData.name, vData.email, vData.mobile, hashedPassword, normalizedRole, 1]
            );
            userId = uResult.insertId;

            await db.execute(
                'INSERT INTO staff (user_id, department_name, designation, staff_type) VALUES (?, ?, ?, ?)',
                [userId, vData.department_id, vData.designation, vData.role]
            );

            await db.execute('UPDATE verified_staff SET is_account_created = 1 WHERE id = ?', [vData.id]);
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
        const query = method === 'email' ? 'SELECT * FROM users WHERE email = ?' : 'SELECT * FROM users WHERE mobile_number = ?';
        const [users] = await db.execute(query, [identifier]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'No registered account found with this identifier. Please contact Admin.' });
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
            res.json({ success: true, message: 'Password reset OTP sent to your registered email address.' });
        } else {
            const message = `Your Smart Campus password reset OTP is: ${otp}. Valid for 5 minutes.`;
            const smsSent = await notifier.sendSMS(identifier, message);
            if (!smsSent) return res.status(500).json({ success: false, message: 'Failed to send OTP SMS. Contact Admin.' });
            res.json({ success: true, message: 'Password reset OTP sent to your registered mobile number.' });
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
            'UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE email = ?' :
            'UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE mobile_number = ?';
        
        const [dbResult] = await db.execute(query, [hashedPassword, identifier]);

        if (dbResult.affectedRows === 0) {
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
        const [users] = await db.execute(
            'SELECT * FROM users WHERE username = ? OR email = ? OR mobile_number = ?',
            [identifier, identifier, identifier]
        );

        if (users.length === 0) {
            await logLoginAttempt(req, {
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
                await db.execute('UPDATE users SET failed_attempts = 0, locked_until = ? WHERE id = ?', [lockTime, user.id]);
                await logLoginAttempt(req, {
                    userId: user.id,
                    identifier,
                    success: false,
                    reason: 'invalid_password_lock'
                });
                return res.status(403).json({ success: false, message: 'Too many failed attempts. Account locked for 15 minutes.' });
            } else {
                await db.execute('UPDATE users SET failed_attempts = ? WHERE id = ?', [newAttempts, user.id]);
                await logLoginAttempt(req, {
                    userId: user.id,
                    identifier,
                    success: false,
                    reason: 'invalid_password'
                });
                return res.status(401).json({ success: false, message: `Invalid password. ${5 - newAttempts} attempts remaining.` });
            }
        }

        // Success: Reset failed attempts
        await db.execute('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);

        await logLoginAttempt(req, {
            userId: user.id,
            identifier,
            success: true,
            reason: 'ok'
        });

        // Fetch detailed info
        let roleInfo = {};
        if (user.role === 'Student') {
            const [students] = await db.execute('SELECT s.id as student_real_id, s.roll_number FROM students s WHERE s.user_id = ?', [user.id]);
            if (students.length > 0) {
                roleInfo = { student_id: students[0].student_real_id, roll_number: students[0].roll_number };
            }
        } else {
            const [staff] = await db.execute('SELECT s.id as staff_id, s.department_name FROM staff s WHERE s.user_id = ?', [user.id]);
            if (staff.length > 0) {
                roleInfo = { staff_id: staff[0].staff_id, department_id: staff[0].department_name };
            }
        }

        const userData = {
            id: user.id,
            username: user.username,
            role: user.role,
            ...roleInfo
        };

        if (!process.env.JWT_SECRET) {
            console.error('[CRITICAL SECURITY ERROR] JWT_SECRET is not defined in environment variables.');
            return res.status(500).json({ success: false, message: 'Internal Server Configuration Error' });
        }

        const token = jwt.sign(
            { user: userData },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        return res.json({
            success: true,
            message: 'Login successful',
            token: token,
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
        // 1. Verify token in verified_staff
        const [rows] = await db.execute(
            'SELECT * FROM verified_staff WHERE email = ? AND activation_token = ? AND is_account_created = 0',
            [email, token]
        );

        if (rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid or expired activation link' });
        }

        const staffData = rows[0];
        const hashedPassword = await bcrypt.hash(password, 10);

        // 2. Create entry in users table
        const [uResult] = await db.execute(
            'INSERT INTO users (username, email, mobile_number, password_hash, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
            [email, email, staffData.mobile, hashedPassword, staffData.role, 1]
        );
        const userId = uResult.insertId;

        // 3. Create entry in staff table
        await db.execute(
            'INSERT INTO staff (user_id, department_id, designation) VALUES (?, ?, ?)',
            [userId, staffData.department_id, staffData.role]
        );

        // 4. Update verified_staff
        await db.execute('UPDATE verified_staff SET is_account_created = 1, activation_token = NULL WHERE id = ?', [staffData.id]);

        res.json({ success: true, message: 'Account activated successfully! You can now login.' });
    } catch (error) {
        console.error('Staff activation error:', error);
        res.status(500).json({ success: false, message: 'Server error during activation' });
    }
};

/**
 * Verify Firebase UID and handle local session
 */
exports.verifyFirebase = async (req, res) => {
    const { uid, mobile_number } = req.body;

    try {
        // 1. Check if user already exists in users table by mobile
        const [users] = await db.execute('SELECT * FROM users WHERE mobile_number = ?', [mobile_number]);
        
        let user;
        if (users.length === 0) {
            // Check if they are in verification master
            const [vStudents] = await db.execute('SELECT * FROM verified_students WHERE mobile_number = ?', [mobile_number]);
            const [vStaff] = await db.execute('SELECT * FROM verified_staff WHERE mobile = ?', [mobile_number]);

            if (vStudents.length === 0 && vStaff.length === 0) {
                return res.status(403).json({ success: false, message: 'Your number is not registered in the campus database. Contact Admin.' });
            }

            // Create basic user profile if first time
            const role = vStudents.length > 0 ? 'Student' : (vStaff.length > 0 ? vStaff[0].role : 'Student');
            const email = vStudents.length > 0 ? vStudents[0].email : vStaff[0].email;
            const username = vStudents.length > 0 ? vStudents[0].roll_number : vStaff[0].name;

            const [result] = await db.execute(
                'INSERT INTO users (username, email, mobile_number, firebase_uid, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
                [username, email, mobile_number, uid, role, 1]
            );
            
            const userId = result.insertId;
            if (role === 'Student') {
                await db.execute('INSERT INTO students (user_id, roll_number, mobile) VALUES (?, ?, ?)', [userId, username, mobile_number]);
            } else {
                await db.execute('INSERT INTO staff (user_id, designation) VALUES (?, ?)', [userId, role]);
            }
            
            const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
            user = rows[0];
        } else {
            user = users[0];
            // Update UID if missing
            if (!user.firebase_uid) {
                await db.execute('UPDATE users SET firebase_uid = ? WHERE id = ?', [uid, user.id]);
            }
        }

        // Fetch detailed info for token
        let roleInfo = {};
        if (user.role === 'Student') {
            const [students] = await db.execute('SELECT s.id as student_real_id, s.roll_number FROM students s WHERE s.user_id = ?', [user.id]);
            if (students.length > 0) roleInfo = { student_id: students[0].student_real_id, roll_number: students[0].roll_number };
        } else {
            const [staff] = await db.execute('SELECT s.id as staff_id FROM staff s WHERE s.user_id = ?', [user.id]);
            if (staff.length > 0) roleInfo = { staff_id: staff[0].staff_id };
        }

        const userData = { id: user.id, username: user.username, role: user.role, ...roleInfo };
        
        if (!process.env.JWT_SECRET) {
            console.error('[CRITICAL SECURITY ERROR] JWT_SECRET is not defined in environment variables.');
            return res.status(500).json({ success: false, message: 'Internal Server Configuration Error' });
        }
        
        const token = jwt.sign({ user: userData }, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.json({
            success: true,
            message: 'Firebase verification successful',
            token: token,
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

        const query = method === 'email' ? 'SELECT id FROM users WHERE email = ?' : 'SELECT id FROM users WHERE mobile_number = ?';
        const [users] = await db.execute(query, [identifier]);
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
