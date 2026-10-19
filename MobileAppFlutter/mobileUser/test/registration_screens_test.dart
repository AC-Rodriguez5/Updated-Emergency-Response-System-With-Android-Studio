import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_user/core/captcha/captcha_field.dart';
import 'package:mobile_user/core/captcha/captcha_service.dart';
import 'package:mobile_user/features/auth/widgets/consent_sheet.dart';
import 'package:mobile_user/features/auth/screens/registration_step1_screen.dart';
import 'package:mobile_user/features/auth/screens/registration_step2_screen.dart';

/// Both steps of registration, wearing the same clothes as the sign-in screen.

final Uint8List _pixel = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9'
  'awAAAABJRU5ErkJggg==',
);

class _StubCaptcha extends CaptchaService {
  _StubCaptcha() : super(Dio());

  @override
  Future<CaptchaMode> mode({bool refresh = false}) async => CaptchaMode.builtin;

  @override
  Future<CaptchaChallenge> fetchChallenge() async =>
      CaptchaChallenge(id: 'challenge-1', image: _pixel);
}

Future<void> _pump(WidgetTester tester, Widget screen, {Size? surface}) async {
  if (surface != null) {
    tester.view.physicalSize = surface * tester.view.devicePixelRatio;
    addTearDown(tester.view.resetPhysicalSize);
  }
  await tester.pumpWidget(
    ProviderScope(
      overrides: [captchaServiceProvider.overrideWithValue(_StubCaptcha())],
      child: MaterialApp(home: screen),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('step 1', () {
    testWidgets('says where you are in the flow', (tester) async {
      await _pump(tester, const RegistrationStep1Screen());

      expect(find.text('Step 1 of 2'), findsOneWidget);
    });

    testWidgets('will not continue until the consent form is agreed to',
        (tester) async {
      await _pump(tester, const RegistrationStep1Screen());

      final button = find.widgetWithText(ElevatedButton, 'Continue');
      await tester.ensureVisible(button);
      await tester.tap(button);
      await tester.pumpAndSettle();

      // Beside the tile, not in a snackbar: at the foot of a long form a
      // snackbar slides in over the keyboard and leaves again.
      expect(find.text(consentCopyEn.tileMissing), findsOneWidget);
      expect(find.byType(SnackBar), findsNothing);
    });

    testWidgets('opens the consent form from the tile', (tester) async {
      await _pump(tester, const RegistrationStep1Screen());

      final tile = find.text(consentCopyEn.tileTitle);
      await tester.ensureVisible(tile);
      await tester.tap(tile);
      await tester.pumpAndSettle();

      expect(find.text(consentCopyEn.title), findsOneWidget);
      expect(find.text(consentCopyEn.collectHeading.toUpperCase()), findsOneWidget);
    });

    testWidgets('fits a narrow phone, long barangay names and all',
        (tester) async {
      // A dropdown is as wide as its widest entry unless told otherwise, and
      // 'Barangay III (Poblacion)' beside a leading icon ran off the field.
      await _pump(
        tester,
        const RegistrationStep1Screen(),
        surface: const Size(320, 1400),
      );

      expect(tester.takeException(), isNull);
    });
  });

  group('step 2', () {
    testWidgets('says where you are in the flow', (tester) async {
      await _pump(tester, const RegistrationStep2Screen(step1Data: {}));

      expect(find.text('Step 2 of 2'), findsOneWidget);
    });

    testWidgets('keeps the security check beside the submit button',
        (tester) async {
      await _pump(tester, const RegistrationStep2Screen(step1Data: {}));

      expect(find.byType(CaptchaField), findsOneWidget);
      expect(find.text('Security check'), findsOneWidget);
      expect(
        find.widgetWithText(ElevatedButton, 'Submit for approval'),
        findsOneWidget,
      );
    });

    testWidgets('asks for both documents before anything is sent',
        (tester) async {
      await _pump(tester, const RegistrationStep2Screen(step1Data: {}));

      final button = find.widgetWithText(ElevatedButton, 'Submit for approval');
      await tester.ensureVisible(button);
      await tester.tap(button);
      await tester.pumpAndSettle();

      expect(
        find.text('Please upload your proof of residency ID.'),
        findsOneWidget,
      );
    });
  });
}
