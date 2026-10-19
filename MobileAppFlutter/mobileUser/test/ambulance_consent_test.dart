import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_user/features/ambulance_transport/widgets/ambulance_consent_sheet.dart';

/// The consent a transport booking asks for, at the moment it is booked.
///
/// A booking carries a named patient, their contact and their medical
/// condition, so the two things that matter are that it cannot be sent without
/// agreement, and that somebody booking for another person is asked whether
/// that person knows.

AmbulanceConsentDecision? _result;

Future<void> _open(
  WidgetTester tester, {
  required bool patientIsSomeoneElse,
}) async {
  _result = null;
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () async {
              _result = await showAmbulanceConsentSheet(
                context,
                patientIsSomeoneElse: patientIsSomeoneElse,
              );
            },
            child: const Text('book'),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('book'));
  await tester.pumpAndSettle();
}

Future<Finder> _reach(WidgetTester tester, String text) async {
  final target = find.text(text);
  if (target.evaluate().isEmpty) {
    await tester.scrollUntilVisible(
      target,
      120,
      scrollable: find.byType(Scrollable).last,
    );
  }
  await tester.ensureVisible(target);
  await tester.pumpAndSettle();
  return target;
}

Future<void> _tick(WidgetTester tester, String title) async {
  await tester.tap(await _reach(tester, title));
  await tester.pumpAndSettle();
}

Finder get _agree =>
    find.widgetWithText(ElevatedButton, ambulanceConsentEn.agree);

void main() {
  testWidgets('says what the request shares and with whom', (tester) async {
    await _open(tester, patientIsSomeoneElse: true);

    expect(find.text(ambulanceConsentEn.title), findsOneWidget);
    for (final fact in ambulanceConsentEn.facts) {
      expect(await _reach(tester, fact.label), findsOneWidget);
    }
    // Medical condition is the sensitive one; it has to be named.
    expect(
      ambulanceConsentEn.facts.any((f) => f.label == 'Medical condition'),
      isTrue,
    );
  });

  testWidgets('cannot be sent without agreement', (tester) async {
    await _open(tester, patientIsSomeoneElse: false);

    expect(tester.widget<ElevatedButton>(_agree).enabled, isFalse);
  });

  testWidgets('needs one tick when booking for yourself', (tester) async {
    await _open(tester, patientIsSomeoneElse: false);

    // Nobody has to confirm they told themselves.
    expect(find.text(ambulanceConsentEn.patientTitle), findsNothing);

    await _tick(tester, ambulanceConsentEn.transportTitle);

    expect(tester.widget<ElevatedButton>(_agree).enabled, isTrue);
  });

  testWidgets('asks whether the patient knows, when the patient is somebody else',
      (tester) async {
    await _open(tester, patientIsSomeoneElse: true);

    expect(
      await _reach(tester, ambulanceConsentEn.patientTitle),
      findsOneWidget,
    );

    await _tick(tester, ambulanceConsentEn.transportTitle);
    // Transport alone is not enough: the patient is a third party who has to
    // have been told their condition is being handed to a crew.
    expect(tester.widget<ElevatedButton>(_agree).enabled, isFalse);

    await _tick(tester, ambulanceConsentEn.patientTitle);

    expect(tester.widget<ElevatedButton>(_agree).enabled, isTrue);
  });

  testWidgets('hands back what was agreed, for the booking to carry',
      (tester) async {
    await _open(tester, patientIsSomeoneElse: true);
    await _tick(tester, ambulanceConsentEn.transportTitle);
    await _tick(tester, ambulanceConsentEn.patientTitle);

    await tester.tap(_agree);
    await tester.pumpAndSettle();

    expect(_result, isNotNull);
    expect(_result!.version, ambulanceConsentVersion);
    expect(_result!.scopes, [scopeAmbulanceTransport, scopePatientInformed]);
    expect(_result!.toJson(), {
      'version': ambulanceConsentVersion,
      'scopes': [scopeAmbulanceTransport, scopePatientInformed],
    });
  });

  testWidgets('claims no patient acknowledgement that was not asked for',
      (tester) async {
    await _open(tester, patientIsSomeoneElse: false);
    await _tick(tester, ambulanceConsentEn.transportTitle);

    await tester.tap(_agree);
    await tester.pumpAndSettle();

    expect(_result!.scopes, [scopeAmbulanceTransport]);
  });

  testWidgets('returns nothing when it is cancelled', (tester) async {
    await _open(tester, patientIsSomeoneElse: false);

    await tester.tap(find.text(ambulanceConsentEn.cancel));
    await tester.pumpAndSettle();

    // The caller treats this as "do not send".
    expect(_result, isNull);
  });

  testWidgets('can be read in Filipino', (tester) async {
    await _open(tester, patientIsSomeoneElse: true);

    await tester.tap(find.text(ambulanceConsentFil.languageLabel));
    await tester.pumpAndSettle();

    expect(find.text(ambulanceConsentFil.title), findsOneWidget);
    expect(find.text(ambulanceConsentEn.title), findsNothing);
    expect(
      await _reach(tester, ambulanceConsentFil.transportTitle),
      findsOneWidget,
    );
  });

  testWidgets('fits a narrow phone', (tester) async {
    tester.view.physicalSize = const Size(320 * 3, 640 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await _open(tester, patientIsSomeoneElse: true);
    for (final fact in ambulanceConsentEn.facts) {
      await _reach(tester, fact.label);
    }
    await _reach(tester, ambulanceConsentEn.patientTitle);

    expect(tester.takeException(), isNull);
  });

  group('the wording', () {
    test('is versioned so a grant says which text it was given under', () {
      expect(ambulanceConsentVersion, isNotEmpty);
    });

    test('names the scopes the backend records', () {
      // Kept in step with shared/consent.ts by hand; a mismatch means a grant
      // arrives and is silently dropped.
      expect(scopeAmbulanceTransport, 'ambulance_transport');
      expect(scopePatientInformed, 'patient_informed');
    });
  });
}
