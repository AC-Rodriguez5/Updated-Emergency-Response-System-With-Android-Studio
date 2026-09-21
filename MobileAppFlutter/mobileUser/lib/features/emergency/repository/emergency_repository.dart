import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../../../core/networking/api_client.dart';
import '../models/emergency_model.dart';

final emergencyRepositoryProvider = Provider<EmergencyRepository>(
  (ref) => EmergencyRepository(ref.read(dioProvider)),
);

class EmergencyRepository {
  final Dio _dio;
  EmergencyRepository(this._dio);

  Future<EmergencyModel> createEmergency({
    required String type,
    required Position location,
    String? barangay,
    String? notes,
  }) async {
    try {
      final response = await _dio.post(
        '/emergencies',
        data: {
          'type': type,
          'source': 'mobile_app',
          'location': {
            'type': 'Point',
            'coordinates': [location.longitude, location.latitude],
            'accuracyMeters': location.accuracy,
            'capturedAt': DateTime.now().toUtc().toIso8601String(),
          },
          'barangay': ?barangay,
          'notes': ?notes,
        },
      );
      final data =
          (response.data as Map<String, dynamic>)['data']
              as Map<String, dynamic>;
      return EmergencyModel.fromJson(data);
    } on DioException catch (e) {
      throw dioErrorToApiException(e);
    }
  }

  Future<EmergencyModel> createFromIot({
    required Map<String, dynamic> payload,
  }) async {
    try {
      final response = await _dio.post('/emergencies/from-iot', data: payload);
      final data =
          (response.data as Map<String, dynamic>)['data']
              as Map<String, dynamic>;
      return EmergencyModel.fromJson(data);
    } on DioException catch (e) {
      throw dioErrorToApiException(e);
    }
  }

  Future<EmergencyModel> getEmergency(String id) async {
    try {
      final response = await _dio.get('/emergencies/$id');
      final data =
          (response.data as Map<String, dynamic>)['data']
              as Map<String, dynamic>;
      return EmergencyModel.fromJson(data);
    } on DioException catch (e) {
      throw dioErrorToApiException(e);
    }
  }

  Future<List<EmergencyModel>> getMyEmergencies() async {
    try {
      final response = await _dio.get('/emergencies/my');
      final data =
          (response.data as Map<String, dynamic>)['data']
              as Map<String, dynamic>;
      final items = data['items'] as List? ?? [];
      return items
          .map((e) => EmergencyModel.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw dioErrorToApiException(e);
    }
  }

  Future<EmergencyModel?> getCurrentActiveEmergency() async {
    final emergencies = await getMyEmergencies();
    for (final emergency in emergencies) {
      if (emergency.isActive) return emergency;
    }
    return null;
  }

  Future<void> cancelEmergency(String id, {String? reason}) async {
    try {
      await _dio.post('/emergencies/$id/cancel', data: {'reason': ?reason});
    } on DioException catch (e) {
      throw dioErrorToApiException(e);
    }
  }

  Future<void> sendLocation({
    required Position location,
    String? emergencyId,
  }) async {
    try {
      await _dio.post(
        '/locations/user',
        data: {
          'coordinates': [location.longitude, location.latitude],
          'accuracyMeters': location.accuracy,
          'capturedAt': DateTime.now().toUtc().toIso8601String(),
          'emergencyId': ?emergencyId,
        },
      );
    } on DioException catch (_) {
      // silently fail location updates
    }
  }
}
