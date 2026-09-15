import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:uuid/uuid.dart';
import 'api.dart';
import 'diagnostics.dart';

abstract class Locator {
  Future<Json> current({bool allowLastKnown = false});
}

class GpsLocator implements Locator {
  @override
  Future<Json> current({bool allowLastKnown = false}) async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw ApiException(
        0,
        'GPS_DISABLED',
        'Enable location services to send your emergency.',
      );
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      throw ApiException(
        0,
        'GPS_PERMISSION',
        'Allow location access in Settings to send your emergency.',
      );
    }
    Position? position;
    var lastKnown = false;
    try {
      position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
    } catch (_) {
      if (allowLastKnown) {
        position = await Geolocator.getLastKnownPosition();
        lastKnown = true;
        if (position == null ||
            DateTime.now().difference(position.timestamp).inSeconds > 60) {
          position = null;
        }
      }
    }
    if (position == null || position.accuracy > 5000) {
      throw ApiException(
        0,
        'GPS_UNAVAILABLE',
        'Waiting for a usable GPS location. Enable location and move to an open area.',
      );
    }
    return {
      'lat': position.latitude,
      'lng': position.longitude,
      'accuracyMeters': position.accuracy,
      'capturedAt': position.timestamp.toUtc().toIso8601String(),
      if (lastKnown) 'locationFreshness': 'last_known',
    };
  }
}

class EmergencyQueue {
  final Api api;
  final Locator locator;
  final String storagePrefix;
  List<Json> items = [];
  bool sending = false;
  String? message;
  Json? delivered;
  String get key => '$storagePrefix:${recordId(api.account!)}';
  EmergencyQueue(this.api, this.locator, {this.storagePrefix = 'attempts'});
  Future<void> restore() async {
    if (api.account == null) return;
    final raw = await api.vault.read(key);
    items = raw == null ? [] : (jsonDecode(raw) as List).cast<Json>();
  }

  Future<void> persist() async {
    if (api.account != null) await api.vault.write(key, jsonEncode(items));
  }

  bool needsReview(Json item) =>
      item['source'] != 'iot_ble' &&
      DateTime.now()
              .difference(DateTime.parse(item['createdAt'] as String))
              .inMinutes >=
          10;
  Future<void> enqueue(
    String type, {
    String source = 'mobile_app',
    String? eventId,
    String? deviceId,
    String? notes,
  }) async {
    if (api.account == null || api.account!['status'] != 'approved') {
      throw ApiException(
        403,
        'NOT_APPROVED',
        'Sign in with an approved account to send an emergency.',
      );
    }
    if (source == 'mobile_app' && items.isNotEmpty) {
      throw ApiException(
        409,
        'QUEUED_ATTEMPT',
        'Review your queued emergency before starting another.',
      );
    }
    final idempotency = eventId == null
        ? const Uuid().v4()
        : 'ble:$deviceId:$eventId';
    if (items.any((item) => item['key'] == idempotency)) return;
    items.add({
      'key': idempotency,
      'type': type,
      'source': source,
      'createdAt': DateTime.now().toUtc().toIso8601String(),
      'bleEventId': ?eventId,
      'deviceId': ?deviceId,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
    });
    await persist();
  }

  Future<void> approveRetry(Json item) async {
    item['createdAt'] = DateTime.now().toUtc().toIso8601String();
    item.remove('blocked');
    await persist();
  }

  Future<void> discard(Json item) async {
    items.remove(item);
    await persist();
  }

  Future<void> flush() async {
    if (sending || api.account == null) return;
    sending = true;
    try {
      for (final item in List<Json>.from(items)) {
        if (needsReview(item) || item['blocked'] == true) continue;
        try {
          if (item['payload'] == null) {
            final location = await locator.current(
              allowLastKnown: item['source'] == 'iot_ble',
            );

            item['payload'] = {
              'type': item['type'],
              'source': item['source'],
              'location': location,
              if (item['bleEventId'] != null) 'bleEventId': item['bleEventId'],
              if (item['deviceId'] != null) 'deviceId': item['deviceId'],
              if (item['notes'] != null) 'notes': item['notes'],
            };
            await persist();
          }
          final result = await api.request(
            'POST',
            '/emergencies',
            body: item['payload'] as Json,
            idempotencyKey: item['key'] as String,
          );
          delivered = result['data'] as Json;
          if (recordId(delivered!).isEmpty) {
            throw ApiException(
              502,
              'INVALID_RESPONSE',
              'Delivery has not been confirmed. Retry this attempt.',
            );
          }
          items.remove(item);
          message = null;
          await persist();
        } on ApiException catch (e) {
          message = e.message;
          // The server checks a saved receipt before freshness. This explicit rejection
          // proves no incident was committed, so obtaining a new fix is safe.
          if (e.code == 'STALE_LOCATION') {
            item.remove('payload');
            item.remove('blocked');
            await persist();
            break;
          }
          if (!e.retryable) {
            item['blocked'] = true;
            await persist();
          }
          break;
        } catch (_) {
          message =
              'Waiting for connection to send emergency. Your attempt is saved on this device.';
          break;
        }
      }
    } finally {
      sending = false;
    }
  }
}

