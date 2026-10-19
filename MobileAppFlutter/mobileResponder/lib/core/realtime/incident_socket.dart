import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../features/auth/repository/auth_repository.dart';
import '../config/app_config.dart';
import '../storage/secure_storage.dart';

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
class IncidentSocket {
  IncidentSocket(this._storage, {Future<void> Function()? refreshSession})
    : _refreshSession = refreshSession;

  final SecureStorageService _storage;

  /// Makes one authenticated HTTP call, which is how an expired access token
  /// gets refreshed — the API client swaps it on a 401 and writes the new pair
  /// to storage, where [connect] will pick it up.
  final Future<void> Function()? _refreshSession;

  static const List<String> _events = [
    'emergency.created',
    'emergency.iot_keychain_created',
    'emergency.iot_device_created',
    'emergency.location_updated',
    'emergency.updated',
    'emergency.assigned',
    'emergency.assignment_acknowledged',
    'emergency.assignment_expired',
    'emergency.released',
    'emergency.dispatch_overdue',
    'emergency.responder_on_the_way',
    'emergency.responder_nearby',
    'emergency.responder_arrived',
    'emergency.responder_report',
    'emergency.message',
    'emergency.update_requested',
    'emergency.resolved',
  ];

  final _events$ = StreamController<IncidentEvent>.broadcast();
  final _connection$ = StreamController<bool>.broadcast();

  io.Socket? _socket;
  bool _connected = false;
  Timer? _reauth;
  int _attempt = 0;

  Stream<IncidentEvent> get events => _events$.stream;

  /// Whether the stream is live, for the "listening"/"offline" dot.
  Stream<bool> get connection => _connection$.stream;
  bool get isConnected => _connected;

  Future<void> connect() async {
    final token = await _storage.getAccessToken();
    if (token == null) return;
    disconnect();

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

    for (final name in _events) {
      socket.on(name, (dynamic data) {
        if (data is Map<String, dynamic>) {
          _events$.add(IncidentEvent(name, data));
        }
      });
    }
  }

  void disconnect() {
    _reauth?.cancel();
    _reauth = null;
    _attempt = 0;
    _socket?.dispose();
    _socket = null;
    _setConnected(false);
  }

  /// Renews the session, then reconnects, backing off so a backend that is
  /// simply down is not hammered.
  void _scheduleReconnect() {
    _setConnected(false);
    if (_reauth != null) return;

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
