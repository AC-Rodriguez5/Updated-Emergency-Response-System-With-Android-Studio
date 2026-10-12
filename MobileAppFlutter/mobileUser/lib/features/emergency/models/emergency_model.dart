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
  };

  bool get isActive => !['resolved', 'cancelled'].contains(status);
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
