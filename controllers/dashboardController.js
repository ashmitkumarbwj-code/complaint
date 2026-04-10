const db = require('../config/db');
const logger = require('../utils/logger');

exports.getPrincipalDashboardStats = async (req, res) => {
    try {
        const [totalToday] = await db.tenantExecute(req, 'SELECT COUNT(*) as count FROM complaints WHERE DATE(created_at) = CURDATE()');
        const [pending] = await db.tenantExecute(req, 'SELECT COUNT(*) as count FROM complaints WHERE status = "Pending"');
        const [escalated] = await db.tenantExecute(req, 'SELECT COUNT(*) as count FROM complaints WHERE status = "Escalated"');
        const [resolvedToday] = await db.tenantExecute(req, 'SELECT COUNT(*) as count FROM complaints WHERE status = "Resolved" AND DATE(updated_at) = CURDATE()');

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
        logger.error('[Dashboard] getPrincipalDashboardStats error:', error);
        res.status(500).json({ success: false, message: 'Error fetching stats' });
    }
};

exports.getPrincipalCriticalComplaints = async (req, res) => {
    try {
        const [rows] = await db.tenantExecute(req, `
            SELECT c.*, d.name as department_name, u.username as student_name
            FROM complaints c
            JOIN departments d ON c.department_id = d.id
            JOIN students s ON c.student_id = s.id
            JOIN users u ON s.user_id = u.id
            WHERE (c.status = 'Escalated' OR c.priority = 'Emergency')
            ORDER BY c.priority = 'Emergency' DESC, c.created_at DESC
            LIMIT 10
        `);
        res.json({ success: true, complaints: rows });
    } catch (error) {
        logger.error('[Dashboard] getPrincipalCriticalComplaints error:', error);
        res.status(500).json({ success: false, message: 'Error fetching critical complaints' });
    }
};

