require('dotenv').config();
const express = require('express');
const path    = require('path');
const helmet  = require('helmet');
const cors    = require('cors');
const rateLimit = require('express-rate-limit');
const morgan  = require('morgan');
const logger  = require('./utils/logger');
const { traceMiddleware } = require('./middleware/traceMiddleware');

// Handle Uncaught Exceptions EARLY
process.on('uncaughtException', (err) => {
    logger.error('CRITICAL UNCAUGHT EXCEPTION — App Shutting Down:', err);
    // Give Winston time to flush logs before exiting
    setTimeout(() => {
        process.exit(1);
    }, 1000);
});

// Handle Unhandled Promise Rejections EARLY
process.on('unhandledRejection', (reason, promise) => {
    logger.error('CRITICAL UNHANDLED REJECTION — App Shutting Down:', reason);
    setTimeout(() => {
        process.exit(1);
    }, 1000);
});

const app = express();

// 1. High-Priority Tracing (MUST be first)
app.use(traceMiddleware);

// Global Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (process.env.NODE_ENV === 'production') ? 100 : 5000, // Much higher limit for testing
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

app.use(limiter);

// HTTP request logging → logs/access-YYYY-MM-DD.log  (via Winston stream)
app.use(morgan(
    ':remote-addr :method :url :status :res[content-length] - :response-time ms',
    { stream: logger.stream }
));

const http = require('http').createServer(app);
const socketService = require('./utils/socketService');
const PORT = process.env.PORT || 3000;

// Initialize Socket.io
socketService.init(http);

// Security and CORS middlewares
app.use(helmet({
  contentSecurityPolicy: false // disabled for simple CDN loading of GSAP and Charts
}));

// Strict CORS Configuration
const frontendUrls = process.env.FRONTEND_URLS ? process.env.FRONTEND_URLS.split(',').map(u => u.trim()) : [];

const allowedOrigins = [
    ...frontendUrls,
    process.env.BASE_URL,
    'http://127.0.0.1:3000'
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, or Postman)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Routes
const authRoutes = require('./routes/auth');
const complaintRoutes = require('./routes/complaints');
const dashboardRoutes = require('./routes/dashboards');
const adminRoutes = require('./routes/admin');
const galleryRoutes = require('./routes/gallery');
const statsRoutes = require('./routes/stats');
const usersRoutes = require('./routes/users');
const departmentRoutes = require('./routes/departments');
const healthRoutes = require('./routes/health');

app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/dashboards', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/health', healthRoutes);

// API 404 — unknown /api/* routes return JSON (static won't serve these)
app.use((req, res, next) => {
    if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({ success: false, message: 'Not found' });
    }
    next();
});

// Default route (handles root index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// App 404 fallback for any other unhandled GET routes (HTML)
app.use((req, res, next) => {
    if (req.method === 'GET') {
        res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    } else {
        next();
    }
});

// Initialize Background Workers (BullMQ) if Redis is available
const { getIsAvailable } = require('./config/redis');
if (getIsAvailable()) {
    require('./workers/index');

    // BullBoard Integration for Queue Monitoring
    try {
        const { createBullBoard } = require('@bull-board/api');
        const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
        const { ExpressAdapter } = require('@bull-board/express');
        const { notificationQueue, uploadQueue } = require('./utils/queueService');
        const requireAuth = require('./middleware/authMiddleware');
        const checkRole = require('./middleware/roleMiddleware');

        const serverAdapter = new ExpressAdapter();
        serverAdapter.setBasePath('/admin/queues');

        createBullBoard({
            queues: [
                new BullMQAdapter(notificationQueue),
                new BullMQAdapter(uploadQueue)
            ],
            serverAdapter: serverAdapter,
        });

        // Protect the dashboard with auth middleware
        app.use('/admin/queues', requireAuth, checkRole(['Admin', 'Principal']), serverAdapter.getRouter());
        logger.info('BullBoard initialized at /admin/queues');
    } catch (err) {
        logger.warn('BullBoard not initialized: ' + err.message);
    }

} else {
    logger.info('Skipping background workers (Redis not available).');
}

// Global error-handling middleware
app.use((err, req, res, next) => {
    logger.error(`Unhandled error on ${req.method} ${req.originalUrl} — ${err.message}`, err);
    
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(422).json({ 
            success: false, 
            message: 'File size exceeds the limit (Max 20 MB for multimedia).' 
        });
    }

    // Pass through validation errors or other handled errors
    if (res.headersSent) return next(err);
    
    res.status(err.status || 500).json({ 
        success: false, 
        message: err.message || 'An internal server error occurred.' 
    });
});


// Setup Scheduled Jobs
const complaintControllerCore = require('./controllers/complaintController');
const escalationService = require('./utils/escalationService');
const backupService = require('./utils/backupService');

const resyncWorker = require('./workers/resyncWorker');

// Run database backup daily
setInterval(async () => {
    try {
        await backupService.runBackup();
        await backupService.cleanupOldBackups();
    } catch (err) {
        logger.error('[Cron] Daily Backup/Cleanup Failed:', err);
    }
}, 24 * 60 * 60 * 1000);

// Run Resilience Re-sync every 10 minutes
setInterval(async () => {
    await resyncWorker.processPendingResyncs();
}, 10 * 60 * 1000);

// Run media cleanup job daily
setInterval(async () => {
    await complaintControllerCore.cleanupOldMedia();
}, 24 * 60 * 60 * 1000);

// Run SLA Escalation Job every hour
setInterval(async () => {
    await escalationService.processEscalations();
}, 1 * 60 * 60 * 1000);

// Run OTP Database Cleanup Job every hour
setInterval(async () => {
    try {
        const db = require('./config/db');
        const [result] = await db.execute('DELETE FROM otps WHERE expires_at < NOW() OR is_used = 1');
        if (result.affectedRows > 0) {
            logger.info(`[OTP Job] Cleaned up ${result.affectedRows} expired/used OTPs`);
        }
    } catch (e) {
        logger.error('[OTP Job] Cleanup failed', e);
    }
}, 1 * 60 * 60 * 1000);

// Run initial checks 5 seconds after server start
setTimeout(async () => {
    await complaintControllerCore.cleanupOldMedia();
    await escalationService.processEscalations();
}, 5000);


// Start Server
http.listen(PORT, () => {
    logger.info(`Smart Campus server started on port ${PORT} (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
});
