const db = require('./config/db');

async function seedGallery() {
    try {
        // Clear existing
        await db.execute('DELETE FROM gallery_images');
        
        const images = [
            { filename: 'campus_admin.png', url: '/uploads/gallery/campus_admin.png', title: 'Modern Campus Administration', display_order: 1 },
            { filename: 'student_hub.png', url: '/uploads/gallery/student_hub.png', title: 'Campus Student Hub', display_order: 2 },
            { filename: 'digital_governance.png', url: '/uploads/gallery/digital_governance.png', title: 'Digital Governance Concept', display_order: 3 }
        ];

        for (const img of images) {
            await db.execute(
                'INSERT INTO gallery_images (tenant_id, filename, url, title, display_order, is_featured) VALUES ($1, $2, $3, $4, $5, $6)',
                [1, img.filename, img.url, img.title, img.display_order, true]
            );
        }

        console.log('Gallery seeded successfully with 3 images.');
        process.exit(0);
    } catch (err) {
        console.error('Seeding Error:', err);
        process.exit(1);
    }
}

seedGallery();
