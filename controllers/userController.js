const db = require('../config/db');
const bcrypt = require('bcryptjs');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');
const logger = require('../utils/logger');

/**
 * Update User Profile (Name, Photo, Password)
 */
exports.updateProfile = async (req, res) => {
    const userId = req.user.id;
    const { username, password } = req.body;
    let profile_image = null;

    try {
        // 1. Handle Photo Upload to Cloudinary if a file was sent
        if (req.file) {
            // Check if Cloudinary is configured
            if (!process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME === 'your_cloud_name') {
                logger.error('Cloudinary is not configured. Redirecting to error.');
                if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
                return res.status(400).json({ success: false, message: 'Cloudinary storage is not configured. Please contact admin.' });
            }

            try {
                const result = await cloudinary.uploader.upload(req.file.path, {
                    folder: 'smart_campus/profiles',
                    public_id: `user_${userId}`,
                    overwrite: true
                });
                profile_image = result.secure_url;
            } catch (cloudErr) {
                logger.error('Cloudinary upload failure:', cloudErr);
                if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
                return res.status(500).json({ success: false, message: 'Failed to upload profile photo to cloud storage.' });
            }
            
            // Clean up the local temp file
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        }

        // 2. Build the update query dynamically
        let query = 'UPDATE users SET ';
        const params = [];
        const updates = [];

        if (username) {
            params.push(username);
            updates.push(`username = $${params.length}`);
        }

        if (profile_image) {
            params.push(profile_image);
            updates.push(`profile_image = $${params.length}`);
        }

        if (password && password.length >= 8) {
            const hashedPassword = await bcrypt.hash(password, 10);
            params.push(hashedPassword);
            updates.push(`password_hash = $${params.length}`);
        }

        if (updates.length === 0 && !req.file) {
            return res.status(400).json({ success: false, message: 'No changes provided' });
        }

        params.push(userId);
        query += updates.join(', ') + ` WHERE id = $${params.length}`;

        await db.tenantExecute(req, query, params);

        // Fetch updated user data to return
        const [rows] = await db.tenantExecute(req, 'SELECT id, username, email, role, profile_image FROM users WHERE id = $1', [userId]);
        const updatedUser = rows[0];

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: updatedUser
        });

    } catch (error) {
        logger.error('Update profile error:', error);
        res.status(500).json({ success: false, message: 'Server error updating profile' });
    }
};

/**
 * Get current profile info
 */
exports.getProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const role = (req.user.role || '').toLowerCase().trim();
        
        // 1. Base query from users table
        let query = `
            SELECT u.id, u.username, u.full_name, u.email, u.role, u.profile_image, u.mobile_number, u.last_login_at
        `;
        
        // 2. Conditional joins based on role to get required IDs
        if (role === 'student') {
            query += `, s.id as student_id, s.roll_number, s.course, s.semester, s.section, s.admission_year, d.name as department_name, d.code as department_code
                      FROM users u 
                      LEFT JOIN students s ON u.id = s.user_id 
                      LEFT JOIN departments d ON s.department_id = d.id `;
        } else {
            query += `, st.id as staff_id, st.department_id, st.designation, st.subject_specialization, st.employment_type, d.name as department_name, d.code as department_code
                      FROM users u 
                      LEFT JOIN staff st ON u.id = st.user_id 
                      LEFT JOIN departments d ON st.department_id = d.id `;
        }
        
        query += ` WHERE u.id = $1 AND u.tenant_id = $2 `;
        
        const tenantId = db.getTenantId(req) || 1;
        const [rows] = await db.execute(query, [userId, tenantId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, user: rows[0] });
    } catch (error) {
        logger.error('Get profile error:', error);
        res.status(500).json({ success: false, message: 'Error fetching profile' });
    }
};

