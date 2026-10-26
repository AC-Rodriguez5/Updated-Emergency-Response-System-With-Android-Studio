import 'dart:async';
import 'dart:convert';
import 'dart:ui';

import 'package:dio/dio.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:geolocator/geolocator.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/app_config.dart';
import '../config/server_config.dart';
import '../notifications/alert_notifications.dart';
import '../realtime/incident_events.dart';
import '../storage/secure_storage.dart';

/// Keeps the responder reachable for the whole of a shift.
///
/// The app used to hold its incident socket in the UI isolate and nowhere else.
/// That works while somebody is looking at the screen and stops the moment
/// Android decides the process is idle — so a panic-button press at 02:00 went
/// to a phone that had no listener on it, and the responder found out when they
/// next opened the app. Going on duty now starts an Android foreground service:
/// it holds the process alive, owns the one socket, raises the alarm through
/// [AlertNotifications], and streams duty location. Going off duty stops it.
///
/// **One socket, one token owner.** Refresh tokens rotate server-side and the
/// old one is revoked, so two isolates refreshing independently can revoke each
/// other and sign the responder out mid-shift. While this service runs it is the
/// only thing holding a socket; the UI isolate hands its own over (see
/// `IncidentSocket.connect`) and consumes the relay instead.
class DutyService {
  DutyService._();

  static final FlutterBackgroundService _service = FlutterBackgroundService();

  // service -> UI
  static const String channelIncident = 'incident';
  static const String channelConnection = 'connection';
  // UI -> service
  static const String channelStop = 'stop';
  static const String channelUiVisible = 'ui_visible';
  static const String channelRefreshNow = 'refresh_now';
  static const String channelLocationTag = 'location_tag';

  static bool _configured = false;

  /// Call once from `main()`. Does not start anything.
  static Future<void> configure() async {
    if (_configured) return;
    _configured = true;
    await AlertNotifications.init();
    await _service.configure(
      androidConfiguration: AndroidConfiguration(
        onStart: dutyServiceEntrypoint,
        // Duty is a decision a responder makes, never something the phone does
        // on their behalf: nothing here starts on boot or on configure.
        autoStart: false,
        autoStartOnBoot: false,
        isForegroundMode: true,
        notificationChannelId: AlertNotifications.dutyChannelId,
        foregroundServiceNotificationId: AlertNotifications.dutyNotificationId,
        initialNotificationTitle: 'TanzAlert — going on duty',
        initialNotificationContent: 'Connecting to dispatch…',
        foregroundServiceTypes: const [
          AndroidForegroundType.location,
          AndroidForegroundType.dataSync,
        ],
      ),
      iosConfiguration: IosConfiguration(autoStart: false),
    );
  }

  static Future<bool> get isRunning => _service.isRunning();

  /// Returns false when the responder refused the notification permission —
  /// a duty session that cannot ring is not a duty session, so the caller says
  /// so rather than pretending.
  static Future<bool> start() async {
    await configure();
    final allowed = await AlertNotifications.requestPermission();
    if (!allowed) return false;
    if (await _service.isRunning()) return true;
    return _service.startService();
  }

  static void stop() => _service.invoke(channelStop);

  /// Incident events as the service received them: `{name, data}`.
  static Stream<Map<String, dynamic>?> get incidents =>
      _service.on(channelIncident);

  /// Whether the service's socket is live, for the connection dot.
  static Stream<Map<String, dynamic>?> get connection =>
      _service.on(channelConnection);

  /// Lets the service skip the alarm for something the responder is already
  /// looking at.
  static void setUiVisible(bool visible) =>
      _service.invoke(channelUiVisible, {'visible': visible});

  /// Tags the duty location stream with the incident or transport being served,
  /// so the fixes the service is already sending land against it. Call with no
  /// arguments to go back to plain duty tracking.
  static void setLocationTag({String? emergencyId, String? ambulanceRequestId}) =>
      _service.invoke(channelLocationTag, {
        'emergencyId': emergencyId,
        'ambulanceRequestId': ambulanceRequestId,
      });
}

