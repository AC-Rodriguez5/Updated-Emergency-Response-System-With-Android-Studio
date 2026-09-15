import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:safealert_mobile/safealert_mobile.dart';

class MemoryVault implements Vault {
  final values = <String, String>{};
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async {
    values[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    values.remove(key);
  }
}

class TestGps implements Locator {
  bool available = true;
  @override
  Future<Json> current({bool allowLastKnown = false}) async {
    if (!available) {
      throw ApiException(0, 'GPS_UNAVAILABLE', 'Enable location.');
    }
    return {
      'lat': 14.6,
      'lng': 120.98,
      'accuracyMeters': 8,
      'capturedAt': '2026-09-10T00:00:00.000Z',
    };
  }
}

Api api(
  MemoryVault vault,
  Future<http.Response> Function(http.Request) handler,
) =>
    Api(
        vault: vault,
        base: 'https://safealert.test/api',
        client: MockClient(handler),
      )
      ..account = {'id': 'resident-a', 'status': 'approved', 'role': 'user'}
      ..accessToken = 'test-access';
http.Response success(Json data) =>
    http.Response(jsonEncode({'data': data, 'requestId': 'test'}), 201);
void main() {
  test('definitive stale GPS rejection refreshes the fix without changing retry key', () async {
    final vault=MemoryVault();
    final requests=<http.Request>[];
    final queue=EmergencyQueue(api(vault,(request) async {
      requests.add(request);
      if(requests.length==1)return http.Response(jsonEncode({'error':{'code':'STALE_LOCATION','message':'Obtain a fresh fix'}}),400);
      return success({'id':'confirmed-after-fresh-fix','status':'pending'});
    }),TestGps());
    await queue.enqueue('medical');
    await queue.flush();
    expect(queue.items.single['payload'],isNull);
    expect(queue.delivered,isNull);
    await queue.flush();
    expect(queue.items,isEmpty);
    expect(requests.first.headers['Idempotency-Key'],requests.last.headers['Idempotency-Key']);
    expect(queue.delivered!['id'],'confirmed-after-fresh-fix');
  });
  test(
    'constructing resident state does not create an SOS or obtain GPS',
    () async {
      var calls = 0;
      final vault = MemoryVault();
      final gps = TestGps()..available = false;
      final controller = AppController(
        'user',
        api(vault, (r) async {
          calls++;
          return success({});
        }),
        locator: gps,
      );
      expect(calls, 0);
      expect(controller.queue.items, isEmpty);
      expect(controller.incidents, isEmpty);
      controller.dispose();
    },
  );
  test(
    'unavailable GPS persists an attempt without sending fabricated coordinates',
    () async {
      var calls = 0;
      final vault = MemoryVault();
      final gps = TestGps()..available = false;
      final queue = EmergencyQueue(
        api(vault, (r) async {
          calls++;
          return success({});
        }),
        gps,
      );
      await queue.enqueue('medical');
      await queue.flush();
      expect(calls, 0);
      expect(queue.items, hasLength(1));
      expect(queue.items.single['payload'], isNull);
      expect(queue.delivered, isNull);
      expect(await vault.read('attempts:resident-a'), isNotNull);
    },
  );
  test(
    'retry after network loss and restart retains authenticated frozen payload and server ID',
    () async {
      final vault = MemoryVault();
      final requests = <http.Request>[];
      var offline = true;
      final client = api(vault, (r) async {
        requests.add(r);
        if (offline) throw http.ClientException('offline');
        return success({'id': 'server-incident-42', 'status': 'pending'});
      });
      final original = EmergencyQueue(client, TestGps());
      await original.enqueue('fire');
      await original.flush();
      expect(original.items, hasLength(1));
      expect(original.delivered, isNull);
      offline = false;
      final restored = EmergencyQueue(client, TestGps()..available = false);
      await restored.restore();
      await restored.flush();
      expect(restored.items, isEmpty);
      expect(restored.delivered!['id'], 'server-incident-42');
      expect(requests.length, 2);
      expect(
        requests.first.headers['Idempotency-Key'],
        requests.last.headers['Idempotency-Key'],
      );
      expect(requests.first.body, requests.last.body);
      expect(requests.last.headers['Authorization'], 'Bearer test-access');
      expect((jsonDecode(requests.last.body) as Json)['location']['lat'], 14.6);
    },
  );
  test(
    'manual requests older than ten minutes wait for explicit review',
    () async {
      var calls = 0;
      final vault = MemoryVault();
      final queue = EmergencyQueue(
        api(vault, (r) async {
          calls++;
          return success({'id': 'id'});
        }),
        TestGps(),
      );
      await queue.enqueue('crime');
      queue.items.single['createdAt'] = DateTime.now()
          .subtract(const Duration(minutes: 11))
          .toIso8601String();
      await queue.persist();
      await queue.flush();
      expect(calls, 0);
      await queue.approveRetry(queue.items.single);
      await queue.flush();
      expect(calls, 1);
    },
  );
  test('queued attempts are isolated by authenticated account', () async {
    final vault = MemoryVault();
    var calls = 0;
    final client = api(vault, (r) async {
      calls++;
      return success({'id': 'id'});
    });
    final queue = EmergencyQueue(client, TestGps());
    await queue.enqueue('medical');
    client.account = {'id': 'resident-b', 'status': 'approved', 'role': 'user'};
    await queue.restore();
    await queue.flush();
    expect(queue.items, isEmpty);
    expect(calls, 0);
    expect(await vault.read('attempts:resident-a'), isNotNull);
  });
  test('duplicate BLE events retain one stable queued key', () async {
    final vault = MemoryVault();
    final queue = EmergencyQueue(
      api(vault, (r) async => success({'id': 'id'})),
      TestGps(),
    );
    await queue.enqueue(
      'general_sos',
      source: 'iot_ble',
      deviceId: 'SA-1',
      eventId: 'SA-1-boot-8',
    );
    await queue.enqueue(
      'general_sos',
      source: 'iot_ble',
      deviceId: 'SA-1',
      eventId: 'SA-1-boot-8',
    );
    expect(queue.items, hasLength(1));
    expect(queue.items.single['key'], 'ble:SA-1:SA-1-boot-8');
  });
  test('unapproved account cannot enqueue emergency', () async {
    final client = api(MemoryVault(), (r) async => success({}));
    client.account!['status'] = 'pending';
    final queue = EmergencyQueue(client, TestGps());
    await expectLater(queue.enqueue('medical'), throwsA(isA<ApiException>()));
    expect(queue.items, isEmpty);
  });
  test('failed cancellation never pretends incident was cancelled', () async {
    final c = AppController(
      'user',
      api(
        MemoryVault(),
        (r) async => http.Response(
          jsonEncode({
            'error': {'code': 'OFFLINE', 'message': 'Server unavailable'},
            'requestId': 'test',
          }),
          503,
        ),
      ),
      locator: TestGps(),
    );
    final incident = <String, dynamic>{'id': 'incident', 'status': 'pending'};
    c.incidents = [incident];
    await expectLater(
      c.action(incident, 'cancel'),
      throwsA(isA<ApiException>()),
    );
    expect(c.incidents.single['status'], 'pending');
    expect(c.busy, false);
    c.dispose();
  });
  test('a 401 refreshes once and retries with the new access token', () async {
    final vault = MemoryVault();
    var refreshed = 0;
    final client = api(vault, (r) async {
      if (r.url.path.endsWith('/auth/refresh')) {
        refreshed++;
        return success({
          'accessToken': 'new-token',
          'refreshToken': 'new-refresh',
          'account': {'id': 'resident-a', 'status': 'approved', 'role': 'user'},
        });
      }
      if (r.headers['Authorization'] == 'Bearer test-access') {
        return http.Response(
          jsonEncode({
            'error': {'code': 'TOKEN_EXPIRED', 'message': 'Expired'},
          }),
          401,
        );
      }
      return success({'id': 'resident-a'});
    })..refreshToken = 'old-refresh';
    expect(
      (await client.request('GET', '/auth/me'))['data']['id'],
      'resident-a',
    );
    expect(refreshed, 1);
    expect(client.accessToken, 'new-token');
  });
}
