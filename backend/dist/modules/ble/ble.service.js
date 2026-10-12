import mongoose from 'mongoose';
import { createHash, randomBytes } from 'crypto';
import { AuditLog, BleDevice, Emergency, LocationSample, } from '../../models/index.js';
import { AppError } from '../../shared/middleware/errorHandler.js';
import { tanzaScope } from '../../shared/utils/tanza.js';
import { emitEmergencyEvent } from '../emergencies/events.js';
import { priorityFor, snapshotUser } from '../emergencies/emergencies.service.js';
const CLOSED_STATUSES = new Set([
    'resolved',
    'cancelled',
]);
export function deviceAck(emergency) {
    return {
        emergencyId: emergency._id.toString(),
        eventId: emergency.hardwareEventId,
        status: emergency.status,
        locationStatus: emergency.locationStatus ?? (emergency.currentLocation ? 'fixed' : 'pending'),
        revision: emergency.locationRevision ?? 0,
        tracking: emergency.trackingActive ?? false,
    };
}
export async function pairDevice(input, auth) {
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
        // Re-pairing re-provisions the device, so take the phone's declared intent
        // rather than resetting to false and waiting for the follow-up status PATCH.
        existing.directCellularEnabled = input.directCellularEnabled ?? false;
        existing.pairingStatus = 'paired';
        existing.pairedAt = new Date();
        existing.revokedAt = undefined;
        existing.revokedReason = undefined;
        existing.revokedBy = undefined;
        existing.lastSeenAt = new Date();
        await existing.save();
        const safe = existing.toObject();
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
        directCellularEnabled: input.directCellularEnabled ?? false,
        deviceTokenHash,
        tokenIssuedAt: new Date(),
        pairingStatus: 'paired',
        pairedAt: new Date(),
        lastSeenAt: new Date(),
    });
    const safe = device.toObject();
    delete safe.deviceTokenHash;
    return { ...safe, deviceToken };
}
export async function listDevices(auth) {
    return BleDevice.find({
        userId: new mongoose.Types.ObjectId(auth.accountId),
        pairingStatus: { $ne: 'revoked' },
    })
        .sort({ pairedAt: -1 })
        .lean();
}
export async function unpairDevice(deviceDocId, body, auth) {
    const device = await BleDevice.findById(deviceDocId);
    if (!device)
        throw new AppError('Device not found', 404, 'NOT_FOUND');
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
export async function updateDeviceStatus(deviceDocId, body, auth) {
    const device = await BleDevice.findOne({
        _id: deviceDocId,
        userId: new mongoose.Types.ObjectId(auth.accountId),
        pairingStatus: 'paired',
    });
    if (!device)
        throw new AppError('Device not found', 404, 'NOT_FOUND');
    if (body.fingerprintEnrolled !== undefined) {
        device.fingerprintEnrolled = body.fingerprintEnrolled;
    }
    if (body.directCellularEnabled !== undefined) {
        device.directCellularEnabled = body.directCellularEnabled;
    }
    if (body.firmwareVersion)
        device.firmwareVersion = body.firmwareVersion;
    device.lastSeenAt = new Date();
    await device.save();
    return device;
}
export async function processBleEvent(input, auth) {
    const device = await BleDevice.findOne({
        userId: new mongoose.Types.ObjectId(auth.accountId),
        deviceId: input.deviceId,
        pairingStatus: 'paired',
    });
    if (!device)
        throw new AppError('Device not found or not paired', 404, 'DEVICE_NOT_FOUND');
    device.lastSeenAt = new Date();
    if (input.batteryLevel !== undefined)
        device.batteryPercent = input.batteryLevel;
    if (input.firmwareVersion)
        device.firmwareVersion = input.firmwareVersion;
    if (input.switchState)
        device.switchState = input.switchState;
    if (input.rssi !== undefined)
        device.lastRssi = input.rssi;
    await device.save();
    return { acknowledged: true, deviceId: input.deviceId, eventId: input.eventId };
}
export async function createFromIot(input, auth, ctx) {
    const device = await BleDevice.findOne({
        userId: new mongoose.Types.ObjectId(auth.accountId),
        deviceId: input.deviceId,
        pairingStatus: 'paired',
    });
    if (!device) {
        throw new AppError('Device not found or not paired to your account', 403, 'DEVICE_NOT_PAIRED');
    }
    const idempotencyKey = `iot:${input.deviceId}:${input.eventId}:${auth.accountId}`;
    // A single press can reach here twice: once over BLE through the phone and once
    // over LTE straight from the modem. The second arrival must not raise a second
    // incident, but it should still be recorded as a delivery route.
    const duplicate = await Emergency.findOneAndUpdate({ idempotencyKey }, { $addToSet: { deliveryTransports: input.transport } }, { new: true });
    if (duplicate)
        return duplicate;
    if (input.location) {
        const locationAge = Date.now() - Date.parse(input.location.capturedAt);
        if (locationAge < -30_000 || locationAge > 24 * 60 * 60 * 1000) {
            throw new AppError('The hardware GNSS fix is outside the 24-hour delivery window', 400, 'EXPIRED_HARDWARE_EVENT');
        }
    }
    // No fix yet is the normal case for this device, not an error: the alert is sent
    // on the button press and the GNSS receiver is still searching. The incident is
    // filed without coordinates and the first fix fills them in.
    const scope = input.location
        ? tanzaScope(input.location.coordinates[0], input.location.coordinates[1])
        : { isInsideTanza: false, outsideScopeFlag: false };
    const userObjectId = new mongoose.Types.ObjectId(auth.accountId);
    // The incident carries a copy of the account's registered details, so the
    // dispatcher sees the same name, age, blood type, address and emergency contact
    // that the owner of this device registered with.
    const snapshot = await snapshotUser(auth.accountId);
    const now = new Date();
    let emergency;
    try {
        emergency = await Emergency.create({
            type: 'general_sos',
            source: 'iot_device',
            priority: priorityFor(input.buttonType),
            status: 'pending',
            userId: userObjectId,
            ...(input.location
                ? {
                    currentLocation: {
                        type: 'Point',
                        coordinates: input.location.coordinates,
                        accuracyMeters: input.location.accuracyMeters,
                        capturedAt: new Date(input.location.capturedAt),
                    },
                    locationStatus: 'fixed',
                    locationRevision: 1,
                    locationFirstFixAt: now,
                    lastLocationAt: now,
                }
                : { locationStatus: 'pending', locationRevision: 0 }),
            trackingActive: true,
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
            timeline: [
                { event: 'created', at: now, actorId: userObjectId, actorRole: 'user' },
                ...(input.location
                    ? []
                    : [
                        {
                            event: 'awaiting_gps',
                            at: now,
                            actorRole: 'system',
                            note: 'Hardware alert raised before a GNSS fix was available.',
                        },
                    ]),
            ],
        });
    }
    catch (error) {
        if (!(error instanceof mongoose.mongo.MongoServerError) || error.code !== 11000) {
            throw error;
        }
        const concurrentDuplicate = await Emergency.findOneAndUpdate({ idempotencyKey }, { $addToSet: { deliveryTransports: input.transport } }, { new: true });
        if (!concurrentDuplicate)
            throw error;
        return concurrentDuplicate;
    }
    if (input.location) {
        await recordLocationSample(emergency, userObjectId, input.location);
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
            locationStatus: emergency.locationStatus,
        },
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
    });
    emitEmergencyEvent(ctx.io, 'emergency.iot_device_created', emergency);
    return emergency;
}
async function recordLocationSample(emergency, userObjectId, location) {
    await LocationSample.create({
        emergencyId: emergency._id,
        actorId: userObjectId,
        actorType: 'user',
        location: { type: 'Point', coordinates: location.coordinates },
        accuracyMeters: location.accuracyMeters,
        capturedAt: new Date(location.capturedAt),
    });
}
/**
 * A GNSS fix streamed by the panic button while its incident is still open.
 *
 * The device has no idea whether a dispatcher has closed the incident, so it keeps
 * transmitting and relies on the reply: once `tracking` comes back false it stops.
 * That means a ping against a resolved incident is a normal, expected outcome and
 * must answer 200 with `tracking: false` rather than an error the firmware would
 * only retry.
 */
