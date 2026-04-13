const fs = require('fs');
const path = require('path');

const galleryDir = path.join(__dirname, '../public/images/gallery');

// Ensure gallery directory exists
if (!fs.existsSync(galleryDir)) {
    fs.mkdirSync(galleryDir, { recursive: true });
}

const db = require('../config/db');
const logger = require('../utils/logger');

/**
 * @route   GET /api/gallery
 * @desc    Get all gallery images from DB (Authenticated)
 */
exports.getGallery = async (req, res) => {
    try {
        // Fetch all, ordered by display_order then date
        const [images] = await db.execute('SELECT * FROM gallery_images ORDER BY display_order ASC, created_at DESC');
        res.json({ success: true, images });
    } catch (error) {
        logger.error('Get gallery error:', error);
        res.status(500).json({ success: false, message: 'Error fetching gallery images' });
    }
};

/**
 * @route   GET /api/dashboards/public/gallery
 * @desc    Get public gallery images with fallback logic
 */
exports.getPublicGallery = async (req, res) => {
    try {
        // 1. Primary: Return featured images (limit to max 5 if frontend doesn't)
        let [images] = await db.execute(
            'SELECT * FROM gallery_images WHERE is_featured = 1 ORDER BY display_order ASC, created_at DESC LIMIT 5'
        );

        // 2. Fallback: If no featured images exist, return the latest 4 to prevent broken UI
        if (images.length === 0) {
            [images] = await db.execute(
                'SELECT * FROM gallery_images ORDER BY created_at DESC LIMIT 4'
            );
        }

        res.json({ success: true, images });
    } catch (error) {
        logger.error('Get public gallery error:', error);
        res.status(500).json({ success: false, message: 'Error fetching images' });
    }
};

/**
 * @route   POST /api/gallery/upload
 * @desc    Upload image to gallery and save to DB
 */
exports.uploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No image uploaded' });
        }

        const { title } = req.body;
        const filename = req.file.filename;
        const url = 'images/gallery/' + filename;

        const [result] = await db.tenantExecute(req,
            'INSERT INTO gallery_images (tenant_id, filename, url, title) VALUES ($1, $2, $3, $4) RETURNING id',
            [req.user.tenant_id, filename, url, title || '']
        );

        res.json({ 
            success: true, 
            message: 'Image uploaded successfully',
            image: {
                id: result.rows[0].id,
                name: filename,
                url: url,
                title: title || ''
            }
        });
    } catch (error) {
        logger.error('Upload gallery error:', error);
        res.status(500).json({ success: false, error: 'Error uploading image' });
    }
};

/**
 * @route   DELETE /api/gallery/:id
 * @desc    Delete image from gallery and DB (Principal Only)
 */
exports.deleteImage = async (req, res) => {
    try {
        const { id } = req.params;
        const tenant_id = req.user.tenant_id;

        // 🛑 Backend Guard: Principal Only
        if (req.user.role !== 'Principal') {
            return res.status(403).json({ success: false, message: 'Access denied: Only Principal can delete images' });
        }

        // Find image first to get filename
        const [rows] = await db.execute(
            'SELECT filename FROM gallery_images WHERE id = $1 AND tenant_id = $2',
            [id, tenant_id]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Image not found' });
        }

        const filename = rows[0].filename;
        const filePath = path.join(galleryDir, filename);

        // 🛡️ SAFE DELETE: Prevents server crash if file is missing
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            } else {
                console.warn('[Gallery] File already missing on disk:', filePath);
            }
        } catch (fsErr) {
            console.error('[Gallery] File deletion error:', fsErr);
        }

        // Delete from DB
        await db.execute('DELETE FROM gallery_images WHERE id = $1 AND tenant_id = $2', [id, tenant_id]);

        res.json({ success: true, message: 'Image deleted successfully' });
    } catch (error) {
        logger.error('Delete gallery error:', error);
        res.status(500).json({ success: false, message: 'Delete failed' });
    }
};

/**
 * @route   PATCH /api/gallery/:id/featured
 * @desc    Toggle image visibility on homepage slider (Principal Only)
 */
exports.toggleFeatured = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_featured } = req.body;
        const tenant_id = req.user.tenant_id;

        // 🛑 Backend Guard: Principal Only
        if (req.user.role !== 'Principal') {
            return res.status(403).json({ success: false, message: 'Access denied: Only Principal can control visibility' });
        }

        // 🚀 Enforce Featured Limit: MAX 5
        if (is_featured) {
            const [countRows] = await db.execute(
                'SELECT COUNT(*) as total FROM gallery_images WHERE is_featured = 1 AND tenant_id = $1',
                [tenant_id]
            );
            if (countRows[0].total >= 5) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Maximum 5 featured images allowed. Unfeature another image first.' 
                });
            }
        }

        await db.execute(
            'UPDATE gallery_images SET is_featured = $1 WHERE id = $2 AND tenant_id = $3',
            [is_featured ? 1 : 0, id, tenant_id]
        );

        res.json({ success: true, message: is_featured ? 'Image featured!' : 'Image hidden' });
    } catch (error) {
        logger.error('Toggle featured error:', error);
        res.status(500).json({ success: false, message: 'Failed to update visibility' });
    }
};

/**
 * @route   PATCH /api/gallery/:id/display-order
 * @desc    Update image display sequence (Principal Only)
 */
exports.updateDisplayOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { display_order } = req.body;
        const tenant_id = req.user.tenant_id;

        // 🛑 Backend Guard: Principal Only
        if (req.user.role !== 'Principal') {
            return res.status(403).json({ success: false, message: 'Access denied: Only Principal can change order' });
        }

        await db.execute(
            'UPDATE gallery_images SET display_order = $1 WHERE id = $2 AND tenant_id = $3',
            [parseInt(display_order) || 0, id, tenant_id]
        );

        res.json({ success: true, message: 'Order updated' });
    } catch (error) {
        logger.error('Update order error:', error);
        res.status(500).json({ success: false, message: 'Failed to update display order' });
    }
};

/**
 * @route   POST /api/gallery/reorder
 * @desc    Bulk update image display order (Principal Only)
 */
exports.reorderImages = async (req, res) => {
    try {
        const { order } = req.body;
        const tenant_id = req.user.tenant_id;

        // 🛑 Backend Guard: Principal Only
        if (req.user.role !== 'Principal') {
            return res.status(403).json({ success: false, message: 'Access denied: Only Principal can reorder gallery' });
        }

        if (!Array.isArray(order)) {
            return res.status(400).json({ success: false, message: 'Invalid order data' });
        }

        // Use a simple loop for updates; for very large sets, a transaction or batch update would be better.
        for (const item of order) {
            await db.execute(
                'UPDATE gallery_images SET display_order = $1 WHERE id = $2 AND tenant_id = $3',
                [item.display_order, item.id, tenant_id]
            );
        }

        res.json({ success: true, message: 'Gallery order synchronized' });
    } catch (error) {
        logger.error('Reorder gallery error:', error);
        res.status(500).json({ success: false, message: 'Failed to save new order' });
    }
};

/**
 * @route   PATCH /api/gallery/:id/title
 * @desc    Update image title
 */
exports.updateTitle = async (req, res) => {
    const { id } = req.params;
    const { title } = req.body;
    const tenant_id = req.user.tenant_id;

    try {
        await db.execute('UPDATE gallery_images SET title = $1 WHERE id = $2 AND tenant_id = $3', [title, id, tenant_id]);
        res.json({ success: true, message: 'Title updated successfully' });
    } catch (error) {
        logger.error('Update title error:', error);
        res.status(500).json({ success: false, message: 'Error updating title' });
    }
};
