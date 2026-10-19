import { describe, expect, it } from 'vitest';

import { registerUserSchema } from './auth.schemas.js';
import {
  CONSENT_SCOPES,
  REQUIRED_CONSENT_SCOPES,
  coversRequiredScopes,
} from '../../shared/consent.js';

/**
 * What a resident agreed to at registration, as it arrives over the wire.
 *
 * The form promises in writing that the grant is recorded with its version, so
 * the thing that matters here is that a real grant survives the trip intact and
 * that nothing invents one that was never given.
 */

const base = {
  name: 'Maria Santos',
  email: 'Maria@Example.com',
  phone: '09171234567',
  password: 'a-long-enough-password',
  streetAddress: '12 Daang Amaya',
  dateOfBirth: '1990-04-02',
  bloodType: 'O+',
  emergencyContactName: 'Jose Santos',
  emergencyContactNumber: '09181234567',
};

function parse(extra: Record<string, unknown> = {}) {
  return registerUserSchema.parse({ ...base, ...extra });
}

describe('registration consent', () => {
  it('carries a grant through as a list', () => {
    const parsed = parse({
      consentVersion: 'v1.0',
      consentScopes:
        'account_processing,sos_location_sharing,on_device_biometric_ack,contacts_informed',
    });

    expect(parsed.consentVersion).toBe('v1.0');
    expect(parsed.consentScopes).toEqual([
      'account_processing',
      'sos_location_sharing',
      'on_device_biometric_ack',
      'contacts_informed',
    ]);
  });

  it('keeps the optional grants that were given', () => {
    const parsed = parse({
      consentVersion: 'v1.0',
      consentScopes: 'account_processing,anonymized_research,research_followup',
    });

    expect(parsed.consentScopes).toContain('anonymized_research');
    expect(parsed.consentScopes).toContain('research_followup');
  });

  it('drops a scope this server does not know rather than failing', () => {
    const parsed = parse({
      consentVersion: 'v9.9',
      consentScopes: 'account_processing,sell_my_data_to_anyone',
    });

    // An app a version ahead must not be able to fail a registration, and a
    // name this server cannot honour is not one it should record as honoured.
    expect(parsed.consentScopes).toEqual(['account_processing']);
  });

  it('tolerates the spacing and empty entries a hand-built field can carry', () => {
    const parsed = parse({
      consentVersion: 'v1.0',
      consentScopes: ' account_processing , ,contacts_informed,',
    });

    expect(parsed.consentScopes).toEqual([
      'account_processing',
      'contacts_informed',
    ]);
  });

  it('records nothing when an older app sends nothing', () => {
    const parsed = parse();

    // Better an empty log than a grant nobody gave.
    expect(parsed.consentVersion).toBeUndefined();
    expect(parsed.consentScopes).toBeUndefined();
  });

  it('still registers somebody whose app predates the form', () => {
    expect(() => parse()).not.toThrow();
  });
});

describe('coversRequiredScopes', () => {
  it('accepts the four the service cannot run without', () => {
    expect(
      coversRequiredScopes([
        'account_processing',
        'sos_location_sharing',
        'on_device_biometric_ack',
        'contacts_informed',
      ]),
    ).toBe(true);
  });

  it('refuses when one of them is missing', () => {
    expect(
      coversRequiredScopes([
        'account_processing',
        'sos_location_sharing',
        'on_device_biometric_ack',
      ]),
    ).toBe(false);
  });

  it('is not satisfied by the optional ones', () => {
    expect(
      coversRequiredScopes(['anonymized_research', 'research_followup']),
    ).toBe(false);
  });
});

describe('the scope list', () => {
  it('matches what the app offers', () => {
    /*
      Kept in step with the app by hand; if a list there changes and this one
      does not, grants arrive and are silently dropped. Two forms feed it: the
      registration sheet (consent_content.dart) and the transport booking sheet
      (ambulance_consent_sheet.dart), which is asked at booking rather than at
      registration.
    */
    expect([...CONSENT_SCOPES]).toEqual([
      'account_processing',
      'sos_location_sharing',
      'on_device_biometric_ack',
      'contacts_informed',
      'anonymized_research',
      'research_followup',
      'ambulance_transport',
      'patient_informed',
    ]);
  });

  it('does not make a transport permission a condition of registering', () => {
    // Somebody who never books an ambulance must not have to agree to health
    // processing to open an account.
    expect(REQUIRED_CONSENT_SCOPES).not.toContain('ambulance_transport');
    expect(REQUIRED_CONSENT_SCOPES).not.toContain('patient_informed');
    expect(REQUIRED_CONSENT_SCOPES).toHaveLength(4);
  });
});
