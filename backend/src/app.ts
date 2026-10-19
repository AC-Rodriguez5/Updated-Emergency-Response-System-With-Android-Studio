import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';

import { env } from './config/env.js';
import {
  requestId,
  errorHandler,
  notFoundHandler,
} from './shared/middleware/index.js';

import { authRoutes, captchaPageRoutes } from './modules/auth/index.js';
import {
  adminApprovalsRoutes,
  adminAuditRoutes,
  adminRespondersRoutes,
  adminAmbulanceUnitsRoutes,
  adminReportsRoutes,
  adminDevicesRoutes,
} from './modules/admin/index.js';
import { emergenciesRoutes, adminEmergenciesRoutes } from './modules/emergencies/index.js';
import {
  ambulanceUserRoutes,
  ambulanceAdminRoutes,
  ambulanceResponderRoutes,
} from './modules/ambulance/index.js';
import {
  bleDeviceRouter,
  bleEventRouter,
  iotEmergencyRouter,
  deviceEmergencyRouter,
} from './modules/ble/index.js';
import {
  locationsRouter,
  emergencyHistoryRouter,
  ambulanceHistoryRouter,
  respondersLiveRouter,
} from './modules/locations/index.js';
import { filesRoutes } from './modules/files/index.js';
import { notificationsRoutes } from './modules/notifications/index.js';
import alertRoutes from './routes/alerts.js';
import contactsRoutes from './routes/contacts.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(helmet());

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        const allowedOrigins = [...env.CORS_ORIGINS, 'http://localhost:5174', 'http://127.0.0.1:5174'];
        if (allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
      exposedHeaders: ['Authorization', 'set-cookie'],
    }),
  );

  app.use(express.json({ limit: env.BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: env.BODY_LIMIT }));
  app.use(mongoSanitize());

  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'MongoDB Atlas',
      requestId: req.requestId,
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/captcha', captchaPageRoutes);
  app.use('/api/admin', adminApprovalsRoutes);
  app.use('/api/admin', adminAuditRoutes);
  app.use('/api/admin', adminRespondersRoutes);
  app.use('/api/admin', adminAmbulanceUnitsRoutes);
  app.use('/api/admin', adminReportsRoutes);
  app.use('/api/admin', adminDevicesRoutes);
  app.use('/api/admin/emergencies', adminEmergenciesRoutes);
  app.use('/api/emergencies', emergenciesRoutes);
  app.use('/api/ambulance-requests', ambulanceUserRoutes);
  app.use('/api/admin/ambulance-requests', ambulanceAdminRoutes);
  app.use('/api/responder/ambulance-requests', ambulanceResponderRoutes);
  app.use('/api/user/ble-devices', bleDeviceRouter);
  app.use('/api/user/ble-events', bleEventRouter);
  app.use('/api/emergencies/from-iot', iotEmergencyRouter);
  app.use('/api/device/emergencies', deviceEmergencyRouter);
  app.use('/api/locations', locationsRouter);
  app.use('/api/emergencies', emergencyHistoryRouter);
  app.use('/api/ambulance-requests', ambulanceHistoryRouter);
  app.use('/api/responders', respondersLiveRouter);
  app.use('/api/files', filesRoutes);
  app.use('/api/admin/notifications', notificationsRoutes);
  app.use('/api/alerts', alertRoutes);
  app.use('/api/contacts', contactsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
