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
export type PairDeviceInput = z.infer<typeof pairDeviceSchema>;

export const idParamSchema = z
  .object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId') })
  .strict();
export type IdParam = z.infer<typeof idParamSchema>;

export const unpairBodySchema = z
  .object({ reason: z.string().trim().max(250).optional() })
  .strict();
export type UnpairBody = z.infer<typeof unpairBodySchema>;

export const deviceStatusSchema = z
  .object({
    fingerprintEnrolled: z.boolean().optional(),
    directCellularEnabled: z.boolean().optional(),
    firmwareVersion: z.string().trim().max(40).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one status field');
export type DeviceStatusInput = z.infer<typeof deviceStatusSchema>;

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
export type BleEventInput = z.infer<typeof bleEventSchema>;

const geoPointSchema = z
  .object({
    type: z.literal('Point'),
    coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
    accuracyMeters: z.number().min(0).max(5000).optional(),
    capturedAt: z.string().datetime(),
  })
  .strict();

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
    location: geoPointSchema,
    barangay: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();
export type FromIotInput = z.infer<typeof fromIotSchema>;
