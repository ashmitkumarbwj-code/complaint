module.exports = (roles) => {
    return (req, res, next) => {
        // Standardize input roles to lowercase for comparison
        const allowedRoles = roles.map(r => r.toLowerCase());
        const userRole = (req.user && req.user.role) ? req.user.role.toLowerCase() : null;

        if (!userRole || !allowedRoles.includes(userRole)) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access Denied: You do not have permission to perform this action' 
            });
        }
        next();
    };
};
