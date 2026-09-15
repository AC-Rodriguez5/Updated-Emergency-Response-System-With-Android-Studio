import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:ui';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:uuid/uuid.dart';
import 'api.dart';
import 'controller.dart';

const serviceUuid = '9f4d0001-7d6a-4b85-9e74-2f4d8e8d0001';
const buttonUuid = '9f4d0002-7d6a-4b85-9e74-2f4d8e8d0002';
const heartbeatUuid = '9f4d0003-7d6a-4b85-9e74-2f4d8e8d0003';
const configUuid = '9f4d0004-7d6a-4b85-9e74-2f4d8e8d0004';

Future<void> initializeFirebase() async {
  if (Firebase.apps.isNotEmpty) return;
  const apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  if (apiKey.isEmpty) {
    throw StateError('Push notifications are not configured for this build.');
  }
  await Firebase.initializeApp(
    options: const FirebaseOptions(
      apiKey: apiKey,
      appId: String.fromEnvironment('FIREBASE_APP_ID'),
      messagingSenderId: String.fromEnvironment('FIREBASE_SENDER_ID'),
      projectId: String.fromEnvironment('FIREBASE_PROJECT_ID'),
    ),
  );
}

@pragma('vm:entry-point')
Future<void> firebaseBackground(RemoteMessage message) async {
  await initializeFirebase();
}

Future<Json> registrationPush(Vault vault) async {
  try {
    await initializeFirebase();
    FirebaseMessaging.onBackgroundMessage(firebaseBackground);
    await FirebaseMessaging.instance.requestPermission();
    final token = await FirebaseMessaging.instance.getToken();
    if(token == null) return {};
    final id = await vault.read('pushDeviceId') ?? const Uuid().v4();
    await vault.write('pushDeviceId', id);
    return {'pushToken':token,'deviceId':id,'platform':'android'};
  } catch(_) { return {}; }
}

/// Platform lifecycle is isolated from the controller so core emergency flows are testable.
class PlatformServices {
  final AppController controller;
  final FlutterBackgroundService service = FlutterBackgroundService();
  bool configured = false, enabling = false;
  String? pushDeviceId;
  StreamSubscription<String>? tokenSub;
  StreamSubscription<RemoteMessage>? notificationSub, foregroundPushSub;
  StreamSubscription<Json?>? statusSub;
  Json status = {};
  PlatformServices(this.controller);
  Future<void> attach() async {
    controller.delegateQueueFlush = () async {
      if(!await service.isRunning()) return false;
      final requestId = const Uuid().v4();
      final response = service.on('manualFlushed').firstWhere((event) => event?['requestId'] == requestId).timeout(const Duration(seconds:25));
      service.invoke('flushManual', {'requestId':requestId});
      try {
        final result = await response;
        await controller.queue.restore();
        controller.queue.message = result?['message'] as String?;
        if(result?['delivered'] is Json) controller.queue.delivered = result!['delivered'] as Json;
      } catch(_) { controller.queue.message = 'Waiting for background delivery confirmation. Your attempt remains saved.'; }
      return true;
    };
    controller.api.coordinateRefresh = () async {
      if (!await service.isRunning()) return false;
      final requestId = const Uuid().v4();
      final response = service
          .on('sessionRefreshed')
          .firstWhere((event) => event?['requestId'] == requestId)
          .timeout(const Duration(seconds: 12));
      service.invoke('refreshSession', {'requestId': requestId});
      final result = await response;
      if (result?['success'] != true) {
        throw ApiException(
          0,
          'SESSION_REFRESH',
          'Session refresh was interrupted. Try again.',
        );
      }
      return true;
    };
    controller.onServicesChanged = update;
    controller.onLogout = stop;
    statusSub = service.on('status').listen((value) {
      if (value == null) return;
      status = value;
      if (value['location'] is Json) {
        controller.currentLocation = value['location'] as Json;
      }
      if (value['deliveredId'] is String) {
        controller.queue.restore();
        controller
            .openIncident(value['deliveredId'] as String)
            .catchError((Object _) {});
      }
      controller.updatePlatform(warning: value['warning'] as String?);
    });
  }

