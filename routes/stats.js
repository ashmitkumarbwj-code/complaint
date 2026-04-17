const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');

// @route   GET /api/stats/admin
// @desc    Get aggregate stats for admin dashboard
// @access  Private (Admin)
router.get('/admin', auth, checkRole(['admin']), async (req, res) => {
    try {
        const [total] = await db.tenantExecute(req, 'SELECT COUNT(*) as count FROM complaints');
        const [pending] = await db.tenantExecute(req, 'SELECT COUNT(*) as count FROM complaints WHERE status = $1', ['Pending']);
        const [resolved] = await db.tenantExecute(req, 'SELECT COUNT(*) as count FROM complaints WHERE status = $1', ['Resolved']);
        const [users] = await db.tenantExecute(req, 'SELECT COUNT(*) as count FROM users');

        res.json({
            success: true,
            stats: {
                total: parseInt(total[0].count),
                pending: parseInt(pending[0].count),
                resolved: parseInt(resolved[0].count),
                users: parseInt(users[0].count)
            }
        });
    } catch (error) {
        console.error('Stats API error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching stats' });
    }
});

module.exports = router;
