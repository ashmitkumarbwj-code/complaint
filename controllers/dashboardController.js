const db = require('../config/db');
const logger = require('../utils/logger');
const { connection: redis, getIsAvailable: getRedisAvailable } = require('../config/redis');

/**
 * @desc Get Premium Dashboard Analytics for Admin/Principal
 * Aggregates: Summary cards, Status Breakdown, Daily Trends (30d), and Dept stats.
 * Uses Redis caching (5 min TTL) for performance.
 */
exports.getDashboardStats = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id || 1;
        const cacheKey = `dashboard_stats:${tenant_id}`;

        // 1. Try Cache First
        if (getRedisAvailable()) {
            const cachedData = await redis.get(cacheKey);
            if (cachedData) {
                return res.json(JSON.parse(cachedData));
            }
        }

        // 2. Aggregate Data from DB
        // 🛡️ Pro Analytics: Every query below is hardened via tenantExecute
        const summaryQuery = `
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending,
                COUNT(CASE WHEN status = 'Resolved' THEN 1 END) as resolved,
                -- 🚀 Pro Intelligence: Count SLA Breaches (> 48h)
                COUNT(CASE WHEN status = 'Pending' AND created_at < CURRENT_TIMESTAMP - INTERVAL '48 hours' THEN 1 END) as sla_breaches
            FROM complaints
            WHERE 1=1
        `;
        const studentsQuery = `
            SELECT COUNT(*) as count FROM users WHERE role = 'student'
        `;
        const statusDistributionQuery = `
            SELECT status, COUNT(*) as count FROM complaints GROUP BY status
        `;
        const dailyTrendsQuery = `
            SELECT created_at::DATE as date, COUNT(*) as count 
            FROM complaints 
            WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
            GROUP BY created_at::DATE 
            ORDER BY date ASC
        `;
        const departmentStatsQuery = `
            SELECT 
                d.id, d.name, 
                COUNT(c.id) as total_count,
                COUNT(CASE WHEN c.status = 'Pending' THEN 1 END) as pending_count,
                -- 🚀 Pro Intelligence: Pressure Score = Pending / Total (relative to department size)
                CASE WHEN COUNT(c.id) > 0 
                     THEN ROUND((COUNT(CASE WHEN c.status = 'Pending' THEN 1 END)::DECIMAL / COUNT(c.id)::DECIMAL) * 100, 1)
                     ELSE 0 END as pressure_score
            FROM departments d
            LEFT JOIN complaints c ON d.id = c.department_id
            WHERE 1=1
            GROUP BY d.id, d.name
        `;

        // 🚀 Pro Intelligence: Category Intensity
        const categoryIntensityQuery = `
            SELECT category, COUNT(*) as count 
            FROM complaints 
            WHERE 1=1
            GROUP BY category 
            ORDER BY count DESC 
            LIMIT 5
        `;

        // 🚀 Pro Intelligence: Avg Resolution Time (in hours)
        const avgResolutionTimeQuery = `
            SELECT ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600), 1) as avg_hours
            FROM complaints
            WHERE status = 'Resolved'
        `;

        const [summary] = await db.tenantExecute(req, summaryQuery);
        const [students] = await db.tenantExecute(req, studentsQuery);
        const [statusDistribution] = await db.tenantExecute(req, statusDistributionQuery);
        const [dailyTrends] = await db.tenantExecute(req, dailyTrendsQuery);
        const [departmentStats] = await db.tenantExecute(req, departmentStatsQuery);
        const [categoryIntensity] = await db.tenantExecute(req, categoryIntensityQuery);
        const [resolutionTime] = await db.tenantExecute(req, avgResolutionTimeQuery);

        const dashboardData = {
            success: true,
            summary: {
                total: summary[0].total,
                pending: summary[0].pending,
                resolved: summary[0].resolved,
                sla_breaches: summary[0].sla_breaches,
                active_students: students[0].count,
                avg_resolution_hours: resolutionTime[0].avg_hours || 0
            },
            statusDistribution,
            dailyTrends,
            departmentStats,
            categoryIntensity
        };

        // 3. Store in Cache (5 Min TTL)
        if (getRedisAvailable()) {
            await redis.setex(cacheKey, 300, JSON.stringify(dashboardData));
        }

        res.json(dashboardData);

    } catch (err) {
        logger.error('[Dashboard] getDashboardStats error:', err.message);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

// ─── LEGACY / AUTHORITY METHODS (RESTORED) ───────────────────────────────────

exports.getPrincipalDashboardStats = async (req, res) => {
    try {
        const [totalToday] = await db.tenantExecute(req, 'SELECT COUNT(*) as count FROM complaints WHERE created_at::DATE = CURRENT_DATE');
        const [pending] = await db.tenantExecute(req, "SELECT COUNT(*) as count FROM complaints WHERE status = 'Pending'");
        const [escalated] = await db.tenantExecute(req, "SELECT COUNT(*) as count FROM complaints WHERE status = 'Escalated'");
        const [resolvedToday] = await db.tenantExecute(req, "SELECT COUNT(*) as count FROM complaints WHERE status = 'Resolved' AND updated_at::DATE = CURRENT_DATE");

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
            AND c.tenant_id = $1
            ORDER BY c.priority = 'Emergency' DESC, c.created_at DESC
            LIMIT 10
        `, [req.user.tenant_id || 1]);
        res.json({ success: true, complaints: rows });
    } catch (error) {
        logger.error('[Dashboard] getPrincipalCriticalComplaints error:', error);
        res.status(500).json({ success: false, message: 'Error fetching critical complaints' });
    }
};

exports.getAuthorityStats = async (req, res) => {
    const { department_id } = req.params;
    try {
        if (req.user.role === 'Staff' || req.user.role === 'HOD') {
            const [membership] = await db.tenantExecute(req,
                'SELECT 1 FROM department_members WHERE department_id = $1 AND user_id = $2',
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
            WHERE department_id = $1
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
                'SELECT 1 FROM department_members WHERE department_id = $1 AND user_id = $2',
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
            WHERE c.department_id = $1 AND c.tenant_id = $2
            ORDER BY 
                CASE WHEN c.priority = 'High' AND c.status != 'Resolved' THEN 1 ELSE 2 END,
                c.created_at DESC
        `, [department_id, req.user.tenant_id || 1]);
        res.json({ success: true, complaints: rows });
    } catch (error) {
        logger.error('[Dashboard] getAuthorityComplaints error:', error);
        res.status(500).json({ success: false, message: 'Error fetching complaints' });
    }
};