  Future<void> registerPush() async {
    try {
      await initializeFirebase();
      FirebaseMessaging.onBackgroundMessage(firebaseBackground);
      await FirebaseMessaging.instance.requestPermission();
      pushDeviceId =
          await controller.api.vault.read('pushDeviceId') ?? const Uuid().v4();
      await controller.api.vault.write('pushDeviceId', pushDeviceId!);
      Future<void> register(String token) async {
        if (controller.account != null) {
          await controller.api.request(
            'POST',
            '/notifications/devices',
            body: {
              'deviceId': pushDeviceId,
              'token': token,
              'platform': 'android',
            },
          );
        }
      }

      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) await register(token);
      await tokenSub?.cancel();
      tokenSub = FirebaseMessaging.instance.onTokenRefresh.listen((token) {
        register(token).catchError((Object _) {});
      });
      Future<void> open(RemoteMessage message) async {
        final id = message.data['emergencyId'];
        if (id is String && controller.account != null) {
          await controller.openIncident(id);
        }
      }

      await notificationSub?.cancel();
      notificationSub = FirebaseMessaging.onMessageOpenedApp.listen((message) {
        open(message).catchError((Object _) {});
      });
      final initial = await FirebaseMessaging.instance.getInitialMessage();
      if (initial != null) await open(initial);
      await foregroundPushSub?.cancel();
      foregroundPushSub = FirebaseMessaging.onMessage.listen(
        (_) => controller.sync(),
      );
    } catch (_) {
      controller.updatePlatform(
        warning:
            'Push notifications are unavailable. Live updates work while this app is connected.',
      );
    }
  }

  Future<bool> get monitoring async =>
      controller.account != null &&
      await controller.api.vault.read(
            'bleEnabled:${recordId(controller.account!)}',
          ) ==
          'true';
  Future<void> enableMonitoring(bool enabled) async {
    if (enabled) {
      await controller.locator.current();
      final grants = await [
        Permission.bluetoothScan,
        Permission.bluetoothConnect,
        Permission.notification,
      ].request();
      if (grants[Permission.bluetoothScan] != PermissionStatus.granted ||
          grants[Permission.bluetoothConnect] != PermissionStatus.granted) {
        throw ApiException(
          0,
          'BLE_PERMISSION',
          'Allow nearby devices in Settings to monitor the panic button.',
        );
      }
    }
    await controller.api.vault.write(
      'bleEnabled:${recordId(controller.account!)}',
      '$enabled',
    );
    await update();
  }

  Future<void> update() async {
    if (enabling || controller.account == null || !Platform.isAndroid) return;
    enabling = true;
    try {
      final bleEnabled = controller.role == 'user' && await monitoring;
      final needed =
          controller.shouldTrack ||
          bleEnabled ||
          controller.queue.items.isNotEmpty;
      if (!needed) {
        if (await service.isRunning()) service.invoke('stop');
        return;
      }
      if (!configured) {
        await Permission.notification.request();
        await service.configure(
          androidConfiguration: AndroidConfiguration(
            onStart: backgroundMain,
            isForegroundMode: true,
            autoStart: false,
            autoStartOnBoot: false,
            initialNotificationTitle: 'SafeAlert is active',
            initialNotificationContent:
                'Emergency location sharing or panic button monitoring is enabled.',
            foregroundServiceTypes: [AndroidForegroundType.location],
          ),
          iosConfiguration: IosConfiguration(autoStart: false),
        );
        configured = true;
      }
      await controller.api.vault.write('serviceRole', controller.role);
      if (!await service.isRunning()) await service.startService();
      service.invoke('refresh');
    } catch (_) {
      controller.serviceWarning =
          'Background monitoring could not start. Keep this app open and check location permissions.';
    } finally {
      enabling = false;
    }
  }

  Future<void> stop() async {
    service.invoke('stop');
    await tokenSub?.cancel();
    await notificationSub?.cancel();
    await foregroundPushSub?.cancel();
    if (pushDeviceId != null && controller.account != null) {
      try {
        await controller.api.request(
          'DELETE',
          '/notifications/devices/$pushDeviceId',
        );
      } catch (_) {}
    }
    pushDeviceId = null;
  }

  Future<List<ScanResult>> scan() async {
    final grants = await [
      Permission.bluetoothScan,
      Permission.bluetoothConnect,
      Permission.locationWhenInUse,
    ].request();
    if (grants.values.any((status) => status != PermissionStatus.granted)) {
      throw ApiException(
        0,
        'BLE_PERMISSION',
        'Allow location and nearby devices to scan for your panic button.',
      );
    }
    if (await FlutterBluePlus.adapterState.first != BluetoothAdapterState.on) {
      throw ApiException(
        0,
        'BLUETOOTH_OFF',
        'Turn on Bluetooth and scan again.',
      );
    }
    await FlutterBluePlus.startScan(
      withServices: [Guid(serviceUuid)],
      timeout: const Duration(seconds: 8),
    );
    await Future<void>.delayed(const Duration(seconds: 8));
    await FlutterBluePlus.stopScan();
    return FlutterBluePlus.lastScanResults;
  }

  Future<void> pair(ScanResult result) async {
    final device = result.device;
    await device.connect(timeout: const Duration(seconds: 10));
    await device.requestMtu(247);
    try {
      final services = await device.discoverServices();
      final config = services
          .expand((s) => s.characteristics)
          .firstWhere((c) => c.uuid == Guid(configUuid));
      final identity = jsonDecode(utf8.decode(await config.read())) as Json;
      final deviceId = identity['deviceId'];
      if (deviceId is! String || deviceId.isEmpty) {
        throw ApiException(
          400,
          'BLE_ID',
          'Device identity is missing. Update the panic button firmware.',
        );
      }
      await controller.api.request(
        'POST',
        '/user/ble-devices/pair',
        body: {
          'deviceId': deviceId,
          'deviceName': result.advertisementData.advName,
          'firmwareVersion': identity['firmwareVersion'] ?? 'unknown',
        },
      );
      await controller.api.vault.write(
        'bleDevice:${recordId(controller.account!)}',
        jsonEncode({
          'deviceId': deviceId,
          'remoteId': device.remoteId.str,
          'deviceName': result.advertisementData.advName,
          'firmwareVersion': identity['firmwareVersion'],
        }),
      );
      await controller.loadDevices();
    } finally {
      await device.disconnect();
    }
  }

  Future<void> unpair(Json device) async {
    await controller.api.request(
      'POST',
      '/user/ble-devices/${recordId(device)}/unpair',
      body: {},
    );
    await enableMonitoring(false);
    await controller.api.vault.delete(
      'bleDevice:${recordId(controller.account!)}',
    );
    await controller.loadDevices();
  }

  void dispose() {
    tokenSub?.cancel();
    notificationSub?.cancel();
    foregroundPushSub?.cancel();
    statusSub?.cancel();
  }
}

