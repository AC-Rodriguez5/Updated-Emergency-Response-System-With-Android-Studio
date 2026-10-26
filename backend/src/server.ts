import { createServer } from 'http';
import { Server, type Socket } from 'socket.io';

import { env } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { createApp } from './app.js';
import { seedAdmin } from './seed/admin.js';
import { seedAmbulanceUnits } from './seed/ambulanceUnits.js';
import { verifyAccessToken } from './modules/auth/jwt.js';
import type { AuthContext, AuthRole } from './shared/types/http.js';
import { Responder } from './models/index.js';
import {
  RESPONDER_BROADCAST_ROOM,
  emergencyTypesForResponder,
} from './modules/emergencies/responderRoleAccess.js';
import { canSubscribeToEmergency } from './modules/emergencies/emergencies.service.js';
import { startDispatchWatchdog } from './modules/emergencies/dispatch.watchdog.js';
import { startRetentionSweep } from './modules/retention/index.js';

interface SocketData {
  auth?: AuthContext;
}

async function autoJoinRooms(socket: Socket & { data: SocketData }, auth: AuthContext): Promise<void> {
  const { accountId, role } = auth;
  if (role === 'user') socket.join(`user:${accountId}`);
  if (role === 'responder') {
    socket.join(`responder:${accountId}`);
    // Joined before the role lookup, and regardless of its outcome: an
    // untriaged panic-button press has to reach a responder whose role covers
    // nothing in particular as surely as one whose role covers everything.
    socket.join(RESPONDER_BROADCAST_ROOM);
    const responder = await Responder.findById(accountId)
      .select('responderRole department agencyType')
      .lean();
    if (responder) {
      const types = emergencyTypesForResponder(responder);
      const feedTypes = types.length > 0
        ? types
        : (['medical', 'fire', 'crime', 'general_sos'] as const);
      for (const type of feedTypes) {
        socket.join(`responder-feed:${type}`);
      }
    }
  }
  if (role === 'admin') socket.join('admin:live');
}

async function bootstrap(): Promise<void> {
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

  /*
    A socket with no valid token is refused outright.

    It used to be waved through unauthenticated — it joined no rooms, which read
    as safe, but the handlers below were happy to take instructions from it. An
    anonymous client has nothing legitimate to do on this namespace, so the
    cheapest correct answer is not to have one.

    Clients now see `connect_error` and show themselves as offline, which is
    also an improvement: an expired token used to produce a socket that looked
    connected and delivered nothing.
  */
  io.use((socket, next) => {
    const token =
      (socket.handshake.auth as Record<string, unknown>)?.token ??
      socket.handshake.query?.token;
    if (typeof token !== 'string' || !token) {
      next(new Error('UNAUTHENTICATED'));
      return;
    }
    try {
      const claims = verifyAccessToken(token);
      (socket.data as SocketData).auth = {
        accountId: claims.sub,
        email: claims.email,
        role: claims.role as AuthRole,
      };
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  app.set('io', io);
  startDispatchWatchdog(io);
  startRetentionSweep();

  io.on('connection', (socket: Socket & { data: SocketData }) => {
    // Guaranteed by the handshake check above.
    const auth = socket.data.auth!;
    autoJoinRooms(socket, auth).catch((err) => {
      console.error('Failed to join socket rooms:', err);
    });

    // Enough for a session's worth of honest subscriptions, far too few to
    // sweep ObjectIds looking for incidents that are not yours.
    let joinBudget = 60;

    socket.on('join:emergency', (emergencyId: unknown) => {
      if (typeof emergencyId !== 'string' || !/^[a-f\d]{24}$/i.test(emergencyId)) {
        return;
      }
      if (joinBudget <= 0) return;
      joinBudget -= 1;

      canSubscribeToEmergency(auth, emergencyId)
        .then((allowed) => {
          if (allowed) socket.join(`emergency:${emergencyId}`);
        })
        .catch((err) => {
          console.error('join:emergency check failed:', err);
        });
    });

    socket.on('leave:emergency', (emergencyId: unknown) => {
      if (typeof emergencyId === 'string') {
        socket.leave(`emergency:${emergencyId}`);
      }
    });

    /*
      Removed with this change: `join`, which joined any room a caller named and
      so handed out `admin:live`; `alert:refresh`, which re-broadcast arbitrary
      payloads to every connected client; and `responderLocation`, a relay into
      a room called `user`. None of the three apps emitted any of them.
    */

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  httpServer.listen(env.PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${env.PORT}`);
    console.log(`Local: http://localhost:${env.PORT}`);
    console.log(`Env: ${env.NODE_ENV}`);
  });

  const shutdown = (signal: string): void => {
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
