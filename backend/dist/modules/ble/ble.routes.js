import { Router } from 'express';
import { authGuard, deviceLocationLimiter, emergencyCreateLimiter, roleGuard, validateRequest, } from '../../shared/middleware/index.js';
import { AppError } from '../../shared/middleware/errorHandler.js';
import { bleEventSchema, deviceLocationSchema, deviceStatusSchema, fromIotSchema, idParamSchema, pairDeviceSchema, unpairBodySchema, } from './ble.schemas.js';
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
function ctx(req) {
    return {
        io: req.app.get('io'),
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.header('user-agent') ?? undefined,
    };
}
bleDeviceRouter.post('/pair', validateRequest({ body: pairDeviceSchema }), async (req, res, next) => {
    try {
        const data = await svc.pairDevice(req.validated.body, req.auth);
        res.status(201).json({ data });
    }
    catch (err) {
        next(err);
    }
});
bleDeviceRouter.patch('/:id/status', validateRequest({ params: idParamSchema, body: deviceStatusSchema }), async (req, res, next) => {
    try {
        const data = await svc.updateDeviceStatus(req.validated.params.id, req.validated.body, req.auth);
        res.json({ data });
    }
    catch (err) {
        next(err);
    }
});
bleDeviceRouter.get('/', async (req, res, next) => {
    try {
        const data = await svc.listDevices(req.auth);
        res.json({ data });
    }
    catch (err) {
        next(err);
    }
});
bleDeviceRouter.post('/:id/unpair', validateRequest({ params: idParamSchema, body: unpairBodySchema }), async (req, res, next) => {
    try {
        const data = await svc.unpairDevice(req.validated.params.id, req.validated.body, req.auth);
        res.json({ data });
    }
    catch (err) {
        next(err);
    }
});
bleEventRouter.post('/', validateRequest({ body: bleEventSchema }), async (req, res, next) => {
    try {
        const data = await svc.processBleEvent(req.validated.body, req.auth);
        res.json({ data });
    }
    catch (err) {
        next(err);
    }
});
iotEmergencyRouter.post('/', emergencyCreateLimiter, validateRequest({ body: fromIotSchema }), async (req, res, next) => {
    try {
        const input = req.validated.body;
        if (input.transport !== 'ble') {
            throw new AppError('Phone-delivered device events require BLE transport', 400, 'INVALID_TRANSPORT');
        }
        const data = await svc.createFromIot(input, req.auth, ctx(req));
        res.status(201).json({ data });
    }
    catch (err) {
        next(err);
    }
});
// The phone relays the fixes it receives over BLE while the wearable has no
// cellular path of its own. It gets the full incident back because the app renders
// it; the hardware's own route below gets the compact ack instead.
iotEmergencyRouter.post('/location', deviceLocationLimiter, validateRequest({ body: deviceLocationSchema }), async (req, res, next) => {
    try {
        const input = req.validated.body;
        if (input.transport !== 'ble') {
            throw new AppError('Phone-delivered device events require BLE transport', 400, 'INVALID_TRANSPORT');
        }
        const emergency = await svc.recordDeviceLocation(input, req.auth, ctx(req));
        res.json({ data: emergency, ack: svc.deviceAck(emergency) });
    }
    catch (err) {
        next(err);
    }
});
function assertDeviceMatchesPayload(req, deviceId, transport) {
    const headerDeviceId = req.header('x-device-id');
    if (transport !== 'lte' || (headerDeviceId && headerDeviceId !== deviceId)) {
        throw new AppError('Authenticated LTE device does not match the payload', 400, 'DEVICE_ID_MISMATCH');
    }
}
deviceEmergencyRouter.post('/', emergencyCreateLimiter, validateRequest({ body: fromIotSchema }), async (req, res, next) => {
    try {
        const input = req.validated.body;
        assertDeviceMatchesPayload(req, input.deviceId, input.transport);
        const emergency = await svc.createFromIot(input, req.auth, ctx(req));
        res.status(201).json({ data: svc.deviceAck(emergency) });
    }
    catch (err) {
        next(err);
    }
});
// The firmware posts here every few seconds until `tracking` comes back false.
// A fix for an already-closed incident is the expected way that stream ends, so
// this answers 200 with tracking: false rather than an error the device would retry.
deviceEmergencyRouter.post('/location', deviceLocationLimiter, validateRequest({ body: deviceLocationSchema }), async (req, res, next) => {
    try {
        const input = req.validated.body;
        assertDeviceMatchesPayload(req, input.deviceId, input.transport);
        const emergency = await svc.recordDeviceLocation(input, req.auth, ctx(req));
        res.json({ data: svc.deviceAck(emergency) });
    }
    catch (err) {
        next(err);
    }
});
