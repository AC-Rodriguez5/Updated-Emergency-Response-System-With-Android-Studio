import 'package:dio/dio.dart';

class NominatimResult {
  final double latitude;
  final double longitude;
  final String displayName;

  const NominatimResult({
    required this.latitude,
    required this.longitude,
    required this.displayName,
  });
}

class NominatimService {
  NominatimService()
      : _dio = Dio(BaseOptions(
          baseUrl: 'https://nominatim.openstreetmap.org',
          headers: {
            // Nominatim usage policy requires a descriptive User-Agent.
            'User-Agent': 'TanzAlert-MobileUser/1.0 (Tanza MDRRMO)',
          },
          connectTimeout: const Duration(seconds: 8),
          receiveTimeout: const Duration(seconds: 8),
        ));

  final Dio _dio;

  /// Reverse geocodes a pin into a full, human-readable address.
  ///
  /// Nominatim's `display_name` is exactly what the location label wants — the
  /// whole address, house number through province — instead of the handful of
  /// fields the platform geocoder returns. Results are memoised per rounded
  /// coordinate because Nominatim's usage policy caps automated callers at
  /// roughly one request a second, and panning a map fires far more than that.
  ///
  /// Returns null on any failure so callers can fall back to coordinates
  /// rather than show an error the user cannot act on.
  Future<String?> reverseGeocode(double latitude, double longitude) async {
    // ~11 m of precision: finer than that is noise for an address lookup and
    // would defeat the cache while a finger rests on the map.
    final key =
        '${latitude.toStringAsFixed(4)},${longitude.toStringAsFixed(4)}';
    final hit = _reverseCache[key];
    if (hit != null) return hit;

    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/reverse',
        queryParameters: {
          'lat': latitude,
          'lon': longitude,
          'format': 'jsonv2',
          'addressdetails': 1,
          // 18 = building level. Lower zooms answer with just the barangay,
          // which is not the address someone pinned.
          'zoom': 18,
        },
      );
      final name = res.data?['display_name']?.toString().trim();
      if (name == null || name.isEmpty) return null;
      _reverseCache[key] = name;
      return name;
    } catch (_) {
      return null;
    }
  }

  final Map<String, String> _reverseCache = {};

  Future<List<NominatimResult>> search(
    String query, {
    int limit = 6,
    String countryCodes = 'ph',
  }) async {
    final q = query.trim();
    if (q.isEmpty) return const [];
    try {
      final res = await _dio.get<List<dynamic>>(
        '/search',
        queryParameters: {
          'q': q,
          'format': 'jsonv2',
          'addressdetails': 0,
          'limit': limit,
          'countrycodes': countryCodes,
        },
      );
      final items = res.data ?? const [];
      return items
          .whereType<Map<String, dynamic>>()
          .map((m) {
            final lat = double.tryParse('${m['lat']}');
            final lon = double.tryParse('${m['lon']}');
            final name = m['display_name']?.toString() ?? '';
            if (lat == null || lon == null || name.isEmpty) return null;
            return NominatimResult(latitude: lat, longitude: lon, displayName: name);
          })
          .whereType<NominatimResult>()
          .toList();
    } catch (_) {
      return const [];
    }
  }
}
