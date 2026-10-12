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
  /// True when the wearable has a CA on its modem and therefore authenticates
  /// the backend's certificate. False means encrypted but unverified.
  final bool serverCertVerified;

  /// Carrier the wearable read from its own SIM, e.g. "Smart / TNT". The
  /// firmware picks the APN from this, so it is the useful thing to show when
  /// cellular delivery is not working.
  final String simBrands;

  /// APN currently carrying traffic, or the one remembered from last time.
  final String activeApn;

  /// True while the wearable has a working data bearer of its own.
  final bool cellularOnline;
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
    this.serverCertVerified = false,
    this.simBrands = '',
    this.activeApn = '',
    this.cellularOnline = false,
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
    bool? serverCertVerified,
    String? simBrands,
    String? activeApn,
    bool? cellularOnline,
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
    serverCertVerified: serverCertVerified ?? this.serverCertVerified,
    simBrands: simBrands ?? this.simBrands,
    activeApn: activeApn ?? this.activeApn,
    cellularOnline: cellularOnline ?? this.cellularOnline,
    enrollmentStatus: enrollmentStatus ?? this.enrollmentStatus,
    message: clearMessage ? null : message ?? this.message,
  );
}

/// Delivers a panic-button alert. Returns the server-side incident when one was
/// created, or null when the alert must stay queued on the wearable.
typedef BleEventCallback =
    Future<BleDelivery> Function(Map<String, dynamic> emergencyPayload);

/// Relays one streamed GNSS fix. Returns null when delivery failed.
typedef BleLocationCallback =
    Future<BleDelivery?> Function(Map<String, dynamic> locationPayload);

/// What the phone learned from the backend about one delivery, in the shape the
/// wearable's config characteristic understands.
class BleDelivery {
  final bool accepted;
  final String? emergencyId;
  final int? revision;

  /// Whether the wearable should keep streaming its position. Defaults to true so
  /// that a missing or malformed reply never silences a live alert.
  final bool tracking;

  const BleDelivery({
    required this.accepted,
    this.emergencyId,
    this.revision,
    this.tracking = true,
  });

  static const rejected = BleDelivery(accepted: false);
}

/// The two frame kinds the wearable notifies on its event characteristic.
enum _FrameKind { sos, location }

class _HardwareFrame {
  final _FrameKind kind;
  final String eventId;
  final Map<String, dynamic> payload;
  const _HardwareFrame(this.kind, this.eventId, this.payload);
}

