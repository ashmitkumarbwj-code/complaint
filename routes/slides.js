const express = require('express');
const router = express.Router();
const slidesController = require('../controllers/slidesController');

/**
 * PUBLIC ROUTES
 * GET /api/slides
 */
router.get('/', slidesController.getPublicSlides);

module.exports = router;