/// A single background isolate owns BLE ingestion and its separate encrypted queue.
@pragma('vm:entry-point')
Future<void> backgroundMain(ServiceInstance service) async {
  WidgetsFlutterBinding.ensureInitialized();
  DartPluginRegistrant.ensureInitialized();
  final vault = SecureVault();
  final api = Api(vault: vault);
  await api.restore();
  service.on('refreshSession').listen((event) async {
    try {
      await api.refresh();
      service.invoke('sessionRefreshed', {
        'requestId': event?['requestId'],
        'success': true,
      });
    } catch (_) {
      service.invoke('sessionRefreshed', {
        'requestId': event?['requestId'],
        'success': false,
      });
    }
  });
  final role = await vault.read('serviceRole') ?? 'user';
  final controller = AppController(role, api);
  controller.startRealtime();
  service.on('flushManual').listen((event) async {
    if(!controller.queue.sending) await controller.queue.restore();
    await controller.queue.flush();
    service.invoke('manualFlushed', {'requestId':event?['requestId'],'message':controller.queue.message,'delivered':controller.queue.delivered});
  });
  // Socket reconciliation plus disconnected-only polling continues in this isolate.
  final bleQueue = EmergencyQueue(
    api,
    GpsLocator(),
    storagePrefix: 'bleAttempts',
  );
  final monitor = BleMonitor(service, api, bleQueue);
  var ticking = false, stopped = false;
  Timer? timer;
  Future<void> stop() async {
    stopped = true;
    timer?.cancel();
    await monitor.dispose();
    controller.dispose();
    await service.stopSelf();
  }

  service.on('stop').listen((_) => stop());
  // Avoid a second copy of the foreground manual queue in this isolate.
  controller.queue.items = [];
  await bleQueue.restore();
  Future<void> tick() async {
    if (ticking || stopped) return;
    ticking = true;
    try {
      await api.restore();
      if (api.account == null) {
        await stop();
        return;
      }
      try {
        final me = (await api.request('GET', '/auth/me'))['data'] as Json;
        if (me['status'] != 'approved') {
          await stop();
          return;
        }
        controller.isOnDuty = me['isOnDuty'] == true;
        if (!controller.live) await controller.sync();
      } on ApiException catch (error) {
        // A network outage must not prevent already-paired BLE events from
        // reaching the durable local queue. The server rechecks access on retry.
        if (!error.retryable) rethrow;
      }
      if(!controller.queue.sending) await controller.queue.restore();
      await controller.queue.flush();
      final bleEnabled =
          role == 'user' &&
          await vault.read('bleEnabled:${recordId(api.account!)}') == 'true';
      if (!controller.shouldTrack &&
          !bleEnabled &&
          controller.queue.items.isEmpty) {
        await stop();
        return;
      }
      String? warning = controller.queue.message;
      Json? location;
      if (controller.shouldTrack) {
        try {
          location = await controller.locator.current();
          final owned = controller.active
              .where(
                (i) =>
                    role == 'user' ||
                    i['assignedResponderId'] == recordId(api.account!),
              )
              .firstOrNull;
          await api.request(
            'POST',
            '/locations/$role',
            body: {
              ...location,
              if (owned != null) 'emergencyId': recordId(owned),
            },
          );
        } catch (e) {
          warning = '$e';
        }
      }
      if (bleEnabled) {
        await monitor.ensureConnected();
        await bleQueue.flush();
        warning ??= bleQueue.message ?? monitor.warning;
      } else {
        await monitor.disconnect();
      }
      final deliveredId =
          (bleQueue.delivered ?? controller.queue.delivered) == null
          ? null
          : recordId((bleQueue.delivered ?? controller.queue.delivered)!);
      bleQueue.delivered = null;
      controller.queue.delivered = null;
      if (service is AndroidServiceInstance) {
        await service.setForegroundNotificationInfo(
          title: bleEnabled
              ? 'SafeAlert is monitoring the panic button'
              : 'SafeAlert emergency location sharing',
          content:
              warning ??
              (bleEnabled
                  ? 'Panic button ${monitor.connected ? 'connected' : 'disconnected'}. ${controller.shouldTrack ? 'Location sharing active.' : ''}'
                  : 'Location sharing is active.'),
        );
      }
      service.invoke('status', {
        'connected': monitor.connected,
        'battery': monitor.battery,
        'lastEvent': monitor.lastEvent,
        'warning': warning,
        'queued': bleQueue.items.length,
        'location': ?location,
        'deliveredId': ?deliveredId,
      });
    } catch (e) {
      service.invoke('status', {
        'warning': '$e',
        'connected': false,
        'queued': bleQueue.items.length,
      });
    } finally {
      ticking = false;
    }
  }

  service.on('refresh').listen((_) => tick());
  timer = Timer.periodic(const Duration(seconds: 5), (_) => tick());
  await tick();
}

