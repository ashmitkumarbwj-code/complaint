const express = require('express');
const router = express.Router();
const dynamicSlidesController = require('../controllers/dynamicSlidesController');

/**
 * PUBLIC ROUTES
 * GET /api/dynamic-slides
 */
router.get('/', dynamicSlidesController.getPublicSlides);

module.exports = router;
