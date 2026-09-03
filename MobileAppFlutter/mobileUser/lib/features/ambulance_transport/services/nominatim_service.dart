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
