import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:safealert_mobile/src/diagnostics.dart';
import 'emergency_safety_test.dart' show MemoryVault, api, success;

void main() {
  test(
    'crash reports redact messages and paths, persist offline and deduplicate retries',
    () async {
      final vault = MemoryVault();
      var offline = true;
      final sent = <String>[];
      final client = api(vault, (request) async {
        sent.add(request.body);
        if (offline) throw Exception('offline');
        return success({'received': true});
      });
      await CrashReports.capture(
        client,
        StateError('private coordinates and token'),
        StackTrace.fromString(
          '#0 EmergencyQueue.flush (file:///private/path.dart:12:4)',
        ),
        false,
      );
      final stored = await vault.read('diagnostics:resident-a');
      expect(stored, contains('EmergencyQueue.flush'));
      expect(stored, isNot(contains('private')));
      expect(stored, isNot(contains('token')));
      await CrashReports.flush(client);
      expect(
        jsonDecode((await vault.read('diagnostics:resident-a'))!) as List,
        hasLength(1),
      );
      offline = false;
      await CrashReports.flush(client);
      expect(sent.first, sent.last);
      expect(
        jsonDecode((await vault.read('diagnostics:resident-a'))!) as List,
        isEmpty,
      );
    },
  );
}
