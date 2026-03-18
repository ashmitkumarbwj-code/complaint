const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');

// @route   GET /api/stats/admin
// @desc    Get aggregate stats for admin dashboard
// @access  Private (Admin)
router.get('/admin', auth, checkRole(['Admin']), async (req, res) => {
    try {
        const [total] = await db.execute('SELECT COUNT(*) as count FROM complaints');
        const [pending] = await db.execute('SELECT COUNT(*) as count FROM complaints WHERE status = "Pending"');
        const [resolved] = await db.execute('SELECT COUNT(*) as count FROM complaints WHERE status = "Resolved"');
        const [users] = await db.execute('SELECT COUNT(*) as count FROM users');

        res.json({
            success: true,
            stats: {
                total: total[0].count,
                pending: pending[0].count,
                resolved: resolved[0].count,
                users: users[0].count
            }
        });
    } catch (error) {
        console.error('Stats API error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching stats' });
    }
});

module.exports = router;
