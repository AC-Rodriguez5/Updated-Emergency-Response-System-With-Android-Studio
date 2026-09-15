import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:path_provider/path_provider.dart';

typedef Json = Map<String, dynamic>;

abstract class Vault {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class SecureVault implements Vault {
  Future<T> sessionLock<T>(Future<T> Function() work) async {
    final directory = await getApplicationSupportDirectory();
    final lock = await File(
      '${directory.path}/session.lock',
    ).open(mode: FileMode.append);
    try {
      await lock.lock(FileLock.exclusive);
      return await work();
    } finally {
      await lock.unlock();
      await lock.close();
    }
  }

  final FlutterSecureStorage storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );
  @override
  Future<String?> read(String key) => storage.read(key: key);
  @override
  Future<void> write(String key, String value) =>
      storage.write(key: key, value: value);
  @override
  Future<void> delete(String key) => storage.delete(key: key);
}

class ApiException implements Exception {
  final int status;
  final String code;
  final String message;
  ApiException(this.status, this.code, this.message);
  bool get retryable => status == 0 || status == 429 || status >= 500;
  @override
  String toString() => message;
}

class Api {
  static const defaultBase = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:5000/api',
  );
  final String base;
  final http.Client client;
  final Vault vault;
  String? accessToken;
  String? refreshToken;
  Json? account;
  Future<void>? _refreshing;
  void Function()? onSessionExpired;
  void Function()? onSessionRefreshed;
  Future<bool> Function()? coordinateRefresh;
  Api({required this.vault, String? base, http.Client? client})
    : base = (base ?? defaultBase).replaceFirst(RegExp(r'/$'), ''),
      client = client ?? http.Client();
  Future<void> restore() async {
    final raw = await vault.read('session');
    if (raw == null) {
      accessToken = null;
      refreshToken = null;
      account = null;
      return;
    }
    final data = jsonDecode(raw) as Json;
    accessToken = data['accessToken'] as String?;
    refreshToken = data['refreshToken'] as String?;
    account = data['account'] as Json?;
  }

  Future<void> setSession(Json data) async {
    accessToken = data['accessToken'] as String;
    refreshToken = data['refreshToken'] as String;
    account = data['account'] as Json;
    await vault.write('session', jsonEncode(data));
  }

  Future<void> clearSession() async {
    accessToken = null;
    refreshToken = null;
    account = null;
    await vault.delete('session');
  }

  Future<void> refresh() =>
      _refreshing ??= _lockedRefresh().whenComplete(() => _refreshing = null);
  Future<void> _lockedRefresh() async {
    if (coordinateRefresh != null && await coordinateRefresh!()) {
      await restore();
      onSessionRefreshed?.call();
      return;
    }
    final previous = refreshToken;
    Future<void> run() async {
      if (vault is SecureVault) {
        await restore();
        if (refreshToken != previous && accessToken != null) {
          onSessionRefreshed?.call();
          return;
        }
      }
      await _refresh();
    }

    if (vault is SecureVault) {
      await (vault as SecureVault).sessionLock(run);
    } else {
      await run();
    }
  }

  Future<void> _refresh() async {
    if (refreshToken == null) {
      throw ApiException(401, 'SESSION_EXPIRED', 'Please sign in again.');
    }
    try {
      final result = await request(
        'POST',
        '/auth/refresh',
        body: {'refreshToken': refreshToken},
        authenticated: false,
      );
      await setSession(result['data'] as Json);
      onSessionRefreshed?.call();
    } on ApiException catch (e) {
      if (e.status == 401 || e.status == 403) {
        await clearSession();
        onSessionExpired?.call();
      }
      rethrow;
    }
  }

  Future<Json> request(
    String method,
    String path, {
    Json? body,
    String? idempotencyKey,
    bool authenticated = true,
    bool refreshed = false,
    bool retry = false,
  }) async {
    var attempts = 0;
    while (true) {
      try {
        final request = http.Request(method, Uri.parse('$base$path'));
        request.headers['Content-Type'] = 'application/json';
        if (authenticated && accessToken != null) {
          request.headers['Authorization'] = 'Bearer $accessToken';
        }
        if (idempotencyKey != null) {
          request.headers['Idempotency-Key'] = idempotencyKey;
        }
        if (body != null) request.body = jsonEncode(body);
        final response = await (() async => http.Response.fromStream(
          await client.send(request),
        ))().timeout(const Duration(seconds: 10));
        if (response.statusCode == 401 &&
            authenticated &&
            !refreshed &&
            refreshToken != null) {
          await refresh();
          return this.request(
            method,
            path,
            body: body,
            idempotencyKey: idempotencyKey,
            refreshed: true,
            retry: retry,
          );
        }
        return decode(response);
      } on ApiException catch (e) {
        if (!retry ||
            !(method == 'GET' || idempotencyKey != null) ||
            !e.retryable ||
            attempts >= 3) {
          rethrow;
        }
      } on TimeoutException {
        if (!retry ||
            !(method == 'GET' || idempotencyKey != null) ||
            attempts >= 3) {
          throw ApiException(
            0,
            'TIMEOUT',
            'Connection timed out. Delivery has not been confirmed.',
          );
        }
      } on http.ClientException {
        if (!retry ||
            !(method == 'GET' || idempotencyKey != null) ||
            attempts >= 3) {
          throw ApiException(
            0,
            'OFFLINE',
            'Waiting for connection to send emergency.',
          );
        }
      }
      await Future<void>.delayed(
        Duration(milliseconds: (1000 << attempts++) + Random().nextInt(250)),
      );
    }
  }

  Json decode(http.Response response) {
    Json result;
    try {
      result = jsonDecode(response.body) as Json;
    } catch (_) {
      throw ApiException(
        response.statusCode,
        'INVALID_RESPONSE',
        'The server returned an unreadable response. Try again.',
      );
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = result['error'];
      throw ApiException(
        response.statusCode,
        error is Map ? '${error['code']}' : 'REQUEST_FAILED',
        error is Map ? '${error['message']}' : 'Request failed. Try again.',
      );
    }
    return result;
  }

  Future<String> upload(
    String path,
    String name,
    String purpose,
    String source,
    String registrationToken,
  ) async {
    final extension = name.split('.').last.toLowerCase();
    final mime = switch (extension) {
      'png' => 'image/png',
      'pdf' => 'application/pdf',
      'webp' => 'image/webp',
      _ => 'image/jpeg',
    };
    final request = http.MultipartRequest('POST', Uri.parse('$base/upload'))
      ..headers['Authorization'] = 'Bearer $registrationToken'
      ..fields.addAll({'purpose': purpose, 'source': source});
    request.files.add(
      await http.MultipartFile.fromPath(
        'file',
        path,
        filename: name,
        contentType: MediaType.parse(mime),
      ),
    );
    try {
      final response = await (() async => http.Response.fromStream(
        await client.send(request),
      ))().timeout(const Duration(seconds: 10));
      return (decode(response)['data'] as Json)['id'] as String;
    } on TimeoutException {
      throw ApiException(
        0,
        'TIMEOUT',
        'Upload timed out. Please retry the document.',
      );
    }
  }

  void dispose() => client.close();
}

String recordId(Json value) => '${value['id'] ?? value['_id'] ?? ''}';
bool isActive(Json incident) =>
    !{'resolved', 'cancelled', 'false_alarm'}.contains(incident['status']);
String readable(String value) => value
    .split('_')
    .map(
      (part) =>
          part.isEmpty ? part : '${part[0].toUpperCase()}${part.substring(1)}',
    )
    .join(' ');
