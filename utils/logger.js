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

// ── Ensure the logs/ directory exists ────────────────────────────────────────
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// ── Custom log formats ────────────────────────────────────────────────────────
const timestampedFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),      // include stack trace on Error objects
    format.splat(),                       // support printf-style %s substitutions
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
    format.json()
);

// ── Daily-rotate transport factory ───────────────────────────────────────────
const makeRotatingTransport = (filename, level) =>
    new DailyRotateFile({
        filename:      path.join(logsDir, `${filename}-%DATE%.log`),
        datePattern:   'YYYY-MM-DD',
        zippedArchive: true,       // compress old log files
        maxSize:       '20m',      // rotate if a single file exceeds 20 MB
        maxFiles:      '14d',      // keep 14 days of logs
        level,
        format:        jsonFormat
    });

// ── Main application logger ───────────────────────────────────────────────────
const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    transports: [
        // All levels (info and above) → combined / access
        makeRotatingTransport('access', 'info'),
        // Only warn / error → dedicated error log
        makeRotatingTransport('error', 'error'),
    ],
    exceptionHandlers: [
        // Uncaught exceptions also land in the error log
        new DailyRotateFile({
            filename:    path.join(logsDir, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxFiles:    '14d',
            format:      jsonFormat
        })
    ],
    rejectionHandlers: [
        // Unhandled promise rejections too
        new DailyRotateFile({
            filename:    path.join(logsDir, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxFiles:    '14d',
            format:      jsonFormat
        })
    ],
    exitOnError: false
});

// ── Console transport (coloured, only in non-production) ─────────────────────
if (process.env.NODE_ENV !== 'production') {
    logger.add(new transports.Console({
        format: format.combine(format.colorize(), timestampedFormat)
    }));
}

// ── Morgan stream adapter ─────────────────────────────────────────────────────
// Pipe every Morgan HTTP line through Winston at 'http' level.
// Morgan writes a trailing newline — strip it before handing to Winston.
logger.stream = {
    write: (message) => logger.info(message.trimEnd())
};

module.exports = logger;
