/// Who is coming, as the API reports it on `GET /emergencies/:id`.
///
/// Carries no phone or email: the app has no call feature, and the backend
/// deliberately does not hand out a responder's contact details.
class AssignedResponder {
  final String id;
  final String name;
  final String? badgeId;

  /// Already humanised by the backend: MDRRMO, PNP, BFP, and so on.
  final String? agency;
  final String? department;
  final String? stationName;

  const AssignedResponder({
    required this.id,
    required this.name,
    this.badgeId,
    this.agency,
    this.department,
    this.stationName,
  });

  factory AssignedResponder.fromJson(Map<String, dynamic> json) =>
      AssignedResponder(
        id: json['id'] as String? ?? json['_id'] as String? ?? '',
        name: (json['name'] as String? ?? '').trim(),
        badgeId: json['badgeId'] as String?,
        agency: json['agency'] as String?,
        department: json['department'] as String?,
        stationName: json['stationName'] as String?,
      );

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    if (badgeId != null) 'badgeId': badgeId,
    if (agency != null) 'agency': agency,
    if (department != null) 'department': department,
    if (stationName != null) 'stationName': stationName,
  };

  /// What the tracking screen prints under the responder headline, e.g.
  /// "MDRRMO - Tanza Station" or just "MDRRMO" when no station is recorded.
  String get unitLine => [
    agency,
    stationName,
  ].whereType<String>().where((s) => s.trim().isNotEmpty).join(' - ');
}

/// One entry of an emergency's audit trail, as the backend records it.
///
/// The API already returns the whole timeline on `GET /emergencies/:id`; this
/// is what lets the tracking screen show real timestamps for "received",
/// "assigned" and "on the way" instead of guessing from the current status.
class EmergencyTimelineEvent {
  final String event;
  final DateTime at;
  final String? note;
  final String? actorRole;

  /// Set on `responder_report` entries. Arrival has no timeline event of its
  /// own — the responder files a report with `reportType: 'arrival'` — so this
  /// is how the tracking screen knows when they actually got there.
  final String? reportType;

  const EmergencyTimelineEvent({
    required this.event,
    required this.at,
    this.note,
    this.actorRole,
    this.reportType,
  });

  factory EmergencyTimelineEvent.fromJson(Map<String, dynamic> json) =>
      EmergencyTimelineEvent(
        event: json['event'] as String? ?? '',
        at:
            DateTime.tryParse(json['at'] as String? ?? '')?.toLocal() ??
            DateTime.now(),
        note: json['note'] as String?,
        actorRole: json['actorRole'] as String?,
        reportType: json['reportType'] as String?,
      );

  Map<String, dynamic> toJson() => {
    'event': event,
    'at': at.toUtc().toIso8601String(),
    if (note != null) 'note': note,
    if (actorRole != null) 'actorRole': actorRole,
    if (reportType != null) 'reportType': reportType,
  };
}

class EmergencyModel {
  final String id;
  final String type;
  final String source;
  final String priority;
  final String status;
  final bool isInsideTanza;
  final bool outsideScopeFlag;
  final String? barangay;
  final String? notes;
  final DateTime createdAt;
  final String? assignedResponderId;

  /// `pending` until the hardware panic button lands its first GNSS fix. The
  /// incident is live and dispatchable either way.
  final String locationStatus;

  /// Count of position updates the server has accepted for this incident. The
  /// wearable echoes it back as `Server confirmed ... revision ...`.
  final int locationRevision;

  /// True while the wearable should keep streaming its position.
  final bool trackingActive;
  final List<EmergencyTimelineEvent> timeline;
  final AssignedResponder? assignedResponder;

  const EmergencyModel({
    required this.id,
    required this.type,
    required this.source,
    required this.priority,
    required this.status,
    required this.isInsideTanza,
    required this.outsideScopeFlag,
    this.barangay,
    this.notes,
    required this.createdAt,
    this.assignedResponderId,
    this.locationStatus = 'fixed',
    this.locationRevision = 0,
    this.trackingActive = false,
    this.timeline = const [],
    this.assignedResponder,
  });

