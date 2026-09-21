import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive/hive.dart';

import '../../../core/config/app_config.dart';
import '../../../core/networking/api_client.dart';

enum BleConnectionState { off, scanning, connected, disconnected }

class BleDeviceState {
  final BleConnectionState connection;
  final String? deviceId;
  final String? serverDeviceId;
  final String? deviceName;
  final int? batteryPercent;
  final DateTime? lastSeen;
  final String? firmwareVersion;
  final bool fingerprintReady;
  final bool fingerprintEnrolled;
  final bool pairingWindow;
  final bool provisioned;
  final bool directCellularEnabled;
  final String enrollmentStatus;
  final String? message;

  const BleDeviceState({
    this.connection = BleConnectionState.disconnected,
    this.deviceId,
    this.serverDeviceId,
    this.deviceName,
    this.batteryPercent,
    this.lastSeen,
    this.firmwareVersion,
    this.fingerprintReady = false,
    this.fingerprintEnrolled = false,
    this.pairingWindow = false,
    this.provisioned = false,
    this.directCellularEnabled = false,
    this.enrollmentStatus = 'not_started',
    this.message,
  });

  bool get isConnected => connection == BleConnectionState.connected;
  bool get isHeartbeatStale =>
      lastSeen != null &&
      DateTime.now().difference(lastSeen!) >
          const Duration(seconds: AppConfig.bleHeartbeatTimeoutSec);

  BleDeviceState copyWith({
    BleConnectionState? connection,
    String? deviceId,
    String? serverDeviceId,
    String? deviceName,
    int? batteryPercent,
    DateTime? lastSeen,
    String? firmwareVersion,
    bool? fingerprintReady,
    bool? fingerprintEnrolled,
    bool? pairingWindow,
    bool? provisioned,
    bool? directCellularEnabled,
    String? enrollmentStatus,
    String? message,
    bool clearMessage = false,
  }) => BleDeviceState(
    connection: connection ?? this.connection,
    deviceId: deviceId ?? this.deviceId,
    serverDeviceId: serverDeviceId ?? this.serverDeviceId,
    deviceName: deviceName ?? this.deviceName,
    batteryPercent: batteryPercent ?? this.batteryPercent,
    lastSeen: lastSeen ?? this.lastSeen,
    firmwareVersion: firmwareVersion ?? this.firmwareVersion,
    fingerprintReady: fingerprintReady ?? this.fingerprintReady,
    fingerprintEnrolled: fingerprintEnrolled ?? this.fingerprintEnrolled,
    pairingWindow: pairingWindow ?? this.pairingWindow,
    provisioned: provisioned ?? this.provisioned,
    directCellularEnabled: directCellularEnabled ?? this.directCellularEnabled,
    enrollmentStatus: enrollmentStatus ?? this.enrollmentStatus,
    message: clearMessage ? null : message ?? this.message,
  );
}

typedef BleEventCallback =
    Future<bool> Function(Map<String, dynamic> emergencyPayload);

class BleService extends StateNotifier<BleDeviceState> {
  final Dio _dio;
  final Box<String> _offlineQueue;
  BleEventCallback? onEmergency;

  final _processedEventIds = <String>{};
  final _processingEventIds = <String>{};
  BluetoothDevice? _device;
  BluetoothCharacteristic? _configCharacteristic;
  StreamSubscription<List<ScanResult>>? _scanSub;
  StreamSubscription<BluetoothConnectionState>? _connSub;
  final List<StreamSubscription<List<int>>> _notifySubscriptions = [];
  Timer? _heartbeatTimer;

  BleService(this._dio, this._offlineQueue) : super(const BleDeviceState());

  Future<void> startScan() async {
    await _scanSub?.cancel();
    state = state.copyWith(
      connection: BleConnectionState.scanning,
      clearMessage: true,
    );
    try {
      _scanSub = FlutterBluePlus.scanResults.listen((results) {
        if (results.isEmpty ||
            state.connection != BleConnectionState.scanning) {
          return;
        }
        unawaited(FlutterBluePlus.stopScan());
        unawaited(_scanSub?.cancel());
        unawaited(_connectAndPair(results.first.device));
      });
      await FlutterBluePlus.startScan(
        withServices: [Guid(AppConfig.serviceUuid)],
        timeout: const Duration(seconds: 10),
      );
      await Future<void>.delayed(const Duration(seconds: 11));
      if (state.connection == BleConnectionState.scanning) {
        state = state.copyWith(
          connection: BleConnectionState.disconnected,
          message:
              'No TanzAlert device was found. Reopen pairing mode and scan again.',
        );
      }
    } catch (error) {
      state = state.copyWith(
        connection: BleConnectionState.disconnected,
        message: 'Bluetooth scan failed: $error',
      );
    }
  }

