/// One-tap updates, so saying something costs a thumb and not a paragraph.
///
/// A field report is a document written after the fact. These are the sentences
/// a dispatcher actually waits for during the call — "on scene", "need backup",
/// "taking them to hospital" — and a responder holding a torch in the rain will
/// send a chip they can hit without looking, where they would not type.
///
/// [code] travels with the message so every screen renders the same words for
/// the same update, in whatever language it is showing.
class IncidentQuickUpdate {
  /// Stored on the incident alongside the text.
  final String code;

  /// What the sending responder sees on the chip.
  final String label;

  /// What is written into the incident.
  final String message;

  /// Whether this one is addressed to the person in the emergency by default.
  ///
  /// "On my way to you" is reassurance and belongs to them. "Need backup" is
  /// dispatch's problem to solve and would only frighten someone who can do
  /// nothing about it, so it stays on the working channel.
  final bool tellResident;

  const IncidentQuickUpdate({
    required this.code,
    required this.label,
    required this.message,
    this.tellResident = false,
  });
}

const List<IncidentQuickUpdate> responderQuickUpdates = [
  IncidentQuickUpdate(
    code: 'on_scene',
    label: 'On scene',
    message: 'I am at the scene.',
    tellResident: true,
  ),
  IncidentQuickUpdate(
    code: 'searching',
    label: 'Cannot find you',
    message: 'I am at the location but cannot find you. Please signal if you can.',
    tellResident: true,
  ),
  IncidentQuickUpdate(
    code: 'patient_stable',
    label: 'Patient stable',
    message: 'Patient is stable.',
    tellResident: true,
  ),
  IncidentQuickUpdate(
    code: 'transporting',
    label: 'Transporting',
    message: 'Transporting the patient to a facility now.',
    tellResident: true,
  ),
  IncidentQuickUpdate(
    code: 'need_backup',
    label: 'Need backup',
    message: 'Need backup at this scene.',
  ),
  IncidentQuickUpdate(
    code: 'need_ambulance',
    label: 'Need ambulance',
    message: 'Need an ambulance dispatched to this scene.',
  ),
  IncidentQuickUpdate(
    code: 'scene_unsafe',
    label: 'Scene unsafe',
    message: 'Scene is not secure. Advise before anyone else approaches.',
  ),
  IncidentQuickUpdate(
    code: 'delayed',
    label: 'Delayed',
    message: 'Delayed getting there. Still coming.',
    tellResident: true,
  ),
];

/// Looks up the canned update a stored [code] came from, so a received message
/// can be shown as the same chip the sender tapped.
IncidentQuickUpdate? quickUpdateForCode(String? code) {
  if (code == null) return null;
  for (final update in responderQuickUpdates) {
    if (update.code == code) return update;
  }
  return null;
}
