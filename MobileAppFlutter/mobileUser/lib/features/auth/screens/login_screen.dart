import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:safealert_ui/safealert_ui.dart';
import '../providers/auth_provider.dart';
import '../../../core/captcha/captcha_field.dart';
import '../../../core/captcha/captcha_service.dart';
import '../../../core/config/server_config.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/widgets/server_address_sheet.dart';
import '../widgets/auth_chrome.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _captcha = CaptchaFieldController();
  bool _obscure = true;
  bool _rememberMe = false;
  bool _loading = false;
  String? _error;

  /// Whether the last failure was the app not reaching the backend at all.
  ///
  /// The address is otherwise out of sight — it belongs in Settings, behind a
  /// sign-in that cannot happen while the server is unreachable. So it is
  /// offered here, and only in the one case where it is the actual fix.
  bool _offerServerFix = false;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passCtrl.dispose();
    _captcha.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    // Answered on the form above, when the deployment draws its own challenge.
    // A no-op otherwise, so this reads the same either way.
    if (!_captcha.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
      _offerServerFix = false;
    });
    try {
      final captcha = ref.read(captchaServiceProvider);
      var captchaToken = _captcha.token;
      if (captchaToken == null && await captcha.mode() == CaptchaMode.webview) {
        // A hosted provider: its widget cannot live on the form, so it opens
        // here instead.
        if (!mounted) return;
        captchaToken = await captcha.solve(context);
        if (captchaToken == null) {
          setState(() => _error = 'Security check cancelled. Please try again.');
          return;
        }
      }

      await ref
          .read(authProvider.notifier)
          .login(
            email: _emailCtrl.text,
            password: _passCtrl.text,
            rememberMe: _rememberMe,
            captchaToken: captchaToken,
          );
    } on ApiException catch (e) {
      // The challenge is spent whether or not it was read correctly, so a
      // rejected one has to be replaced before they can try again.
      if (e.isCaptchaFailure) _captcha.refresh();
      final unreachable = _looksUnreachable(e.message);
      setState(() {
        _offerServerFix = unreachable;
        _error = e.isNotApproved
            ? 'Your account is pending admin approval.'
            : e.statusCode == 403
            ? 'Account rejected. Contact MDRRMO for assistance.'
            : unreachable
            ? 'Cannot reach ${ref.read(serverConfigProvider).host}. '
                  'The server address may have changed.'
            : e.message;
      });
    } catch (_) {
      setState(
        () => _error = 'Login failed. Check your connection and try again.',
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// A request that never reached the backend reports the raw transport
  /// failure, which reads as a bug in the app rather than as a wrong address.
  bool _looksUnreachable(String message) {
    const transport = [
      'Failed host lookup',
      'SocketException',
      'Connection refused',
      'Connection timed out',
      'connection errored',
    ];
    return transport.any(message.contains);
  }

  @override
  Widget build(BuildContext context) {
    return AuthBackdrop(
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const TanzAlertAuthHero(
              eyebrow: 'Resident access',
              title: 'Emergency readiness starts here.',
              description:
                  'Sign in to request help, track response, and manage your TanzAlert wearable.',
              icon: Icons.shield_outlined,
            ),
            const SizedBox(height: 18),
            if (_error != null) ...[
              AuthErrorBanner(
                message: _error!,
                onFixServer: _offerServerFix
                    ? () => showServerAddressSheet(context)
                    : null,
              ),
              const SizedBox(height: 16),
            ],
            _signInCard(),
            const SizedBox(height: 16),
            _registerCard(),
            const SizedBox(height: 22),
            const _Wordmark(),
          ],
        ),
      ),
    );
  }

  Widget _signInCard() {
    return TanzAlertPanel(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const TanzAlertSectionHeader(
            eyebrow: 'Secure access',
            title: 'Sign in to continue',
          ),
          const SizedBox(height: 18),
          AppInput(
            label: 'Email address',
            controller: _emailCtrl,
            keyboardType: TextInputType.emailAddress,
            prefix: const Icon(
              Icons.alternate_email,
              size: 20,
              color: AppColors.textMuted,
            ),
            validator: (v) =>
                v == null || !v.contains('@') ? 'Enter a valid email' : null,
          ),
          const SizedBox(height: 14),
          AppInput(
            label: 'Password',
            controller: _passCtrl,
            obscureText: _obscure,
            prefix: const Icon(
              Icons.lock_outline,
              size: 20,
              color: AppColors.textMuted,
            ),
            suffix: IconButton(
              tooltip: _obscure ? 'Show password' : 'Hide password',
              icon: Icon(
                _obscure ? Icons.visibility_off : Icons.visibility,
                size: 20,
              ),
              onPressed: () => setState(() => _obscure = !_obscure),
            ),
            validator: (v) =>
                v == null || v.isEmpty ? 'Enter your password' : null,
          ),
          const SizedBox(height: 6),
          // The whole row toggles, not just the 20px box.
          InkWell(
            onTap: () => setState(() => _rememberMe = !_rememberMe),
            borderRadius: BorderRadius.circular(8),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  Checkbox(
                    value: _rememberMe,
                    onChanged: (v) => setState(() => _rememberMe = v ?? false),
                    activeColor: AppColors.responderBlue,
                    visualDensity: VisualDensity.compact,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  const SizedBox(width: 8),
                  const Text(
                    'Keep me signed in',
                    style: TextStyle(fontSize: 14, color: AppColors.textStrong),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          CaptchaField(
            controller: _captcha,
            // Inside a white panel, so the challenge reads as an inset well.
            background: AppColors.background,
          ),
          const SizedBox(height: 18),
          AppButton(label: 'Sign in', onPressed: _login, isLoading: _loading),
        ],
      ),
    );
  }

  Widget _registerCard() {
    return TanzAlertPanel(
      padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.softBlue,
              borderRadius: BorderRadius.circular(11),
            ),
            child: const Icon(
              Icons.person_add_alt,
              size: 20,
              color: AppColors.responderBlue,
            ),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'New to TanzAlert?',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: AppColors.textStrong,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  'Register as a Tanza resident',
                  style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: () => context.push('/register'),
            child: const Text('Register'),
          ),
        ],
      ),
    );
  }
}

class _Wordmark extends StatelessWidget {
  const _Wordmark();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.verified_user_outlined,
            size: 14,
            color: AppColors.textMuted,
          ),
          const SizedBox(width: 7),
          // Flexible: the line is long enough to overrun a narrow phone, and a
          // footer is not worth an overflow stripe.
          Flexible(
            child: Text(
              'TanzAlert  ·  Municipality of Tanza, Cavite',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.labelSmall,
            ),
          ),
        ],
      ),
    );
  }
}
