require('dotenv').config();
const express = require('express');
const path    = require('path');
const helmet  = require('helmet');
const cors    = require('cors');
const cookieParser = require('cookie-parser');
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
app.set('trust proxy', 1);

// 1. High-Priority Tracing (MUST be first)
app.use(traceMiddleware);
app.use(cookieParser());

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
  contentSecurityPolicy: false, // disabled for simple CDN loading of GSAP and Charts
  crossOriginResourcePolicy: false // disable strict CORP to allow CDN assets
}));

const allowedOrigins = process.env.FRONTEND_URLS
  ? process.env.FRONTEND_URLS.split(',')
  : [];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn(`❌ CORS BLOCKED: ${origin}`);
      callback(new Error('CORS error / blocked by production policy'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true 
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
const slidesRoutes = require('./routes/slides');
const dynamicSlidesRoutes = require('./routes/dynamicSlides');

const publicRoutes = require('./routes/public');

app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/dashboards', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/slides', slidesRoutes); // added
app.use('/api/dynamic-slides', dynamicSlidesRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/public', publicRoutes);


// API 404 — unknown /api/* routes return JSON (static won't serve these)
app.use((req, res, next) => {
    if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({ success: false, message: 'Not found' });
    }
    next();
});

// Legacy Flow Hard Kill
app.get('/activate.html', (req, res) => {
    logger.info(`[Security] Legacy activate.html request blocked and redirected from ${req.ip}`);
    res.redirect('/login.html');
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

// CRITICAL: Check if running in Vercel Serverless environment
const isServerless = process.env.VERCEL === '1';

// Initialize Background Workers (BullMQ) if Redis is available and not on Vercel
if (!isServerless && process.env.USE_REDIS === 'true') {
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
        app.use('/admin/queues', requireAuth, checkRole(['admin', 'principal']), serverAdapter.getRouter());
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

if (!isServerless) {
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
        try {
            await resyncWorker.processPendingResyncs();
        } catch (err) {
            logger.error('[Cron] Resilience Re-sync Job Failed:', err);
        }
    }, 10 * 60 * 1000);

    // Run media cleanup job daily
    setInterval(async () => {
        try {
            await complaintControllerCore.cleanupOldMedia();
            await resyncWorker.deleteOldOrphans(); // 🛡️ Disk Safety Cleanup
        } catch (err) {
            logger.error('[Cron] Media/Disk Cleanup Job Failed:', err);
        }
    }, 24 * 60 * 60 * 1000);


    // Run SLA Escalation Job every hour
    setInterval(async () => {
        try {
            await escalationService.processEscalations();
        } catch (err) {
            logger.error('[Cron] SLA Escalation Job Failed:', err);
        }
    }, 1 * 60 * 60 * 1000);

    // Run OTP Database Cleanup Job every hour
    setInterval(async () => {
        try {
            const db = require('./config/db');
            const [dbRows, result] = await db.execute('DELETE FROM otp_verifications WHERE expires_at < NOW() OR verified = true');
            if (result && result.rowCount > 0) {
                logger.info(`[OTP Job] Cleaned up ${result.rowCount} expired/used OTPs`);
            }
        } catch (e) {
            logger.error('[OTP Job] Cleanup failed', e);
        }
    }, 1 * 60 * 60 * 1000);

    // Run initial checks 5 seconds after server start
    setTimeout(async () => {
        await complaintControllerCore.cleanupOldMedia();
        await escalationService.processEscalations();
        
        // Recover stuck AI analysis jobs
        const aiQueue = require('./utils/aiQueue');
        await aiQueue.recover();
    }, 5000);

    // Start Server
    http.listen(PORT, () => {
        logger.info(`Smart Campus server started on port ${PORT} (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
    });
} else {
    logger.warn('Vercel Serverless mode detected: Background workers, chron jobs, and listeners are disabled.');
}

module.exports = app;
