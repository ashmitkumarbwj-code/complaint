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
/**
 * Automated Tenant Isolation Wrapper (Golden Rule Enforcement)
 * Automatically appends 'AND tenant_id = ?' to SQL queries using context from req.user.
 * 
 * @param {Object} req - Express request object (must have req.user.tenant_id)
 * @param {string} sql - Original SQL string
 * @param {Array}  params - Original query parameters
 */
async function tenantExecute(req, sql, params = []) {
    if (!req.user || !req.user.tenant_id) {
        logger.error('[SECURITY FATAL] Tenant context missing on scoped query!');
        throw new Error('[DB SEC] Tenant context missing in request. Query blocked to prevent leakage.');
    }
    
    const tenantId = req.user.tenant_id;
    let modifiedSql = sql.trim();

    // identify if it already has a WHERE clause
    const hasWhere = /\bWHERE\b/i.test(modifiedSql);
    const isSelect = /\bSELECT\b/i.test(modifiedSql);
    const isUpdate = /\bUPDATE\b/i.test(modifiedSql);
    const isDelete = /\bDELETE\b/i.test(modifiedSql);

    if (isSelect || isUpdate || isDelete) {
        if (hasWhere) {
            // Find common trailing clauses to insert BEFORE them
            if (/\bGROUP BY\b/i.test(modifiedSql)) {
                modifiedSql = modifiedSql.replace(/\bGROUP BY\b/i, `AND tenant_id = ? GROUP BY`);
            } else if (/\bORDER BY\b/i.test(modifiedSql)) {
                modifiedSql = modifiedSql.replace(/\bORDER BY\b/i, `AND tenant_id = ? ORDER BY`);
            } else if (/\bLIMIT\b/i.test(modifiedSql)) {
                modifiedSql = modifiedSql.replace(/\bLIMIT\b/i, `AND tenant_id = ? LIMIT`);
            } else {
                modifiedSql += ` AND tenant_id = ?`;
            }
        } else {
            modifiedSql += ` WHERE tenant_id = ?`;
        }
    }

    // Add tenantId to the END of the params
    return await pool.execute(modifiedSql, [...params, tenantId]);
}

/**
 * Validate Tenant ID from Request Body/Query (For Auth flows)
 */
function getTenantId(req) {
    const tenantId = req.body.tenant_id || req.query.tenant_id;
    if (!tenantId) {
        throw new Error('Tenant ID is required for this operation.');
    }
    return tenantId;
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
    // The raw pool — use for background jobs (explicit tenant passing required)
    pool,

    // Raw execution (User with Admin access or non-tenant tables)
    execute: (sql, params) => pool.execute(sql, params),

    // The Golden Rule: Use this for 99% of controller logic
    tenantExecute,

    // Aliased query helper with logging
    query,

    // Helper for Auth flows
    getTenantId,

    then: undefined 
};


