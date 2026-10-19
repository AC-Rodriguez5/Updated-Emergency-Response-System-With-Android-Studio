import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_user/core/captcha/captcha_field.dart';
import 'package:mobile_user/core/captcha/captcha_service.dart';

/// The security check as somebody signing in actually meets it: on the form,
/// before they press anything, rather than sprung on them afterwards.

/// A 1x1 PNG. The field only has to render it; what it depicts is the
/// backend's business.
final Uint8List _pixel = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9'
  'awAAAABJRU5ErkJggg==',
);

class _StubCaptcha extends CaptchaService {
  _StubCaptcha(this.stubbedMode) : super(Dio());

  final CaptchaMode stubbedMode;
  int fetches = 0;
  bool failNextFetch = false;

  @override
  Future<CaptchaMode> mode({bool refresh = false}) async => stubbedMode;

  @override
  Future<CaptchaChallenge> fetchChallenge() async {
    if (failNextFetch) throw Exception('backend unreachable');
    fetches += 1;
    return CaptchaChallenge(id: 'challenge-$fetches', image: _pixel);
  }
}

Future<CaptchaFieldController> _pumpField(
  WidgetTester tester,
  CaptchaService service,
) async {
  final controller = CaptchaFieldController();
  addTearDown(controller.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [captchaServiceProvider.overrideWithValue(service)],
      child: MaterialApp(
        home: Scaffold(body: CaptchaField(controller: controller)),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return controller;
}

void main() {
  testWidgets('stays out of the way when no check is asked for', (tester) async {
    final controller = await _pumpField(tester, _StubCaptcha(CaptchaMode.none));

    expect(find.text('Security check'), findsNothing);
    expect(find.byType(TextField), findsNothing);
    // A screen calls this unconditionally, so it has to wave the check through.
    expect(controller.validate(), isTrue);
    expect(controller.token, isNull);
  });

  testWidgets('leaves the form alone under a hosted provider too', (tester) async {
    // That widget cannot live inline; the screen opens its sheet instead.
    final controller = await _pumpField(tester, _StubCaptcha(CaptchaMode.webview));

    expect(find.byType(TextField), findsNothing);
    expect(controller.validate(), isTrue);
  });

  testWidgets('shows the picture and asks for it before anything is pressed',
      (tester) async {
    await _pumpField(tester, _StubCaptcha(CaptchaMode.builtin));

    expect(find.text('Security check'), findsOneWidget);
    expect(find.byType(Image), findsOneWidget);
    expect(find.text('Type the characters above'), findsOneWidget);
  });

  testWidgets('refuses an empty answer and says so in place', (tester) async {
    final controller = await _pumpField(tester, _StubCaptcha(CaptchaMode.builtin));

    expect(controller.validate(), isFalse);
    await tester.pump();

    // In place, beside the box: the screen's error banner is off the top of a
    // scrolled form and would not be read.
    expect(find.text('Enter the characters shown above.'), findsOneWidget);
    expect(controller.token, isNull);
  });

  testWidgets('hands back the challenge id with what was typed', (tester) async {
    final controller = await _pumpField(tester, _StubCaptcha(CaptchaMode.builtin));

    await tester.enterText(find.byType(TextField), 'K4M7Q');

    expect(controller.validate(), isTrue);
    expect(controller.token, 'challenge-1:K4M7Q');
  });

  testWidgets('types in the same case as the picture', (tester) async {
    final controller = await _pumpField(tester, _StubCaptcha(CaptchaMode.builtin));

    await tester.enterText(find.byType(TextField), 'k4m7q');

    expect(controller.token, 'challenge-1:K4M7Q');
  });

  testWidgets('clears the complaint as soon as they start typing',
      (tester) async {
    final controller = await _pumpField(tester, _StubCaptcha(CaptchaMode.builtin));
    controller.validate();
    await tester.pump();
    expect(find.text('Enter the characters shown above.'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'K');
    await tester.pump();

    expect(find.text('Enter the characters shown above.'), findsNothing);
  });

  testWidgets('a refresh draws a new one and empties the box', (tester) async {
    final service = _StubCaptcha(CaptchaMode.builtin);
    final controller = await _pumpField(tester, service);
    await tester.enterText(find.byType(TextField), 'K4M7Q');

    controller.refresh();
    await tester.pumpAndSettle();

    // What a screen does after the backend rejects an answer: the old picture
    // is spent whether or not it was read correctly.
    expect(service.fetches, 2);
    expect(controller.input.text, isEmpty);
    expect(controller.token, isNull);
  });

  testWidgets('offers a retry when the picture cannot be loaded', (tester) async {
    final service = _StubCaptcha(CaptchaMode.builtin)..failNextFetch = true;
    final controller = await _pumpField(tester, service);

    expect(find.text('Could not load the security check.'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
    // Nothing to answer, so the screen must not submit as though there were.
    expect(controller.validate(), isFalse);

    service.failNextFetch = false;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(find.byType(Image), findsOneWidget);
    expect(find.text('Retry'), findsNothing);
  });
}
