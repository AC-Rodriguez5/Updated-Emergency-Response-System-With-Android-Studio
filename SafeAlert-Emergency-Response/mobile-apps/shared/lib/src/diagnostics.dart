import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import 'api.dart';

/// First-party, account-scoped diagnostics. Never captures exception messages,
/// file paths, URLs, coordinates, document content or authentication tokens.
class CrashReports {
  static bool sending = false;
  static Future<void> pending = Future.value();
  static void install(Api api) {
    FlutterError.onError = (details) {
      FlutterError.presentError(details);
      unawaited(
        capture(
          api,
          details.exception,
          details.stack ?? StackTrace.current,
          false,
        ),
      );
    };
    PlatformDispatcher.instance.onError = (error, stack) {
      unawaited(capture(api, error, stack, true));
      return false;
    };
  }

  static Future<void> capture(
    Api api,
    Object error,
    StackTrace stack,
    bool fatal,
  ) {
    final account = api.account;
    if (account == null) return Future.value();
    final key = 'diagnostics:${recordId(account)}';
    final frames = RegExp(r'^#\d+\s+([A-Za-z0-9_.$<>-]+)', multiLine: true)
        .allMatches(stack.toString())
        .take(20)
        .map((match) => match.group(1)!)
        .where((frame) => frame.length <= 160)
        .toList();
    final type = error.runtimeType.toString().replaceAll(
      RegExp(r'[^A-Za-z0-9_]'),
      '',
    );
    final code = type.isEmpty
        ? 'UnknownError'
        : type.substring(0, type.length.clamp(0, 80));
    pending = pending.then((_) async {
      try {
        final rows = jsonDecode(await api.vault.read(key) ?? '[]') as List;
        rows.add({
          'eventId': const Uuid().v4(),
          'platform': 'android',
          'code': code,
          'frames': frames,
          'fatal': fatal,
          'capturedAt': DateTime.now().toUtc().toIso8601String(),
        });
        await api.vault.write(
          key,
          jsonEncode(
            rows.skip(rows.length > 20 ? rows.length - 20 : 0).toList(),
          ),
        );
      } catch (_) {
        /* Diagnostics must not interrupt emergency processing. */
      }
    });
    return pending;
  }

  static Future<void> flush(Api api) {
    if (sending || api.account == null) return Future.value();
    sending = true;
    final accountId = recordId(api.account!);
    pending = pending.then((_) async {
      try {
        final key = 'diagnostics:$accountId';
        final rows = jsonDecode(await api.vault.read(key) ?? '[]') as List;
        while (rows.isNotEmpty) {
          if (api.account == null || recordId(api.account!) != accountId) break;
          await api.request(
            'POST',
            '/diagnostics',
            body: Map<String, dynamic>.from(rows.first as Map),
          );
          rows.removeAt(0);
          await api.vault.write(key, jsonEncode(rows));
        }
      } catch (_) {
        /* Retain offline reports for the next successful sync. */
      } finally {
        sending = false;
      }
    });
    return pending;
  }
}
