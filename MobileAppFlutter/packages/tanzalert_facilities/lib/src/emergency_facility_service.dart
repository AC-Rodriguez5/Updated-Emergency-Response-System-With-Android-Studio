import 'dart:math' as math;

import 'package:dio/dio.dart';

import 'ph_emergency_facility_seeds.dart';
import 'emergency_facility.dart';

/// What a bounds lookup produced, including whether the live query actually
/// reached a server. The picker shows the difference: seeds-only is a working
/// map with fewer pins, not an error, but the user should still know the live
/// list is incomplete rather than believe the area has no hospital.
class FacilityLookup {
  final List<EmergencyFacility> facilities;
  final bool liveDataReached;

  const FacilityLookup({
    required this.facilities,
    required this.liveDataReached,
  });
}

/// Finds emergency facilities — hospitals, Red Cross chapters, MDRRMO/DRRMO
/// offices, BFP fire stations, police stations and ambulance stations —
/// anywhere in the Philippines, from OpenStreetMap via Overpass.
///
/// Three things keep this usable on a phone in an emergency:
///  * the bundled [phEmergencyFacilitySeeds] answer instantly and offline, and
///    are always merged in, so the map is never empty;
///  * mirrors are tried in turn, because the public Overpass endpoints
///    regularly answer 429/500/502 under load;
///  * results are cached per coarse tile, so panning around does not re-query
///    (Overpass asks automated clients to be gentle, and so does Nominatim).
class EmergencyFacilityService {
  EmergencyFacilityService({Dio? dio})
      : _dio = dio ??
            Dio(BaseOptions(
              headers: {
                // Overpass rejects requests with no descriptive User-Agent.
                'User-Agent': 'TanzAlert-MobileUser/1.0 (Tanza MDRRMO)',
                'Content-Type': 'text/plain; charset=utf-8',
              },
              connectTimeout: const Duration(seconds: 10),
              receiveTimeout: const Duration(seconds: 30),
              responseType: ResponseType.json,
            ));

  final Dio _dio;