class AppController extends ChangeNotifier {
  final String role;
  final Api api;
  final Locator locator;
  late final EmergencyQueue queue;
  bool ready = false, busy = false, refreshing = false, live = false;
  bool isOnDuty = false;
  String? error, serviceWarning, selectedId;
  List<Json> incidents = [];
  List<Json> devices = [];
  Json? currentLocation;
  io.Socket? _socket;
  Timer? _fallback, _retry, _sessionTimer;
  int _retryCount = 0;
  Future<void> Function()? onServicesChanged;
  Future<void> Function()? onLogout;
  Future<bool> Function()? delegateQueueFlush;
  AppController(this.role, this.api, {Locator? locator})
    : locator = locator ?? GpsLocator() {
    queue = EmergencyQueue(api, this.locator);
    api.onSessionExpired = () {
      _stop();
      onLogout?.call();
      notifyListeners();
    };
    api.onSessionRefreshed = () {
      _connect();
    };
  }
  Json? get account => api.account;
  void closeIncident() {
    selectedId = null;
    notifyListeners();
  }

  void updatePlatform({String? warning, Json? location}) {
    serviceWarning = warning;
    if (location != null) currentLocation = location;
    notifyListeners();
  }

  void startRealtime() => _connect();
  List<Json> get active => incidents.where(isActive).toList();
  Json? get selected =>
      incidents.where((i) => recordId(i) == selectedId).firstOrNull;
  bool get hasAssignment =>
      active.any((i) => i['assignedResponderId'] == recordId(account ?? {}));
  bool get shouldTrack =>
      account != null &&
      (role == 'user' ? active.isNotEmpty : isOnDuty || hasAssignment);
  Future<void> initialize() async {
    try {
      await api.restore();
      if (account != null) {
        final result = await api.request('GET', '/auth/me');
        api.account = result['data'] as Json;
        if (account!['role'] != role || account!['status'] != 'approved') {
          await api.clearSession();
        } else {
          await _authenticated();
        }
      }
    } catch (e) {
      if (e is ApiException && e.retryable && account?['role'] == role && account?['status'] == 'approved') {
        // Restore the account's durable attempts even when startup is offline.
        // Every eventual server request still revalidates the current session.
        await _authenticated();
      }
      error = '$e';
    }
    ready = true;
    notifyListeners();
  }

  Future<void> login(String email, String password, bool remember) async {
    final result = await api.request(
      'POST',
      '/auth/login',
      body: {
        'email': email.trim(),
        'password': password,
        'role': role,
        'rememberMe': remember,
      },
      authenticated: false,
    );
    await api.setSession(result['data'] as Json);
    await _authenticated();
    notifyListeners();
  }

  Future<void> _authenticated() async {
    isOnDuty = account?['isOnDuty'] == true;
    await queue.restore();
    await sync();
    _connect();
    _sessionTimer?.cancel();
    _sessionTimer = Timer.periodic(const Duration(minutes: 12), (_) async {
      try {
        await api.refresh();
      } catch (_) {}
    });
    _fallback?.cancel();
    _fallback = Timer.periodic(const Duration(seconds: 10), (_) {
      if (!live) sync();
    });
    if (queue.items.isNotEmpty) unawaited(flushQueue());
    await onServicesChanged?.call();
  }

