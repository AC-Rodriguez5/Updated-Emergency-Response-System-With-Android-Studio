import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive/hive.dart';

import 'app_config.dart';

/// Saves the backend address typed into the app so it outlives a restart.
///
/// Hive rather than the secure store: the address is not a secret, and it has
/// to be readable synchronously before the first frame.
class ServerConfigStore {
  ServerConfigStore._();

  static const String boxName = 'app_settings';
  static const String _key = 'api_base_url';

  static Box<String> get _box => Hive.box<String>(boxName);

  /// Call once from `main()`, after [boxName] is open and before `runApp`.
  static void restore() => AppConfig.setApiBaseUrlOverride(_box.get(_key));

  static Future<void> save(String apiBaseUrl) async {
    AppConfig.setApiBaseUrlOverride(apiBaseUrl);
    await _box.put(_key, apiBaseUrl);
  }

  static Future<void> clear() async {
    AppConfig.setApiBaseUrlOverride(null);
    await _box.delete(_key);
  }
}

final serverConfigProvider = ChangeNotifierProvider<ServerConfigNotifier>(
  (ref) => ServerConfigNotifier(),
);

class ServerConfigNotifier extends ChangeNotifier {
  String get apiBaseUrl => AppConfig.apiBaseUrl;
  String get defaultApiBaseUrl => AppConfig.defaultApiBaseUrl;

  /// Whether the app follows an address saved on this device rather than the
  /// one compiled into the build.
  bool get isCustom => AppConfig.apiBaseUrlOverride != null;

  /// Host only, for showing which backend the app is on without eating a line.
  String get host => Uri.tryParse(apiBaseUrl)?.host ?? apiBaseUrl;

  Future<void> save(String apiBaseUrl) async {
    await ServerConfigStore.save(apiBaseUrl);
    notifyListeners();
  }

  Future<void> useBuildDefault() async {
    await ServerConfigStore.clear();
    notifyListeners();
  }

  /// Asks `<apiBaseUrl>/health` whether anything is there, so an address can be
  /// checked before it is saved rather than by failing a sign-in.
  Future<ServerProbeResult> probe(String apiBaseUrl) async {
    final dio = Dio(
      BaseOptions(
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 10),
        validateStatus: (_) => true,
      ),
    );
    try {
      final response = await dio.get<dynamic>('$apiBaseUrl/health');
      if (response.statusCode == 200) {
        return const ServerProbeResult(true, 'Reached the server.');
      }
      return ServerProbeResult(
        false,
        'Something answered with ${response.statusCode}, but it is not the '
            'TanzAlert backend. Check the address.',
      );
    } on DioException catch (e) {
      return ServerProbeResult(false, _probeFailure(e));
    } finally {
      dio.close(force: true);
    }
  }

  String _probeFailure(DioException e) {
    if ((e.message ?? '').contains('Failed host lookup')) {
      return 'That address does not exist. If it is a Cloudflare quick tunnel, '
          'it has been restarted since — start it again and paste the new URL.';
    }
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return 'The server did not answer in time.';
      default:
        return 'Could not reach the server. Check the address, and that the '
            'backend is running.';
    }
  }
}

class ServerProbeResult {
  final bool reachable;
  final String message;

  const ServerProbeResult(this.reachable, this.message);
}
