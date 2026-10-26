import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../features/auth/repository/auth_repository.dart';
import '../config/app_config.dart';
import '../duty/duty_service.dart';
import '../storage/secure_storage.dart';
import 'incident_events.dart';

/// One incident event, as it came off the wire.
class IncidentEvent {
  final String name;
  final Map<String, dynamic> data;

  const IncidentEvent(this.name, this.data);

  String? get emergencyId =>
      data['emergencyId'] as String? ??
      data['_id'] as String? ??
      data['id'] as String?;

  String? get assignedResponderId => data['assignedResponderId'] as String?;

  /// Something a person said or asked, rather than a status moving.
  bool get isConversation =>
      name == 'emergency.message' || name == 'emergency.update_requested';

  /// The incident changing hands — taken back by dispatch, expired unanswered,
  /// or handed to somebody else.
  bool get isAssignmentChange =>
      name == 'emergency.released' ||
      name == 'emergency.assignment_expired' ||
      name == 'emergency.assigned' ||
      name == 'emergency.resolved';
}

/// The app's one connection to the incident stream.
///
/// This used to live inside the live-map screen, which meant a dispatcher's
/// message only arrived if the responder happened to have that tab open — and
/// silently went nowhere if they were on Duty or Ambulance. A connection that
/// exists for the life of the session is the difference between a channel and
/// a screen that sometimes listens.
///
/// While the responder is on duty the connection is not held here at all. The
/// duty foreground service owns it ([DutyService]), because a socket in the UI
/// isolate dies with the process and Android kills an idle process within
/// minutes. This class then relays the service's events into the same stream
/// the screens already read, so nothing above it has to know which of the two
/// is dialling. Only ever one at a time: refresh tokens rotate server-side, and
/// two isolates renewing the same pair can revoke each other.
class IncidentSocket {
  IncidentSocket(this._storage, {Future<void> Function()? refreshSession})
    : _refreshSession = refreshSession;

  final SecureStorageService _storage;

  /// Makes one authenticated HTTP call, which is how an expired access token
  /// gets refreshed — the API client swaps it on a 401 and writes the new pair
  /// to storage, where [connect] will pick it up.
  final Future<void> Function()? _refreshSession;

  final _events$ = StreamController<IncidentEvent>.broadcast();
  final _connection$ = StreamController<bool>.broadcast();

  io.Socket? _socket;
  bool _connected = false;
  Timer? _reauth;
  Timer? _watchdog;
  int _attempt = 0;

  /// True while the duty foreground service holds the connection.
  bool _delegated = false;

  StreamSubscription<Map<String, dynamic>?>? _relayEvents;
  StreamSubscription<Map<String, dynamic>?>? _relayConnection;
  StreamSubscription<List<ConnectivityResult>>? _connectivity;

  Stream<IncidentEvent> get events => _events$.stream;

  /// Whether the stream is live, for the "listening"/"offline" dot.
  Stream<bool> get connection => _connection$.stream;
  bool get isConnected => _connected;

  /// Whether the responder's phone will still be listening with the app closed.
  bool get isHeldByDutyService => _delegated;

  Future<void> connect() async {
    _listenToDutyService();
    unawaited(_watchConnectivity());
    _startWatchdog();

    if (await DutyService.isRunning) {
      _delegate();
      return;
    }
    await _dial();
  }

  Future<void> _dial() async {
    final token = await _storage.getAccessToken();
    if (token == null) return;
    _teardownSocket();

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
    // A refused handshake is usually an access token that aged out mid-shift.
    // Socket.IO would retry forever with the same stale one, so the token is
    // renewed before trying again.
    socket.onConnectError((_) => _scheduleReconnect());
    socket.onError((_) => _setConnected(false));

    for (final name in kIncidentEvents) {
      socket.on(name, (dynamic data) {
        if (data is Map<String, dynamic>) {
          _events$.add(IncidentEvent(name, data));
        }
      });
    }
  }

