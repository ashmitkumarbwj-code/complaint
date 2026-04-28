/**
 * utils/logger.js
 * ───────────────────────────────────────────────────────────────────────────
 * Centralised logging for Smart Campus Complaint & Response System.
 *
 *  • Winston handles structured app/error logs → logs/error.log + logs/combined.log
 *  • Daily rotation keeps individual log files small (one per day, 14-day retention)
 *  • Morgan stream adapter pipes HTTP access logs through Winston → logs/access.log
 *  • Console output stays on during development, suppressed in production tests
 * ───────────────────────────────────────────────────────────────────────────
 */

const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

const isServerless = process.env.VERCEL === '1';

// ── Ensure the logs/ directory exists (EC2 ONLY) ──────────────────────────────
const logsDir = path.join(__dirname, '..', 'logs');
if (!isServerless && !fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// ── Custom log formats ────────────────────────────────────────────────────────
const timestampedFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),      
    format.splat(),                       
    format.printf(({ timestamp, level, message, stack }) => {
        return stack
            ? `[${timestamp}] ${level.toUpperCase()}: ${message}\n${stack}`
            : `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
);

const jsonFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format((info) => {
        try {
            const { getStore } = require('../middleware/traceMiddleware');
            const store = getStore();
            if (store) {
                return { ...info, ...store };
            }
        } catch (e) {
            // Context undefined
        }
        return info;
    })(),
    format.json()
);

const makeRotatingTransport = (filename, level) =>
    new DailyRotateFile({
        filename:      path.join(logsDir, `${filename}-%DATE%.log`),
        datePattern:   'YYYY-MM-DD',
        zippedArchive: true,       
        maxSize:       '20m',      
        maxFiles:      '14d',     
        level,
        format:        jsonFormat
    });

// Map environment-aware pipelines
const transportsList = [];
const anomalyHandlers = [];

if (!isServerless) {
    transportsList.push(
        makeRotatingTransport('access', 'info'),
        makeRotatingTransport('error', 'error'),
        new transports.File({ 
            filename: path.join(logsDir, 'access.log'), 
            level: 'info',
            format: jsonFormat
        }),
        new transports.File({ 
            filename: path.join(logsDir, 'error.log'), 
            level: 'error',
            format: jsonFormat
        })
    );
    anomalyHandlers.push(
        new DailyRotateFile({
            filename:    path.join(logsDir, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxFiles:    '14d',
            format:      jsonFormat
        }),
        new transports.File({ 
            filename: path.join(logsDir, 'error.log'),
            format: jsonFormat
        })
    );
}

// ── Main application logger ───────────────────────────────────────────────────
const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    transports: transportsList.length > 0 ? transportsList : [new transports.Console()],
    exceptionHandlers: anomalyHandlers,
    rejectionHandlers: anomalyHandlers,
    exitOnError: false
});

// ── Fallback Console Transport ────────────────────────────────────────────────
if (isServerless || process.env.NODE_ENV !== 'production') {
    if (transportsList.length > 0) {
        logger.add(new transports.Console({
            format: format.combine(format.colorize(), timestampedFormat)
        }));
    }
}

// ── Morgan stream adapter ─────────────────────────────────────────────────────
// Pipe every Morgan HTTP line through Winston at 'http' level.
// Morgan writes a trailing newline — strip it before handing to Winston.
logger.stream = {
    write: (message) => logger.info(message.trimEnd())
};

module.exports = logger;