  void _connect() {
    _socket?.dispose();
    if (api.accessToken == null) return;
    final origin = api.base.replaceFirst(RegExp(r'/api$'), '');
    _socket = io.io(
      origin,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': api.accessToken})
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(30000)
          .disableAutoConnect()
          .build(),
    );
    _socket!.onConnect((_) {
      live = true;
      sync();
      notifyListeners();
    });
    _socket!.onDisconnect((_) {
      live = false;
      notifyListeners();
    });
    _socket!.onConnectError((_) {
      live = false;
      notifyListeners();
    });
    for (final event in [
      'emergency.created',
      'emergency.updated',
      'emergency.assigned',
      'emergency.responder_on_the_way',
      'emergency.responder_nearby',
      'emergency.resolved',
      'emergency.cancelled',
      'emergency.false_alarm',
      'emergency.responder_report_submitted',
      'location.user_updated',
      'location.responder_updated',
    ]) {
      _socket!.on(event, (_) => sync());
    }
    _socket!.connect();
  }

  Future<void> sync() async {
    if (account == null || refreshing) return;
    refreshing = true;
    try {
      final response = await api.request(
        'GET',
        role == 'user'
            ? '/emergencies/my?limit=100'
            : '/emergencies/active?limit=100',
      );
      incidents = (response['data'] as List).cast<Json>();
      unawaited(CrashReports.flush(api));
      if (selectedId != null && selected == null) {
        try {
          incidents.add(
            (await api.request('GET', '/emergencies/$selectedId'))['data']
                as Json,
          );
        } on ApiException catch (_) {
          selectedId = null;
        }
      }
      error = null;
      await onServicesChanged?.call();
    } catch (e) {
      error = '$e';
    } finally {
      refreshing = false;
      notifyListeners();
    }
  }

  Future<void> openIncident(String id) async {
    final item = (await api.request('GET', '/emergencies/$id'))['data'] as Json;
    incidents.removeWhere((value) => recordId(value) == id);
    incidents.insert(0, item);
    selectedId = id;
    notifyListeners();
  }

  Future<void> submit(String type, {String? notes}) async {
    if (busy) return;
    if (active.isNotEmpty) {
      throw ApiException(
        409,
        'ACTIVE_EMERGENCY',
        'An emergency is already active. Open it to view progress.',
      );
    }
    busy = true;
    error = null;
    notifyListeners();
    try {
      await queue.enqueue(type, notes: notes);
      await flushQueue();
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> flushQueue() async {
    if(delegateQueueFlush == null || !await delegateQueueFlush!()) { await queue.flush(); }
    error = queue.message;
    if (queue.delivered != null) {
      final item = queue.delivered!;
      selectedId = recordId(item);
      incidents.removeWhere((i) => recordId(i) == selectedId);
      incidents.insert(0, item);
      queue.delivered = null;
      _retryCount = 0;
      await onServicesChanged?.call();
    }
    _retry?.cancel();
    await onServicesChanged?.call();
    if (queue.items.any((i) => !queue.needsReview(i) && i['blocked'] != true)) {
      _retry = Timer(
        Duration(
          milliseconds:
              min(30000, 1000 << min(_retryCount++, 5)) + Random().nextInt(250),
        ),
        flushQueue,
      );
    }
    notifyListeners();
  }

  Future<void> action(Json incident, String action, {Json? body}) async {
    if (busy) return;
    busy = true;
    error = null;
    notifyListeners();
    try {
      await api.request(
        'POST',
        '/emergencies/${recordId(incident)}/$action',
        body: body ?? {},
      );
      await sync();
    } on ApiException catch (e) {
      if (e.status == 409) await sync();
      rethrow;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> setDuty(bool value) async {
    if (value) currentLocation = await locator.current();
    await api.request(
      'PATCH',
      '/responders/me/duty',
      body: {'isOnDuty': value},
    );
    isOnDuty = value;
    _connect();
    await onServicesChanged?.call();
    notifyListeners();
  }

  Future<void> loadDevices() async {
    devices = ((await api.request('GET', '/user/ble-devices'))['data'] as List)
        .cast<Json>();
    notifyListeners();
  }

  Future<void> logout() async {
    await onLogout?.call();
    try {
      await api.request(
        'POST',
        '/auth/logout',
        body: {'refreshToken': api.refreshToken},
      );
    } finally {
      await api.clearSession();
      _stop();
      incidents = [];
      devices = [];
      selectedId = null;
      queue.items = [];
      notifyListeners();
    }
  }

  void _stop() {
    _socket?.dispose();
    _fallback?.cancel();
    _retry?.cancel();
    _sessionTimer?.cancel();
    live = false;
  }

  @override
  void dispose() {
    _stop();
    api.dispose();
    super.dispose();
  }
}