exports.getAdminStats = async (req, res) => {
    try {
        const [total] = await db.tenantExecute(req, 'SELECT COUNT(*) as count FROM complaints');
        const [pending] = await db.tenantExecute(req, "SELECT COUNT(*) as count FROM complaints WHERE status = 'Pending'");
        const [resolved] = await db.tenantExecute(req, "SELECT COUNT(*) as count FROM complaints WHERE status = 'Resolved'");
        const [deptStats] = await db.tenantExecute(req, `
            SELECT d.name, COUNT(c.id) as total, 
            SUM(CASE WHEN c.status = 'Resolved' THEN 1 ELSE 0 END) as resolved
            FROM departments d
            LEFT JOIN complaints c ON d.id = c.department_id
            WHERE d.tenant_id = $1
            GROUP BY d.id, d.name
        `, [req.user.tenant_id || 1]);

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
                FLOOR(EXTRACT(DAY FROM (CURRENT_TIMESTAMP - created_at)) / 7) as weeks_ago,
                SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved,
                SUM(CASE WHEN status IN ('Pending', 'In Progress', 'Escalated') THEN 1 ELSE 0 END) as unresolved
            FROM complaints
            WHERE created_at >= CURRENT_DATE - INTERVAL '4 weeks'
            GROUP BY weeks_ago
            ORDER BY weeks_ago DESC
        `);

        // Format for Chart.js
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
        logger.error('[Dashboard] getWeeklyStats error:', error);
        res.status(500).json({ success: false, message: 'Error fetching weekly stats' });
    }
};

exports.getPublicWeeklyStats = async (req, res) => {
    try {
        const tenantId = req.query.tenant_id || 1;
        const [rows] = await db.execute(`
            SELECT 
                FLOOR(EXTRACT(DAY FROM (CURRENT_TIMESTAMP - created_at)) / 7) as weeks_ago,
                SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved,
                SUM(CASE WHEN status IN ('Pending', 'In Progress', 'Escalated') THEN 1 ELSE 0 END) as unresolved
            FROM complaints
            WHERE tenant_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '4 weeks'
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
        let totalQuery = 'SELECT COUNT(*) as count FROM complaints';
        let resolvedQuery = 'SELECT COUNT(*) as count FROM complaints WHERE status = \'Resolved\'';
        let params = [];

        if (tenantId) {
            totalQuery += ' WHERE tenant_id = $1';
            resolvedQuery += ' AND tenant_id = $1';
            params = [tenantId];
        }

        const [total] = await db.execute(totalQuery, params);
        const [resolved] = await db.execute(resolvedQuery, params);

        res.json({
            success: true,
            solved: resolved[0].count,
            unresolved: total[0].count - resolved[0].count
        });
    } catch (error) {
        logger.error('[Dashboard] getPublicStats error:', error);
        res.status(500).json({ success: false, message: 'Error fetching public stats' });
    }
};
