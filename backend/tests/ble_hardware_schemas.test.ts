import { describe, expect, it } from 'vitest';

import { fromIotSchema, pairDeviceSchema } from '../src/modules/ble/ble.schemas.js';

const validEvent = {
  deviceId: 'SA-ESP32-1234ABCD',
  eventId: 'SA-ESP32-1234ABCD-7',
  buttonType: 'general_sos',
  fingerprintVerified: true,
  authMethod: 'fingerprint',
  transport: 'ble',
  firmwareVersion: '1.0.0',
  deviceTimestamp: '2026-09-15T07:30:10Z',
  gnssHdop: 1.2,
  gnssSatellites: 9,
  location: {
    type: 'Point',
    coordinates: [120.875, 14.35],
    accuracyMeters: 6,
    capturedAt: '2026-09-15T07:30:10Z',
  },
} as const;

describe('fingerprint GNSS hardware schemas', () => {
  it('accepts a fingerprint-authorized General SOS with real GNSS metadata', () => {
    expect(fromIotSchema.safeParse(validEvent).success).toBe(true);
  });

  it('rejects legacy multi-button and unauthenticated events', () => {
    expect(fromIotSchema.safeParse({ ...validEvent, buttonType: 'fire' }).success).toBe(false);
    expect(fromIotSchema.safeParse({ ...validEvent, fingerprintVerified: false }).success).toBe(false);
  });

  it('rejects invalid coordinates and unexpected fields', () => {
    expect(fromIotSchema.safeParse({
      ...validEvent,
      location: { ...validEvent.location, coordinates: [181, 14.35] },
    }).success).toBe(false);
    expect(fromIotSchema.safeParse({ ...validEvent, trustedByClient: true }).success).toBe(false);
  });

  it('records fingerprint state during pairing', () => {
    expect(pairDeviceSchema.parse({
      deviceId: 'SA-ESP32-1234ABCD',
      fingerprintEnrolled: true,
    }).fingerprintEnrolled).toBe(true);
  });
});