  /// Checks that something is actually listening, rather than trusting it.
  ///
  /// Two ways this app can look connected and not be: a socket that came back
  /// from a cell handover half-open, still "connected" on this side and
  /// delivering nothing; and a duty service that an OEM battery manager killed,
  /// leaving the app waiting on a relay from a process that no longer exists.
  /// [ensureLive] covers both.
  void _startWatchdog() {
    _watchdog ??= Timer.periodic(
      const Duration(seconds: 45),
      (_) => unawaited(ensureLive()),
    );
  }

  /// Reconnects if the stream is not actually live. Cheap enough to call on
  /// every app resume, which is what the shell does.
  Future<void> ensureLive() async {
    if (_delegated) {
      // The service is the authority on its own socket while it is alive.
      if (await DutyService.isRunning) return;
      // It is not. Taking the connection back here is the difference between
      // an app that says offline and one where nobody notices.
      _delegated = false;
    }
    if (_socket?.connected == true) return;
    await connect();
  }

  /// Called when duty starts and stops. Starting duty hands the connection to
  /// the foreground service; ending it takes the connection back, so the app
  /// stays live on screen without a service holding the process open.
  Future<void> setDelegatedToDutyService(bool delegated) async {
    if (delegated) {
      _delegate();
      return;
    }
    _delegated = false;
    // Dialled directly rather than through [connect]: `stopSelf` is
    // asynchronous, so the service it just told to stop can still report itself
    // as running for a moment, and going back through connect() would hand the
    // socket straight back to something that has stopped listening.
    _listenToDutyService();
    _startWatchdog();
    await _dial();
  }

  void _delegate() {
    _delegated = true;
    _teardownSocket();
    // The service reports its own connection state over the relay; until the
    // first report arrives, say nothing rather than claim offline.
  }

  void _listenToDutyService() {
    _relayEvents ??= DutyService.incidents.listen((message) {
      final name = message?['name'] as String?;
      final data = message?['data'];
      if (name == null || data is! Map) return;
      _events$.add(IncidentEvent(name, Map<String, dynamic>.from(data)));
    });
    _relayConnection ??= DutyService.connection.listen((message) {
      if (!_delegated) return;
      _setConnected(message?['connected'] == true);
    });
  }

  /// Wi-Fi to mobile data, or a tunnel coming back up, should not cost a
  /// responder the backoff window.
  Future<void> _watchConnectivity() async {
    _connectivity ??= Connectivity().onConnectivityChanged.listen((results) {
      final online = results.any((r) => r != ConnectivityResult.none);
      if (online) unawaited(ensureLive());
    });
  }

  void _teardownSocket() {
    _reauth?.cancel();
    _reauth = null;
    _attempt = 0;
    _socket?.dispose();
    _socket = null;
  }

  /// Ends the session's listening entirely. Signing out, not going off duty.
  void disconnect() {
    _watchdog?.cancel();
    _watchdog = null;
    _delegated = false;
    _teardownSocket();
    _setConnected(false);
  }

  /// Renews the session, then reconnects, backing off so a backend that is
  /// simply down is not hammered.
  void _scheduleReconnect() {
    _setConnected(false);
    if (_delegated || _reauth != null) return;

    const backoff = [3, 5, 10, 20, 30];
    final seconds = backoff[_attempt < backoff.length ? _attempt : backoff.length - 1];
    _attempt++;

    _reauth = Timer(Duration(seconds: seconds), () async {
      _reauth = null;
      try {
        await _refreshSession?.call();
      } catch (_) {
        // Still worth reconnecting: the old token may yet be valid and the
        // failure may have been the network rather than the credentials.
      }
      await connect();
    });
  }

  void _setConnected(bool value) {
    if (_connected == value) return;
    _connected = value;
    if (!_connection$.isClosed) _connection$.add(value);
  }

  void dispose() {
    _watchdog?.cancel();
    unawaited(_relayEvents?.cancel());
    unawaited(_relayConnection?.cancel());
    unawaited(_connectivity?.cancel());
    disconnect();
    unawaited(_events$.close());
    unawaited(_connection$.close());
  }
}

final incidentSocketProvider = Provider<IncidentSocket>((ref) {
  final socket = IncidentSocket(
    ref.read(secureStorageProvider),
    refreshSession: () => ref.read(authRepositoryProvider).getMe(),
  );
  ref.onDispose(socket.dispose);
  return socket;
});
