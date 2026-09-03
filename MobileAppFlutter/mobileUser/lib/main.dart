import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import 'core/config/app_config.dart';
import 'core/services/offline_sync_service.dart';
import 'core/storage/secure_storage.dart';
import 'core/theme/app_theme.dart';
import 'core/routing/app_router.dart';
import 'features/auth/providers/auth_provider.dart';
import 'features/emergency/providers/emergency_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Hive.initFlutter();
  await Hive.openBox<String>('offline_queue');
  await Hive.openBox<String>('pending_alerts');
  await Hive.openBox<String>('active_emergency');
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
      unawaited(_startEmergencySession());
    } else if (state is AuthUnauthenticated || state is AuthPending) {
      _disconnectEmergencySocket();
      ref.read(emergencyProvider.notifier).reset();
    }
  }

  Future<void> _startEmergencySession() async {
    if (_startingEmergencySession) return;
    _startingEmergencySession = true;
    try {
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
      'emergency.updated',
      'emergency.assigned',
      'emergency.responder_on_the_way',
      'emergency.responder_nearby',
      'emergency.resolved',
    ];
    for (final event in events) {
      socket.on(event, refreshFromEvent);
    }
    socket.onConnect((_) {
      unawaited(ref.read(emergencyProvider.notifier).loadActiveEmergency());
    });
  }

  String? _eventString(dynamic data, String key) {
    if (data is Map && data[key] != null) return data[key].toString();
    return null;
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
