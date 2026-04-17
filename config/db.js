'use strict';

require('dotenv').config();
const { Pool } = require('pg');

// ─── 1. Environment Validation ───────────────────────────────────────────────
const REQUIRED_VARS = ['DATABASE_URL'];
const missing = REQUIRED_VARS.filter(v => process.env[v] === undefined);

if (missing.length > 0 && !process.env.PGHOST) {
    console.error(`[DB FATAL] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
}

// ─── 2. Pool Configuration ───────────────────────────────────────────────────
const isNeon = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('neon.tech');

const poolConfig = {
    connectionString: process.env.DATABASE_URL,
    host:             process.env.PGHOST || process.env.DB_HOST,
    user:             process.env.PGUSER || process.env.DB_USER,
    password:         process.env.PGPASSWORD || process.env.DB_PASSWORD,
    database:         process.env.PGDATABASE || process.env.DB_NAME,
    port:             process.env.PGPORT || 5432,
    max:              parseInt(process.env.DB_POOL_SIZE || '25', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
};


if (isNeon || process.env.PGSSL === 'true') {
    poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

// ─── 3. Native Database Methods ──────────────────────────────────────────────
/**
 * Execute a query with PG-native positional parameters ($1, $2...)
 * Returns [rows, resultObject] for a balanced transition, 
 * or { rows, rowCount } for pure PG.
 * Given the large codebase, we will standardize on returning [rows, meta] 
 * temporarily but WITHOUT the MySQL-mimicking hacks.
 */
async function query(sql, params = []) {
    const start = Date.now();
    try {
        const result = await pool.query(sql, params);
        // Standard shape: [rows, resultFull]
        return [result.rows, result];
    } catch (err) {
        console.error(`[DB ERROR] Query: ${sql}\nParams: ${JSON.stringify(params)}\nError: ${err.message}`);
        throw err;
    }
}

/**
 * tenantExecute: Native PG with Tenant Isolation
 * Now expects native PG placeholders ($n) in 'sql'
 * 🛡️ Security: Automatically injects tenant_id filter
 */
async function tenantExecute(req, sql, params = []) {
    if (!req.user || !req.user.tenant_id) {
        throw new Error('[DB SEC] Tenant context missing.');
    }
    
    const tenantId = req.user.tenant_id;
    let modifiedSql = sql.trim();

    // 1. Identify query type
    const isSelect = /^SELECT\b/i.test(modifiedSql);
    const isUpdate = /^UPDATE\b/i.test(modifiedSql);
    const isDelete = /^DELETE\b/i.test(modifiedSql);

    if (isSelect || isUpdate || isDelete) {
        // 2. Determine injection placement
        // We find the first occurrence of GROUP BY, ORDER BY, LIMIT, or OFFSET
        const suffixRegex = /\b(GROUP BY|ORDER BY|LIMIT|OFFSET|RETURNING)\b/i;
        const match = suffixRegex.exec(modifiedSql);
        const splitIndex = match ? match.index : modifiedSql.length;
        
        let head = modifiedSql.slice(0, splitIndex).trim();
        const tail = modifiedSql.slice(splitIndex).trim();

        // 3. Find next placeholder index
        const placeholderCount = (modifiedSql.match(/\$\d+/g) || []).length;
        const tenantPlaceholder = `$${placeholderCount + 1}`;

        // 4. Inject tenant filter
        const hasWhere = /\bWHERE\b/i.test(head);
        if (hasWhere) {
            head += ` AND tenant_id = ${tenantPlaceholder}`;
        } else {
            head += ` WHERE tenant_id = ${tenantPlaceholder}`;
        }

        modifiedSql = `${head} ${tail}`.trim();
        return await query(modifiedSql, [...params, tenantId]);
    }

    // Pass through for non-isolated queries (e.g., INSERT is usually handled explicitly)
    return await query(modifiedSql, params);
}

/**
 * Native Transaction Wrapper
 */
async function getTransaction() {
    const client = await pool.connect();
    
    // Pure PG extension
    client.queryNative = client.query;
    
    // Convenience for our [rows, meta] pattern
    client.execute = async (sql, params = []) => {
        const result = await client.query(sql, params);
        return [result.rows, result];
    };

    client.beginTransaction = () => client.query('BEGIN');
    client.commit = () => client.query('COMMIT');
    client.rollback = () => client.query('ROLLBACK');
    
    return client;
}

// ─── 4. Startup ──────────────────────────────────────────────────────────────
(async () => {
    try {
        const client = await pool.connect();
        console.log(`[DB/PG] Engine: PostgreSQL (Native Mode)`);
        client.release();
    } catch (err) {
        console.error(`[DB/PG FATAL] Connection failed: ${err.message}`);
    }
})();

module.exports = {
    pool,
    query,
    execute: query, // Transition alias
    tenantExecute,
    getTransaction,
    getTenantId: (req) => req.user?.tenant_id
};