class BleMonitor {
  final ServiceInstance service;
  final Api api;
  final EmergencyQueue queue;
  BluetoothDevice? device;
  BluetoothCharacteristic? acknowledgement;
  final subscriptions = <StreamSubscription<dynamic>>[];
  DateTime? heartbeat, nextAttempt;
  int retry = 0;
  int? battery;
  String? lastEvent, warning;
  bool connected = false, connecting = false;
  Set<String> seen = {};
  Future<void> pendingEvent = Future.value();
  BleMonitor(this.service, this.api, this.queue);
  Future<void> ensureConnected() async {
    if (connecting) return;
    if (connected &&
        heartbeat != null &&
        DateTime.now().difference(heartbeat!).inSeconds <= 30) {
      return;
    }
    if (connected) {
      warning = 'Panic button disconnected: heartbeat was not received.';
      await disconnect();
    }
    if (nextAttempt != null && DateTime.now().isBefore(nextAttempt!)) return;
    connecting = true;
    try {
      final raw = await api.vault.read('bleDevice:${recordId(api.account!)}');
      if (raw == null) {
        warning = 'Pair a panic button to enable monitoring.';
        return;
      }
      final binding = jsonDecode(raw) as Json;
      // Revalidate when online; a network failure must not disable a previously
      // registered local binding or its durable offline emergency queue.
      try {
      final devices =
          ((await api.request('GET', '/user/ble-devices'))['data'] as List)
              .cast<Json>();
      if (!devices.any(
        (d) =>
            d['deviceId'] == binding['deviceId'] && d['status'] != 'unpaired',
      )) {
        throw ApiException(
          403,
          'BLE_UNPAIRED',
          'This panic button is no longer paired with your account.',
        );
      }
      } on ApiException catch (error) {
        if (!error.retryable) rethrow;
      }
      final seenRaw = await api.vault.read('bleSeen:${recordId(api.account!)}');
      seen = seenRaw == null
          ? {}
          : (jsonDecode(seenRaw) as List).cast<String>().toSet();
      device = BluetoothDevice.fromId(binding['remoteId'] as String);
      await device!.connect(timeout: const Duration(seconds: 10));
      await device!.requestMtu(247);
      final services = await device!.discoverServices();
      final chars = services.expand((s) => s.characteristics).toList();
      final config = chars.firstWhere((c) => c.uuid == Guid(configUuid));
      acknowledgement = config;
      final identity = jsonDecode(utf8.decode(await config.read())) as Json;
      if (identity['deviceId'] != binding['deviceId']) {
        throw ApiException(
          403,
          'BLE_ID_MISMATCH',
          'The connected panic button does not match your paired device.',
        );
      }
      for (final characteristic in chars) {
        if (!characteristic.properties.notify) continue;
        if (![
          Guid(buttonUuid),
          Guid(heartbeatUuid),
          Guid('00002a19-0000-1000-8000-00805f9b34fb'),
        ].contains(characteristic.uuid)) {
          continue;
        }
        subscriptions.add(
          characteristic.onValueReceived.listen((bytes) {
            heartbeat = DateTime.now();
            if (characteristic.uuid == Guid(buttonUuid)) {
              pendingEvent = pendingEvent
                  .then((_) => accept(bytes, binding))
                  .catchError((Object _) {
                    warning = 'A panic button event could not be read.';
                  });
            } else if (characteristic.uuid ==
                    Guid('00002a19-0000-1000-8000-00805f9b34fb') &&
                bytes.isNotEmpty) {
              battery = bytes.first;
              if (battery! < 20) {
                warning =
                    'Panic button battery is below 20%. Charge the device.';
              }
            }
          }),
        );
        await characteristic.setNotifyValue(true);
      }
      subscriptions.add(
        device!.connectionState.listen((state) {
          if (state == BluetoothConnectionState.disconnected) {
            connected = false;
            warning = 'Panic button disconnected. Reconnecting…';
          }
        }),
      );
      connected = true;
      heartbeat = DateTime.now();
      retry = 0;
      warning = null;
    } catch (_) {
      await disconnect();
      warning = 'Panic button disconnected. Reconnecting…';
      nextAttempt = DateTime.now().add(
        Duration(
          milliseconds:
              min(60000, 1000 << min(retry++, 6)) + Random().nextInt(500),
        ),
      );
    } finally {
      connecting = false;
    }
  }