  factory EmergencyModel.fromJson(Map<String, dynamic> json) {
    return EmergencyModel(
      id: json['_id'] as String? ?? json['id'] as String? ?? '',
      type: json['type'] as String? ?? '',
      source: json['source'] as String? ?? 'mobile_app',
      priority: json['priority'] as String? ?? 'medium',
      status: json['status'] as String? ?? 'pending',
      isInsideTanza: json['isInsideTanza'] as bool? ?? true,
      outsideScopeFlag: json['outsideScopeFlag'] as bool? ?? false,
      barangay: json['barangay'] as String?,
      notes: json['notes'] as String?,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'] as String) ?? DateTime.now()
          : DateTime.now(),
      assignedResponderId: json['assignedResponderId'] as String?,
      locationStatus: json['locationStatus'] as String? ?? 'fixed',
      locationRevision: (json['locationRevision'] as num?)?.toInt() ?? 0,
      trackingActive: json['trackingActive'] as bool? ?? false,
      timeline:
          (json['timeline'] as List?)
              ?.whereType<Map>()
              .map(
                (e) =>
                    EmergencyTimelineEvent.fromJson(e.cast<String, dynamic>()),
              )
              .toList() ??
          const [],
      assignedResponder: json['assignedResponder'] is Map
          ? AssignedResponder.fromJson(
              (json['assignedResponder'] as Map).cast<String, dynamic>(),
            )
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    '_id': id,
    'type': type,
    'source': source,
    'priority': priority,
    'status': status,
    'isInsideTanza': isInsideTanza,
    'outsideScopeFlag': outsideScopeFlag,
    if (barangay != null) 'barangay': barangay,
    if (notes != null) 'notes': notes,
    'createdAt': createdAt.toUtc().toIso8601String(),
    if (assignedResponderId != null) 'assignedResponderId': assignedResponderId,
    'locationStatus': locationStatus,
    'locationRevision': locationRevision,
    'trackingActive': trackingActive,
    if (timeline.isNotEmpty)
      'timeline': timeline.map((e) => e.toJson()).toList(),
    if (assignedResponder != null)
      'assignedResponder': assignedResponder!.toJson(),
  };

  bool get isActive => !['resolved', 'cancelled'].contains(status);

  /// When the given timeline event last happened, or null if it has not.
  ///
  /// Reads the *latest* match: a responder can be reassigned, and the useful
  /// timestamp is the one that still applies.
  DateTime? timeOf(String event) {
    for (final entry in timeline.reversed) {
      if (entry.event == event) return entry.at;
    }
    return null;
  }

  List<EmergencyTimelineEvent> get userMessages =>
      timeline.where((e) => e.event == 'user_message').toList();

  /// What the responder and dispatch have said *to this person*, oldest first.
  ///
  /// The backend never sends the dispatch-only channel to this app, so
  /// everything here was deliberately addressed to them — which is why it can
  /// be shown without a second thought about what it reveals.
  List<EmergencyTimelineEvent> get updatesForMe =>
      timeline.where((e) => e.event == 'message').toList();

  /// When the responder reported arriving on scene, if they have.
  DateTime? get arrivedAt {
    for (final entry in timeline.reversed) {
      if (entry.event == 'responder_report' && entry.reportType == 'arrival') {
        return entry.at;
      }
    }
    return null;
  }

  bool get isAwaitingGps => locationStatus == 'pending';
  bool get isFromPanicButton => source == 'iot_device';
  bool get canCancel => status == 'pending';

  String get displayType => switch (type) {
    'medical' => 'Medical Emergency',
    'crime' => 'Crime / Security',
    'fire' => 'Fire',
    'general_sos' => 'General SOS',
    _ => type,
  };
}
