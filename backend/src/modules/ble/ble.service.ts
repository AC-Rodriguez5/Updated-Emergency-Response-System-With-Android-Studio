import mongoose from 'mongoose';
import { createHash, randomBytes } from 'crypto';
import type { Server as SocketServer } from 'socket.io';
import { AuditLog, BleDevice, Emergency } from '../../models/index.js';
import { AppError } from '../../shared/middleware/errorHandler.js';
import { tanzaScope } from '../../shared/utils/tanza.js';
import type { AuthContext } from '../../shared/types/http.js';
import { emitEmergencyEvent } from '../emergencies/events.js';
import { priorityFor, snapshotUser } from '../emergencies/emergencies.service.js';
import type {
  BleEventInput,
  DeviceStatusInput,
  FromIotInput,
  PairDeviceInput,
  UnpairBody,
} from './ble.schemas.js';

interface ServiceCtx {
  io?: SocketServer;
  requestId?: string;
  ip?: string;
  userAgent?: string;
}

export async function pairDevice(input: PairDeviceInput, auth: AuthContext) {
  const existing = await BleDevice.findOne({ deviceId: input.deviceId });
  if (existing && existing.userId.toString() !== auth.accountId) {
    throw new AppError('Device already paired to another account', 409, 'DEVICE_TAKEN');
  }
  const deviceToken = randomBytes(32).toString('base64url');
  const deviceTokenHash = createHash('sha256').update(deviceToken).digest('hex');
  if (existing) {
    existing.bleServiceUuid = input.bleServiceUuid ?? existing.bleServiceUuid;
    existing.firmwareVersion = input.firmwareVersion ?? existing.firmwareVersion;
    existing.batteryPercent = input.batteryPercent ?? existing.batteryPercent;
    existing.fingerprintEnrolled =
      input.fingerprintEnrolled ?? existing.fingerprintEnrolled;
    existing.hardwareProfile = 'fingerprint_gnss_lte';
    existing.deviceTokenHash = deviceTokenHash;
    existing.tokenIssuedAt = new Date();
    existing.directCellularEnabled = false;
    existing.pairingStatus = 'paired';
    existing.pairedAt = new Date();
    existing.revokedAt = undefined;
    existing.revokedReason = undefined;
    existing.revokedBy = undefined;
    existing.lastSeenAt = new Date();
    await existing.save();
    const safe = existing.toObject() as unknown as Record<string, unknown>;
    delete safe.deviceTokenHash;
    return { ...safe, deviceToken };
  }
  const device = await BleDevice.create({
    userId: new mongoose.Types.ObjectId(auth.accountId),
    deviceId: input.deviceId,
    bleServiceUuid: input.bleServiceUuid,
    firmwareVersion: input.firmwareVersion,
    batteryPercent: input.batteryPercent,
    hardwareProfile: 'fingerprint_gnss_lte',
    fingerprintEnrolled: input.fingerprintEnrolled ?? false,
    directCellularEnabled: false,
    deviceTokenHash,
    tokenIssuedAt: new Date(),
    pairingStatus: 'paired',
    pairedAt: new Date(),
    lastSeenAt: new Date(),
  });
  const safe = device.toObject() as unknown as Record<string, unknown>;
  delete safe.deviceTokenHash;
  return { ...safe, deviceToken };
}

export async function listDevices(auth: AuthContext) {
  return BleDevice.find({
    userId: new mongoose.Types.ObjectId(auth.accountId),
    pairingStatus: { $ne: 'revoked' },
  })
    .sort({ pairedAt: -1 })
    .lean();
}

export async function unpairDevice(
  deviceDocId: string,
  body: UnpairBody,
  auth: AuthContext,
) {
  const device = await BleDevice.findById(deviceDocId);
  if (!device) throw new AppError('Device not found', 404, 'NOT_FOUND');
  if (device.userId.toString() !== auth.accountId) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  if (device.pairingStatus === 'revoked') {
    throw new AppError('Device already unpaired', 409, 'ALREADY_REVOKED');
  }
  device.pairingStatus = 'revoked';
  device.revokedAt = new Date();
  device.revokedBy = new mongoose.Types.ObjectId(auth.accountId);
  device.revokedReason = body.reason;
  device.directCellularEnabled = false;
  device.deviceTokenHash = undefined;
  device.tokenIssuedAt = undefined;
  await device.save();
  return device;
}

export async function updateDeviceStatus(
  deviceDocId: string,
  body: DeviceStatusInput,
  auth: AuthContext,
) {
  const device = await BleDevice.findOne({
    _id: deviceDocId,
    userId: new mongoose.Types.ObjectId(auth.accountId),
    pairingStatus: 'paired',
  });
  if (!device) throw new AppError('Device not found', 404, 'NOT_FOUND');
  if (body.fingerprintEnrolled !== undefined) {
    device.fingerprintEnrolled = body.fingerprintEnrolled;
  }
  if (body.directCellularEnabled !== undefined) {
    device.directCellularEnabled = body.directCellularEnabled;
  }
  if (body.firmwareVersion) device.firmwareVersion = body.firmwareVersion;
  device.lastSeenAt = new Date();
  await device.save();
  return device;
}

