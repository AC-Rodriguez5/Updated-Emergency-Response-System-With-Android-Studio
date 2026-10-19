import { createServer } from 'http';
import { Server } from 'socket.io';
import { env } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { createApp } from './app.js';
import { seedAdmin } from './seed/admin.js';
import { seedAmbulanceUnits } from './seed/ambulanceUnits.js';
import { verifyAccessToken } from './modules/auth/jwt.js';
import { Responder } from './models/index.js';
import { emergencyTypesForResponder } from './modules/emergencies/responderRoleAccess.js';
import { startDispatchWatchdog } from './modules/emergencies/dispatch.watchdog.js';
async function autoJoinRooms(socket, auth) {
    const { accountId, role } = auth;
    if (role === 'user')
        socket.join(`user:${accountId}`);
    if (role === 'responder') {
        socket.join(`responder:${accountId}`);
        const responder = await Responder.findById(accountId)
            .select('responderRole department agencyType')
            .lean();
        if (responder) {
            const types = emergencyTypesForResponder(responder);
            const feedTypes = types.length > 0
                ? types
                : ['medical', 'fire', 'crime', 'general_sos'];
            for (const type of feedTypes) {
                socket.join(`responder-feed:${type}`);
            }
        }
    }
    if (role === 'admin')
        socket.join('admin:live');
}
async function bootstrap() {
    await connectDatabase();
    await seedAdmin();
    await seedAmbulanceUnits();
    const app = createApp();
    const httpServer = createServer(app);
    const localDevOrigins = [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5174',
    ];
    const socketCorsOrigins = Array.from(new Set([...env.CORS_ORIGINS, ...localDevOrigins]));
    const io = new Server(httpServer, {
        cors: {
            origin: socketCorsOrigins,
            methods: ['GET', 'POST', 'PATCH', 'DELETE'],
            credentials: true,
        },
    });
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token ??
            socket.handshake.query?.token;
        if (typeof token !== 'string' || !token)
            return next();
        try {
            const claims = verifyAccessToken(token);
            socket.data.auth = {
                accountId: claims.sub,
                email: claims.email,
                role: claims.role,
            };
            next();
        }
        catch {
            next();
        }
    });
    app.set('io', io);
    startDispatchWatchdog(io);
    io.on('connection', (socket) => {
        const auth = socket.data.auth;
        if (auth) {
            autoJoinRooms(socket, auth).catch((err) => {
                console.error('Failed to join socket rooms:', err);
            });
        }
        socket.on('join:emergency', (emergencyId) => {
            if (typeof emergencyId === 'string' && /^[a-f\d]{24}$/i.test(emergencyId)) {
                socket.join(`emergency:${emergencyId}`);
            }
        });
        socket.on('leave:emergency', (emergencyId) => {
            if (typeof emergencyId === 'string') {
                socket.leave(`emergency:${emergencyId}`);
            }
        });
        socket.on('join', (data) => {
            socket.join(data.type);
            socket.join(data.id);
        });
        socket.on('responderLocation', (data) => {
            io.to('user').emit('responderLocationUpdate', data);
        });
        socket.on('alert:refresh', (data) => {
            io.emit('alert:updated', data);
        });
        socket.on('disconnect', () => {
            console.log(`Socket disconnected: ${socket.id}`);
        });
    });
    httpServer.listen(env.PORT, '0.0.0.0', () => {
        console.log(`Server running on http://0.0.0.0:${env.PORT}`);
        console.log(`Local: http://localhost:${env.PORT}`);
        console.log(`Env: ${env.NODE_ENV}`);
    });
    const shutdown = (signal) => {
        console.log(`Received ${signal}, shutting down...`);
        httpServer.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}
bootstrap().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
