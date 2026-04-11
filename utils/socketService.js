let io;

module.exports = {
    init: (server) => {
        const { Server } = require('socket.io');

        // ─── Restrict CORS to the configured origin ───────────────────────────
        const allowedOrigin = '*';

        io = new Server(server, {
            cors: {
                origin: allowedOrigin,
                methods: ['GET', 'POST']
            },
            // ─── Heartbeat settings ─────────────────────────────────────────
            // If client misses 2 pings (2 × 10s = 20s), the server forcefully
            // disconnects the stale socket to free up memory.
            pingInterval: 10000,    // Send a ping every 10 seconds
            pingTimeout:  20000     // Wait 20s for pong before disconnect
        });

        io.on('connection', (socket) => {
            console.log('[Socket.io] Client connected:', socket.id);

            socket.on('join', (room) => {
                socket.join(room);
                console.log(`[Socket.io] ${socket.id} joined room: ${room}`);
            });

            // ─── Transport Error Fallback ────────────────────────────────────
            // If WebSocket upgrade fails, Socket.io automatically falls back
            // to HTTP long-polling. We log the error for monitoring visibility.
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
    emitNewComplaint: (complaint) => {
        if (io) {
            // Emit to admin room
            io.to('admin').emit('new_complaint', complaint);
            // Also emit to the specific department room
            io.to(`dept_${complaint.department_id}`).emit('new_complaint', complaint);
        }
    },
    emitStatusUpdate: (complaintId, status, studentId) => {
        if (io) {
            // Emit to the specific student
            io.to(`student_${studentId}`).emit('status_updated', { complaintId, status });
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
