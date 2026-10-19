import 'package:latlong2/latlong.dart';

/// The facility kinds the drop-off picker plots. Ordered roughly by how often a
/// transport ends there, which is also the order the legend reads in.
enum EmergencyFacilityType {
  hospital,
  redCross,
  drrmo,
  fireStation,
  police,
  ambulanceStation,
}

/// A place an ambulance can drop a patient off at.
///
/// Instances come from two sources that must agree on shape: the bundled
/// [phEmergencyFacilitySeeds] baseline, and live OpenStreetMap data pulled
/// through Overpass. [fromOverpass] is the only place that knows OSM tagging.
class EmergencyFacility {
  final String id;
  final String name;

  /// Street-level address when the source already knows it. Null means the
  /// picker reverse-geocodes on tap instead.
  final String? address;
  final EmergencyFacilityType type;
  final double latitude;
  final double longitude;

  const EmergencyFacility({
    required this.id,
    required this.name,
    required this.type,
    required this.latitude,
    required this.longitude,
    this.address,
  });

  LatLng get point => LatLng(latitude, longitude);

  /// What goes in the location label: the facility's own name first, then its
  /// address, because "Tanza General Hospital" identifies the destination and
  /// the address only qualifies it.
  String labelWith(String? resolvedAddress) {
    final addr = (address?.trim().isNotEmpty ?? false)
        ? address!.trim()
        : (resolvedAddress?.trim() ?? '');
    if (addr.isEmpty) return name;
    // Nominatim's display_name often starts with the POI's own name. Repeating
    // it would read "Tanza General Hospital, Tanza General Hospital, ...".
    if (addr.toLowerCase().startsWith(name.toLowerCase())) return addr;
    return '$name, $addr';
  }

  /// Police stations in OSM are a mixed bag: real PNP stations sit alongside
  /// mall security desks, impounding lots and village gates, all tagged
  /// `amenity=police`. A transport cannot be delivered to a village gate, so
  /// those are dropped rather than shown as an emergency facility.
  static final RegExp _notAStation = RegExp(
    r'security|main gate|impounding|kadiwa|mobile police box|police box|traffic investigation',
    caseSensitive: false,
  );

  /// Builds a facility from one Overpass element, or returns null when the
  /// element is not an emergency facility this picker should plot.
  ///
  /// Unnamed elements are always dropped: the whole point of tapping a pin is
  /// to log a full name and address, and "(unnamed)" is neither.
  static EmergencyFacility? fromOverpass(Map<String, dynamic> element) {
    final tags = (element['tags'] as Map?)?.cast<String, dynamic>() ?? const {};
    final name = (tags['name'] ?? '').toString().trim();
    if (name.isEmpty) return null;

    final lat = _coord(element, 'lat');
    final lon = _coord(element, 'lon');
    if (lat == null || lon == null) return null;

    final type = _classify(tags, name);
    if (type == null) return null;
    if (type == EmergencyFacilityType.police && _notAStation.hasMatch(name)) {
      return null;
    }

    return EmergencyFacility(
      id: 'osm/${element['type']}/${element['id']}',
      name: name,
      type: type,
      latitude: lat,
      longitude: lon,
      address: _addressFromTags(tags),
    );
  }

  /// Overpass returns a node's own lat/lon, but a way or relation only carries
  /// `center` (from `out center`).
  static double? _coord(Map<String, dynamic> element, String key) {
    final direct = element[key];
    if (direct is num) return direct.toDouble();
    final center = (element['center'] as Map?)?.cast<String, dynamic>();
    final fromCenter = center?[key];
    return fromCenter is num ? fromCenter.toDouble() : null;
  }

  /// Philippine tagging is inconsistent, so name matching backs up the tags:
  /// a Red Cross chapter may be `office=ngo`, `healthcare=blood_donation` or
  /// even `amenity=clinic`, and an MDRRMO may be `emergency=disaster_response`,
  /// `office=government` + `government=emergency_management`, or only a name.
  /// Name checks run first for Red Cross and DRRMO so those two keep their own
  /// icon instead of being flattened into hospital or police.
  static EmergencyFacilityType? _classify(
    Map<String, dynamic> tags,
    String name,
  ) {
    final amenity = (tags['amenity'] ?? '').toString();
    final emergency = (tags['emergency'] ?? '').toString();
    final office = (tags['office'] ?? '').toString();
    final government = (tags['government'] ?? '').toString();
    final healthcare = (tags['healthcare'] ?? '').toString();
    final operator = (tags['operator'] ?? '').toString();
    final haystack = '$name $operator'.toLowerCase();

    if (haystack.contains('red cross')) return EmergencyFacilityType.redCross;
    if (haystack.contains('drrmo') ||
        haystack.contains('disaster risk reduction') ||
        emergency == 'disaster_response' ||
        emergency == 'rescue_station' ||
        government == 'emergency_management') {
      return EmergencyFacilityType.drrmo;
    }
    if (amenity == 'hospital' || healthcare == 'hospital') {
      return EmergencyFacilityType.hospital;
    }
    if (amenity == 'fire_station' ||
        haystack.contains('bureau of fire') ||
        haystack.contains('bfp ')) {
      return EmergencyFacilityType.fireStation;
    }
    if (amenity == 'police') return EmergencyFacilityType.police;
    if (emergency == 'ambulance_station') {
      return EmergencyFacilityType.ambulanceStation;
    }
    // `office=government` with no emergency_management hint is a town hall or a
    // line agency, not an emergency facility.
    if (office == 'government' && government.isEmpty) return null;
    return null;
  }

  static String? _addressFromTags(Map<String, dynamic> tags) {
    final parts = [
      tags['addr:housenumber'],
      tags['addr:street'],
      tags['addr:barangay'],
      tags['addr:village'],
      tags['addr:city'] ?? tags['addr:municipality'],
      tags['addr:province'] ?? tags['addr:state'],
    ].map((v) => (v ?? '').toString().trim()).where((s) => s.isNotEmpty);
    if (parts.isEmpty) return null;
    // A bare street with nothing to place it is worse than no address at all,
    // because the picker would then skip the reverse geocode that would.
    final joined = parts.join(', ');
    return parts.length < 2 ? null : joined;
  }
}
