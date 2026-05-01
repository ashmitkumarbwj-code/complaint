let io;

module.exports = {
    init: (server) => {
        const { Server } = require('socket.io');

        // ─── Restrict CORS to the configured origin(s) ────────────────────────
        const frontendUrls = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URLS)
            ? (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URLS).split(',').map(u => u.trim())
            : (process.env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://localhost:5000'] : []);

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

                // [FIX C3] No token → anonymous public session only (no tenant assignment)
                if (!token) {
                    socket.user = null; // Explicitly null — no tenant context
                    socket.isAuthenticated = false;
                    return next();
                }

                if (!process.env.JWT_SECRET) {
                    console.error('[Socket.io Auth] JWT_SECRET is missing!');
                    return next(new Error('Internal server error'));
                }

                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                socket.user = decoded.user; // Attach verified identity
                socket.isAuthenticated = true;
                next();
            } catch (err) {
                // [FIX C3] Invalid/expired token → anonymous public session only.
                // Do NOT fall back to tenant_id=1. This prevents cross-tenant data leaks.
                console.warn(`[Socket.io Auth] Token invalid for ${socket.id}: ${err.message} — downgrading to public session.`);
                socket.user = null;
                socket.isAuthenticated = false;
                return next(); // Allow connection for public dashboard pages only
            }
        });

        io.on('connection', (socket) => {
            const isAuth = socket.isAuthenticated;
            const user = socket.user;

            if (!isAuth || !user) {
                // ── Anonymous / Public Session ──────────────────────────────────
                // Only joins the non-sensitive public_metrics room.
                // Receives only general system-wide signals — no complaint IDs,
                // no role events, no tenant-specific private data.
                socket.join('public_metrics');
                console.log(`[Socket.io] Public connection: ${socket.id} → room: public_metrics`);

                socket.on('error', (err) => {
                    console.error(`[Socket.io] Transport error on public ${socket.id}:`, err.message);
                });
                socket.on('disconnect', (reason) => {
                    console.log(`[Socket.io] Public client disconnected: ${socket.id} (${reason})`);
                });
                return; // Stop here — no tenant or role rooms for unauthenticated users
            }

            // ── Authenticated Session ───────────────────────────────────────────
            const normalizedRole = (user.role || '').toLowerCase().trim();
            const tenantId = user.tenant_id;

            if (!tenantId) {
                // Defensive: authenticated but no tenant context (should not happen)
                console.error(`[Socket.io] Authenticated user ${socket.id} missing tenant_id — closing.`);
                socket.disconnect(true);
                return;
            }

            console.log(`[Socket.io] Authenticated: ${socket.id} | Role: ${normalizedRole} | Tenant: ${tenantId}`);

            // ─── Tenant-Scoped Metrics Room ──────────────────────────────────
            socket.join(`tenant_${tenantId}_metrics`);

            // ─── Private User Room ───────────────────────────────────────────
            socket.join(`user_${user.id}`);

            // ─── Role-Specific Rooms ─────────────────────────────────────────
            if (normalizedRole === 'student' && user.student_id) {
                socket.join(`student_${user.student_id}`);
            } else if (normalizedRole === 'admin' || normalizedRole === 'principal') {
                socket.join('admin');
                if (normalizedRole === 'principal') socket.join('principal_room');
            } else if (user.department_id) {
                socket.join(`dept_${user.department_id}`);
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
     * Emit to authenticated tenant room (private dashboard stats).
     * Also emits to public_metrics for non-sensitive signals.
     */
    emitStatsChanged: (tenantId) => {
        if (io) {
            io.to(`tenant_${tenantId}_metrics`).emit('DASHBOARD_STATS_CHANGED');
            // Public room gets a generic signal — no tenant ID or complaint data exposed
            io.to('public_metrics').emit('PUBLIC_STATS_CHANGED');
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

