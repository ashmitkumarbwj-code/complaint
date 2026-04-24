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

module.exports = router;
