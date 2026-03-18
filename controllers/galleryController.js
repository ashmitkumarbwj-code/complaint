const fs = require('fs');
const path = require('path');

const galleryDir = path.join(__dirname, '../public/images/gallery');

// Ensure gallery directory exists
if (!fs.existsSync(galleryDir)) {
    fs.mkdirSync(galleryDir, { recursive: true });
}

const db = require('../config/db');

/**
 * @route   GET /api/gallery
 * @desc    Get all gallery images from DB
 */
exports.getGallery = async (req, res) => {
    try {
        const [images] = await db.execute('SELECT * FROM gallery_images ORDER BY created_at DESC');
        res.json({ success: true, images });
    } catch (error) {
        console.error('Get gallery error:', error);
        res.status(500).json({ success: false, message: 'Error fetching gallery images' });
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

        const [result] = await db.execute(
            'INSERT INTO gallery_images (filename, url, title) VALUES (?, ?, ?)',
            [filename, url, title || '']
        );

        res.json({ 
            success: true, 
            message: 'Image uploaded successfully',
            image: {
                id: result.insertId,
                name: filename,
                url: url,
                title: title || ''
            }
        });
    } catch (error) {
        console.error('Upload gallery error:', error);
        res.status(500).json({ success: false, error: 'Error uploading image' });
    }
};

/**
 * @route   DELETE /api/gallery/:id
 * @desc    Delete image from gallery and DB
 */
exports.deleteImage = async (req, res) => {
    const { id } = req.params;

    try {
        // Find image first to get filename
        const [images] = await db.execute('SELECT filename FROM gallery_images WHERE id = ?', [id]);
        if (images.length === 0) {
            return res.status(404).json({ success: false, error: 'Image not found' });
        }

        const filename = images[0].filename;
        const filePath = path.join(galleryDir, filename);

        // Delete from DB
        await db.execute('DELETE FROM gallery_images WHERE id = ?', [id]);

        // Delete from filesystem
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.json({ success: true, message: 'Image deleted successfully' });
    } catch (error) {
        console.error('Delete gallery error:', error);
        res.status(500).json({ success: false, error: 'Error deleting image' });
    }
};

/**
 * @route   PATCH /api/gallery/:id/title
 * @desc    Update image title
 */
exports.updateTitle = async (req, res) => {
    const { id } = req.params;
    const { title } = req.body;

    try {
        await db.execute('UPDATE gallery_images SET title = ? WHERE id = ?', [title, id]);
        res.json({ success: true, message: 'Title updated successfully' });
    } catch (error) {
        console.error('Update title error:', error);
        res.status(500).json({ success: false, error: 'Error updating title' });
    }
};
