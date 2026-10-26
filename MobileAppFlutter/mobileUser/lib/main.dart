import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import 'core/config/app_config.dart';
import 'core/config/server_config.dart';
import 'core/services/offline_sync_service.dart';
import 'core/storage/secure_storage.dart';
import 'core/theme/app_theme.dart';
import 'core/routing/app_router.dart';
import 'features/auth/providers/auth_provider.dart';
import 'features/auth/repository/auth_repository.dart';
import 'features/ble_panic_button/service/ble_service.dart';
import 'features/emergency/providers/emergency_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Hive.initFlutter();
  await Hive.openBox<String>('offline_queue');
  await Hive.openBox<String>('pending_alerts');
  await Hive.openBox<String>('active_emergency');
  await Hive.openBox<String>('wearable_settings');
  await Hive.openBox<String>(ServerConfigStore.boxName);
  // Before runApp, so the very first request goes to the saved address.
  ServerConfigStore.restore();
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);
  runApp(const ProviderScope(child: TanzAlertApp()));
}

class TanzAlertApp extends ConsumerStatefulWidget {
  const TanzAlertApp({super.key});

  @override
  ConsumerState<TanzAlertApp> createState() => _TanzAlertAppState();
}

class _TanzAlertAppState extends ConsumerState<TanzAlertApp>
    with WidgetsBindingObserver {
  StreamSubscription? _syncSub;
  io.Socket? _emergencySocket;
  Timer? _socketRenewal;
  int _socketAttempt = 0;
  bool _startingEmergencySession = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final syncService = ref.read(offlineSyncServiceProvider);
      _syncSub = syncService.onAlertSynced.listen((em) {
        ref.read(emergencyProvider.notifier).setActive(em);
      });
      _handleAuthState(ref.read(authStateProvider));
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _syncSub?.cancel();
    _socketRenewal?.cancel();
    _disconnectEmergencySocket();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        ref.read(authStateProvider) is AuthAuthenticated) {
      unawaited(_startEmergencySession());
    }
  }

  void _handleAuthState(AuthState state) {
    if (state is AuthAuthenticated) {
      ref.read(bleServiceProvider.notifier).setOwner(state.user.id);
      unawaited(_startEmergencySession());
    } else if (state is AuthUnauthenticated || state is AuthPending) {
      _disconnectEmergencySocket();
      final ble = ref.read(bleServiceProvider.notifier);
      ble.onEmergency = null;
      ble.onDeviceLocation = null;
      ble.setOwner(null);
      unawaited(ble.disconnect(clearState: true));
      ref.read(emergencyProvider.notifier).reset();
    }
  }

  Future<void> _startEmergencySession() async {
    if (_startingEmergencySession) return;
    _startingEmergencySession = true;
    try {
      final ble = ref.read(bleServiceProvider.notifier);
      ble.onEmergency = (payload) async {
        final delivery = await ref
            .read(emergencyProvider.notifier)
            .createFromIot(payload: payload);
        final em = delivery.emergency;
        return BleDelivery(
          accepted: delivery.accepted,
          emergencyId: em?.id,
          revision: em?.locationRevision,
          // An offline-queued alert has no server answer yet, so the device is
          // left streaming rather than told to stop.
          tracking: em?.trackingActive ?? true,
        );
      };
      ble.onDeviceLocation = (payload) async {
        final em = await ref
            .read(emergencyProvider.notifier)
            .sendIotLocation(payload: payload);
        if (em == null) return null;
        return BleDelivery(
          accepted: true,
          emergencyId: em.id,
          revision: em.locationRevision,
          tracking: em.trackingActive,
        );
      };
      if (ref.read(bleServiceProvider).deviceId != null) {
        unawaited(ble.reconnect());
      }
      await ble.retryQueuedEvents();
      await ref.read(emergencyProvider.notifier).loadActiveEmergency();
      await _connectEmergencySocket();
    } finally {
      _startingEmergencySession = false;
    }
  }

  Future<void> _connectEmergencySocket() async {
    if (_emergencySocket?.connected ?? false) return;

    final token = await ref.read(secureStorageProvider).getAccessToken();
    if (token == null) return;

    _disconnectEmergencySocket();
    final socket = io.io(
      AppConfig.apiBaseUrl.replaceAll('/api', ''),
      io.OptionBuilder().setTransports(['websocket']).setAuth({
        'token': token,
      }).build(),
    );
    _emergencySocket = socket;

    // The server refuses a handshake carrying an expired access token, and
    // Socket.IO would keep presenting the same one. One authenticated call
    // renews it; then reconnect with what is now in storage.
    socket.onConnectError((_) => _renewAndReconnect());

    void refreshFromEvent(dynamic data) {
      final emergencyId =
          _eventString(data, 'emergencyId') ??
          _eventString(data, '_id') ??
          _eventString(data, 'id');
      final status = _eventString(data, 'status');
      final notifier = ref.read(emergencyProvider.notifier);

      if (emergencyId == null) {
        unawaited(notifier.loadActiveEmergency());
        return;
      }
      unawaited(notifier.refreshEmergency(emergencyId, status: status));
    }

    const events = [
      'emergency.created',
      'emergency.iot_keychain_created',
      'emergency.iot_device_created',
      'emergency.updated',
      'emergency.assigned',
      // A responder handing the incident back, or a dispatch nobody answered:
      // either way it is waiting on a responder again and the screen must stop
      // saying somebody is coming.
      'emergency.released',
      'emergency.assignment_expired',
      'emergency.responder_on_the_way',
      'emergency.responder_nearby',
      'emergency.resolved',
    ];
    for (final event in events) {
      socket.on(event, refreshFromEvent);
    }
    socket.onConnect((_) {
      _socketAttempt = 0;
      unawaited(ref.read(emergencyProvider.notifier).loadActiveEmergency());
    });
  }

  String? _eventString(dynamic data, String key) {
    if (data is Map && data[key] != null) return data[key].toString();
    return null;
  }

  /// Backs off, renews the session, and reconnects. Shared by both failure
  /// paths so a backend that is simply down is not hammered.
  void _renewAndReconnect() {
    if (_socketRenewal != null) return;
    const backoff = [3, 5, 10, 20, 30];
    final seconds =
        backoff[_socketAttempt < backoff.length
            ? _socketAttempt
            : backoff.length - 1];
    _socketAttempt++;

    _socketRenewal = Timer(Duration(seconds: seconds), () async {
      _socketRenewal = null;
      if (!mounted) return;
      try {
        await ref.read(authRepositoryProvider).getMe();
      } catch (_) {
        // The old token may still be good and the network may have been the
        // problem, so reconnecting is still worth a try.
      }
      _disconnectEmergencySocket();
      await _connectEmergencySocket();
    });
  }

  void _disconnectEmergencySocket() {
    final socket = _emergencySocket;
    if (socket == null) return;
    socket.dispose();
    _emergencySocket = null;
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AuthState>(authStateProvider, (_, next) {
      _handleAuthState(next);
    });

    final router = ref.watch(appRouterProvider);
    return MaterialApp.router(
      title: 'TanzAlert',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      routerConfig: router,
    );
  }
}