class BleService extends StateNotifier<BleDeviceState> {
  final Dio _dio;
  final Box<String> _offlineQueue;
  BleEventCallback? onEmergency;
  BleLocationCallback? onDeviceLocation;

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
              ? 'Scan the enrolled finger, then hold the emergency button for 3 seconds.'
              : 'Hold the emergency button for 3 seconds, then scan again.',
        );
      }

      final response = await _dio.post<Map<String, dynamic>>(
        '/user/ble-devices/pair',
        data: {
          'deviceId': deviceId,
          'bleServiceUuid': AppConfig.serviceUuid,
          'firmwareVersion': identity['firmwareVersion'],
          'fingerprintEnrolled': identity['fingerprintEnrolled'] == true,
          'directCellularEnabled': AppConfig.directCellularReady,
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
            // The CA's filename on the modem, not its bytes. Empty means the
            // wearable cannot verify the backend's certificate.
            'caFile': AppConfig.modemCaFile,
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
        '/user/ble-devices/${paired['_id']}/status',
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
        serverCertVerified: provisioned['serverCertVerified'] == true,
        simBrands: provisioned['simBrands']?.toString() ?? '',
        activeApn: provisioned['activeApn']?.toString() ?? '',
        cellularOnline: provisioned['cellularOnline'] == true,
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

  /// Reads one BLE frame into an API payload.
  ///
  /// A notification carries at most MTU-3 bytes, so the wearable sends a compact
  /// form with single-letter keys. `k` names the frame kind; frames from older
  /// firmware have no `k` and are treated as alerts.
  ///
  /// A GNSS block is optional on an alert frame and required on a location frame.
  /// That asymmetry is the whole point of the design: the alert leaves the moment
  /// the button is released, and the fixes follow as the receiver finds them.
  _HardwareFrame? _decodeHardwareFrame(List<int> bytes) {
    final event = jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
    final deviceId = event['deviceId'] ?? event['d'];
    final eventId = event['eventId'] ?? event['e'];
    if (deviceId != state.deviceId || eventId is! String) return null;

    final kind = (event['kind'] ?? event['k']) == 'loc'
        ? _FrameKind.location
        : _FrameKind.sos;
    final location = _decodeLocation(event);

    if (kind == _FrameKind.location) {
      if (location == null) return null;
      return _HardwareFrame(kind, eventId, {
        'deviceId': deviceId,
        'eventId': eventId,
        'transport': 'ble',
        'location': location,
        ..._decodeGnssQuality(event),
        if (state.firmwareVersion != null)
          'firmwareVersion': state.firmwareVersion,
      });
    }

    final emergencyType = event['buttonType'] ?? event['type'] ?? event['t'];
    final fingerprintVerified =
        event['fingerprintVerified'] == true ||
        event['authMethod'] == 'fingerprint' ||
        event['f'] == true;
    // An unauthenticated or mistyped alert is dropped: only a fingerprint-verified
    // general SOS from the paired wearable may raise an incident.
    if (emergencyType != 'general_sos' || !fingerprintVerified) return null;

    return _HardwareFrame(kind, eventId, {
      'deviceId': deviceId,
      'eventId': eventId,
      'buttonType': 'general_sos',
      'fingerprintVerified': true,
      'authMethod': 'fingerprint',
      'transport': 'ble',
      // Omitted rather than sent as null: the API treats the field as optional but
      // rejects an explicit null.
      'firmwareVersion':
          ?(event['firmwareVersion'] ?? event['v'] ?? state.firmwareVersion),
      if ((event['batteryLevel'] ?? event['b']) is num)
        'deviceBatteryAtTrigger': event['batteryLevel'] ?? event['b'],
      ..._decodeGnssQuality(event),
      if (location != null) 'deviceTimestamp': location['capturedAt'],
      'location': ?location,
    });
  }

  /// Returns the GeoJSON block for a frame, or null when the wearable has no fix
  /// yet. A partially filled block is treated as no fix at all rather than being
  /// patched up with defaults.
  Map<String, dynamic>? _decodeLocation(Map<String, dynamic> event) {
    final nested = event['location'];
    final raw = nested is Map<String, dynamic>
        ? nested
        : <String, dynamic>{
            'coordinates': [event['lo'], event['la']],
            'accuracyMeters': event['a'],
            'capturedAt': event['at'],
          };
    final coordinates = raw['coordinates'];
    final accuracy = raw['accuracyMeters'];
    final capturedAt = raw['capturedAt'];
    if (coordinates is! List ||
        coordinates.length != 2 ||
        coordinates[0] is! num ||
        coordinates[1] is! num ||
        accuracy is! num ||
        capturedAt is! String ||
        DateTime.tryParse(capturedAt) == null) {
      return null;
    }
    return {
      'type': 'Point',
      'coordinates': [
        (coordinates[0] as num).toDouble(),
        (coordinates[1] as num).toDouble(),
      ],
      'accuracyMeters': accuracy.toDouble(),
      'capturedAt': capturedAt,
    };
  }

  Map<String, dynamic> _decodeGnssQuality(Map<String, dynamic> event) {
    final hdop = event['gnssHdop'] ?? event['h'];
    final satellites = event['gnssSatellites'] ?? event['s'];
    return {
      if (hdop is num) 'gnssHdop': hdop,
      if (satellites is int) 'gnssSatellites': satellites,
    };
  }

  Future<void> _handleHardwareEvent(List<int> bytes) async {
    String? processingEventId;
    try {
      final frame = _decodeHardwareFrame(bytes);
      if (frame == null) {
        state = state.copyWith(
          message: 'Ignored an invalid or unauthenticated hardware event.',
        );
        return;
      }
      if (frame.kind == _FrameKind.location) {
        await _relayLocation(frame);
        return;
      }
      final eventId = frame.eventId;
      if (_processedEventIds.contains(eventId)) {
        await _acknowledge(eventId);
        return;
      }
      if (!_processingEventIds.add(eventId)) return;
      processingEventId = eventId;
      final key = 'hardware:${frame.payload['deviceId']}:$eventId';
      await _offlineQueue.put(key, jsonEncode(frame.payload));
      final delivery = await onEmergency?.call(frame.payload);
      if (delivery?.accepted ?? false) {
        await _offlineQueue.delete(key);
        _processedEventIds.add(eventId);
        if (_processedEventIds.length > 1000) {
          _processedEventIds.remove(_processedEventIds.first);
        }
        await _acknowledge(eventId, delivery: delivery);
        state = state.copyWith(
          lastSeen: DateTime.now(),
          message: frame.payload['location'] == null
              ? 'Fingerprint-authorized SOS sent. Waiting for the first GPS fix.'
              : 'Fingerprint-authorized SOS was saved for delivery.',
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

  /// Forwards one streamed fix.
  ///
  /// Nothing is queued for retry here: a stale position is worth less than the
  /// next one, which is seconds away, and the wearable holds its own copy until
  /// the incident closes.
  Future<void> _relayLocation(_HardwareFrame frame) async {
    final delivery = await onDeviceLocation?.call(frame.payload);
    if (delivery == null) return;
    await _acknowledge(frame.eventId, delivery: delivery);
    state = state.copyWith(
      lastSeen: DateTime.now(),
      message: delivery.tracking
          ? 'Location sent to dispatch (revision ${delivery.revision ?? 0}).'
          : 'Incident closed. The device was told to stop tracking.',
    );
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
        final delivery = await callback(payload);
        if (delivery.accepted) {
          await _offlineQueue.delete(key);
          await _acknowledge(payload['eventId'] as String, delivery: delivery);
        }
      } catch (_) {
        return;
      }
    }
  }

  /// Confirms one event back to the wearable.
  ///
  /// `revision` is what the firmware prints as `Server confirmed ... revision ...`.
  /// `tracking` is what ends its GPS stream, and is only ever sent on an explicit
  /// server answer — a dropped reply has to leave the device transmitting rather
  /// than silence it on a live incident.
  Future<void> _acknowledge(String eventId, {BleDelivery? delivery}) async {
    await _configCharacteristic?.write(
      utf8.encode(
        jsonEncode({
          'ackEventId': eventId,
          if (delivery?.emergencyId != null)
            'emergencyId': delivery!.emergencyId,
          if (delivery?.revision != null) 'revision': delivery!.revision,
          if (delivery != null) 'tracking': delivery.tracking,
        }),
      ),
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
            ? 'Scan the enrolled finger, then hold the emergency button for 3 seconds.'
            : 'Hold the emergency button for 3 seconds before enrollment.',
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

  /// Re-reads the device's identity so the status card stays current.
  ///
  /// The wearable cannot report its carrier at pairing time — its modem needs
  /// roughly 20 seconds to boot before the SIM can be read — so a one-shot read at
  /// pairing would permanently show "unknown". This also keeps the GPS and
  /// tracking indicators live.
  Future<void> _refreshIdentity() async {
    if (!state.isConnected) return;
    try {
      final latest = await _readIdentity();
      state = state.copyWith(
        fingerprintReady: latest['fingerprintReady'] == true,
        fingerprintEnrolled: latest['fingerprintEnrolled'] == true,
        pairingWindow: latest['pairingWindow'] == true,
        directCellularEnabled: latest['directCellularEnabled'] == true,
        serverCertVerified: latest['serverCertVerified'] == true,
        simBrands: latest['simBrands']?.toString() ?? state.simBrands,
        activeApn: latest['activeApn']?.toString() ?? state.activeApn,
        cellularOnline: latest['cellularOnline'] == true,
      );
    } catch (_) {
      // A failed read is not a disconnect; the heartbeat check below owns that.
    }
  }

  /// Tells the backend the wearable is powered and in range.
  ///
  /// A panic button only contacts the server by itself when it has an alert to
  /// send, so without this the admin dashboard's "last seen" would only ever
  /// advance on an emergency and an idle, healthy device would read as days stale.
  /// Liveness is therefore only ever as fresh as the last time this phone was
  /// nearby with the app running, which is what the dashboard says.
  Future<void> _checkIn() async {
    final serverDeviceId = state.serverDeviceId;
    if (serverDeviceId == null || !state.isConnected) return;
    try {
      await _dio.post(
        '/user/ble-devices/$serverDeviceId/checkin',
        data: {
          if (state.batteryPercent != null) 'batteryPercent': state.batteryPercent,
          if (state.firmwareVersion != null)
            'firmwareVersion': state.firmwareVersion,
        },
      );
    } catch (_) {
      // A missed check-in is not worth surfacing: the dashboard degrades to a
      // slightly older "last seen" and the next tick retries.
    }
  }

  void _startHeartbeatTimer() {
    _heartbeatTimer?.cancel();
    var ticks = 0;
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      ticks++;
      // Every third tick, so the extra BLE read costs little.
      if (ticks % 3 == 0) unawaited(_refreshIdentity());
      // Every 24th tick — two minutes. The backend treats anything inside five
      // minutes as online, so this tolerates one missed relay.
      if (ticks % 24 == 1) unawaited(_checkIn());
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
