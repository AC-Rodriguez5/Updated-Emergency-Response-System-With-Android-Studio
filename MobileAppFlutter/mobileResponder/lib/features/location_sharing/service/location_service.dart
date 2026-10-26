import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../../../core/duty/duty_service.dart';
import '../../../core/networking/api_client.dart';

final locationServiceProvider = Provider<LocationService>((ref) => LocationService(ref.read(dioProvider)));

/// Streams the responder's position to the backend.
///
/// While on duty this does not open a GPS stream of its own. The duty
/// foreground service already holds one — it has to, because a stream in the UI
/// isolate stops the moment Android idles the process, which is most of a
/// shift — so this hands it the tag instead. Two streams would mean two sets of
/// fixes for the same responder, half of them untagged.
class LocationService {
  final Dio _dio;
  StreamSubscription<Position>? _sub;

  /// True while the duty service is carrying the stream for us.
  bool _delegated = false;

  LocationService(this._dio);

  void startBroadcast({String? emergencyId, String? ambulanceRequestId}) {
    unawaited(_start(emergencyId: emergencyId, ambulanceRequestId: ambulanceRequestId));
  }

  Future<void> _start({String? emergencyId, String? ambulanceRequestId}) async {
    if (await DutyService.isRunning) {
      _delegated = true;
      await _sub?.cancel();
      _sub = null;
      DutyService.setLocationTag(
        emergencyId: emergencyId,
        ambulanceRequestId: ambulanceRequestId,
      );
      return;
    }

    _delegated = false;
    await _sub?.cancel();
    _sub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
      ),
    ).listen((pos) async {
      try {
        await _dio.post('/locations/responder', data: {
          'coordinates': [pos.longitude, pos.latitude],
          'accuracyMeters': pos.accuracy,
          'capturedAt': DateTime.now().toUtc().toIso8601String(),
          'emergencyId': ?emergencyId,
          'ambulanceRequestId': ?ambulanceRequestId,
        });
      } catch (_) {}
    });
  }

  void stopBroadcast() {
    if (_delegated) {
      // The duty stream keeps running — it is the shift's, not this screen's.
      // Only the tag belongs to the screen, so only the tag is cleared.
      _delegated = false;
      DutyService.setLocationTag();
      return;
    }
    _sub?.cancel();
    _sub = null;
  }

  void dispose() => stopBroadcast();
}
