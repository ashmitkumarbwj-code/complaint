const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    // 1. Get token from Cookie (Priority - Secure)
    // 2. Fallback to Authorization Header (Bearer <token>)
    let token = req.cookies?.accessToken;

    if (!token) {
        const authHeader = req.header('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }
    }
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'No token, authorization denied' });
    }

    try {
        if (!process.env.JWT_SECRET) {
            console.error('[CRITICAL SECURITY ERROR] JWT_SECRET is not defined in environment variables. Refusing to verify token.');
            return res.status(500).json({ success: false, message: 'Internal Server Configuration Error' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user;
        
        // Update tracing context if available
        if (req.updateTraceContext) {
            req.updateTraceContext(decoded.user);
        }

        next();
    } catch (err) {
        console.warn(`[Auth Middleware] Token verification failed: ${err.message} (Token: ${token.substring(0, 10)}...)`);
        res.status(401).json({ success: false, message: 'Token is not valid' });
    }
};
