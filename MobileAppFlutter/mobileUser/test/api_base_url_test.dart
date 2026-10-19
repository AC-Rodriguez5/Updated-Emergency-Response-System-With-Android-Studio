import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_user/core/config/app_config.dart';

/// The address is typed in by hand, usually pasted out of the tunnel terminal
/// in a hurry, so what counts is that a half-written one still lands on a URL
/// the API client can use — and that a wrong one is refused at the form rather
/// than by a failed sign-in.
void main() {
  group('normalizeApiBaseUrl', () {
    test('a pasted tunnel host becomes an https API base', () {
      expect(
        AppConfig.normalizeApiBaseUrl('catalogs-scan-ide-broker.trycloudflare.com'),
        'https://catalogs-scan-ide-broker.trycloudflare.com/api',
      );
    });

    test('a full URL that already ends in /api is left alone', () {
      expect(
        AppConfig.normalizeApiBaseUrl('https://abc.trycloudflare.com/api'),
        'https://abc.trycloudflare.com/api',
      );
    });

    test('trailing slashes and surrounding space do not survive', () {
      expect(
        AppConfig.normalizeApiBaseUrl('  https://abc.trycloudflare.com///  '),
        'https://abc.trycloudflare.com/api',
      );
    });

    test('a LAN address keeps http and its port, since it has no certificate', () {
      expect(
        AppConfig.normalizeApiBaseUrl('192.168.1.10:5000'),
        'http://192.168.1.10:5000/api',
      );
      expect(
        AppConfig.normalizeApiBaseUrl('localhost:5000'),
        'http://localhost:5000/api',
      );
    });

    test('an explicit scheme is never second-guessed', () {
      expect(
        AppConfig.normalizeApiBaseUrl('http://10.0.2.2:5000'),
        'http://10.0.2.2:5000/api',
      );
    });

    test('nonsense is rejected rather than guessed at', () {
      expect(AppConfig.normalizeApiBaseUrl(''), isNull);
      expect(AppConfig.normalizeApiBaseUrl('   '), isNull);
      expect(AppConfig.normalizeApiBaseUrl('ftp://abc.com'), isNull);
    });
  });

  group('validateApiBaseUrl', () {
    test('accepts what normalize can read', () {
      expect(AppConfig.validateApiBaseUrl('abc.trycloudflare.com'), isNull);
    });

    test('reports an empty field and an unusable address differently', () {
      expect(AppConfig.validateApiBaseUrl(''), 'Enter the server address');
      expect(
        AppConfig.validateApiBaseUrl('ftp://abc.com'),
        'Enter a valid http:// or https:// address',
      );
    });
  });

  group('apiBaseUrlOverride', () {
    tearDown(() => AppConfig.setApiBaseUrlOverride(null));

    test('an override takes over from the compiled-in address', () {
      final fromBuild = AppConfig.defaultApiBaseUrl;
      expect(AppConfig.apiBaseUrl, fromBuild);
      expect(AppConfig.apiBaseUrlOverride, isNull);

      AppConfig.setApiBaseUrlOverride('https://abc.trycloudflare.com/api');
      expect(AppConfig.apiBaseUrl, 'https://abc.trycloudflare.com/api');
      expect(AppConfig.directCellularReady, isTrue);

      AppConfig.setApiBaseUrlOverride(null);
      expect(AppConfig.apiBaseUrl, fromBuild);
    });

    test('a blank override is treated as none at all', () {
      AppConfig.setApiBaseUrlOverride('   ');
      expect(AppConfig.apiBaseUrlOverride, isNull);
    });
  });
}
