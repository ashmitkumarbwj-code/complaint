const db = require('../config/db');
const cloudinary = require('../config/cloudinary');
const logger = require('../utils/logger');

// Upload a media file to Cloudinary
const uploadToCloudinary = (fileBuffer, resourceType = 'auto') => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { 
                folder: 'smart_campus/dynamic_slides',
                resource_type: resourceType
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
 * @route   POST /api/admin/dynamic-slides
 * @desc    Upload a new dynamic slide
 * @access  Private (Admin)
 */
exports.createSlide = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Media file is required' });
        }
        
        const { title, description, display_order, is_active } = req.body;
        if (!title) {
            return res.status(400).json({ success: false, message: 'Title is required' });
        }

        const mimeType = req.file.mimetype;
        const mediaType = mimeType.startsWith('video/') ? 'video' : 'image';

        const uploadResult = await uploadToCloudinary(req.file.buffer, 'auto');
        
        const [result] = await db.execute(
            `INSERT INTO dynamic_homepage_slides 
            (title, description, media_url, media_type, public_id, display_order, is_active, created_by) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [
                title, 
                description || null, 
                uploadResult.secure_url, 
                mediaType,
                uploadResult.public_id, 
                parseInt(display_order) || 0,
                is_active === 'true' || is_active === true,
                req.user.id
            ]
        );

        logger.info(`[DynamicSlides Controller] Slide created: ID ${result[0].id} by Admin ${req.user.id}`);
        res.status(201).json({ success: true, slide: result[0], message: 'Slide created successfully' });
    } catch (error) {
        logger.error('[DynamicSlides Controller] Create error:', error);
        res.status(500).json({ success: false, message: 'Failed to create slide' });
    }
};

/**
 * @route   GET /api/admin/dynamic-slides
 * @desc    Get all dynamic slides for admin
 * @access  Private (Admin)
 */
exports.getAllSlides = async (req, res) => {
    try {
        const [slides] = await db.execute('SELECT * FROM dynamic_homepage_slides ORDER BY display_order ASC, created_at DESC');
        res.json({ success: true, slides });
    } catch (error) {
        logger.error('[DynamicSlides Controller] Get all error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch slides' });
    }
};

/**
 * @route   PUT /api/admin/dynamic-slides/:id
 * @desc    Update a dynamic slide
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
        const [existingRows] = await db.execute('SELECT * FROM dynamic_homepage_slides WHERE id = $1', [id]);
        if (existingRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Slide not found' });
        }
        const currentSlide = existingRows[0];

        let final_media_url = currentSlide.media_url;
        let final_public_id = currentSlide.public_id;
        let final_media_type = currentSlide.media_type;

        // If replacing media
        let uploadResult = null;
        if (req.file) {
            const mimeType = req.file.mimetype;
            final_media_type = mimeType.startsWith('video/') ? 'video' : 'image';
            
            uploadResult = await uploadToCloudinary(req.file.buffer, 'auto');
            final_media_url = uploadResult.secure_url;
            final_public_id = uploadResult.public_id;
        }

        const [updated] = await db.execute(
            `UPDATE dynamic_homepage_slides 
             SET title = $1, description = $2, media_url = $3, media_type = $4, public_id = $5, display_order = $6, is_active = $7
             WHERE id = $8 RETURNING *`,
            [
                title, 
                description || null, 
                final_media_url, 
                final_media_type,
                final_public_id,
                parseInt(display_order) || 0,
                is_active === 'true' || is_active === true,
                id
            ]
        );

        // Delete old media ONLY if upload and DB update succeeded
        if (req.file && currentSlide.public_id) {
            try {
                const resourceType = currentSlide.media_type === 'video' ? 'video' : 'image';
                await cloudinary.uploader.destroy(currentSlide.public_id, { resource_type: resourceType });
                logger.info(`[DynamicSlides Controller] Replaced and destroyed old media ${currentSlide.public_id}`);
            } catch (e) {
                logger.warn(`[DynamicSlides Controller] Failed to destroy old media ${currentSlide.public_id}:`, e);
            }
        }

        logger.info(`[DynamicSlides Controller] Slide updated: ID ${updated[0].id} by Admin ${req.user.id}`);
        res.json({ success: true, slide: updated[0], message: 'Slide updated successfully' });
    } catch (error) {
        logger.error('[DynamicSlides Controller] Update error:', error);
        res.status(500).json({ success: false, message: 'Failed to update slide' });
    }
};

/**
 * @route   DELETE /api/admin/dynamic-slides/:id
 * @desc    Delete a dynamic slide
 * @access  Private (Admin)
 */
exports.deleteSlide = async (req, res) => {
    try {
        const { id } = req.params;

        const [existingRows] = await db.execute('SELECT * FROM dynamic_homepage_slides WHERE id = $1', [id]);
        if (existingRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Slide not found' });
        }
        const currentSlide = existingRows[0];

        // Delete from DB first for safety
        await db.execute('DELETE FROM dynamic_homepage_slides WHERE id = $1', [id]);
        
        // Delete from Cloudinary
        if (currentSlide.public_id) {
            try {
                const resourceType = currentSlide.media_type === 'video' ? 'video' : 'image';
                await cloudinary.uploader.destroy(currentSlide.public_id, { resource_type: resourceType });
                logger.info(`[DynamicSlides Controller] Destroyed media ${currentSlide.public_id} after DB delete`);
            } catch (e) {
                logger.warn(`[DynamicSlides Controller] Failed to destroy media ${currentSlide.public_id}:`, e);
            }
        }

        logger.info(`[DynamicSlides Controller] Slide deleted: ID ${id} by Admin ${req.user.id}`);
        res.json({ success: true, message: 'Slide deleted successfully' });
    } catch (error) {
        logger.error('[DynamicSlides Controller] Delete error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete slide' });
    }
};

/**
 * @route   GET /api/dynamic-slides
 * @desc    Get active dynamic slides for homepage
 * @access  Public
 */
exports.getPublicSlides = async (req, res) => {
    try {
        const [slides] = await db.execute(`
            SELECT * FROM dynamic_homepage_slides 
            WHERE is_active = true 
            ORDER BY display_order ASC, created_at DESC
        `);
        logger.info(`[DynamicSlides Controller] Public GET: Returned ${slides.length} active dynamic slides.`);
        res.json({ success: true, slides });
    } catch (error) {
        logger.error('[DynamicSlides Controller] Public get error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch dynamic slides' });
    }
};