  Future<void> _connectAndPair(BluetoothDevice device) async {
    try {
      await device.connect(autoConnect: false);
      await device.requestMtu(247);
      _device = device;
      final services = await device.discoverServices();
      final characteristics = services
          .where(
            (service) =>
                service.uuid.str.toLowerCase() ==
                AppConfig.serviceUuid.toLowerCase(),
          )
          .expand((service) => service.characteristics)
          .toList();
      _configCharacteristic = characteristics.firstWhere(
        (characteristic) =>
            characteristic.uuid.str.toLowerCase() ==
            AppConfig.configCharUuid.toLowerCase(),
      );
      final identity = await _readIdentity();
      final deviceId = identity['deviceId'];
      if (deviceId is! String || !deviceId.startsWith('SA-ESP32-')) {
        throw StateError('Device identity is missing or invalid.');
      }
      if (identity['pairingWindow'] != true) {
        final enrolled = identity['fingerprintEnrolled'] == true;
        throw StateError(
          enrolled
              ? 'Scan the enrolled finger, then hold the emergency button for 8 seconds.'
              : 'Hold the emergency button for 8 seconds, then scan again.',
        );
      }

      final response = await _dio.post<Map<String, dynamic>>(
        '/user/ble-devices/pair',
        data: {
          'deviceId': deviceId,
          'bleServiceUuid': AppConfig.serviceUuid,
          'firmwareVersion': identity['firmwareVersion'],
          'fingerprintEnrolled': identity['fingerprintEnrolled'] == true,
        },
      );
      final paired = response.data?['data'] as Map<String, dynamic>?;
      final token = paired?['deviceToken'];
      if (paired == null || token is! String || token.length < 32) {
        throw StateError('The server did not return device provisioning data.');
      }
      await _configCharacteristic!.write(
        utf8.encode(
          jsonEncode({
            'command': 'provision',
            'deviceToken': token,
            'apiBase': AppConfig.apiBaseUrl,
            'apn': AppConfig.cellularApn,
            'cellularEnabled': AppConfig.directCellularReady,
          }),
        ),
        withoutResponse: false,
      );
      await Future<void>.delayed(const Duration(milliseconds: 500));
      final provisioned = await _readIdentity();
      if (provisioned['provisioned'] != true) {
        throw StateError(
          'The device rejected provisioning. Reopen pairing mode.',
        );
      }
      await _dio.patch(
        '/user/ble-devices/${paired['_id']}',
        data: {
          'fingerprintEnrolled': provisioned['fingerprintEnrolled'] == true,
          'directCellularEnabled': provisioned['directCellularEnabled'] == true,
          'firmwareVersion': provisioned['firmwareVersion'],
        },
      );

      state = state.copyWith(
        connection: BleConnectionState.connected,
        deviceId: deviceId,
        serverDeviceId: paired['_id']?.toString(),
        deviceName: device.platformName.isEmpty
            ? 'TanzAlert wearable'
            : device.platformName,
        lastSeen: DateTime.now(),
        firmwareVersion: provisioned['firmwareVersion']?.toString(),
        fingerprintReady: provisioned['fingerprintReady'] == true,
        fingerprintEnrolled: provisioned['fingerprintEnrolled'] == true,
        pairingWindow: provisioned['pairingWindow'] == true,
        provisioned: true,
        directCellularEnabled: provisioned['directCellularEnabled'] == true,
        enrollmentStatus:
            provisioned['enrollmentStatus']?.toString() ?? 'ready',
        clearMessage: true,
      );
      await _subscribe(characteristics);
      _startHeartbeatTimer();
      _connSub = device.connectionState.listen((connection) {
        if (connection == BluetoothConnectionState.disconnected) {
          state = state.copyWith(
            connection: BleConnectionState.disconnected,
            message: 'TanzAlert device disconnected. Scan to reconnect.',
          );
          _heartbeatTimer?.cancel();
        }
      });
      await retryQueuedEvents();
    } catch (error) {
      await disconnect(clearState: false);
      state = state.copyWith(
        connection: BleConnectionState.disconnected,
        message: '$error'.replaceFirst('Bad state: ', ''),
      );
    }
  }

  Future<Map<String, dynamic>> _readIdentity() async {
    final characteristic = _configCharacteristic;
    if (characteristic == null) {
      throw StateError('Device configuration is unavailable.');
    }
    return jsonDecode(utf8.decode(await characteristic.read()))
        as Map<String, dynamic>;
  }

