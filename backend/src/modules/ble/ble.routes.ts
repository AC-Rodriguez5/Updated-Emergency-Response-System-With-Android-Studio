import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Server as SocketServer } from 'socket.io';
import {
  authGuard,
  emergencyCreateLimiter,
  roleGuard,
  validateRequest,
} from '../../shared/middleware/index.js';
import { AppError } from '../../shared/middleware/errorHandler.js';
import {
  bleEventSchema,
  deviceStatusSchema,
  fromIotSchema,
  idParamSchema,
  pairDeviceSchema,
  unpairBodySchema,
  type BleEventInput,
  type DeviceStatusInput,
  type FromIotInput,
  type IdParam,
  type PairDeviceInput,
  type UnpairBody,
} from './ble.schemas.js';
import * as svc from './ble.service.js';
import { deviceAuthGuard } from './deviceAuth.js';

export const bleDeviceRouter = Router();
export const bleEventRouter = Router();
export const iotEmergencyRouter = Router();
export const deviceEmergencyRouter = Router();

bleDeviceRouter.use(authGuard, roleGuard('user'));
bleEventRouter.use(authGuard, roleGuard('user'));
iotEmergencyRouter.use(authGuard, roleGuard('user'));
deviceEmergencyRouter.use(deviceAuthGuard);

function ctx(req: Request) {
  return {
    io: req.app.get('io') as SocketServer | undefined,
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.header('user-agent') ?? undefined,
  };
}

bleDeviceRouter.post(
  '/pair',
  validateRequest({ body: pairDeviceSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await svc.pairDevice(req.validated!.body as PairDeviceInput, req.auth!);
      res.status(201).json({ data });
    } catch (err) { next(err); }
  },
);

bleDeviceRouter.patch(
  '/:id/status',
  validateRequest({ params: idParamSchema, body: deviceStatusSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await svc.updateDeviceStatus(
        (req.validated!.params as IdParam).id,
        req.validated!.body as DeviceStatusInput,
        req.auth!,
      );
      res.json({ data });
    } catch (err) { next(err); }
  },
);

bleDeviceRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await svc.listDevices(req.auth!);
      res.json({ data });
    } catch (err) { next(err); }
  },
);

bleDeviceRouter.post(
  '/:id/unpair',
  validateRequest({ params: idParamSchema, body: unpairBodySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await svc.unpairDevice(
        (req.validated!.params as IdParam).id,
        req.validated!.body as UnpairBody,
        req.auth!,
      );
      res.json({ data });
    } catch (err) { next(err); }
  },
);

bleEventRouter.post(
  '/',
  validateRequest({ body: bleEventSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await svc.processBleEvent(req.validated!.body as BleEventInput, req.auth!);
      res.json({ data });
    } catch (err) { next(err); }
  },
);

iotEmergencyRouter.post(
  '/',
  emergencyCreateLimiter,
  validateRequest({ body: fromIotSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.validated!.body as FromIotInput;
      if (input.transport !== 'ble') {
        throw new AppError('Phone-delivered device events require BLE transport', 400, 'INVALID_TRANSPORT');
      }
      const data = await svc.createFromIot(input, req.auth!, ctx(req));
      res.status(201).json({ data });
    } catch (err) { next(err); }
  },
);

deviceEmergencyRouter.post(
  '/',
  emergencyCreateLimiter,
  validateRequest({ body: fromIotSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.validated!.body as FromIotInput;
      const headerDeviceId = req.header('x-device-id');
      if (input.transport !== 'lte' || (headerDeviceId && headerDeviceId !== input.deviceId)) {
        throw new AppError('Authenticated LTE device does not match the payload', 400, 'DEVICE_ID_MISMATCH');
      }
      const data = await svc.createFromIot(input, req.auth!, ctx(req));
      res.status(201).json({ data });
    } catch (err) { next(err); }
  },
);
