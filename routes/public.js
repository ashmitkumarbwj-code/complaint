const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

/**
 * @route   GET /api/public/stats
 * @desc    Get anonymous aggregated institutional statistics
 * @access  Public
 */
router.get('/stats', dashboardController.getPublicStats);

/**
 * @route   GET /api/public/weekly-stats
 * @desc    Get historical weekly complaint trends (anonymous)
 * @access  Public
 */
router.get('/weekly-stats', dashboardController.getPublicWeeklyStats);

// Public system configuration
router.get('/config', (req, res) => {
    const { FEATURES } = require('../utils/constants');
    res.json({
        success: true,
        features: {
            ai_ui_enabled: FEATURES.AI_UI_ENABLED,
            ai_apply_enabled: FEATURES.AI_APPLY_ENABLED
        }
    });
});

module.exports = router;
