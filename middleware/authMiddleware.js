const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
        return res.status(401).json({ success: false, message: 'No token, authorization denied' });
    }

    // Header format: Bearer <token>
    const tokenParts = authHeader.split(' ');
    if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
        return res.status(401).json({ success: false, message: 'Auth format should be Bearer <token>' });
    }

    const token = tokenParts[1];

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
