import 'package:flutter/foundation.dart' show kIsWeb;

class AppConfig {
  AppConfig._();

  // Pass at build/run time via --dart-define=API_BASE_URL=https://your-tunnel.trycloudflare.com/api
  // Empty string means: fall back to local LAN defaults (dev on same Wi-Fi).
  static const String _apiBaseUrlOverride = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  // Used only when API_BASE_URL is not provided. Set to your laptop's LAN IP.
  static const String _lanDevIp = '192.168.1.10';

  /// Typed into the app on this device and saved by `ServerConfigStore`, which
  /// restores it before the first frame.
  ///
  /// [_apiBaseUrlOverride] is a compile-time constant, but a Cloudflare quick
  /// tunnel gets a brand-new hostname every time it starts. Without a runtime
  /// address the app has to be rebuilt to follow the tunnel, and until it is,
  /// every request dies on a DNS lookup for a host that no longer exists.
  static String? _runtimeApiBaseUrl;

  /// Where this build points when nothing is set on the device.
  static String get defaultApiBaseUrl {
    if (_apiBaseUrlOverride.isNotEmpty) return _apiBaseUrlOverride;
    if (kIsWeb) return 'http://localhost:5000/api';
    return 'http://$_lanDevIp:5000/api';
  }

  /// The address saved on this device, or null when it follows the build.
  static String? get apiBaseUrlOverride => _runtimeApiBaseUrl;

  static String get apiBaseUrl => _runtimeApiBaseUrl ?? defaultApiBaseUrl;

  /// Pass null to go back to [defaultApiBaseUrl]. Expects a value that has
  /// already been through [normalizeApiBaseUrl].
  static void setApiBaseUrlOverride(String? value) {
    final trimmed = value?.trim();
    _runtimeApiBaseUrl = (trimmed == null || trimmed.isEmpty) ? null : trimmed;
  }

  /// Turns what someone pastes out of the tunnel terminal into an API base, so
  /// `catalogs-scan-ide-broker.trycloudflare.com` becomes
  /// `https://catalogs-scan-ide-broker.trycloudflare.com/api`.
  ///
  /// A bare host or IP keeps `http://` — a LAN backend has no certificate — and
  /// anything else is assumed to be `https://`. Returns null when [raw] cannot
  /// be read as an address, which is what [validateApiBaseUrl] reports.
  static String? normalizeApiBaseUrl(String raw) {
    var text = raw.trim();
    if (text.isEmpty) return null;
    if (!text.contains('://')) {
      text = '${_looksLocal(text) ? 'http' : 'https'}://$text';
    }

    final uri = Uri.tryParse(text);
    if (uri == null || uri.host.isEmpty) return null;
    if (uri.scheme != 'http' && uri.scheme != 'https') return null;

    var path = uri.path.replaceAll(RegExp(r'/+$'), '');
    if (!path.endsWith('/api')) path = '$path/api';

    return Uri(
      scheme: uri.scheme,
      host: uri.host,
      port: uri.hasPort ? uri.port : null,
      path: path,
    ).toString();
  }

  static String? validateApiBaseUrl(String? raw) {
    if (raw == null || raw.trim().isEmpty) return 'Enter the server address';
    if (normalizeApiBaseUrl(raw) == null) {
      return 'Enter a valid http:// or https:// address';
    }
    return null;
  }

  static bool _looksLocal(String value) {
    final host = value.split('/').first.split(':').first;
    return host == 'localhost' ||
        RegExp(r'^\d{1,3}(\.\d{1,3}){3}$').hasMatch(host);
  }

  static const String serviceUuid = '9f4d0001-7d6a-4b85-9e74-2f4d8e8d0001';
  static const String eventCharUuid = '9f4d0002-7d6a-4b85-9e74-2f4d8e8d0002';
  static const String buttonCharUuid = eventCharUuid;
  static const String batteryCharUuid = '00002a19-0000-1000-8000-00805f9b34fb';
  static const String heartbeatCharUuid =
      '9f4d0003-7d6a-4b85-9e74-2f4d8e8d0003';
  static const String configCharUuid = '9f4d0004-7d6a-4b85-9e74-2f4d8e8d0004';

  /// Optional APN override for the wearable's modem.
  ///
  /// Normally leave this empty: the firmware reads the SIM's home network from its
  /// IMSI and picks the matching APN (Globe/TM/GOMO, Smart/TNT, DITO, Sun), then
  /// falls back to walking every known APN until one carries data. Set this only
  /// for a SIM the table does not cover — an MVNO or a private APN.
  static const String cellularApn = String.fromEnvironment(
    'CELLULAR_APN',
    defaultValue: '',
  );

  /// Filename of a root CA **already loaded into the modem's own filesystem** with
  /// `AT+CCERTDOWN` — not the certificate itself, which would not fit in a BLE
  /// write. Provisioning this name makes the wearable verify the backend's
  /// certificate (`AT+CSSLCFG="authmode",0,1`).
  ///
  /// Left empty, the wearable still posts over TLS but does not authenticate the
  /// server, so its device token is exposed to a man-in-the-middle. That state is
  /// surfaced on the pairing screen and logged by the firmware on every boot
  /// rather than being hidden.
  static const String modemCaFile = String.fromEnvironment(
    'MODEM_CA_FILE',
    defaultValue: '',
  );

  /// Whether this build can provision the wearable for direct cellular delivery.
  ///
  /// Only an HTTPS API is required — the firmware refuses plaintext outright, and
  /// it discovers the APN from the SIM itself. Certificate verification is reported
  /// separately rather than gating delivery: a panic button that can reach dispatch
  /// unverified is worth more than one that cannot reach it at all, and
  /// [modemCaFile] is how you close that gap.
  static bool get directCellularReady => apiBaseUrl.startsWith('https://');

  static bool get modemVerifiesServer => modemCaFile.isNotEmpty;

  static const double tanzaMinLat = 14.30;
  static const double tanzaMaxLat = 14.42;
  static const double tanzaMinLng = 120.82;
  static const double tanzaMaxLng = 120.95;
  static const double tanzaCenterLat = 14.355;
  static const double tanzaCenterLng = 120.885;

  static const int bleHeartbeatTimeoutSec = 30;
  static const int locationMaxAgeSec = 60;
  static const int locationHistoryCap = 100;

  static bool isInsideTanza(double lat, double lng) =>
      lat >= tanzaMinLat &&
      lat <= tanzaMaxLat &&
      lng >= tanzaMinLng &&
      lng <= tanzaMaxLng;
}
