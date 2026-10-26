class ResponderModel {
  final String id;
  final String name;
  final String email;
  final String role;
  final bool isApproved;
  final String approvalStatus;
  final String? responderRole;
  final String? department;
  final String? agencyType;
  final String? stationName;
  final String? position;
  final String? coverageArea;
  final String dutyStatus;

  const ResponderModel({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    required this.isApproved,
    required this.approvalStatus,
    this.responderRole,
    this.department,
    this.agencyType,
    this.stationName,
    this.position,
    this.coverageArea,
    required this.dutyStatus,
  });

  factory ResponderModel.fromJson(Map<String, dynamic> json) {
    final account = json['account'] as Map<String, dynamic>? ?? json;
    return ResponderModel(
      id: account['_id'] as String? ?? account['id'] as String? ?? '',
      name: account['name'] as String? ?? '',
      email: account['email'] as String? ?? '',
      role: account['role'] as String? ?? 'responder',
      isApproved: account['isApproved'] as bool? ?? false,
      approvalStatus: account['approvalStatus'] as String? ?? 'pending',
      responderRole: account['responderRole'] as String?,
      department: account['department'] as String?,
      agencyType: account['agencyType'] as String?,
      stationName: account['stationName'] as String?,
      position: account['position'] as String?,
      coverageArea: account['coverageArea'] as String?,
      dutyStatus: account['dutyStatus'] as String? ?? 'off_duty',
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'email': email,
    'role': role,
    'isApproved': isApproved,
    'approvalStatus': approvalStatus,
    'responderRole': responderRole,
    'department': department,
    'agencyType': agencyType,
    'stationName': stationName,
    'position': position,
    'coverageArea': coverageArea,
    'dutyStatus': dutyStatus,
  };

  bool get isPending => approvalStatus == 'pending';

  /// The same set the backend treats as live (`LIVE_RESPONDER_STATUSES`).
  ///
  /// `available` and `responding` are not states a responder ever picks — the
  /// backend moves them there when an incident is assigned, started or
  /// resolved. Reading only `on_duty` and `busy` meant a responder whose last
  /// call had just been closed came back to an app that said OFF DUTY while
  /// dispatch still had them on the roster.
  bool get isOnDuty => const {
    'on_duty',
    'available',
    'busy',
    'responding',
  }.contains(dutyStatus);

  Set<String> get allowedEmergencyTypes {
    final types = <String>{};
    if (responderRole == 'medic' || responderRole == 'ambulance_driver') {
      types.add('medical');
    }
    if (responderRole == 'fire_responder') types.add('fire');
    if (responderRole == 'police_responder') types.add('crime');
    if (responderRole == 'disaster_response' ||
        responderRole == 'general_responder') {
      types.add('general_sos');
    }
    if (department == 'medical') types.add('medical');
    if (department == 'fire') types.add('fire');
    if (department == 'police') types.add('crime');
    if (department == 'rescue' || department == 'barangay') {
      types.add('general_sos');
    }
    if (agencyType == 'medical') types.add('medical');
    if (agencyType == 'bfp') types.add('fire');
    if (agencyType == 'pnp') types.add('crime');
    if (agencyType == 'mdrrmo' ||
        agencyType == 'rescue' ||
        agencyType == 'barangay') {
      types.add('general_sos');
    }
    return types;
  }

  // Feed visibility: true when no role is configured (show all) or role matches.
  bool canHandleEmergencyType(String type) =>
      allowedEmergencyTypes.isEmpty || allowedEmergencyTypes.contains(type);

  // Self-accept: only when the responder's role explicitly covers this type.
  bool canSelfAssign(String type) =>
      allowedEmergencyTypes.isNotEmpty && allowedEmergencyTypes.contains(type);

  /// Role rules for a whole incident, which is what every caller actually has.
  ///
  /// A panic-button press is filed as `general_sos` because the schema needs a
  /// value — the wearable has one button and no way to ask what happened. Run
  /// through the ordinary role filter, that placeholder category hid every
  /// hardware alert from medics, fire and police: the app dropped the socket
  /// event and the backend left it out of the feed. Hardware alerts belong to
  /// whoever is nearest, so they skip the filter on both sides
  /// (`responderRoleAccess.ts`, `isHardwareSourced`).
  bool canHandleIncident({required String type, required String source}) =>
      isHardwareIncident(source) || canHandleEmergencyType(type);

  bool canAcceptIncident({required String type, required String source}) =>
      isHardwareIncident(source) || canSelfAssign(type);

  static bool isHardwareIncident(String source) =>
      source == 'iot_device' || source == 'iot_keychain';
}
