import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../config/app_config.dart';
import '../config/server_discovery.dart';
import '../storage/secure_storage.dart';
import 'api_exception.dart';

/// Marks a request that has already been retried against a rediscovered
/// address, so a server that is genuinely down cannot start a retry loop.
const String _rediscovered = 'server_rediscovered';

final dioProvider = Provider<Dio>((ref) {
  final storage = ref.read(secureStorageProvider);
  final dio = Dio(BaseOptions(
    baseUrl: AppConfig.apiBaseUrl,
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 30),
    headers: {'Content-Type': 'application/json'},
  ));

  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) async {
      // The address can change while the app runs (Settings -> Server address),
      // and the repositories hold this Dio for the life of the process, so read
      // it per request instead of trusting BaseOptions.
      options.baseUrl = AppConfig.apiBaseUrl;
      final token = await storage.getAccessToken();
      if (token != null) options.headers['Authorization'] = 'Bearer $token';
      handler.next(options);
    },
    onError: (error, handler) async {
      if (ServerDiscovery.looksLikeServerMoved(error) &&
          error.requestOptions.extra[_rediscovered] != true) {
        final moved = await ref
            .read(serverDiscoveryProvider)
            .rediscover(skip: error.requestOptions.baseUrl);
        if (moved != null) {
          final retry = error.requestOptions
            ..baseUrl = moved
            ..extra[_rediscovered] = true;
          try {
            return handler.resolve(await dio.fetch<dynamic>(retry));
          } on DioException catch (e) {
            return handler.next(e);
          }
        }
      }
      if (error.response?.statusCode == 401) {
        try {
          final refreshToken = await storage.getRefreshToken();
          if (refreshToken == null) { await storage.clearTokens(); return handler.next(error); }
          final response = await Dio().post('${AppConfig.apiBaseUrl}/auth/refresh', data: {'refreshToken': refreshToken});
          final data = response.data as Map<String, dynamic>;
          final newAccess = data['data']['accessToken'] as String;
          final newRefresh = data['data']['refreshToken'] as String;
          await storage.saveTokens(accessToken: newAccess, refreshToken: newRefresh);
          error.requestOptions.headers['Authorization'] = 'Bearer $newAccess';
          final retried = await dio.fetch<dynamic>(error.requestOptions);
          return handler.resolve(retried);
        } catch (_) { await storage.clearTokens(); }
      }
      handler.next(error);
    },
  ));
  return dio;
});

ApiException dioErrorToApiException(DioException e) {
  final data = e.response?.data;
  if (data is Map<String, dynamic>) return ApiException.fromMap(data, e.response?.statusCode);
  if (ServerDiscovery.looksLikeServerMoved(e)) {
    // Rediscovery has already been tried and found nothing, so what is left to
    // say is where the app looked and what would bring it back - not Dio's
    // account of a 530, which reads as a bug in the app.
    final host = Uri.tryParse(AppConfig.apiBaseUrl)?.host ?? AppConfig.apiBaseUrl;
    return ApiException(
      message: 'Cannot reach the server at $host. Put this phone on the same '
          'Wi-Fi as the backend and try again, or set the new address under '
          'Server.',
      statusCode: e.response?.statusCode,
    );
  }
  return ApiException(message: e.message ?? 'Network error', statusCode: e.response?.statusCode);
}
