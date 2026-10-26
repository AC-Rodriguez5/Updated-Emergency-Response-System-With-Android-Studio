import { describe, expect, it } from 'vitest';

import { createAmbulanceRequestSchema } from './ambulance.schemas.js';
import { AMBULANCE_CONSENT_SCOPES, CONSENT_BASES } from '../../shared/consent.js';

/**
 * The consent a transport booking carries.
 *
 * A booking holds a named patient, their contact and their medical condition,
 * often about somebody who is not the account holder, so what matters here is
 * that a real grant arrives intact, that a stray scope cannot refuse an
 * ambulance, and that nothing invents a grant nobody gave.
 */

const base = {
  requestType: 'schedule' as const,
  patient: {
    fullName: 'Lola Remedios',
    address: '12 Daang Amaya',
    contactNumber: '09171234567',
    medicalCondition: 'Dialysis appointment, needs a stretcher',
  },
  pickupLocation: {
    type: 'Point' as const,
    coordinates: [120.8778, 14.3126],
    addressLabel: '12 Daang Amaya, Tanza',
  },
  dropOffLocation: {
    type: 'Point' as const,
    coordinates: [120.9, 14.33],
    addressLabel: 'Tanza District Hospital',
  },
  requestedDate: '2026-07-01',
  // Scheduled and transfer bookings are only allowed between 3 and 7 PM.
  requestedTime: '16:00',
};

function parse(extra: Record<string, unknown> = {}) {
  return createAmbulanceRequestSchema.parse({ ...base, ...extra });
}

describe('booking consent', () => {
  it('carries a grant through with the wording it was given under', () => {
    const parsed = parse({
      consent: {
        version: 'v1.0',
        scopes: ['ambulance_transport', 'patient_informed'],
      },
    });

    expect(parsed.consent?.version).toBe('v1.0');
    expect(parsed.consent?.scopes).toEqual([
      'ambulance_transport',
      'patient_informed',
    ]);
  });

  it('accepts a booking somebody made for themselves', () => {
    // No patient acknowledgement: nobody has to confirm they told themselves.
    const parsed = parse({
      consent: { version: 'v1.0', scopes: ['ambulance_transport'] },
    });

    expect(parsed.consent?.scopes).toEqual(['ambulance_transport']);
  });

  it('drops a scope this server does not know instead of refusing the booking', () => {
    const parsed = parse({
      consent: {
        version: 'v9.9',
        scopes: ['ambulance_transport', 'something_invented_later'],
      },
    });

    // A consent detail must never turn into a refused ambulance.
    expect(parsed.consent?.scopes).toEqual(['ambulance_transport']);
  });

  it('still books for a client that predates the sheet', () => {
    const parsed = parse();

    // Better no consent block than a grant nobody gave. The app is the gate.
    expect(parsed.consent).toBeUndefined();
  });

  it('refuses a consent block carrying fields nobody asked for', () => {
    expect(() =>
      parse({
        consent: {
          version: 'v1.0',
          scopes: ['ambulance_transport'],
          // The basis is decided on the server, from the request type.
          basis: 'vital_interest',
        },
      }),
    ).toThrow();
  });

  it('refuses a grant with no version to tie it to any wording', () => {
    expect(() => parse({ consent: { scopes: ['ambulance_transport'] } })).toThrow();
  });
});

describe('the consent vocabulary', () => {
  it('names the two permissions a booking asks for', () => {
    expect([...AMBULANCE_CONSENT_SCOPES]).toEqual([
      'ambulance_transport',
      'patient_informed',
    ]);
  });

  it('allows an emergency to be recorded as something other than consent', () => {
    // There is no dialog between a resident and an ambulance, so there has to
    // be a basis that is not a tick.
    expect(CONSENT_BASES).toContain('vital_interest');
  });
});
