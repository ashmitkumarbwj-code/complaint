const express = require('express');
const router = express.Router();
const multer = require('multer');
const adminController = require('../controllers/adminController');
const slidesController = require('../controllers/slidesController');
const auth = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');

// Multer memory storage setup for slides
const slideUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
        }
    }
});

// Multer: in-memory storage for CSV (no disk writes)
const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
    fileFilter: (req, file, cb) => {
        if (file.originalname.toLowerCase().endsWith('.csv') || file.mimetype.includes('csv') || file.mimetype === 'text/plain') {
            cb(null, true);
        } else {
            cb(new Error('Only .csv files are allowed'));
        }
    }
});

// @route   POST /api/admin/add-staff
// @desc    Add a new staff member to master verification table
// @access  Private (Admin only)
router.post('/add-staff', auth, checkRole(['Admin']), adminController.addStaff);

// @route   POST /api/admin/add-student
// @desc    Add a student to verified_students registry (can then activate via activate.html)
// @access  Private (Admin only)
router.post('/add-student', auth, checkRole(['Admin']), adminController.addStudent);

// @route   POST /api/admin/bulk-import-students
// @desc    Bulk-import students into verified_students registry (supports JSON or CSV)
// @access  Private (Admin only)
router.post('/bulk-import-students',
    auth,
    checkRole(['Admin']),
    csvUpload.single('csv'),
    adminController.bulkImportStudents
);

// @route   POST /api/admin/bulk-import-staff
// @desc    Bulk-import staff member into verified_staff table (JSON array)
// @access  Private (Admin only)
router.post('/bulk-import-staff',
    auth,
    checkRole(['Admin']),
    adminController.bulkImportStaff
);

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
// @access  Private (Admin, Principal)
router.put('/complaints/:id/status', auth, checkRole(['Admin', 'Principal']), adminController.updateComplaintStatus);

// @route   PATCH /api/admin/complaints/:id/forward
// @desc    Manually forward (reassign) a complaint to a different department
// @access  Private (Admin, Principal)
router.patch('/complaints/:id/forward', auth, checkRole(['Admin', 'Principal']), adminController.forwardComplaint);


// ==========================================
// ADMIN SLIDES MANAGEMENT
// ==========================================
router.get('/slides', auth, checkRole(['Admin']), slidesController.getAllSlides);
router.post('/slides', auth, checkRole(['Admin']), slideUpload.single('image'), slidesController.createSlide);
router.put('/slides/:id', auth, checkRole(['Admin']), slideUpload.single('image'), slidesController.updateSlide);
router.delete('/slides/:id', auth, checkRole(['Admin']), slidesController.deleteSlide);
router.patch('/slides/:id/toggle', auth, checkRole(['Admin']), slidesController.toggleSlide);

const dynamicSlidesController = require('../controllers/dynamicSlidesController');

// Multer memory storage setup for dynamic slides (images + videos)
const dynamicSlideUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max for videos
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/ogg'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, PNG, WebP images and MP4, WebM, OGG videos are allowed'));
        }
    }
});

// ==========================================
// ADMIN DYNAMIC SLIDES MANAGEMENT
// ==========================================
router.get('/dynamic-slides', auth, checkRole(['Admin']), dynamicSlidesController.getAllSlides);
router.post('/dynamic-slides', auth, checkRole(['Admin']), dynamicSlideUpload.single('media'), dynamicSlidesController.createSlide);
router.put('/dynamic-slides/:id', auth, checkRole(['Admin']), dynamicSlideUpload.single('media'), dynamicSlidesController.updateSlide);
router.delete('/dynamic-slides/:id', auth, checkRole(['Admin']), dynamicSlidesController.deleteSlide);

module.exports = router;
