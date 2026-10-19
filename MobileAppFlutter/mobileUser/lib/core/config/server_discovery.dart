import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_config.dart';
import 'server_config.dart';

final serverDiscoveryProvider = Provider<ServerDiscovery>(
  (ref) => ServerDiscovery(ref),
);

/// Finds the backend again after it moves, so an installed app survives a
/// restart of the tunnel it was built against.
///
/// A Cloudflare quick tunnel is handed a new hostname every time it starts. The
/// old one first answers 530 — Cloudflare still has the name, but nothing is
/// behind it — and then stops resolving at all. Neither is something the person
/// holding the phone can do anything about, and in the usual case they do not
/// have to: when the phone is on the same Wi-Fi as the backend, the tunnel is
/// not needed at all. So a request that fails this way sweeps the local network
/// for something answering `/health` on [backendPort], keeps it, and the failed
/// request is retried against it.
class ServerDiscovery {
  ServerDiscovery(this._ref);

  final Ref _ref;

  static const int backendPort = 5000;

  /// Cloudflare's "the tunnel is gone" replies, plus the ordinary gateway
  /// errors. A 5xx from our own backend is not here: that is a server that
  /// answered, and moving to another one would not help.
  static const Set<int> _edgeFailures = {502, 503, 504, 521, 522, 523, 524, 530};

  static const Duration _probeTimeout = Duration(milliseconds: 600);
  static const Duration _healthTimeout = Duration(seconds: 3);

  /// Keeps a burst of failing requests, or a backend that is simply down, from
  /// sweeping the network over and over.
  static const Duration _cooldown = Duration(seconds: 15);

  static const int _batchSize = 48;

  Future<String?>? _inFlight;
  DateTime? _lastFailure;

  /// Whether [error] says the backend moved, rather than that it answered.
  static bool looksLikeServerMoved(DioException error) {
    switch (error.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
        return true;
      case DioExceptionType.badResponse:
        return _edgeFailures.contains(error.response?.statusCode);
      case DioExceptionType.unknown:
        final message = error.message ?? '';
        return message.contains('Failed host lookup') ||
            message.contains('SocketException');
      default:
        return false;
    }
  }

  /// The address the app should use now, or null when nothing could be found.
  ///
  /// [skip] is the address that just failed, so it is not tried again first.
  /// Concurrent callers share one sweep.
  Future<String?> rediscover({String? skip}) async {
    final last = _lastFailure;
    if (last != null && DateTime.now().difference(last) < _cooldown) {
      return null;
    }
    final running = _inFlight;
    if (running != null) return running;

    final attempt = _search(skip: skip);
    _inFlight = attempt;
    try {
      return await attempt;
    } finally {
      _inFlight = null;
    }
  }

  Future<String?> _search({String? skip}) async {
    // The address this build was compiled with is one HTTP call to rule out,
    // and it is the right answer whenever the app simply lost its way back.
    final fromBuild = AppConfig.defaultApiBaseUrl;
    if (fromBuild != skip && await isBackend(fromBuild)) {
      return _adopt(fromBuild);
    }

    final onLan = await _findOnLan(skip: skip);
    if (onLan != null) return _adopt(onLan);

    _lastFailure = DateTime.now();
    return null;
  }

  Future<String> _adopt(String apiBaseUrl) async {
    _lastFailure = null;
    if (apiBaseUrl != AppConfig.apiBaseUrl) {
      // Saved, not just held: the next launch should start where this one
      // ended up, and the screens showing the address update with it.
      await _ref.read(serverConfigProvider).save(apiBaseUrl);
    }
    return apiBaseUrl;
  }

  Future<String?> _findOnLan({String? skip}) async {
    for (final prefix in await _subnets()) {
      for (var start = 1; start < 255; start += _batchSize) {
        final hosts = [
          for (var i = start; i < start + _batchSize && i < 255; i++)
            '$prefix$i',
        ];
        final open = await Future.wait(hosts.map(_portOpen));
        for (var i = 0; i < hosts.length; i++) {
          if (!open[i]) continue;
          final candidate = 'http://${hosts[i]}:$backendPort/api';
          if (candidate != skip && await isBackend(candidate)) return candidate;
        }
      }
    }
    return null;
  }

  /// The `x.y.z.` prefixes worth sweeping: the phone's own Wi-Fi or ethernet
  /// networks.
  ///
  /// Mobile data is deliberately left out. Its address is private too, but it
  /// belongs to the carrier's network, where the backend certainly is not and
  /// where sweeping 254 addresses is both pointless and rude.
  Future<List<String>> _subnets() async {
    try {
      final interfaces = await NetworkInterface.list(
        type: InternetAddressType.IPv4,
        includeLoopback: false,
        includeLinkLocal: false,
      );
      final prefixes = <String>{};
      for (final interface in interfaces) {
        if (!isLocalNetworkInterface(interface.name)) continue;
        for (final address in interface.addresses) {
          final prefix = subnetPrefix(address.address);
          if (prefix != null) prefixes.add(prefix);
        }
      }
      return prefixes.toList();
    } on Object {
      return const [];
    }
  }

  Future<bool> _portOpen(String host) async {
    try {
      final socket = await Socket.connect(
        host,
        backendPort,
        timeout: _probeTimeout,
      );
      socket.destroy();
      return true;
    } on Object {
      return false;
    }
  }

  /// Whether [apiBaseUrl] is the TanzAlert backend rather than merely something
  /// with port 5000 open.
  @visibleForTesting
  Future<bool> isBackend(String apiBaseUrl) async {
    final dio = Dio(
      BaseOptions(
        connectTimeout: _healthTimeout,
        receiveTimeout: _healthTimeout,
        validateStatus: (_) => true,
      ),
    );
    try {
      final response = await dio.get<dynamic>('$apiBaseUrl/health');
      final body = response.data;
      return response.statusCode == 200 &&
          body is Map &&
          body['status'] == 'ok';
    } on Object {
      return false;
    } finally {
      dio.close(force: true);
    }
  }

  @visibleForTesting
  static bool isLocalNetworkInterface(String name) =>
      name.startsWith('wlan') || name.startsWith('eth') || name.startsWith('en');

  /// `192.168.254.107` -> `192.168.254.`, and null for anything that is not a
  /// private IPv4 address.
  @visibleForTesting
  static String? subnetPrefix(String ip) {
    final parts = ip.split('.');
    if (parts.length != 4) return null;
    final octets = [for (final part in parts) int.tryParse(part)];
    if (octets.any((o) => o == null || o < 0 || o > 255)) return null;

    final first = octets[0]!;
    final second = octets[1]!;
    final private = first == 10 ||
        (first == 172 && second >= 16 && second <= 31) ||
        (first == 192 && second == 168);
    if (!private) return null;

    return '${parts[0]}.${parts[1]}.${parts[2]}.';
  }
}
