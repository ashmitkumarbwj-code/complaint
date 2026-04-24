let io;

module.exports = {
    init: (server) => {
        const { Server } = require('socket.io');

        // ─── Restrict CORS to the configured origin(s) ────────────────────────
        const frontendUrls = process.env.FRONTEND_URLS 
            ? process.env.FRONTEND_URLS.split(',').map(u => u.trim()) 
            : ['http://localhost:3000', 'https://smart-complaint-and-response-system.vercel.app'];

        const jwt = require('jsonwebtoken');
        const cookie = require('cookie');

        io = new Server(server, {
            cors: {
                origin: frontendUrls,
                methods: ['GET', 'POST'],
                credentials: true
            },
            pingInterval: 10000,
            pingTimeout: 20000
        });

        // 🛡️ SECURITY: Socket.io JWT Authentication Middleware
        io.use((socket, next) => {
            try {
                const cookies = cookie.parse(socket.handshake.headers.cookie || '');
                const token = cookies.accessToken;

                if (!token) {
                    // Phase 1: Allow anonymous guest connections for public dashboard updates
                    // We default to tenant_id 1 for anonymous users unless specified
                    socket.user = { id: 'anonymous', role: 'guest', tenant_id: 1 };
                    return next();
                }

                if (!process.env.JWT_SECRET) {
                    console.error('[Socket.io Auth] JWT_SECRET is missing!');
                    return next(new Error('Internal server error'));
                }

                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                socket.user = decoded.user; // Attach verified identity
                next();
            } catch (err) {
                console.error(`[Socket.io Auth] Authentication failed for ${socket.id}:`, err.message);
                // Allow anonymous fallback even on invalid token for public dashboards
                socket.user = { id: 'anonymous', role: 'guest', tenant_id: 1 };
                return next();
            }
        });

        io.on('connection', (socket) => {
            const user = socket.user;
            const normalizedRole = (user.role || '').toLowerCase().trim();
            const tenantId = user.tenant_id || 1;
            
            console.log(`[Socket.io] Connected: ${socket.id} | Role: ${normalizedRole} | Tenant: ${tenantId}`);

            // ─── Room-Based Isolation (Phase 1) ─────────────────────────────
            // Every socket joins a tenant-specific metrics room for stats signals
            socket.join(`tenant_${tenantId}_metrics`);

            // ─── Server-Assigned Private Room Joins (Secure) ─────────────────
            if (user.id !== 'anonymous') {
                socket.join(`user_${user.id}`);

                if (normalizedRole === 'student' && user.student_id) {
                    socket.join(`student_${user.student_id}`);
                } else if (normalizedRole === 'admin' || normalizedRole === 'principal') {
                    socket.join('admin');
                    if (normalizedRole === 'principal') socket.join('principal_room');
                } else if (user.department_id) {
                    socket.join(`dept_${user.department_id}`);
                }
            }

            socket.on('error', (err) => {
                console.error(`[Socket.io] Transport error on ${socket.id}:`, err.message);
            });

            socket.on('disconnect', (reason) => {
                console.log(`[Socket.io] Client disconnected: ${socket.id} (${reason})`);
            });
        });

        return io;
    },
    getIO: () => {
        if (!io) {
            throw new Error("Socket.io not initialized!");
        }
        return io;
    },
    /**
     * Phase 1: Refetch-on-Signal Broadcaster
     * Signals all clients in a tenant room that statistics have changed.
     */
    emitStatsChanged: (tenantId) => {
        if (io) {
            io.to(`tenant_${tenantId}_metrics`).emit('DASHBOARD_STATS_CHANGED');
            console.log(`[Socket.io] Emitted DASHBOARD_STATS_CHANGED for Tenant: ${tenantId}`);
        }
    },
    emitNewComplaint: (complaint) => {
        if (io) {
            // Emit to admin room
            io.to('admin').emit('new_complaint', complaint);
            // Also emit to the specific department room
            io.to(`dept_${complaint.department_id}`).emit('new_complaint', complaint);
        }
    },
    emitStatusUpdate: (complaintId, status, studentId, departmentId) => {
        if (io) {
            // Emit to the specific student
            io.to(`student_${studentId}`).emit('status_updated', { complaintId, status });
            
            // Notify the department room (for staff synchronization)
            if (departmentId) {
                io.to(`dept_${departmentId}`).emit('status_updated', { complaintId, status });
            }

            // Also notify admin stream
            io.to('admin').emit('status_updated', { complaintId, status });
        }
    },

    emitEmergencyAlert: (complaint) => {
        if (io) {
            // Emits specifically to the principal_room
            io.to('principal_room').emit('emergency_alert', {
                id: complaint.id,
                text: complaint.description,
                category: complaint.category,
                location: complaint.location,
                timestamp: new Date()
            });
            // Also notify general admin
            io.to('admin').emit('new_emergency_complaint', complaint);
        }
    }
};
