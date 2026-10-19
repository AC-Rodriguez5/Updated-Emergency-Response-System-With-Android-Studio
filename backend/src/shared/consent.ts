/**
 * The permissions a resident is asked for at registration.
 *
 * Kept in step with `consent_content.dart` in the resident app, which is where
 * the wording lives. The four mandatory ones are what TanzAlert needs to open
 * an account and raise an alert at all; the other two are genuinely optional
 * and must stay that way, or the consent is not freely given.
 */
export const CONSENT_SCOPES = [
  // Asked at registration.
  'account_processing',
  'sos_location_sharing',
  'on_device_biometric_ack',
  'contacts_informed',
  'anonymized_research',
  'research_followup',
  // Asked when a resident books an ambulance, not at registration: somebody
  // who never books one should not have to agree to health processing to open
  // an account, and consent asked in context is worth more than consent asked
  // a year earlier.
  'ambulance_transport',
  'patient_informed',
] as const;

export type ConsentScope = (typeof CONSENT_SCOPES)[number];

export const REQUIRED_CONSENT_SCOPES: readonly ConsentScope[] = [
  'account_processing',
  'sos_location_sharing',
  'on_device_biometric_ack',
  'contacts_informed',
];

/**
 * Why this system is allowed to hold the data, not merely that it asked.
 *
 * `vital_interest` is for an emergency ambulance request. RA 10173 allows
 * processing necessary to protect someone's life and health, and the
 * alternative — a consent dialog between a resident and an ambulance — is
 * not one anybody should ship. The determination is made on the server from
 * the request type, never taken from the client.
 */
export type ConsentBasis = 'consent' | 'vital_interest';

export const CONSENT_BASES: readonly ConsentBasis[] = ['consent', 'vital_interest'];

/** The permissions a transport booking asks for, when it asks at all. */
export const AMBULANCE_CONSENT_SCOPES: readonly ConsentScope[] = [
  'ambulance_transport',
  'patient_informed',
];

export type ConsentAction = 'granted' | 'withdrawn';

export const CONSENT_ACTIONS: readonly ConsentAction[] = ['granted', 'withdrawn'];

/** Whether a grant covers everything the service cannot run without. */
export function coversRequiredScopes(scopes: readonly string[]): boolean {
  return REQUIRED_CONSENT_SCOPES.every((scope) => scopes.includes(scope));
}
