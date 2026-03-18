'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');

// ─── 1. Strict Environment Variable Validation ────────────────────────────────
const REQUIRED_VARS = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing = REQUIRED_VARS.filter(v => process.env[v] === undefined);
if (missing.length > 0) {
    console.error(`[DB FATAL] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);    // Crash fast — never run with an unconfigured DB in production
}

// ─── 2. Connection Pool Configuration ────────────────────────────────────────
const poolConfig = {
    host:              process.env.DB_HOST,
    user:              process.env.DB_USER,
    password:          process.env.DB_PASSWORD,
    database:          process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit:   parseInt(process.env.DB_POOL_SIZE || '10', 10),
    queueLimit:        0,          // Unlimited queue — requests wait, never fail silently
    enableKeepAlive:   true,       // Sends a TCP keep-alive to prevent idle disconnections
    keepAliveInitialDelay: 10000   // Start keep-alive pings after 10 seconds idle
};

let pool = mysql.createPool(poolConfig);

// ─── 3. Automatic Reconnection Handler ───────────────────────────────────────
//
// mysql2 pools expose an 'error' event on the underlying connection handle
// for protocol-level errors (e.g. ECONNRESET, PROTOCOL_CONNECTION_LOST).
// We listen to the pool's internal acquire/error lifecycle and recreate the
// pool when a fatal error is detected.
//
function handlePoolError(err) {
    if (err.fatal) {
        console.error(`[DB ERROR] Fatal pool error (${err.code}). Recreating pool in 5 seconds...`, err.message);
        setTimeout(() => {
            pool = mysql.createPool(poolConfig);
            attachPoolErrorHandler(pool);
            console.log('[DB] Pool recreated successfully.');
        }, 5000);
    } else {
        console.warn(`[DB WARN] Non-fatal pool error: ${err.code} – ${err.message}`);
    }
}

function attachPoolErrorHandler(targetPool) {
    // mysql2 promise pools expose the underlying core pool
    targetPool.pool.on('connection', (conn) => {
        conn.on('error', handlePoolError);
    });
}

attachPoolErrorHandler(pool);

// ─── 4. Startup Connectivity Check ───────────────────────────────────────────
(async () => {
    try {
        const conn = await pool.getConnection();
        console.log(`[DB] Connected to '${process.env.DB_NAME}' on ${process.env.DB_HOST}`);
        conn.release();
    } catch (err) {
        console.error(`[DB FATAL] Cannot connect to database on startup: ${err.message}`);
        process.exit(1);
    }
})();

// ─── 5. Parameterized Query Helper (SQL Injection Safe) ───────────────────────
/**
 * Execute a parameterized SQL query.
 *
 * @param {string}  sql    - SQL string with `?` placeholders
 * @param {Array}   params - Values that replace the `?` placeholders
 * @returns {Promise<Array>} - [rows, fields]
 *
 * @example
 *   const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
 *   const [result] = await db.query(
 *       'UPDATE users SET password_hash = ? WHERE mobile_number = ?',
 *       [hash, mobile]
 *   );
 */
async function query(sql, params = []) {
    if (!Array.isArray(params)) {
        throw new TypeError('[DB] Query params must be an Array. Never interpolate values directly into SQL strings.');
    }
    try {
        return await pool.execute(sql, params);     // `execute` uses prepared statements internally
    } catch (err) {
        console.error('[DB QUERY ERROR]', {
            message: err.message,
            code:    err.code,
            sql:     sql.replace(/\s+/g, ' ').trim().substring(0, 200)   // Truncated for log safety
        });
        throw err;  // Re-throw so callers can handle appropriately
    }
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
    // The raw pool — use for transactions or advanced usage
    pool,

    // Safe parameterized execute (recommended for all queries)
    execute: (sql, params) => pool.execute(sql, params),

    // Aliased query helper with logging
    query,

    // Shorthand for controllers that already use `db.execute(...)` throughout
    // This makes the module a drop-in replacement for the old `pool` export
    then: undefined  // Prevents accidental `await db` usage
};

