const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const auth = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');

// @route   POST /api/admin/add-staff
// @desc    Add a new staff member to master verification table
// @access  Private (Admin only)
router.post('/add-staff', auth, checkRole(['Admin']), adminController.addStaff);

// @route   POST /api/admin/add-student
// @desc    Add a student to verified_students registry (can then activate via activate.html)
// @access  Private (Admin only)
router.post('/add-student', auth, checkRole(['Admin']), adminController.addStudent);

// @route   GET /api/admin/staff
// @desc    Get all staff members from master table
// @access  Private (Admin only)
router.get('/staff', auth, checkRole(['Admin']), adminController.getAllStaff);
router.get('/students', auth, checkRole(['Admin']), adminController.getAllStudents);
// @route   GET /api/admin/departments
// @desc    Get all departments (used in complaint routing and staff management dropdowns)
// @access  Private (Admin, Principal, or HOD can view department lists)
router.get('/departments', auth, checkRole(['Admin', 'Principal', 'HOD']), adminController.getDepartments);

// @route   PUT /api/admin/complaints/:id/status
// @desc    Update complaint status (Resolve/Reject)
// @access  Private (Admin only)
router.put('/complaints/:id/status', auth, checkRole(['Admin']), adminController.updateComplaintStatus);

// @route   PATCH /api/admin/complaints/:id/forward
// @desc    Manually forward (reassign) a complaint to a different department
// @access  Private (Admin only)
router.patch('/complaints/:id/forward', auth, checkRole(['Admin']), adminController.forwardComplaint);

module.exports = router;
