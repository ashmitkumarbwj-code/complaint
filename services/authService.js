const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');

exports.generateTokens = async (userData) => {
    // Access token - Short-lived (15 minutes for security)
    const accessToken = jwt.sign(
        { user: userData },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
    );

    // Refresh token - Long-lived (7 days)
    const refreshToken = crypto.randomBytes(40).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); 

    await db.execute(
        'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [userData.id, refreshToken, expiresAt]
    );

    return { accessToken, refreshToken };
};

exports.refreshAccessToken = async (refreshToken) => {
    // Find valid token
    const [rows] = await db.execute(
        'SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP',
        [refreshToken]
    );

    if (rows.length === 0) {
        throw new Error('Invalid or expired refresh token');
    }

    const rtInfo = rows[0];

    // Delete old token (Token Rotation)
    await db.execute('DELETE FROM refresh_tokens WHERE id = $1', [rtInfo.id]);

    // Get user details
    const [users] = await db.execute('SELECT * FROM users WHERE id = $1', [rtInfo.user_id]);
    if (users.length === 0) throw new Error('User not found');
    const user = users[0];

    // Re-fetch role info
    let roleInfo = {};
    if (user.role.toLowerCase() === 'student') {
        const [students] = await db.execute('SELECT s.id as student_real_id, s.roll_number FROM students s WHERE s.user_id = $1', [user.id]);
        if (students.length > 0) roleInfo = { student_id: students[0].student_real_id, roll_number: students[0].roll_number };
    } else {
        const [staff] = await db.execute('SELECT s.id as staff_id, s.department_id FROM staff s WHERE s.user_id = $1', [user.id]);
        if (staff.length > 0) roleInfo = { staff_id: staff[0].staff_id, department_id: staff[0].department_id };
    }

    const userData = {
        id: user.id,
        username: user.username,
        role: user.role,
        ...roleInfo
    };

    return await this.generateTokens(userData);
};

exports.revokeToken = async (refreshToken) => {
    if(!refreshToken) return;
    await db.execute('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
};