export async function processBleEvent(input: BleEventInput, auth: AuthContext) {
  const device = await BleDevice.findOne({
    userId: new mongoose.Types.ObjectId(auth.accountId),
    deviceId: input.deviceId,
    pairingStatus: 'paired',
  });
  if (!device) throw new AppError('Device not found or not paired', 404, 'DEVICE_NOT_FOUND');

  device.lastSeenAt = new Date();
  if (input.batteryLevel !== undefined) device.batteryPercent = input.batteryLevel;
  if (input.firmwareVersion) device.firmwareVersion = input.firmwareVersion;
  if (input.switchState) device.switchState = input.switchState;
  if (input.rssi !== undefined) device.lastRssi = input.rssi;
  await device.save();

  return { acknowledged: true, deviceId: input.deviceId, eventId: input.eventId };
}

export async function createFromIot(
  input: FromIotInput,
  auth: AuthContext,
  ctx: ServiceCtx,
) {
  const device = await BleDevice.findOne({
    userId: new mongoose.Types.ObjectId(auth.accountId),
    deviceId: input.deviceId,
    pairingStatus: 'paired',
  });
  if (!device) {
    throw new AppError('Device not found or not paired to your account', 403, 'DEVICE_NOT_PAIRED');
  }

  const idempotencyKey = `iot:${input.deviceId}:${input.eventId}:${auth.accountId}`;
  const duplicate = await Emergency.findOne({ idempotencyKey }).lean();
  if (duplicate) {
    await Emergency.updateOne(
      { _id: duplicate._id },
      { $addToSet: { deliveryTransports: input.transport } },
    );
    return { ...duplicate, deliveryTransports: Array.from(new Set([
      ...(duplicate.deliveryTransports ?? []),
      input.transport,
    ])) };
  }

  const locationAge = Date.now() - Date.parse(input.location.capturedAt);
  if (locationAge < -30_000 || locationAge > 24 * 60 * 60 * 1000) {
    throw new AppError(
      'The hardware GNSS fix is outside the 24-hour delivery window',
      400,
      'EXPIRED_HARDWARE_EVENT',
    );
  }

  const [lng, lat] = input.location.coordinates;
  const scope = tanzaScope(lng, lat);
  const userObjectId = new mongoose.Types.ObjectId(auth.accountId);
  const snapshot = await snapshotUser(auth.accountId);

  let emergency;
  try {
    emergency = await Emergency.create({
      type: 'general_sos',
      source: 'iot_device',
      priority: priorityFor(input.buttonType),
      status: 'pending',
      userId: userObjectId,
      currentLocation: {
        type: 'Point',
        coordinates: input.location.coordinates,
        accuracyMeters: input.location.accuracyMeters,
        capturedAt: new Date(input.location.capturedAt),
      },
      isInsideTanza: scope.isInsideTanza,
      outsideScopeFlag: scope.outsideScopeFlag,
      barangay: input.barangay,
      municipality: 'Tanza',
      bleEventId: input.eventId,
      hardwareEventId: input.eventId,
      sourceDeviceId: input.deviceId,
      buttonType: 'general_sos',
      deviceBatteryAtTrigger: input.deviceBatteryAtTrigger,
      hardwareAuthMethod: 'fingerprint',
      gnssHdop: input.gnssHdop,
      gnssSatellites: input.gnssSatellites,
      deliveryTransports: [input.transport],
      idempotencyKey,
      notes: input.notes,
      userSnapshot: snapshot,
      timeline: [{ event: 'created', at: new Date(), actorId: userObjectId, actorRole: 'user' }],
    });
  } catch (error) {
    if (!(error instanceof mongoose.mongo.MongoServerError) || error.code !== 11000) {
      throw error;
    }
    const concurrentDuplicate = await Emergency.findOneAndUpdate(
      { idempotencyKey },
      { $addToSet: { deliveryTransports: input.transport } },
      { new: true },
    );
    if (!concurrentDuplicate) throw error;
    return concurrentDuplicate;
  }

  device.lastSeenAt = new Date();
  device.lastTransport = input.transport;
  if (input.deviceBatteryAtTrigger !== undefined) {
    device.batteryPercent = input.deviceBatteryAtTrigger;
  }
  await device.save();

  await AuditLog.create({
    actorId: userObjectId,
    actorRole: 'user',
    action: 'emergency.iot_device_created',
    targetType: 'emergency',
    targetId: emergency._id,
    meta: {
      deviceId: input.deviceId,
      eventId: input.eventId,
      buttonType: 'general_sos',
      transport: input.transport,
      outsideScopeFlag: scope.outsideScopeFlag,
    },
    requestId: ctx.requestId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  emitEmergencyEvent(ctx.io, 'emergency.iot_device_created', emergency);
  return emergency;
}
