const db = require('../config/db');

exports.getPrincipalDashboardStats = async (req, res) => {
    try {
        const [totalToday] = await db.execute('SELECT COUNT(*) as count FROM complaints WHERE DATE(created_at) = CURDATE()');
        const [pending] = await db.execute('SELECT COUNT(*) as count FROM complaints WHERE status = "Pending"');
        const [escalated] = await db.execute('SELECT COUNT(*) as count FROM complaints WHERE status = "Escalated"');
        const [resolvedToday] = await db.execute('SELECT COUNT(*) as count FROM complaints WHERE status = "Resolved" AND DATE(updated_at) = CURDATE()');

        res.json({
            success: true,
            stats: {
                total_today: totalToday[0].count,
                pending: pending[0].count,
                escalated: escalated[0].count,
                resolved_today: resolvedToday[0].count
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching principal stats' });
    }
};

exports.getPrincipalCriticalComplaints = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT c.*, d.name as department_name, u.username as student_name
            FROM complaints c
            JOIN departments d ON c.department_id = d.id
            JOIN students s ON c.student_id = s.id
            JOIN users u ON s.user_id = u.id
            WHERE c.status = 'Escalated' OR c.priority = 'Emergency'
            ORDER BY c.priority = 'Emergency' DESC, c.created_at DESC
            LIMIT 10
        `);
        res.json({ success: true, complaints: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching critical complaints' });
    }
};

exports.getAuthorityStats = async (req, res) => {
    const { department_id } = req.params;
    const { id: user_id, role } = req.user;

    try {
        // Senior Security Isolation: 
        // If user is Staff or HOD, they MUST belong to the department they are querying.
        if (role === 'Staff' || role === 'HOD') {
            const [membership] = await db.execute(
                'SELECT 1 FROM department_members WHERE department_id = ? AND user_id = ?',
                [department_id, user_id]
            );
            if (membership.length === 0) {
                return res.status(403).json({ success: false, message: 'Access denied: You do not belong to this department.' });
            }
        }

        const [stats] = await db.execute(`
            SELECT 
                COUNT(*) as total_complaints,
                SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
                SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved,
                SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) as rejected
            FROM complaints
            WHERE department_id = ?
        `, [department_id]);

        res.json({ success: true, stats: stats[0] });
    } catch (error) {
        console.error('Error fetching authority stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching dashboard stats' });
    }
};

exports.getAuthorityComplaints = async (req, res) => {
    const { department_id } = req.params;
    const { id: user_id, role } = req.user;

    try {
        // Senior Security Isolation: 
        // If user is Staff or HOD, verify department membership
        if (role === 'Staff' || role === 'HOD') {
            const [membership] = await db.execute(
                'SELECT 1 FROM department_members WHERE department_id = ? AND user_id = ?',
                [department_id, user_id]
            );
            if (membership.length === 0) {
                return res.status(403).json({ success: false, message: 'Access denied: You do not belong to this department.' });
            }
        }

        const [rows] = await db.execute(`
            SELECT c.*, s.roll_number, u.username as student_name, d.name as department_name
            FROM complaints c
            JOIN students s ON c.student_id = s.id
            JOIN users u ON s.user_id = u.id
            JOIN departments d ON c.department_id = d.id
            WHERE c.department_id = ?
            ORDER BY 
                CASE WHEN c.priority = 'High' AND c.status != 'Resolved' THEN 1 ELSE 2 END,
                c.created_at DESC
        `, [department_id]);
        res.json({ success: true, complaints: rows });
    } catch (error) {
        console.error('Error fetching assigned complaints:', error);
        res.status(500).json({ success: false, message: 'Error fetching assigned complaints' });
    }
};

exports.getAdminStats = async (req, res) => {
    try {
        const [total] = await db.execute('SELECT COUNT(*) as count FROM complaints');
        const [pending] = await db.execute('SELECT COUNT(*) as count FROM complaints WHERE status = "Pending"');
        const [resolved] = await db.execute('SELECT COUNT(*) as count FROM complaints WHERE status = "Resolved"');
        const [deptStats] = await db.execute(`
            SELECT d.name, COUNT(c.id) as total, 
            SUM(CASE WHEN c.status = 'Resolved' THEN 1 ELSE 0 END) as resolved
            FROM departments d
            LEFT JOIN complaints c ON d.id = c.department_id
            GROUP BY d.id
        `);

        res.json({
            success: true,
            stats: {
                total: total[0].count,
                pending: pending[0].count,
                resolved: resolved[0].count,
                departments: deptStats
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching stats' });
    }
};

exports.getGallery = async (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const galleryDir = path.join(__dirname, '../public/images/gallery');
    const publicPath = 'images/gallery/';
    
    try {
        if (!fs.existsSync(galleryDir)) {
            return res.json({ success: true, images: [] });
        }

        const files = fs.readdirSync(galleryDir);
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.jfif', '.webp'];
        
        const images = files
            .filter(file => allowedExtensions.includes(path.extname(file).toLowerCase()))
            .map(file => ({
                name: file,
                url: publicPath + file
            }));

        res.json({ success: true, images });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching gallery' });
    }
};

exports.getPublicStats = async (req, res) => {
    try {
        const [total] = await db.execute('SELECT COUNT(*) as count FROM complaints');
        const [resolved] = await db.execute('SELECT COUNT(*) as count FROM complaints WHERE status = "Resolved"');
        
        const solvedCount = resolved[0].count;
        const totalCount = total[0].count;
        const unresolvedCount = totalCount - solvedCount;

        res.json({
            success: true,
            solved: solvedCount,
            unresolved: unresolvedCount
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching public stats' });
    }
};
