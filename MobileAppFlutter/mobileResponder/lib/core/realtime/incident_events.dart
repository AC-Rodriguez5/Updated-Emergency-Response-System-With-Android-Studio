/// Every incident event the backend publishes to a responder.
///
/// Kept in one place because two things subscribe to it now — the UI isolate's
/// [IncidentSocket] and the duty foreground service — and an event missing from
/// either list is an alert that silently does not arrive. The authority is
/// `backend/src/modules/emergencies/events.ts` (`EmergencyEventName`).
const List<String> kIncidentEvents = [
  'emergency.created',
  'emergency.iot_keychain_created',
  'emergency.iot_device_created',
  'emergency.location_updated',
  'emergency.updated',
  'emergency.assigned',
  'emergency.assignment_acknowledged',
  'emergency.assignment_expired',
  'emergency.released',
  'emergency.dispatch_overdue',
  'emergency.responder_on_the_way',
  'emergency.responder_nearby',
  'emergency.responder_arrived',
  'emergency.responder_report',
  'emergency.message',
  'emergency.update_requested',
  'emergency.resolved',
];

/// Events that mean somebody needs help and nobody has them yet. These are the
/// ones allowed to sound an alarm.
const Set<String> kAlarmEvents = {
  'emergency.created',
  'emergency.iot_device_created',
  'emergency.iot_keychain_created',
  'emergency.dispatch_overdue',
};

/// Events aimed at one responder in particular: worth a notification, not worth
/// an alarm.
///
/// Only the three that name their assignee. These events also reach every
/// responder subscribed to the incident's type, so anything the phone cannot
/// confirm is *theirs* must not be announced — "Dispatch assigned this to you"
/// on somebody else's assignment is worse than silence. Hand-backs and expired
/// assignments are left to the in-app notice, which can see from the feed
/// whether the incident used to be this responder's.
const Set<String> kPersonalEvents = {
  'emergency.assigned',
  'emergency.message',
  'emergency.update_requested',
};
