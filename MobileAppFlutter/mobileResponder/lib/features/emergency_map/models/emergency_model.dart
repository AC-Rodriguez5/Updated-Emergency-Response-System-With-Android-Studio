class EmergencyModel {
  final String id;
  final String type;
  final String source;
  final String priority;
  final String status;
  final double lat;
  final double lng;
  /// False while the hardware panic button is still searching for a GNSS fix. The
  /// alert is real and already dispatchable, but [lat]/[lng] are the Tanza centre
  /// placeholder, not the sender's position. Never navigate on a false value.
  final bool hasFix;
  final String locationStatus;
  final double? accuracyMeters;
  final bool isInsideTanza;
  final bool outsideScopeFlag;
  final String? barangay;
  final String? notes;
  final DateTime createdAt;
  /// When a dispatcher closed it. Null while the incident is still open.
  final DateTime? resolvedAt;
  final String? assignedResponderId;
  /// When this responder confirmed they are taking it.
  ///
  /// Null on an assignment a dispatcher made that has not been answered yet —
  /// accepting from the feed fills it in immediately, being dispatched does not.
  final DateTime? assignmentAckAt;
  /// Set by the backend once an incident has sat in the pending pool with nobody
  /// accepting it.
  final bool dispatchOverdue;
  final Map<String, dynamic>? userSnapshot;
  final String? bleEventId;
  final String? sourceDeviceId;
  final int? deviceBatteryAtTrigger;
  final List<EmergencyTimelineEvent> timeline;

  const EmergencyModel({
    required this.id,
    required this.type,
    required this.source,
    required this.priority,
    required this.status,
    required this.lat,
    required this.lng,
    this.hasFix = true,
    this.locationStatus = 'fixed',
    this.accuracyMeters,
    required this.isInsideTanza,
    required this.outsideScopeFlag,
    this.barangay,
    this.notes,
    required this.createdAt,
    this.resolvedAt,
    this.assignedResponderId,
    this.assignmentAckAt,
    this.dispatchOverdue = false,
    this.userSnapshot,
    this.bleEventId,
    this.sourceDeviceId,
    this.deviceBatteryAtTrigger,
    this.timeline = const [],
  });

  factory EmergencyModel.fromJson(Map<String, dynamic> json) {
    // Handles both REST response format (_id/currentLocation) and
    // socket event format (emergencyId/location).
    final loc = json['currentLocation'] as Map<String, dynamic>?
             ?? json['location'] as Map<String, dynamic>?;
    final coords = loc?['coordinates'] as List?;
    // A hardware panic-button incident can arrive with no coordinates at all: the
    // alert is sent on the button press and the GNSS receiver is still searching.
    final hasFix = coords != null && coords.length >= 2;
    return EmergencyModel(
      id: json['_id'] as String? ?? json['id'] as String? ?? json['emergencyId'] as String? ?? '',
      type: json['type'] as String? ?? '',
      source: json['source'] as String? ?? 'mobile_app',
      priority: json['priority'] as String? ?? 'medium',
      status: json['status'] as String? ?? 'pending',
      lat: hasFix ? (coords[1] as num).toDouble() : 14.355,
      lng: hasFix ? (coords[0] as num).toDouble() : 120.885,
      hasFix: hasFix,
      locationStatus:
          json['locationStatus'] as String? ?? (hasFix ? 'fixed' : 'pending'),
      accuracyMeters: (loc?['accuracyMeters'] as num?)?.toDouble(),
      isInsideTanza: json['isInsideTanza'] as bool? ?? true,
      outsideScopeFlag: json['outsideScopeFlag'] as bool? ?? false,
      barangay: json['barangay'] as String?,
      notes: json['notes'] as String?,
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt'] as String) ?? DateTime.now() : DateTime.now(),
      resolvedAt: json['resolvedAt'] != null
          ? DateTime.tryParse(json['resolvedAt'] as String)
          : null,
      assignedResponderId: json['assignedResponderId'] as String?,
      assignmentAckAt: json['assignmentAckAt'] != null
          ? DateTime.tryParse(json['assignmentAckAt'] as String)
          : null,
      dispatchOverdue: json['dispatchOverdue'] as bool? ?? false,
      userSnapshot: json['userSnapshot'] as Map<String, dynamic>?,
      bleEventId: json['bleEventId'] as String?,
      sourceDeviceId: json['sourceDeviceId'] as String?,
      deviceBatteryAtTrigger: (json['deviceBatteryAtTrigger'] as num?)?.toInt(),
      timeline: (json['timeline'] as List? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(EmergencyTimelineEvent.fromJson)
          .toList(),
    );
  }

  bool get isActive => !['resolved', 'cancelled'].contains(status);

  /// Everything anybody has said about this incident, oldest first.
  ///
  /// Reports and update requests are in here with the messages on purpose: to
  /// the people working the incident it is one conversation, however it was
  /// filed.
  List<EmergencyTimelineEvent> get conversation {
    const spoken = {
      'message',
      'user_message',
      'responder_report',
      'admin_update_requested',
    };
    return timeline.where((e) => spoken.contains(e.event)).toList()
      ..sort((a, b) => a.at.compareTo(b.at));
  }

  /// Whether the responder has reported standing at the scene.
  bool get hasArrived => status == 'arrived';

  /// A dispatcher has sent this to someone who has not answered yet. Until they
  /// do, nobody can say help is actually coming.
  bool get awaitingAcknowledgement =>
      assignedResponderId != null && assignmentAckAt == null && isActive;
  bool get isCritical => priority == 'critical';
  bool get isIoT => source == 'iot_keychain' || source == 'iot_device';
  bool get isPanicButton => source == 'iot_device';

  String get displayType => switch (type) {
    'medical' => 'Medical',
    'crime' => 'Crime',
    'fire' => 'Fire',
    'general_sos' => 'SOS',
    _ => type,
  };
}

class EmergencyTimelineEvent {
  final String event;
  final DateTime at;
  final String? actorRole;
  final String? note;
  /// The canned update this came from, when it was sent as one tap.
  final String? code;
  /// `all` means the person in the emergency sees it too; `dispatch` keeps it
  /// between the responder and the dispatcher.
  final String? audience;
  final String? reportType;
  final String? reportStatus;

  const EmergencyTimelineEvent({
    required this.event,
    required this.at,
    this.actorRole,
    this.note,
    this.code,
    this.audience,
    this.reportType,
    this.reportStatus,
  });

  factory EmergencyTimelineEvent.fromJson(Map<String, dynamic> json) {
    return EmergencyTimelineEvent(
      event: json['event'] as String? ?? '',
      at: json['at'] != null ? DateTime.tryParse(json['at'] as String) ?? DateTime.now() : DateTime.now(),
      actorRole: json['actorRole'] as String?,
      note: json['note'] as String?,
      code: json['code'] as String?,
      audience: json['audience'] as String?,
      reportType: json['reportType'] as String?,
      reportStatus: json['reportStatus'] as String?,
    );
  }
}