exports.getAuthorityStats = async (req, res) => {
    const { department_id } = req.params;
    try {
        // Membership Lock
        if (req.user.role === 'Staff' || req.user.role === 'HOD') {
            const [membership] = await db.tenantExecute(req,
                'SELECT 1 FROM department_members WHERE department_id = ? AND user_id = ?',
                [department_id, req.user.id]
            );
            if (membership.length === 0) return res.status(403).json({ success: false, message: 'Access Denied' });
        }

        const [stats] = await db.tenantExecute(req, `
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
        logger.error('[Dashboard] getAuthorityStats error:', error);
        res.status(500).json({ success: false, message: 'Error fetching stats' });
    }
};

exports.getAuthorityComplaints = async (req, res) => {
    const { department_id } = req.params;
    try {
        if (req.user.role === 'Staff' || req.user.role === 'HOD') {
            const [membership] = await db.tenantExecute(req,
                'SELECT 1 FROM department_members WHERE department_id = ? AND user_id = ?',
                [department_id, req.user.id]
            );
            if (membership.length === 0) return res.status(403).json({ success: false, message: 'Access Denied' });
        }

        const [rows] = await db.tenantExecute(req, `
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
        logger.error('[Dashboard] getAuthorityComplaints error:', error);
        res.status(500).json({ success: false, message: 'Error fetching complaints' });
    }
};

exports.getAdminStats = async (req, res) => {
    try {
        const [total] = await db.tenantExecute(req, 'SELECT COUNT(*) as count FROM complaints');
        const [pending] = await db.tenantExecute(req, 'SELECT COUNT(*) as count FROM complaints WHERE status = "Pending"');
        const [resolved] = await db.tenantExecute(req, 'SELECT COUNT(*) as count FROM complaints WHERE status = "Resolved"');
        const [deptStats] = await db.tenantExecute(req, `
            SELECT d.name, COUNT(c.id) as total, 
            SUM(CASE WHEN c.status = 'Resolved' THEN 1 ELSE 0 END) as resolved
            FROM departments d
            LEFT JOIN complaints c ON d.id = c.department_id
            WHERE 1=1
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
        logger.error('[Dashboard] getAdminStats error:', error);
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

exports.getWeeklyStats = async (req, res) => {
    try {
        const [rows] = await db.tenantExecute(req, `
            SELECT 
                FLOOR(DATEDIFF(NOW(), created_at) / 7) as weeks_ago,
                SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved,
                SUM(CASE WHEN status IN ('Pending', 'In Progress', 'Escalated') THEN 1 ELSE 0 END) as unresolved
            FROM complaints
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 4 WEEK)
            GROUP BY weeks_ago
            ORDER BY weeks_ago DESC
        `);

        // Format for Chart.js
        const result = {
            weeks: ["Week 4", "Week 3", "Week 2", "Week 1"], // Friendly labels
            resolved: [0, 0, 0, 0],
            unresolved: [0, 0, 0, 0]
        };

        rows.forEach(row => {
            // weeks_ago: 0 = current week (Week 1), 1 = previous week (Week 2), etc.
            // Map to our result arrays (index 3 is Week 1, index 0 is Week 4)
            const index = 3 - row.weeks_ago;
            if (index >= 0 && index < 4) {
                result.resolved[index] = row.resolved;
                result.unresolved[index] = row.unresolved;
            }
        });

        res.json({ success: true, ...result });
    } catch (error) {
        logger.error('[Dashboard] getWeeklyStats error:', error);
        res.status(500).json({ success: false, message: 'Error fetching weekly stats' });
    }
};

/**
 * @route   GET /api/dashboards/public/weekly-stats
 * @desc    Get public weekly stats for landing page (Tenant 1 default)
 */
exports.getPublicWeeklyStats = async (req, res) => {
    try {
        const tenantId = req.query.tenant_id || 1;
        const [rows] = await db.execute(`
            SELECT 
                FLOOR(DATEDIFF(NOW(), created_at) / 7) as weeks_ago,
                SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved,
                SUM(CASE WHEN status IN ('Pending', 'In Progress', 'Escalated') THEN 1 ELSE 0 END) as unresolved
            FROM complaints
            WHERE tenant_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 4 WEEK)
            GROUP BY weeks_ago
            ORDER BY weeks_ago DESC
        `, [tenantId]);

        const result = {
            weeks: ["Week 4", "Week 3", "Week 2", "Week 1"],
            resolved: [0, 0, 0, 0],
            unresolved: [0, 0, 0, 0]
        };

        rows.forEach(row => {
            const index = 3 - row.weeks_ago;
            if (index >= 0 && index < 4) {
                result.resolved[index] = row.resolved;
                result.unresolved[index] = row.unresolved;
            }
        });

        res.json({ success: true, ...result });
    } catch (error) {
        logger.error('[Dashboard] getPublicWeeklyStats error:', error);
        res.status(500).json({ success: false, message: 'Error fetching public weekly stats' });
    }
};

exports.getPublicStats = async (req, res) => {

    try {
        const tenantId = req.query.tenant_id;

        // If tenant_id provided, show filtered stats.
        // Otherwise, show system-wide stats (but keep it generic).
        let totalQuery = 'SELECT COUNT(*) as count FROM complaints';
        let resolvedQuery = 'SELECT COUNT(*) as count FROM complaints WHERE status = "Resolved"';
        let params = [];

        if (tenantId) {
            totalQuery += ' WHERE tenant_id = ?';
            resolvedQuery += ' AND tenant_id = ?';
            params = [tenantId];
        }

        const [total] = await db.execute(totalQuery, params);
        const [resolved] = await db.execute(resolvedQuery, params);

        const solvedCount = resolved[0].count;
        const totalCount = total[0].count;
        const unresolvedCount = totalCount - solvedCount;

        res.json({
            success: true,
            solved: solvedCount,
            unresolved: unresolvedCount
        });
    } catch (error) {
        logger.error('[Dashboard] getPublicStats error:', error);
        res.status(500).json({ success: false, message: 'Error fetching public stats' });
    }
};
