import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:safealert_ui/safealert_ui.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../config/app_config.dart';
import '../networking/api_client.dart';

/// Which human check this deployment asks for.
enum CaptchaMode {
  /// None. Sign-in and registration behave as though this file did not exist.
  none,

  /// The backend draws its own challenge; the app shows it inline on the form.
  builtin,

  /// A hosted provider's widget, rendered in a WebView over a page the backend
  /// serves. Needs the device on the internet and the backend's hostname
  /// registered with the provider.
  webview,
}

/// A picture to read and the id that says which one it was.
class CaptchaChallenge {
  const CaptchaChallenge({required this.id, required this.image});

  final String id;
  final Uint8List image;

  /// What the backend expects in `captchaToken`.
  String tokenFor(String answer) => '$id:${answer.trim()}';
}

/// The human check in front of signing in and registering.
///
/// Two shapes, decided by the backend and read once from `/captcha/status`:
///
/// * [CaptchaMode.builtin] — the backend draws a picture and keeps the answer.
///   The app shows it on the form itself, so somebody filling in their email
///   can see what is being asked of them before they press anything. It needs
///   no provider account and no internet, which is what a LAN deployment has.
/// * [CaptchaMode.webview] — a hosted provider's widget, over a page served
///   from the backend's own origin. Kept for a deployment with a real domain.
class CaptchaService {
  CaptchaService(this._dio);

  final Dio _dio;

  CaptchaMode? _mode;

  /// What this deployment asks for, cached after the first answer.
  ///
  /// A backend that cannot be reached is treated as [CaptchaMode.none]: the
  /// sign-in attempt that follows fails on its own and says something more
  /// useful than a security-check error would.
  Future<CaptchaMode> mode({bool refresh = false}) async {
    if (_mode != null && !refresh) return _mode!;
    try {
      final response = await _dio.get('/captcha/status');
      final data =
          (response.data as Map<String, dynamic>)['data'] as Map<String, dynamic>;
      _mode = switch (data['mode'] as String?) {
        'builtin' => CaptchaMode.builtin,
        'webview' => CaptchaMode.webview,
        'none' => CaptchaMode.none,
        // An older backend that predates `mode` and only reports `enabled`.
        _ => (data['enabled'] as bool? ?? false)
            ? CaptchaMode.webview
            : CaptchaMode.none,
      };
    } catch (_) {
      _mode = CaptchaMode.none;
    }
    return _mode!;
  }

  /// A fresh picture to put in front of somebody. Throws if the backend will
  /// not give one, which the field reports with a retry rather than swallowing.
  Future<CaptchaChallenge> fetchChallenge() async {
    final response = await _dio.get('/captcha/challenge');
    final data =
        (response.data as Map<String, dynamic>)['data'] as Map<String, dynamic>;
    final image = data['image'] as String;
    // `data:image/png;base64,....` — everything after the comma is the picture.
    final payload = image.substring(image.indexOf(',') + 1);
    return CaptchaChallenge(
      id: data['id'] as String,
      image: base64Decode(payload),
    );
  }

  /// Opens a hosted provider's challenge and returns the solved token, or null
  /// if the person closed it or the provider failed. [CaptchaMode.webview] only.
  Future<String?> solve(BuildContext context) {
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      isDismissible: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const _CaptchaSheet(),
    );
  }
}

final captchaServiceProvider = Provider<CaptchaService>(
  (ref) => CaptchaService(ref.read(dioProvider)),
);

class _CaptchaSheet extends StatefulWidget {
  const _CaptchaSheet();

  @override
  State<_CaptchaSheet> createState() => _CaptchaSheetState();
}

class _CaptchaSheetState extends State<_CaptchaSheet> {
  late final WebViewController _controller;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(AppColors.surface)
      ..addJavaScriptChannel(
        // The page posts the solved token — or a one-word failure — through
        // this channel. Keep the name in step with captcha.routes.ts.
        'TanzAlertCaptcha',
        onMessageReceived: (message) => _handle(message.message),
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (_) {
            if (mounted) setState(() => _loading = false);
          },
          onWebResourceError: (_) {
            if (mounted) {
              setState(() {
                _loading = false;
                _error = 'The security check could not load.';
              });
            }
          },
        ),
      )
      ..loadRequest(Uri.parse('${AppConfig.apiBaseUrl}/captcha'));
  }

  void _handle(String message) {
    if (!mounted) return;
    switch (message) {
      case 'disabled':
        // Half-configured backend: let the attempt through rather than
        // stranding someone behind a check that does not exist.
        Navigator.pop(context, '');
      case 'expired':
        setState(() => _error = 'That check expired. Close and try again.');
      case 'error':
      case 'unavailable':
        setState(() => _error = 'The security check is unavailable right now.');
      default:
        Navigator.pop(context, message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.52,
      child: Column(
        children: [
          const SizedBox(height: 12),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.border,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 12, 8),
            child: Row(
              children: [
                const Icon(Icons.verified_user_outlined,
                    color: AppColors.responderBlue),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Quick security check',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textStrong,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Cancel',
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
          Expanded(
            child: Stack(
              children: [
                WebViewWidget(controller: _controller),
                if (_loading) const Center(child: CircularProgressIndicator()),
                if (_error != null)
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        _error!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: AppColors.alertRed,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
