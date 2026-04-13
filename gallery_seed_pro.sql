USE smart_campus_prod;

-- Remove old test entries if they exist with identical names to prevent duplication
DELETE FROM gallery_images WHERE filename IN ('campus_team_meeting.jpg', 'system_showcase.jpg', 'admin_office_working.jpg', 'project_presentation.jpg');

-- Insert new professional images
INSERT INTO gallery_images (tenant_id, filename, url, title, is_featured) VALUES
(1, 'campus_team_meeting.jpg', 'images/gallery/campus_team_meeting.jpg', 'Campus Team Meeting', 1),
(1, 'system_showcase.jpg', 'images/gallery/system_showcase.jpg', 'System Showcase', 1),
(1, 'admin_office_working.jpg', 'images/gallery/admin_office_working.jpg', 'Admin Office Working', 1),
(1, 'project_presentation.jpg', 'images/gallery/project_presentation.jpg', 'Project Presentation', 1);
