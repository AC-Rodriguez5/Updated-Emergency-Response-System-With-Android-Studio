import type {
  EmergencyType,
  IEmergency,
  IResponder,
  ResponderRole,
} from '../../models/index.js';

const ROLE_EMERGENCY_TYPES: Record<ResponderRole, EmergencyType[]> = {
  medic: ['medical'],
  ambulance_driver: ['medical'],
  fire_responder: ['fire'],
  police_responder: ['crime'],
  disaster_response: ['general_sos'],
  general_responder: ['general_sos'],
};

const DEPARTMENT_EMERGENCY_TYPES: Record<string, EmergencyType[]> = {
  medical: ['medical'],
  fire: ['fire'],
  police: ['crime'],
  rescue: ['general_sos'],
  barangay: ['general_sos'],
};

const AGENCY_EMERGENCY_TYPES: Record<string, EmergencyType[]> = {
  medical: ['medical'],
  bfp: ['fire'],
  pnp: ['crime'],
  rescue: ['general_sos'],
  mdrrmo: ['general_sos'],
  barangay: ['general_sos'],
};

function uniqueTypes(values: EmergencyType[]): EmergencyType[] {
  return [...new Set(values)];
}

export function emergencyTypesForResponder(
  responder: Pick<IResponder, 'responderRole' | 'department' | 'agencyType'>,
): EmergencyType[] {
  const types: EmergencyType[] = [];
  if (responder.responderRole) {
    types.push(...ROLE_EMERGENCY_TYPES[responder.responderRole]);
  }
  if (responder.department) {
    types.push(...(DEPARTMENT_EMERGENCY_TYPES[responder.department] ?? []));
  }
  if (responder.agencyType) {
    types.push(...(AGENCY_EMERGENCY_TYPES[responder.agencyType] ?? []));
  }
  return uniqueTypes(types);
}

export function canResponderHandleEmergency(
  responder: Pick<IResponder, 'responderRole' | 'department' | 'agencyType'>,
  emergencyType: EmergencyType,
): boolean {
  return emergencyTypesForResponder(responder).includes(emergencyType);
}

/**
 * A press on the panic button is the one alert nobody triaged.
 *
 * Every other incident carries a type somebody chose — a resident picked
 * "medical" in the app, a dispatcher logged a fire. The wearable has one button
 * and no way to ask what happened, so the backend files it as `general_sos`
 * because the schema needs a value, not because anyone decided it was a rescue
 * call.
 *
 * Routing that value through the ordinary role filter meant a hardware alert
 * reached MDRRMO and rescue accounts and *nobody else*: a medic, a fire
 * responder or a police responder on duty two streets away was never told, on
 * the strength of a category the press never claimed. Hardware-sourced
 * incidents therefore skip role filtering entirely — for the feed, for the
 * socket fan-out, and for self-accept, so whoever is nearest can take it.
 */
export const HARDWARE_SOURCES = ['iot_device', 'iot_keychain'] as const;

export function isHardwareSourced(source: IEmergency['source'] | undefined): boolean {
  return (HARDWARE_SOURCES as readonly string[]).includes(source ?? '');
}

/** Every responder's socket joins this, so an untriaged press reaches all of them. */
export const RESPONDER_BROADCAST_ROOM = 'responder-feed:all';

/**
 * Role check for a whole incident rather than a bare type, which is what every
 * caller actually has. Use this in preference to
 * {@link canResponderHandleEmergency}: a type on its own cannot tell you
 * whether a person chose it.
 */
export function canResponderHandleIncident(
  responder: Pick<IResponder, 'responderRole' | 'department' | 'agencyType'>,
  incident: Pick<IEmergency, 'type' | 'source'>,
): boolean {
  if (isHardwareSourced(incident.source)) return true;
  return canResponderHandleEmergency(responder, incident.type);
}
