const db = require('../config/db');
const cloudinary = require('../config/cloudinary');
const logger = require('../utils/logger');

// Upload a single slide image to Cloudinary using upload_stream
const uploadToCloudinary = (fileBuffer) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { 
                folder: 'smart_campus/homepage_slides',
                format: 'webp',
                quality: 'auto'
            }, 
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );
        stream.end(fileBuffer);
    });
};

/**
 * @route   POST /api/admin/slides
 * @desc    Upload a new slide
 * @access  Private (Admin)
 */
exports.createSlide = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Image is required' });
        }
        
        const { title, description, display_order, is_active } = req.body;
        if (!title) {
            return res.status(400).json({ success: false, message: 'Title is required' });
        }

        const uploadResult = await uploadToCloudinary(req.file.buffer);
        
        const [result] = await db.execute(
            `INSERT INTO homepage_slides 
            (title, description, image_url, public_id, display_order, is_active, created_by) 
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [
                title, 
                description || null, 
                uploadResult.secure_url, 
                uploadResult.public_id, 
                parseInt(display_order) || 0,
                is_active === 'true' || is_active === true,
                req.user.id
            ]
        );

        logger.info(`[Slides Controller] Slide created: ID ${result.rows[0].id} by Admin ${req.user.id}`);
        res.status(201).json({ success: true, slide: result.rows[0], message: 'Slide created successfully' });
    } catch (error) {
        logger.error('[Slides Controller] Create error:', error);
        res.status(500).json({ success: false, message: 'Failed to create slide' });
    }
};

/**
 * @route   GET /api/admin/slides
 * @desc    Get all slides for admin
 * @access  Private (Admin)
 */
exports.getAllSlides = async (req, res) => {
    try {
        const [slides] = await db.execute('SELECT * FROM homepage_slides ORDER BY display_order ASC, created_at DESC');
        res.json({ success: true, slides });
    } catch (error) {
        logger.error('[Slides Controller] Get all error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch slides' });
    }
};

/**
 * @route   PUT /api/admin/slides/:id
 * @desc    Update a slide
 * @access  Private (Admin)
 */
exports.updateSlide = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, display_order, is_active } = req.body;

        if (!title) {
            return res.status(400).json({ success: false, message: 'Title is required' });
        }

        // Check if slide exists
        const [existingRows] = await db.execute('SELECT * FROM homepage_slides WHERE id = $1', [id]);
        if (existingRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Slide not found' });
        }
        const currentSlide = existingRows[0];

        let final_image_url = currentSlide.image_url;
        let final_public_id = currentSlide.public_id;

        // If replacing image
        let uploadResult = null;
        if (req.file) {
            uploadResult = await uploadToCloudinary(req.file.buffer);
            final_image_url = uploadResult.secure_url;
            final_public_id = uploadResult.public_id;
        }

        const [updated] = await db.execute(
            `UPDATE homepage_slides 
             SET title = $1, description = $2, image_url = $3, public_id = $4, display_order = $5, is_active = $6
             WHERE id = $7 RETURNING *`,
            [
                title, 
                description || null, 
                final_image_url, 
                final_public_id,
                parseInt(display_order) || 0,
                is_active === 'true' || is_active === true,
                id
            ]
        );

        // Delete old image ONLY if upload and DB update succeeded
        if (req.file && currentSlide.public_id) {
            try {
                await cloudinary.uploader.destroy(currentSlide.public_id);
                logger.info(`[Slides Controller] Replaced and destroyed old image ${currentSlide.public_id}`);
            } catch (e) {
                logger.warn(`[Slides Controller] Failed to destroy old image ${currentSlide.public_id}:`, e);
            }
        }

        logger.info(`[Slides Controller] Slide updated: ID ${updated.rows[0].id} by Admin ${req.user.id}`);
        res.json({ success: true, slide: updated.rows[0], message: 'Slide updated successfully' });
    } catch (error) {
        logger.error('[Slides Controller] Update error:', error);
        res.status(500).json({ success: false, message: 'Failed to update slide' });
    }
};

/**
 * @route   DELETE /api/admin/slides/:id
 * @desc    Delete a slide
 * @access  Private (Admin)
 */
exports.deleteSlide = async (req, res) => {
    try {
        const { id } = req.params;

        const [existingRows] = await db.execute('SELECT * FROM homepage_slides WHERE id = $1', [id]);
        if (existingRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Slide not found' });
        }
        const currentSlide = existingRows[0];

        // Delete from DB first for safety
        await db.execute('DELETE FROM homepage_slides WHERE id = $1', [id]);
        
        // Delete from Cloudinary
        if (currentSlide.public_id) {
            try {
                await cloudinary.uploader.destroy(currentSlide.public_id);
                logger.info(`[Slides Controller] Destroyed image ${currentSlide.public_id} after DB delete`);
            } catch (e) {
                logger.warn(`[Slides Controller] Failed to destroy image ${currentSlide.public_id}:`, e);
            }
        }

        logger.info(`[Slides Controller] Slide deleted: ID ${id} by Admin ${req.user.id}`);
        res.json({ success: true, message: 'Slide deleted successfully' });
    } catch (error) {
        logger.error('[Slides Controller] Delete error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete slide' });
    }
};

/**
 * @route   PATCH /api/admin/slides/:id/toggle
 * @desc    Toggle active state
 * @access  Private (Admin)
 */
exports.toggleSlide = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;
        
        await db.execute('UPDATE homepage_slides SET is_active = $1 WHERE id = $2', [is_active, id]);
        res.json({ success: true, message: 'Slide status toggled' });
    } catch (error) {
        logger.error('[Slides Controller] Toggle error:', error);
        res.status(500).json({ success: false, message: 'Failed to toggle slide' });
    }
};

/**
 * @route   GET /api/slides
 * @desc    Get active slides for homepage
 * @access  Public
 */
exports.getPublicSlides = async (req, res) => {
    try {
        const [slides] = await db.execute(`
            SELECT * FROM homepage_slides 
            WHERE is_active = true 
              AND (start_date IS NULL OR start_date <= NOW()) 
              AND (end_date IS NULL OR end_date >= NOW()) 
            ORDER BY display_order ASC, created_at DESC
        `);
        logger.info(`[Slides Controller] Public GET: Returned ${slides.length} active slides.`);
        res.json({ success: true, slides });
    } catch (error) {
        logger.error('[Slides Controller] Public get error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch slides' });
    }
};
