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

  static String get apiBaseUrl {
    if (_apiBaseUrlOverride.isNotEmpty) return _apiBaseUrlOverride;
    if (kIsWeb) return 'http://localhost:5000/api';
    return 'http://$_lanDevIp:5000/api';
  }

  static const String serviceUuid = '9f4d0001-7d6a-4b85-9e74-2f4d8e8d0001';
  static const String eventCharUuid = '9f4d0002-7d6a-4b85-9e74-2f4d8e8d0002';
  static const String buttonCharUuid = eventCharUuid;
  static const String batteryCharUuid = '00002a19-0000-1000-8000-00805f9b34fb';
  static const String heartbeatCharUuid =
      '9f4d0003-7d6a-4b85-9e74-2f4d8e8d0003';
  static const String configCharUuid = '9f4d0004-7d6a-4b85-9e74-2f4d8e8d0004';

  /// Carrier APN the wearable's modem dials. Direct cellular delivery cannot work
  /// without it, so leaving it empty is what keeps the feature off.
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
  /// Requires an HTTPS API (the firmware refuses plaintext outright) and an APN.
  /// Certificate verification is reported separately rather than gating delivery:
  /// a panic button that can reach dispatch unverified is worth more than one that
  /// cannot reach it at all, and [modemCaFile] is how you close that gap.
  static bool get directCellularReady =>
      apiBaseUrl.startsWith('https://') && cellularApn.isNotEmpty;

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
