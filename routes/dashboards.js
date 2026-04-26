const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const auth = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');

router.get('/authority/stats/:department_id', auth, checkRole(['Staff', 'HOD', 'Principal', 'Admin']), dashboardController.getAuthorityStats);
router.get('/authority/complaints/:department_id', auth, checkRole(['Staff', 'HOD', 'Principal', 'Admin']), dashboardController.getAuthorityComplaints);
router.get('/authority/staff-members/:department_id', auth, checkRole(['Staff', 'HOD', 'Principal', 'Admin']), dashboardController.getDepartmentStaff);

// Admin stats are also visible to Principal for oversight
router.get('/admin/stats', auth, checkRole(['Admin', 'Principal']), dashboardController.getAdminStats);
router.get('/principal/stats', auth, checkRole(['Principal', 'Admin']), dashboardController.getPrincipalDashboardStats);
router.get('/principal/critical', auth, checkRole(['Principal', 'Admin']), dashboardController.getPrincipalCriticalComplaints);
router.get('/weekly-stats', auth, dashboardController.getWeeklyStats);
// [DEPRECATED] Use /api/public/weekly-stats instead
router.get('/public/weekly-stats', dashboardController.getPublicWeeklyStats);
router.get('/gallery', dashboardController.getGallery);
// [DEPRECATED] Use /api/public/stats instead
router.get('/public/stats', dashboardController.getPublicStats);

// ─── NEW PREMIUM ANALYTICS ──────────────────────────────────────────────
router.get('/stats', auth, checkRole(['Admin', 'Principal']), dashboardController.getDashboardStats);

module.exports = router;