  Future<void> accept(List<int> bytes, Json binding) async {
    if (bytes.isEmpty) return;
    final data = jsonDecode(utf8.decode(bytes)) as Json;
    if (data['deviceId'] != binding['deviceId'] ||
        data['eventId'] is! String ||
        !['medical', 'crime', 'fire', 'general_sos'].contains(data['button'])) {
      warning = 'Ignored an invalid or unpaired panic button event.';
      return;
    }
    final eventId = data['eventId'] as String;
    if (seen.contains(eventId)) {
      await acknowledge(eventId);
      return;
    }
    await queue.enqueue(
      data['button'] as String,
      source: 'iot_ble',
      eventId: eventId,
      deviceId: data['deviceId'] as String,
    );
    seen.add(eventId);
    if (seen.length > 1000) seen = seen.skip(seen.length - 1000).toSet();
    await api.vault.write(
      'bleSeen:${recordId(api.account!)}',
      jsonEncode(seen.toList()),
    );
    // Acknowledge only after the event is encrypted and durably queued locally.
    await acknowledge(eventId);
    lastEvent =
        '${readable(data['button'] as String)} at ${DateTime.now().toIso8601String()}';
    if (data['battery'] is int) battery = data['battery'] as int;
    service.invoke('status', {
      'connected': connected,
      'battery': battery,
      'lastEvent': lastEvent,
      'queued': queue.items.length,
    });
  }

  Future<void> disconnect() async {
    connected = false;
    acknowledgement = null;
    for (final s in subscriptions) {
      await s.cancel();
    }
    subscriptions.clear();
    try {
      await device?.disconnect();
    } catch (_) {}
    device = null;
  }

  Future<void> dispose() => disconnect();
  Future<void> acknowledge(String eventId) async {
    try {
      await acknowledgement?.write(utf8.encode(jsonEncode({'ackEventId':eventId})),withoutResponse:false);
    } catch (_) {
      // Firmware may replay the same ID; durable deduplication makes that safe.
    }
  }
}