  /// Ordered by how reliably each answered while this was built. Rotating is
  /// not optional: on 2026-10-19, overpass-api.de returned "502 at capacity"
  /// and kumi.systems a 500 for the same query that private.coffee served.
  ///
  /// Every mirror here must carry planet-wide data. overpass.osm.ch was tried
  /// and removed: it serves a Switzerland-only extract, so it answered 200 with
  /// zero elements for Tanza — a "success" that would have been cached as
  /// "this town has no hospital". Regional mirrors are worse than no mirror.
  static const List<String> _mirrors = [
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  /// Below this zoom the viewport covers whole provinces, where a query would
  /// return thousands of pins and time out. Seeds still show.
  static const double minLiveQueryZoom = 11;

  final Map<String, List<EmergencyFacility>> _cache = {};

  /// Facilities inside the given bounds. Never throws: a failed live query
  /// degrades to the bundled baseline.
  Future<FacilityLookup> inBounds({
    required double south,
    required double west,
    required double north,
    required double east,
    required double zoom,
  }) async {
    final seeds = phEmergencyFacilitySeeds
        .where((f) =>
            f.latitude >= south &&
            f.latitude <= north &&
            f.longitude >= west &&
            f.longitude <= east)
        .toList();

    if (zoom < minLiveQueryZoom) {
      return FacilityLookup(facilities: seeds, liveDataReached: false);
    }

    // Snap the box out to a coarse grid so small pans reuse one cache entry
    // and one query instead of firing a new one for every drag.
    final key = _cacheKey(south, west, north, east);
    final cached = _cache[key];
    if (cached != null) {
      return FacilityLookup(
        facilities: _merge(seeds, cached),
        liveDataReached: true,
      );
    }

    final live = await _queryOverpass(_snap(south, west, north, east));
    // An empty result is not cached and does not count as reaching live data.
    // A genuinely unmapped rural area and a mirror serving the wrong continent
    // look identical from here, and of the two possible mistakes, repeating a
    // query costs less than telling someone their town has no hospital.
    if (live == null || live.isEmpty) {
      return FacilityLookup(facilities: seeds, liveDataReached: false);
    }

    _cache[key] = live;
    return FacilityLookup(
      facilities: _merge(seeds, live),
      liveDataReached: true,
    );
  }

  /// Answers "hospital near me" and its siblings: the facilities closest to a
  /// point, nearest first.
  ///
  /// The search widens in steps rather than starting wide, because a 45 km box
  /// over Metro Manila returns hundreds of pins and takes seconds, while most
  /// answers are within a few kilometres. Each step reuses [inBounds], so its
  /// cache and its seed fallback apply here too — "nearest hospital" still
  /// answers with Tanza General Hospital when Overpass is unreachable.
  ///
  /// [nameTerms] narrows a kind to a particular place ("divine grace" of
  /// "divine grace hospital"). A term that matches nothing is ignored rather
  /// than returning an empty list, so a typo degrades to "nearest of this
  /// kind" instead of a dead end.
  Future<FacilityLookup> nearest({
    required double latitude,
    required double longitude,
    EmergencyFacilityType? type,
    List<String> nameTerms = const [],
    int limit = 12,
  }) async {
    const radiiKm = [6.0, 18.0, 45.0];
    var liveDataReached = false;

    for (final radiusKm in radiiKm) {
      final dLat = radiusKm / 111.32;
      // Degrees of longitude shrink towards the poles; at Philippine latitudes
      // this is a few percent, but it is free to be right about it.
      final dLng = dLat / math.max(math.cos(latitude * math.pi / 180), 0.01);

      final lookup = await inBounds(
        south: latitude - dLat,
        west: longitude - dLng,
        north: latitude + dLat,
        east: longitude + dLng,
        // Well above the live-query floor: this is a deliberate search, not an
        // incidental pan, so it should always reach for live data.
        zoom: 15,
      );
      liveDataReached = liveDataReached || lookup.liveDataReached;

      var candidates = type == null
          ? lookup.facilities
          : lookup.facilities.where((f) => f.type == type).toList();

      if (nameTerms.isNotEmpty) {
        final narrowed = candidates.where((f) {
          final haystack = '${f.name} ${f.address ?? ''}'.toLowerCase();
          return nameTerms.every((t) => haystack.contains(t));
        }).toList();
        if (narrowed.isNotEmpty) candidates = narrowed;
      }

      if (candidates.isEmpty) continue;

      final sorted = candidates.toList()
        ..sort((a, b) => _metresFromPoint(latitude, longitude, a)
            .compareTo(_metresFromPoint(latitude, longitude, b)));
      return FacilityLookup(
        facilities: sorted.take(limit).toList(),
        liveDataReached: liveDataReached,
      );
    }

    return FacilityLookup(facilities: const [], liveDataReached: liveDataReached);
  }

  /// Returns null when every mirror failed. An empty list means a mirror
  /// answered but matched nothing; [inBounds] treats that the same as a failure
  /// for the reason given there.
  Future<List<EmergencyFacility>?> _queryOverpass(_Box box) async {
    final query = _overpassQuery(box);
    for (final mirror in _mirrors) {
      try {
        final res = await _dio.post<dynamic>(mirror, data: query);
        final data = res.data;
        final elements = (data is Map ? data['elements'] : null) as List?;
        if (elements == null) continue;
        return elements
            .whereType<Map>()
            .map((e) => EmergencyFacility.fromOverpass(e.cast<String, dynamic>()))
            .whereType<EmergencyFacility>()
            .toList();
      } catch (_) {
        continue; // try the next mirror
      }
    }
    return null;
  }

  /// Tag choices come from auditing what Philippine facilities actually carry:
  /// Red Cross branches appear as office=ngo, healthcare=blood_donation and
  /// even amenity=clinic; MDRRMOs as emergency=disaster_response,
  /// emergency=rescue_station or office=government + government=
  /// emergency_management; BFP stations as amenity=fire_station with
  /// operator="Bureau of Fire Protection". The name regex catches the ones
  /// carrying no useful tag at all.
  ///
  /// amenity=clinic is deliberately NOT queried wholesale: in Cavite it is
  /// mostly optical shops, dental and veterinary clinics, which are not
  /// somewhere an ambulance delivers a patient. Red Cross branches tagged that
  /// way are still picked up by name.
  String _overpassQuery(_Box box) {
    final bbox = '${box.south},${box.west},${box.north},${box.east}';
    final emergencyRe = r'^(ambulance_station|disaster_response|rescue_station)$';
    return [
      '[out:json][timeout:25];',
      '(',
      '  nwr["amenity"="hospital"]($bbox);',
      '  nwr["amenity"="police"]($bbox);',
      '  nwr["amenity"="fire_station"]($bbox);',
      '  nwr["emergency"~"$emergencyRe"]($bbox);',
      '  nwr["office"="government"]["government"="emergency_management"]($bbox);',
      '  nwr["name"~"Red Cross|DRRMO|Disaster Risk Reduction",i]($bbox);',
      ');',
      'out center tags;',
    ].join('\n');
  }

  /// Seeds win over live results they duplicate: a curated name like
  /// "Tanza Municipal Police Station" reads better than OSM's "Tanza Police
  /// Station", and a curated address beats one we would have to geocode.
  List<EmergencyFacility> _merge(
    List<EmergencyFacility> seeds,
    List<EmergencyFacility> live,
  ) {
    final out = [...seeds];
    for (final candidate in live) {
      if (!out.any((existing) => _isSameFacility(existing, candidate))) {
        out.add(candidate);
      }
    }
    return out;
  }

  /// Whether two entries are the same real-world facility.
  ///
  /// Distance alone is not enough in either direction. OSM routinely holds the
  /// same hospital twice — once as a building way, once as an entrance node —
  /// tens of metres apart, which must collapse into one pin. But in a town
  /// centre two genuinely different facilities of the same kind can also sit
  /// a hundred metres apart, and dropping one of those would hide a real
  /// destination. So beyond touching distance, the names have to agree too.
  bool _isSameFacility(EmergencyFacility a, EmergencyFacility b) {
    if (a.type != b.type) return false;
    final metres = _metresBetween(a, b);
    if (metres >= 120) return false;
    if (metres < 40) return true; // practically on top of each other
    return _namesAgree(a.name, b.name);
  }

  /// Words that say what kind of place it is rather than which one, and so
  /// carry no weight when deciding whether two names describe the same place.
  static const Set<String> _genericNameWords = {
    'hospital',
    'medical',
    'center',
    'centre',
    'clinic',
    'station',
    'substation',
    'sub',
    'police',
    'fire',
    'bureau',
    'protection',
    'department',
    'office',
    'municipal',
    'city',
    'provincial',
    'headquarters',
    'hq',
    'the',
    'of',
    'and',
    'inc',
    'incorporated',
    'co',
  };

  bool _namesAgree(String a, String b) {
    Set<String> distinctive(String name) => name
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9ñ\s]'), ' ')
        .split(RegExp(r'\s+'))
        .where((w) => w.length > 1 && !_genericNameWords.contains(w))
        .toSet();

    final left = distinctive(a);
    final right = distinctive(b);
    // Two names made only of generic words ("Fire Station" / "Fire Station")
    // cannot be told apart, and at under 120 m they are almost certainly one
    // place mapped twice.
    if (left.isEmpty || right.isEmpty) return true;
    return left.intersection(right).isNotEmpty;
  }