  Future<void> _subscribe(List<BluetoothCharacteristic> characteristics) async {
    for (final subscription in _notifySubscriptions) {
      await subscription.cancel();
    }
    _notifySubscriptions.clear();
    for (final characteristic in characteristics) {
      final uuid = characteristic.uuid.str.toLowerCase();
      if (uuid == AppConfig.eventCharUuid.toLowerCase()) {
        await characteristic.setNotifyValue(true);
        _notifySubscriptions.add(
          characteristic.onValueReceived.listen(
            (bytes) => unawaited(_handleHardwareEvent(bytes)),
          ),
        );
      } else if (uuid == AppConfig.heartbeatCharUuid.toLowerCase()) {
        await characteristic.setNotifyValue(true);
        _notifySubscriptions.add(
          characteristic.onValueReceived.listen((_) {
            state = state.copyWith(lastSeen: DateTime.now());
          }),
        );
      } else if (uuid == AppConfig.batteryCharUuid.toLowerCase()) {
        await characteristic.setNotifyValue(true);
        _notifySubscriptions.add(
          characteristic.onValueReceived.listen((value) {
            if (value.isNotEmpty) {
              state = state.copyWith(
                batteryPercent: value.first,
                lastSeen: DateTime.now(),
              );
            }
          }),
        );
      }
    }
  }

  Map<String, dynamic>? _decodeHardwareEvent(List<int> bytes) {
    final event = jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
    final deviceId = event['deviceId'] ?? event['d'];
    final eventId = event['eventId'] ?? event['e'];
    final emergencyType = event['buttonType'] ?? event['type'] ?? event['t'];
    final fingerprintVerified =
        event['fingerprintVerified'] == true ||
        event['authMethod'] == 'fingerprint' ||
        event['f'] == true;
    final nested = event['location'];
    final location = nested is Map<String, dynamic>
        ? nested
        : <String, dynamic>{
            'type': 'Point',
            'coordinates': [event['lo'], event['la']],
            'accuracyMeters': event['a'],
            'capturedAt': event['at'],
          };
    final coordinates = location['coordinates'];
    final capturedAt = location['capturedAt'];
    if (deviceId != state.deviceId ||
        eventId is! String ||
        emergencyType != 'general_sos' ||
        !fingerprintVerified ||
        coordinates is! List ||
        coordinates.length != 2 ||
        coordinates[0] is! num ||
        coordinates[1] is! num ||
        location['accuracyMeters'] is! num ||
        capturedAt is! String ||
        DateTime.tryParse(capturedAt) == null) {
      return null;
    }
    return {
      'deviceId': deviceId,
      'eventId': eventId,
      'buttonType': 'general_sos',
      'fingerprintVerified': true,
      'authMethod': 'fingerprint',
      'transport': 'ble',
      'firmwareVersion':
          event['firmwareVersion'] ?? event['v'] ?? state.firmwareVersion,
      if ((event['batteryLevel'] ?? event['b']) is num)
        'deviceBatteryAtTrigger': event['batteryLevel'] ?? event['b'],
      if ((event['gnssHdop'] ?? event['h']) is num)
        'gnssHdop': event['gnssHdop'] ?? event['h'],
      if ((event['gnssSatellites'] ?? event['s']) is int)
        'gnssSatellites': event['gnssSatellites'] ?? event['s'],
      'deviceTimestamp': capturedAt,
      'location': {
        'type': 'Point',
        'coordinates': [
          (coordinates[0] as num).toDouble(),
          (coordinates[1] as num).toDouble(),
        ],
        'accuracyMeters': (location['accuracyMeters'] as num).toDouble(),
        'capturedAt': capturedAt,
      },
    };
  }

  Future<void> _handleHardwareEvent(List<int> bytes) async {
    String? processingEventId;
    try {
      final payload = _decodeHardwareEvent(bytes);
      if (payload == null) {
        state = state.copyWith(
          message: 'Ignored an invalid or unauthenticated hardware event.',
        );
        return;
      }
      final eventId = payload['eventId'] as String;
      if (_processedEventIds.contains(eventId)) {
        await _acknowledge(eventId);
        return;
      }
      if (!_processingEventIds.add(eventId)) return;
      processingEventId = eventId;
      final key = 'hardware:${payload['deviceId']}:$eventId';
      await _offlineQueue.put(key, jsonEncode(payload));
      final accepted = await onEmergency?.call(payload) ?? false;
      if (accepted) {
        await _offlineQueue.delete(key);
        _processedEventIds.add(eventId);
        if (_processedEventIds.length > 1000) {
          _processedEventIds.remove(_processedEventIds.first);
        }
        await _acknowledge(eventId);
        state = state.copyWith(
          lastSeen: DateTime.now(),
          message: 'Fingerprint-authorized SOS was saved for delivery.',
        );
      }
    } catch (error) {
      state = state.copyWith(message: 'Hardware event remains queued: $error');
    } finally {
      if (processingEventId != null) {
        _processingEventIds.remove(processingEventId);
      }
    }
  }

