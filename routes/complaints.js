const express = require('express');
const router = express.Router();
const multer = require('multer');
const complaintController = require('../controllers/complaintController');
const auth = require('../middleware/authMiddleware');
const v = require('../middleware/validators');
const checkRole = require('../middleware/roleMiddleware');

const { complaintLimiter, statusUpdateLimiter } = require('../middleware/rateLimiter');

// Multer setup (using disk storage so background workers can process files)
// Limits: 10 MB max, JPEG/PNG/MP4/MOV only
const ALLOWED_EXT  = /\.(jpg|jpeg|png|mp4|mov|avi)$/i;
const ALLOWED_MIME = /^(image\/(jpeg|png)|video\/(mp4|quicktime|x-msvideo))$/;

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        // give it a unique name
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = file.originalname.split('.').pop();
        cb(null, file.fieldname + '-' + uniqueSuffix + '.' + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB cap (SaaS safe)
    fileFilter: (req, file, cb) => {
        const validExt  = ALLOWED_EXT.test(file.originalname);
        const validMime = ALLOWED_MIME.test(file.mimetype);
        if (validExt && validMime) {
            return cb(null, true);
        }
        cb(new Error('Only Images (JPG/PNG) and Videos (MP4/MOV) are allowed (max 10 MB).'));
    }
});

// Submit: auth → rateLimit → multer (parse file) → file validation → body validation → controller
router.post('/',
    auth,
    complaintLimiter,
    (req, res, next) => {
        upload.single('image')(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                // A Multer error occurred when uploading.
                return res.status(422).json({ success: false, message: `Upload error: ${err.message}` });
            } else if (err) {
                // An unknown error occurred when uploading (like our fileFilter error).
                return res.status(422).json({ success: false, message: err.message });
            }
            // Everything went fine.
            next();
        });
    },
    v.validateFileUpload,
    v.validateSubmitComplaint,
    complaintController.submitComplaint
);

// Get complaints for a specific student
router.get('/student/:student_id',
    auth,
    v.validateStudentId,
    complaintController.getStudentComplaints
);

// Get all complaints (admin/HOD/principal)
router.get('/all', auth, checkRole(['Admin', 'Principal']), complaintController.getAllComplaints);

// Update complaint status (Hardened with statusUpdateLimiter)
router.patch('/status/:complaint_id',
    auth,
    statusUpdateLimiter,
    v.validateUpdateStatus,
    complaintController.updateStatus
);

// [BACKWARD COMPATIBILITY ALIAS] Supports frontend calls to /api/complaints/:id/status
router.patch('/:complaint_id/status',
    auth,
    statusUpdateLimiter,
    v.validateUpdateStatus,
    complaintController.updateStatus
);

// Get complaint history (Audit Trail)
router.get('/:id/history', 
    auth, 
    complaintController.getComplaintHistory
);

// 🚨 Phase 2: Apply AI Suggestion (Human-in-the-Loop)
// Restricted to Admin/HOD only as per Phase 2 requirements.
router.post('/:id/apply-ai',
    auth,
    checkRole(['admin', 'hod']),
    v.validateApplyAi,
    complaintController.applyAiSuggestion
);

module.exports = router;