@pragma('vm:entry-point')
Future<void> dutyServiceEntrypoint(ServiceInstance service) async {
  // A background isolate starts with no plugin registry of its own.
  DartPluginRegistrant.ensureInitialized();

  // The backend address lives in Hive and can have been changed on this device;
  // without this the service would dial whatever the build was compiled with.
  await Hive.initFlutter();
  if (!Hive.isBoxOpen(ServerConfigStore.boxName)) {
    await Hive.openBox<String>(ServerConfigStore.boxName);
  }
  ServerConfigStore.restore();

  await AlertNotifications.init();

  final session = _DutySession(service);
  await session.run();
}

/// Everything the foreground service owns, for as long as it is on duty.
class _DutySession {
  _DutySession(this.service);

  final ServiceInstance service;
  final SecureStorageService _storage = SecureStorageService();
  final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 20),
      headers: {'Content-Type': 'application/json'},
    ),
  );

  io.Socket? _socket;
  StreamSubscription<Position>? _positions;
  Timer? _heartbeat;
  Timer? _reconnect;
  int _attempt = 0;
  bool _connected = false;
  bool _uiVisible = false;
  bool _stopping = false;
  DateTime? _lastEventAt;
  int _alerts = 0;
  String? _emergencyTag;
  String? _ambulanceTag;

  /// This responder's account id, read out of the access token. Needed to tell
  /// an assignment addressed to them from one that merely passed through the
  /// feed for their type.
  String? _accountId;

  /// Incidents already announced, so a position fix arriving on an open alert
  /// does not ring a second time.
  final Set<String> _announced = <String>{};

  Future<void> run() async {
    final android = service is AndroidServiceInstance
        ? service as AndroidServiceInstance
        : null;
    await android?.setAsForegroundService();

    service.on(DutyService.channelStop).listen((_) => _shutdown());
    service.on(DutyService.channelUiVisible).listen((event) {
      _uiVisible = event?['visible'] == true;
      // The app coming back is the moment the connection dot has to be right,
      // and the UI has no view of this socket other than what is published.
      if (_uiVisible) unawaited(_publishStatus());
    });
    service.on(DutyService.channelRefreshNow).listen((_) {
      unawaited(_connect());
    });
    service.on(DutyService.channelLocationTag).listen((event) {
      _emergencyTag = event?['emergencyId'] as String?;
      _ambulanceTag = event?['ambulanceRequestId'] as String?;
    });

    await _startLocationStream();
    await _connect();

    // The watchdog. A socket can sit in a half-open state after the phone moves
    // between cells without ever firing onDisconnect, so liveness is checked
    // rather than trusted.
    _heartbeat = Timer.periodic(const Duration(seconds: 30), (_) async {
      await _publishStatus();
      if (_stopping) return;
      // A scheduled reconnect is already backing off after a refused token;
      // dialling over it would throw that away and retry with the same one.
      if (_reconnect != null) return;
      if (!(_socket?.connected ?? false)) await _connect();
    });
  }

  Future<void> _connect() async {
    if (_stopping) return;
    _reconnect?.cancel();
    _reconnect = null;

    final token = await _storage.getAccessToken();
    if (token == null) {
      // Signed out while on duty: there is nothing left to listen as.
      _shutdown();
      return;
    }

    _accountId = _accountIdFrom(token);

    _socket?.dispose();
    final socket = io.io(
      AppConfig.apiBaseUrl.replaceAll('/api', ''),
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableForceNew()
          .setReconnectionDelay(2000)
          .setReconnectionDelayMax(10000)
          .build(),
    );
    _socket = socket;

    socket.onConnect((_) {
      _attempt = 0;
      _setConnected(true);
    });
    socket.onDisconnect((_) => _setConnected(false));
    socket.onError((_) => _setConnected(false));
    // A refused handshake mid-shift is almost always the 15-minute access token
    // ageing out. Renew it, then dial again.
    socket.onConnectError((_) => _scheduleReconnect(renewFirst: true));

    // Named rather than caught with onAny: the backend emits some events with
    // no payload at all, and a catch-all handler with a fixed arity throws on
    // those — inside the one isolate that must not stop running.
    for (final name in kIncidentEvents) {
      socket.on(name, (dynamic data) {
        if (data is! Map) return;
        final payload = Map<String, dynamic>.from(data);
        _lastEventAt = DateTime.now();
        // Relayed first: the screen should never be slower than the alarm.
        service.invoke(DutyService.channelIncident, {
          'name': name,
          'data': payload,
        });
        unawaited(_announce(name, payload));
      });
    }
  }

  void _scheduleReconnect({bool renewFirst = false}) {
    _setConnected(false);
    if (_stopping || _reconnect != null) return;

    const backoff = [2, 4, 8, 15, 30];
    final seconds = backoff[_attempt < backoff.length ? _attempt : backoff.length - 1];
    _attempt++;

    _reconnect = Timer(Duration(seconds: seconds), () async {
      _reconnect = null;
      if (renewFirst) await _renewTokens();
      await _connect();
    });
  }

  /// Rotates the token pair.
  ///
  /// Deliberately never clears the stored tokens on failure. The UI isolate has
  /// its own refresh on the same pair, and whichever loses that race reads a
  /// token that has already been replaced — a retry picks up the new one. A
  /// responder being signed out mid-shift over a lost race is the worse bug.
  Future<bool> _renewTokens() async {
    final refresh = await _storage.getRefreshToken();
    if (refresh == null) return false;
    try {
      final response = await _dio.post<dynamic>(
        '${AppConfig.apiBaseUrl}/auth/refresh',
        data: {'refreshToken': refresh},
      );
      final data = (response.data as Map)['data'] as Map;
      await _storage.saveTokens(
        accessToken: data['accessToken'] as String,
        refreshToken: data['refreshToken'] as String,
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Turns an event into the thing that wakes the phone.
  ///
  /// The payload carries no free text on purpose — dispatch-only notes must not
  /// reach the resident's app — so the words here are built from the fields it
  /// does carry rather than read off it.
  Future<void> _announce(String event, Map<String, dynamic> payload) async {
    final id = payload['emergencyId'] as String?;
    if (id == null) return;

    final status = payload['status'] as String?;
    if (status == 'resolved' || status == 'cancelled') {
      _announced.remove(id);
      await AlertNotifications.cancelIncident(id);
      return;
    }

    final isAlarm = kAlarmEvents.contains(event);
    final isPersonal = kPersonalEvents.contains(event);
    if (!isAlarm && !isPersonal) return;
    if (isPersonal) {
      // Addressed to this responder, or not said at all.
      if (payload['assignedResponderId'] != _accountId) return;
      // A self-accept is acknowledged the instant it is made, which is how an
      // incident somebody took differs from one dispatch sent them. Telling a
      // responder about their own tap is noise.
      if (event == 'emergency.assigned' && payload['assignmentAckAt'] != null) {
        return;
      }
    }
    // An alert already on screen does not ring again when its position lands.
    if (isAlarm && !_announced.add(id)) return;

    final hardware =
        payload['source'] == 'iot_device' || payload['source'] == 'iot_keychain';
    final type = (payload['type'] as String? ?? 'general_sos').replaceAll(
      '_',
      ' ',
    );
    final priority = payload['priority'] as String? ?? 'medium';
    final barangay = payload['barangay'] as String?;
    final waitingForGps = payload['locationStatus'] == 'pending';

    final title = switch (event) {
      'emergency.iot_device_created' => 'PANIC BUTTON PRESSED',
      'emergency.iot_keychain_created' => 'PANIC BUTTON PRESSED',
      'emergency.created' => 'NEW ${type.toUpperCase()} EMERGENCY',
      'emergency.dispatch_overdue' => 'STILL UNANSWERED',
      'emergency.assigned' => 'Dispatch assigned this to you',
      'emergency.message' => 'New message on your incident',
      _ => 'Dispatch is asking for an update',
    };

    final where = barangay != null
        ? 'Barangay $barangay'
        : waitingForGps
        ? 'Location still searching'
        : 'Tanza';
    final body = [
      if (hardware) 'Wearable alert — no category given' else 'Reported as $type',
      where,
      '${priority.toUpperCase()} priority',
      if (waitingForGps) 'Waiting for GPS',
    ].join(' · ');

    if (isAlarm) _alerts++;
    await AlertNotifications.showIncident(
      emergencyId: id,
      title: title,
      body: body,
      // Not an alarm when they are already holding the phone looking at the
      // feed, and never one for a quiet hand-back.
      alarm: isAlarm ? !_uiVisible : false,
    );
  }

  Future<void> _startLocationStream() async {
    await _positions?.cancel();
    if (!await Geolocator.isLocationServiceEnabled()) return;
    final permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return;
    }

    _positions =
        Geolocator.getPositionStream(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 10,
          ),
        ).listen(
          (position) => unawaited(_postPosition(position)),
          onError: (_) {},
        );
  }

  Future<void> _postPosition(Position position, {bool retry = true}) async {
    final token = await _storage.getAccessToken();
    if (token == null) return;
    try {
      await _dio.post<dynamic>(
        '${AppConfig.apiBaseUrl}/locations/responder',
        data: {
          'coordinates': [position.longitude, position.latitude],
          'accuracyMeters': position.accuracy,
          'capturedAt': DateTime.now().toUtc().toIso8601String(),
          if (_emergencyTag != null) 'emergencyId': _emergencyTag,
          if (_ambulanceTag != null) 'ambulanceRequestId': _ambulanceTag,
        },
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
    } on DioException catch (error) {
      if (retry && error.response?.statusCode == 401 && await _renewTokens()) {
        await _postPosition(position, retry: false);
      }
    } catch (_) {
      // A dropped fix is not worth surfacing; the next one is ten metres away.
    }
  }

  void _setConnected(bool value) {
    if (_connected == value) return;
    _connected = value;
    unawaited(_publishStatus());
  }

  /// Keeps the duty row honest. "Listening for alerts" on a socket that is down
  /// is worse than saying nothing, because the responder would believe it.
  Future<void> _publishStatus() async {
    service.invoke(DutyService.channelConnection, {'connected': _connected});
    if (service is! AndroidServiceInstance) return;
    final android = service as AndroidServiceInstance;
    if (!await android.isForegroundService()) return;

    final last = _lastEventAt;
    final detail = _connected
        ? last == null
            ? 'Listening for alerts'
            : 'Listening · last alert ${_clock(last)}'
        : 'Reconnecting to dispatch…';
    await android.setForegroundNotificationInfo(
      title: _connected ? 'On duty — listening' : 'On duty — offline',
      content: _alerts > 0 ? '$detail · $_alerts this session' : detail,
    );
  }

  /// The `sub` claim, without verifying the signature — this token was minted
  /// for this device and the backend checks it on every use. Returns null for
  /// anything that does not parse, so a malformed token silences personal
  /// notifications rather than misdirecting them.
  static String? _accountIdFrom(String token) {
    try {
      final parts = token.split('.');
      if (parts.length < 2) return null;
      final payload = base64Url.decode(base64Url.normalize(parts[1]));
      final claims = jsonDecode(utf8.decode(payload)) as Map<String, dynamic>;
      return claims['sub'] as String?;
    } catch (_) {
      return null;
    }
  }

  static String _clock(DateTime at) =>
      '${at.hour.toString().padLeft(2, '0')}:${at.minute.toString().padLeft(2, '0')}';

  void _shutdown() {
    if (_stopping) return;
    _stopping = true;
    _heartbeat?.cancel();
    _reconnect?.cancel();
    unawaited(_positions?.cancel());
    _socket?.dispose();
    _socket = null;
    service.invoke(DutyService.channelConnection, {'connected': false});
    unawaited(service.stopSelf());
  }
}
