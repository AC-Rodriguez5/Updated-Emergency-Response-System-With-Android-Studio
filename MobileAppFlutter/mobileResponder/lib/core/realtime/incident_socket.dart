import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

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
  IncidentSocket(this._storage);

  final SecureStorageService _storage;

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

    socket.onConnect((_) => _setConnected(true));
    socket.onDisconnect((_) => _setConnected(false));
    socket.onConnectError((_) => _setConnected(false));
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
    _socket?.dispose();
    _socket = null;
    _setConnected(false);
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
  final socket = IncidentSocket(ref.read(secureStorageProvider));
  ref.onDispose(socket.dispose);
  return socket;
});