  /// Equirectangular approximation — accurate well under a metre at these
  /// separations, and far cheaper than haversine for an O(n*m) dedupe.
  double _metresBetween(EmergencyFacility a, EmergencyFacility b) =>
      _metres(a.latitude, a.longitude, b.latitude, b.longitude);

  double _metresFromPoint(
    double latitude,
    double longitude,
    EmergencyFacility f,
  ) =>
      _metres(latitude, longitude, f.latitude, f.longitude);

  double _metres(double lat1, double lng1, double lat2, double lng2) {
    const metresPerDegree = 111320.0;
    final dLat = (lat1 - lat2) * metresPerDegree;
    final meanLat = (lat1 + lat2) / 2 * math.pi / 180;
    final dLng = (lng1 - lng2) * metresPerDegree * math.cos(meanLat);
    return math.sqrt(dLat * dLat + dLng * dLng);
  }

  static const double _gridDegrees = 0.05; // ~5.5 km

  _Box _snap(double south, double west, double north, double east) => _Box(
        south: (south / _gridDegrees).floorToDouble() * _gridDegrees,
        west: (west / _gridDegrees).floorToDouble() * _gridDegrees,
        north: (north / _gridDegrees).ceilToDouble() * _gridDegrees,
        east: (east / _gridDegrees).ceilToDouble() * _gridDegrees,
      );

  String _cacheKey(double south, double west, double north, double east) {
    final b = _snap(south, west, north, east);
    return '${b.south},${b.west},${b.north},${b.east}';
  }
}

class _Box {
  final double south;
  final double west;
  final double north;
  final double east;

  const _Box({
    required this.south,
    required this.west,
    required this.north,
    required this.east,
  });
}
