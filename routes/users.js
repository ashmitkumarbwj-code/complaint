const express = require('express');
const router = express.Router();
const db = require('../config/db');
const userController = require('../controllers/userController');
const auth = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// @route   GET /api/users
// @desc    Get all users (for admin)
// @access  Private (Admin)
router.get('/', auth, checkRole(['admin']), async (req, res) => {
    try {
        const [rows] = await db.tenantExecute(req, `
            SELECT u.id, u.username, u.email, u.mobile_number, u.role, u.is_verified, 
                   u.created_at,
                   (CASE WHEN u.role = 'Student' THEN s.roll_number ELSE NULL END) as roll_number
            FROM users u
            LEFT JOIN students s ON u.id = s.user_id
            ORDER BY u.created_at DESC
        `);
        res.json({ success: true, users: rows });
    } catch (error) {
        console.error('Users API error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching users' });
    }
});

// @route   GET /api/users/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', auth, userController.getProfile);

// @route   PUT /api/users/profile
// @desc    Update current user profile
// @access  Private
router.put('/profile', auth, upload.single('profile_image'), userController.updateProfile);

module.exports = router;
