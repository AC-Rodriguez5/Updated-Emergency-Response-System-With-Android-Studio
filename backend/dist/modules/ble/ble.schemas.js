import { z } from 'zod';
export const pairDeviceSchema = z
    .object({
    deviceId: z.string().trim().min(1).max(100),
    bleServiceUuid: z.string().trim().max(80).optional(),
    firmwareVersion: z.string().trim().max(40).optional(),
    batteryPercent: z.number().min(0).max(100).optional(),
    fingerprintEnrolled: z.boolean().optional(),
})
    .strict();
export const idParamSchema = z
    .object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId') })
    .strict();
export const unpairBodySchema = z
    .object({ reason: z.string().trim().max(250).optional() })
    .strict();
export const deviceStatusSchema = z
    .object({
    fingerprintEnrolled: z.boolean().optional(),
    directCellularEnabled: z.boolean().optional(),
    firmwareVersion: z.string().trim().max(40).optional(),
})
    .strict()
    .refine((value) => Object.keys(value).length > 0, 'Provide at least one status field');
export const bleEventSchema = z
    .object({
    deviceId: z.string().trim().min(1).max(100),
    eventId: z.string().trim().min(1).max(100),
    buttonType: z.enum(['medical', 'crime', 'fire', 'general_sos']).optional(),
    batteryLevel: z.number().min(0).max(100).optional(),
    firmwareVersion: z.string().trim().max(40).optional(),
    switchState: z.enum(['on', 'off']).optional(),
    deviceTimestamp: z.string().datetime().optional(),
    rssi: z.number().min(-200).max(0).optional(),
})
    .strict();
const geoPointSchema = z
    .object({
    type: z.literal('Point'),
    coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
    accuracyMeters: z.number().min(0).max(5000).optional(),
    capturedAt: z.string().datetime(),
})
    .strict();
// `location` is deliberately optional. The panic button raises the alert the
// instant the button is released after a fingerprint match, because a victim
// cannot wait out a cold GNSS start. The incident is created with
// locationStatus: 'pending' and the device then streams fixes into
// `deviceLocationSchema` below until the incident is closed.
export const fromIotSchema = z
    .object({
    deviceId: z.string().trim().min(1).max(100),
    eventId: z.string().trim().min(1).max(100),
    buttonType: z.literal('general_sos'),
    deviceBatteryAtTrigger: z.number().min(0).max(100).optional(),
    firmwareVersion: z.string().trim().max(40).optional(),
    deviceTimestamp: z.string().datetime().optional(),
    fingerprintVerified: z.literal(true),
    authMethod: z.literal('fingerprint'),
    transport: z.enum(['ble', 'lte']),
    gnssHdop: z.number().min(0).max(99).optional(),
    gnssSatellites: z.number().int().min(0).max(100).optional(),
    location: geoPointSchema.optional(),
    barangay: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(500).optional(),
})
    .strict();
export const deviceLocationSchema = z
    .object({
    deviceId: z.string().trim().min(1).max(100),
    eventId: z.string().trim().min(1).max(100),
    transport: z.enum(['ble', 'lte']),
    location: geoPointSchema,
    gnssHdop: z.number().min(0).max(99).optional(),
    gnssSatellites: z.number().int().min(0).max(100).optional(),
    deviceBatteryAtTrigger: z.number().min(0).max(100).optional(),
    firmwareVersion: z.string().trim().max(40).optional(),
})
    .strict();