export async function recordDeviceLocation(input, auth, ctx) {
    const userObjectId = new mongoose.Types.ObjectId(auth.accountId);
    const device = await BleDevice.findOne({
        userId: userObjectId,
        deviceId: input.deviceId,
        pairingStatus: 'paired',
    });
    if (!device) {
        throw new AppError('Device not found or not paired to your account', 403, 'DEVICE_NOT_PAIRED');
    }
    const emergency = await Emergency.findOne({
        userId: userObjectId,
        sourceDeviceId: input.deviceId,
        hardwareEventId: input.eventId,
    });
    if (!emergency) {
        throw new AppError('No incident matches this device event', 404, 'HARDWARE_EVENT_NOT_FOUND');
    }
    device.lastSeenAt = new Date();
    device.lastTransport = input.transport;
    if (input.deviceBatteryAtTrigger !== undefined) {
        device.batteryPercent = input.deviceBatteryAtTrigger;
    }
    if (input.firmwareVersion)
        device.firmwareVersion = input.firmwareVersion;
    await device.save();
    if (CLOSED_STATUSES.has(emergency.status)) {
        if (emergency.trackingActive) {
            emergency.trackingActive = false;
            await emergency.save();
        }
        return emergency;
    }
    const capturedAt = new Date(input.location.capturedAt);
    // Cellular retries and the BLE queue can both replay an older fix after a newer
    // one already landed. Keep the newest position on the incident but still store
    // the sample, so the responder's breadcrumb trail stays complete.
    const isNewer = !emergency.currentLocation?.capturedAt ||
        capturedAt.getTime() > emergency.currentLocation.capturedAt.getTime();
    await recordLocationSample(emergency, userObjectId, input.location);
    if (isNewer) {
        const [lng, lat] = input.location.coordinates;
        const scope = tanzaScope(lng, lat);
        const firstFix = emergency.locationStatus === 'pending';
        emergency.currentLocation = {
            type: 'Point',
            coordinates: input.location.coordinates,
            accuracyMeters: input.location.accuracyMeters,
            capturedAt,
        };
        emergency.locationStatus = 'fixed';
        emergency.locationRevision = (emergency.locationRevision ?? 0) + 1;
        emergency.lastLocationAt = new Date();
        emergency.isInsideTanza = scope.isInsideTanza;
        emergency.outsideScopeFlag = scope.outsideScopeFlag;
        if (input.gnssHdop !== undefined)
            emergency.gnssHdop = input.gnssHdop;
        if (input.gnssSatellites !== undefined)
            emergency.gnssSatellites = input.gnssSatellites;
        if (!emergency.deliveryTransports?.includes(input.transport)) {
            emergency.deliveryTransports = [
                ...(emergency.deliveryTransports ?? []),
                input.transport,
            ];
        }
        if (firstFix) {
            emergency.locationFirstFixAt = new Date();
            emergency.timeline.push({
                event: 'gps_first_fix',
                at: new Date(),
                actorRole: 'system',
                note: `Hardware GNSS fix received ${Math.round((Date.now() - emergency.createdAt.getTime()) / 1000)}s after the alert.`,
            });
        }
        await emergency.save();
        emitEmergencyEvent(ctx.io, 'emergency.location_updated', emergency);
    }
    return emergency;
}
