const { AsyncLocalStorage } = require('async_hooks');
const { v4: uuidv4 } = require('uuid');

const storage = new AsyncLocalStorage();

/**
 * Trace Middleware
 * Generates a unique request_id and sets context for the current request.
 */
const traceMiddleware = (req, res, next) => {
    const requestId = req.header('x-request-id') || uuidv4();
    
    // Extract tenant and user info from req.user (populated by authMiddleware)
    // Note: authMiddleware MUST run before this if we want tenant info in logs
    // for protected routes. For public routes, tenantId might be null.
    const context = {
        requestId,
        tenantId: 'anonymous',
        userId: 'guest',
        route: req.originalUrl,
        method: req.method
    };

    // Store context in AsyncLocalStorage
    storage.run(context, () => {
        req.trace = context;
        // Function to update context once user is identified
        req.updateTraceContext = (userData) => {
            context.tenantId = userData.tenant_id || context.tenantId;
            context.userId = userData.id || context.userId;
        };
        res.setHeader('x-request-id', requestId);
        next();
    });
};

module.exports = {
    traceMiddleware,
    getStore: () => storage.getStore()
};
