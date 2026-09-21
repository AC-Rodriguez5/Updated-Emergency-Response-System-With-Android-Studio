import 'dart:async';
import 'dart:convert';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:hive/hive.dart';
import '../../features/emergency/models/emergency_model.dart';
import '../../features/emergency/repository/emergency_repository.dart';

class OfflineSyncService {
  final EmergencyRepository _repo;
  final Box<String> _pendingAlerts;
  StreamSubscription? _connectivitySub;
  final _syncedController = StreamController<EmergencyModel>.broadcast();

  Stream<EmergencyModel> get onAlertSynced => _syncedController.stream;
  bool get hasPending => _pendingAlerts.isNotEmpty;

  OfflineSyncService(this._repo, this._pendingAlerts);

  void start() {
    _connectivitySub = Connectivity().onConnectivityChanged.listen((
      List<ConnectivityResult> results,
    ) {
      if (results.any((r) => r != ConnectivityResult.none) && hasPending) {
        _drainQueue();
      }
    });
  }

  void queueManual({
    required String type,
    required Position location,
    String? barangay,
    String? notes,
  }) {
    _pendingAlerts.put(
      'alert_${DateTime.now().millisecondsSinceEpoch}',
      jsonEncode({
        'type': 'manual',
        'payload': {
          'emergencyType': type,
          'location': _positionToMap(location),
          'barangay': barangay,
          'notes': notes,
        },
        'queuedAt': DateTime.now().toUtc().toIso8601String(),
      }),
    );
  }

  Future<void> queueIot(Map<String, dynamic> payload) {
    final deviceId = payload['deviceId'] as String;
    final eventId = payload['eventId'] as String;
    return _pendingAlerts.put(
      'iot:$deviceId:$eventId',
      jsonEncode({
        'type': 'iot',
        'payload': payload,
        'queuedAt': DateTime.now().toUtc().toIso8601String(),
      }),
    );
  }

  Future<void> _drainQueue() async {
    final keys = _pendingAlerts.keys.cast<String>().toList();
    for (final key in keys) {
      final raw = _pendingAlerts.get(key);
      if (raw == null) continue;
      try {
        final data = jsonDecode(raw) as Map<String, dynamic>;
        final EmergencyModel em;
        if (data['type'] == 'manual') {
          final p = data['payload'] as Map<String, dynamic>;
          em = await _repo.createEmergency(
            type: p['emergencyType'] as String,
            location: _positionFromMap(p['location'] as Map<String, dynamic>),
            barangay: p['barangay'] as String?,
            notes: p['notes'] as String?,
          );
        } else {
          final p = data['payload'] as Map<String, dynamic>;
          em = await _repo.createFromIot(payload: p);
        }
        await _pendingAlerts.delete(key);
        _syncedController.add(em);
      } catch (_) {
        // leave in queue; will retry on next connectivity event
      }
    }
  }

  Map<String, dynamic> _positionToMap(Position p) => {
    'latitude': p.latitude,
    'longitude': p.longitude,
    'accuracy': p.accuracy,
    'timestamp': p.timestamp.toUtc().toIso8601String(),
  };

  Position _positionFromMap(Map<String, dynamic> m) => Position(
    latitude: (m['latitude'] as num).toDouble(),
    longitude: (m['longitude'] as num).toDouble(),
    accuracy: (m['accuracy'] as num).toDouble(),
    timestamp: DateTime.parse(m['timestamp'] as String),
    altitude: 0,
    altitudeAccuracy: 0,
    heading: 0,
    headingAccuracy: 0,
    speed: 0,
    speedAccuracy: 0,
  );

  void dispose() {
    _connectivitySub?.cancel();
    _syncedController.close();
  }
}

final offlineSyncServiceProvider = Provider<OfflineSyncService>((ref) {
  final repo = ref.read(emergencyRepositoryProvider);
  final box = Hive.box<String>('pending_alerts');
  final service = OfflineSyncService(repo, box);
  service.start();
  ref.onDispose(service.dispose);
  return service;
});
