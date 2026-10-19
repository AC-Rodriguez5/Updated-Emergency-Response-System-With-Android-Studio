import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_user/core/captcha/captcha_service.dart';
import 'package:mobile_user/core/networking/api_exception.dart';
import 'package:mobile_user/core/storage/secure_storage.dart';
import 'package:mobile_user/features/auth/models/user_model.dart';
import 'package:mobile_user/features/auth/providers/auth_provider.dart';
import 'package:mobile_user/features/auth/repository/auth_repository.dart';
import 'package:mobile_user/features/auth/screens/login_screen.dart';

/// The sign-in form.
///
/// The server address used to sit in the footer of this screen, on every
/// visit, spelling out a tunnel hostname nobody needed to read. It now lives in
/// Settings — but Settings is behind a sign-in that cannot happen while the
/// backend is unreachable, so the one case where it is the actual fix has to
/// still offer it.

class _NoCaptcha extends CaptchaService {
  _NoCaptcha() : super(Dio());

  @override
  Future<CaptchaMode> mode({bool refresh = false}) async => CaptchaMode.none;
}

class _Repo extends AuthRepository {
  _Repo(this.failure) : super(Dio(), SecureStorageService());

  final ApiException failure;

  @override
  Future<UserModel?> restoreSession() async => null;

  @override
  Future<({UserModel user, String accessToken, String refreshToken})> login({
    required String email,
    required String password,
    bool rememberMe = false,
    String? captchaToken,
  }) async =>
      throw failure;
}

Future<void> _pumpLogin(WidgetTester tester, ApiException failure) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        captchaServiceProvider.overrideWithValue(_NoCaptcha()),
        authProvider.overrideWith((ref) => AuthNotifier(_Repo(failure))),
      ],
      child: const MaterialApp(home: LoginScreen()),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _signIn(WidgetTester tester) async {
  await tester.enterText(
    find.widgetWithText(TextFormField, 'Email address'),
    'resident@tanza.gov.ph',
  );
  await tester.enterText(
    find.widgetWithText(TextFormField, 'Password'),
    'a-password',
  );
  await tester.tap(find.widgetWithText(ElevatedButton, 'Sign in'));
  await tester.pumpAndSettle();
}

void main() {
  const unreachable = ApiException(
    message: 'SocketException: Connection refused (OS Error: ...)',
  );
  const wrongPassword = ApiException(
    message: 'Invalid email or password',
    statusCode: 401,
  );

  testWidgets('does not put the server address on the form', (tester) async {
    await _pumpLogin(tester, unreachable);

    // The circled line in the bug report: a tunnel hostname under the sign-in
    // button, on every visit, for a setting almost nobody changes.
    expect(find.textContaining('Server:'), findsNothing);
    expect(find.textContaining('trycloudflare'), findsNothing);
    expect(find.text('Change server address'), findsNothing);
  });

  testWidgets('offers the address when the backend cannot be reached',
      (tester) async {
    await _pumpLogin(tester, unreachable);
    await _signIn(tester);

    expect(find.textContaining('Cannot reach'), findsOneWidget);
    // Settings is unreachable too when sign-in cannot complete, so this is the
    // only way back to a moved server.
    expect(find.text('Change server address'), findsOneWidget);
  });

  testWidgets('keeps it hidden for a failure the address cannot fix',
      (tester) async {
    await _pumpLogin(tester, wrongPassword);
    await _signIn(tester);

    expect(find.text('Invalid email or password'), findsOneWidget);
    expect(find.text('Change server address'), findsNothing);
  });

  testWidgets('still sends people to registration', (tester) async {
    await _pumpLogin(tester, unreachable);

    expect(find.text('New to TanzAlert?'), findsOneWidget);
    expect(find.widgetWithText(TextButton, 'Register'), findsOneWidget);
  });
}
