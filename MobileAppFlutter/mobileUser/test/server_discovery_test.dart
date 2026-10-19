import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_user/core/config/server_discovery.dart';

DioException _error(
  DioExceptionType type, {
  int? statusCode,
  String? message,
}) {
  final request = RequestOptions(path: '/auth/login');
  return DioException(
    requestOptions: request,
    type: type,
    message: message,
    response: statusCode == null
        ? null
        : Response<dynamic>(requestOptions: request, statusCode: statusCode),
  );
}

void main() {
  group('looksLikeServerMoved', () {
    test('a dead tunnel hostname counts, however it fails', () {
      // Cloudflare still holds the name but nothing is behind it.
      expect(
        ServerDiscovery.looksLikeServerMoved(
          _error(DioExceptionType.badResponse, statusCode: 530),
        ),
        isTrue,
      );
      // The name has since stopped resolving.
      expect(
        ServerDiscovery.looksLikeServerMoved(
          _error(
            DioExceptionType.unknown,
            message: "Failed host lookup: 'abc.trycloudflare.com'",
          ),
        ),
        isTrue,
      );
      expect(
        ServerDiscovery.looksLikeServerMoved(
          _error(DioExceptionType.connectionError),
        ),
        isTrue,
      );
      expect(
        ServerDiscovery.looksLikeServerMoved(
          _error(DioExceptionType.connectionTimeout),
        ),
        isTrue,
      );
    });

    test('the other gateway failures count too', () {
      for (final code in [502, 503, 504, 521, 522, 523, 524]) {
        expect(
          ServerDiscovery.looksLikeServerMoved(
            _error(DioExceptionType.badResponse, statusCode: code),
          ),
          isTrue,
          reason: '$code should be treated as the server having moved',
        );
      }
    });

    test('a backend that answered is not a backend that moved', () {
      // Looking elsewhere cannot fix our own 500, and must not log anyone out
      // of a server that is right there.
      for (final code in [400, 401, 403, 404, 422, 500]) {
        expect(
          ServerDiscovery.looksLikeServerMoved(
            _error(DioExceptionType.badResponse, statusCode: code),
          ),
          isFalse,
          reason: '$code came from the backend itself',
        );
      }
    });

    test('a cancelled or plainly slow request does not start a sweep', () {
      expect(
        ServerDiscovery.looksLikeServerMoved(_error(DioExceptionType.cancel)),
        isFalse,
      );
      expect(
        ServerDiscovery.looksLikeServerMoved(
          _error(DioExceptionType.receiveTimeout),
        ),
        isFalse,
      );
      expect(
        ServerDiscovery.looksLikeServerMoved(
          _error(DioExceptionType.unknown, message: 'Something else broke'),
        ),
        isFalse,
      );
    });
  });

  group('subnetPrefix', () {
    test('keeps the first three octets of a private address', () {
      expect(ServerDiscovery.subnetPrefix('192.168.254.107'), '192.168.254.');
      expect(ServerDiscovery.subnetPrefix('10.0.2.15'), '10.0.2.');
      expect(ServerDiscovery.subnetPrefix('172.16.4.2'), '172.16.4.');
      expect(ServerDiscovery.subnetPrefix('172.31.0.9'), '172.31.0.');
    });

    test('refuses anything the backend could not be sitting on', () {
      expect(ServerDiscovery.subnetPrefix('8.8.8.8'), isNull);
      expect(ServerDiscovery.subnetPrefix('172.32.0.1'), isNull);
      expect(ServerDiscovery.subnetPrefix('172.15.0.1'), isNull);
      expect(ServerDiscovery.subnetPrefix('abc'), isNull);
      expect(ServerDiscovery.subnetPrefix('192.168.1'), isNull);
      expect(ServerDiscovery.subnetPrefix('192.168.1.999'), isNull);
    });
  });

  group('isLocalNetworkInterface', () {
    test('sweeps Wi-Fi and ethernet', () {
      expect(ServerDiscovery.isLocalNetworkInterface('wlan0'), isTrue);
      expect(ServerDiscovery.isLocalNetworkInterface('eth0'), isTrue);
      expect(ServerDiscovery.isLocalNetworkInterface('en0'), isTrue);
    });

    test('leaves the carrier network alone', () {
      // The backend is never on mobile data, and sweeping 254 addresses of
      // someone else's network is both pointless and rude.
      expect(ServerDiscovery.isLocalNetworkInterface('rmnet_data0'), isFalse);
      expect(ServerDiscovery.isLocalNetworkInterface('ccmni0'), isFalse);
      expect(ServerDiscovery.isLocalNetworkInterface('tun0'), isFalse);
    });
  });
}