  Future<void> retryQueuedEvents() async {
    final callback = onEmergency;
    if (callback == null) return;
    for (final key in _offlineQueue.keys.cast<String>().toList()) {
      final raw = _offlineQueue.get(key);
      if (raw == null) continue;
      try {
        final payload = jsonDecode(raw) as Map<String, dynamic>;
        if (payload['deviceId'] != state.deviceId) continue;
        if (await callback(payload)) {
          await _offlineQueue.delete(key);
          await _acknowledge(payload['eventId'] as String);
        }
      } catch (_) {
        return;
      }
    }
  }

  Future<void> _acknowledge(String eventId) async {
    await _configCharacteristic?.write(
      utf8.encode(jsonEncode({'ackEventId': eventId})),
      withoutResponse: false,
    );
  }

  Future<void> enrollFingerprint() async {
    final config = _configCharacteristic;
    final serverDeviceId = state.serverDeviceId;
    if (config == null || serverDeviceId == null || !state.isConnected) {
      throw StateError('Connect and pair the TanzAlert device first.');
    }
    final identity = await _readIdentity();
    if (identity['pairingWindow'] != true) {
      throw StateError(
        identity['fingerprintEnrolled'] == true
            ? 'Scan the enrolled finger, then hold the emergency button for 8 seconds.'
            : 'Hold the emergency button for 8 seconds before enrollment.',
      );
    }
    state = state.copyWith(enrollmentStatus: 'starting', clearMessage: true);
    await config.write(
      utf8.encode(jsonEncode({'command': 'enroll', 'slot': 1})),
      withoutResponse: false,
    );
    final deadline = DateTime.now().add(const Duration(seconds: 60));
    while (DateTime.now().isBefore(deadline)) {
      await Future<void>.delayed(const Duration(seconds: 1));
      final latest = await _readIdentity();
      state = state.copyWith(
        fingerprintReady: latest['fingerprintReady'] == true,
        fingerprintEnrolled: latest['fingerprintEnrolled'] == true,
        enrollmentStatus: latest['enrollmentStatus']?.toString() ?? 'starting',
        lastSeen: DateTime.now(),
      );
      if (latest['enrollmentStatus'] == 'complete' &&
          latest['fingerprintEnrolled'] == true) {
        await _dio.patch(
          '/user/ble-devices/$serverDeviceId/status',
          data: {
            'fingerprintEnrolled': true,
            'directCellularEnabled': latest['directCellularEnabled'] == true,
            'firmwareVersion': latest['firmwareVersion'],
          },
        );
        state = state.copyWith(
          message:
              'Fingerprint enrolled. Scan this finger before holding the emergency button.',
        );
        return;
      }
      if (latest['enrollmentStatus'] == 'failed') {
        throw StateError(
          'Enrollment failed. Clean the sensor and place the same finger twice.',
        );
      }
    }
    throw TimeoutException(
      'Enrollment timed out. Reopen pairing mode and try again.',
    );
  }

  void _startHeartbeatTimer() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (state.isHeartbeatStale && state.isConnected) {
        state = state.copyWith(
          connection: BleConnectionState.disconnected,
          message: 'Heartbeat lost. Check device power and Bluetooth.',
        );
      }
    });
  }

  Future<void> disconnect({bool clearState = true}) async {
    await _scanSub?.cancel();
    await _connSub?.cancel();
    for (final subscription in _notifySubscriptions) {
      await subscription.cancel();
    }
    _notifySubscriptions.clear();
    _heartbeatTimer?.cancel();
    try {
      await _device?.disconnect();
    } catch (_) {}
    _device = null;
    _configCharacteristic = null;
    if (clearState) state = const BleDeviceState();
  }

  @override
  void dispose() {
    unawaited(disconnect());
    super.dispose();
  }
}

final bleServiceProvider = StateNotifierProvider<BleService, BleDeviceState>((
  ref,
) {
  return BleService(ref.read(dioProvider), Hive.box<String>('offline_queue'));
});
