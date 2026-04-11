const db = require('../config/db');
const fs = require('fs');
const path = require('path');

const images = [
    { filename: '1773680254984-257433289.jfif', title: 'Main Campus Gate' },
    { filename: '1773680350867-390715349.jfif', title: 'College Library' },
    { filename: '1773680389931-885557267.jfif', title: 'Science Block' }
];

async function seed() {
    console.log('🚀 Seeding Gallery Images...');
    
    try {
        for (const img of images) {
            const url = 'images/gallery/' + img.filename;
            
            // Check if already exists
            const [existing] = await db.query('SELECT id FROM gallery_images WHERE filename = ?', [img.filename]);
            
            if (existing.length === 0) {
                // Insert with tenant_id 1 (default admin)
                await db.query(
                    'INSERT INTO gallery_images (tenant_id, filename, url, title) VALUES (?, ?, ?, ?)',
                    [1, img.filename, url, img.title]
                );
                console.log(`✅ Added: ${img.title}`);
            } else {
                console.log(`⏭️ Skipped (already exists): ${img.title}`);
            }
        }
        console.log('✨ Seeding complete!');
    } catch (err) {
        console.error('❌ Seeding failed:', err);
    } finally {
        process.exit();
    }
}

seed();
