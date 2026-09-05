// routes/students.js
const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const auth = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');
const multer = require('multer');

// In‑memory CSV upload middleware (reuse settings similar to admin routes)
const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
    fileFilter: (req, file, cb) => {
        const isCsv = file.originalname.toLowerCase().endsWith('.csv') ||
            file.mimetype.includes('csv') || file.mimetype === 'text/plain';
        cb(null, isCsv);
    }
});

// ------------------------------------------------------------------
// @route   POST /api/students/bulk-import
// @desc    Bulk import students (CSV or JSON payload)
// @access  Admin only
router.post(
    '/bulk-import',
    auth,
    checkRole(['Admin']),
    csvUpload.single('csv'),
    studentController.bulkImport
);

// ------------------------------------------------------------------
// @route   DELETE /api/students/bulk-deactivate
// @desc    Deactivate (soft‑delete) multiple students by IDs
// @access  Admin only
router.delete(
    '/bulk-deactivate',
    auth,
    checkRole(['Admin']),
    studentController.bulkDeactivate
);

// ------------------------------------------------------------------
// @route   GET /api/students/left
// @desc    List students who have left (is_active = FALSE)
// @access  Admin, Principal, HOD
router.get(
    '/left',
    auth,
    checkRole(['Admin', 'Principal', 'HOD']),
    studentController.listLeftStudents
);

module.exports = router;
