const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const galleryController = require('../controllers/galleryController');
const auth = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');

// Configure Multer for disk storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../public/images/gallery'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|jfif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Only images are allowed (jpg, jpeg, png, gif, jfif, webp)'));
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// @route   GET /api/gallery
// Restrict the full image list (with metadata) to Admins and Principals
router.get('/', auth, checkRole(['Admin', 'Principal']), galleryController.getGallery);

// @route   GET /api/gallery/public
// Explicit public route
router.get('/public', galleryController.getPublicGallery);

// @route   POST /api/gallery/upload
router.post('/upload', auth, checkRole(['Admin', 'Principal']), upload.single('file'), galleryController.uploadImage);

// @route   PATCH /api/gallery/:id/featured
router.patch('/:id/featured', auth, checkRole(['Admin', 'Principal']), galleryController.toggleFeatured);

// @route   PATCH /api/gallery/:id/display-order
router.patch('/:id/display-order', auth, checkRole(['Admin', 'Principal']), galleryController.updateDisplayOrder);

// @route   POST /api/gallery/reorder
router.post('/reorder', auth, checkRole(['Admin', 'Principal']), galleryController.reorderImages);

// @route   DELETE /api/gallery/:id
router.delete('/:id', auth, checkRole(['Admin', 'Principal']), galleryController.deleteImage);

// @route   PATCH /api/gallery/:id/title  ← was missing, caused title updates to 404
router.patch('/:id/title', auth, checkRole(['Admin', 'Principal']), galleryController.updateTitle);

module.exports = router;
