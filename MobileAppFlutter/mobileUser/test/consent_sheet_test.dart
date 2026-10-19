import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_user/features/auth/widgets/consent_sheet.dart';

/// The data consent form.
///
/// This is the screen that decides whether TanzAlert is allowed to hold a
/// resident's data at all, so the gate matters more than the layout: the four
/// required permissions have to be unskippable, the two optional ones have to
/// be genuinely optional, and what comes back has to be exactly what was ticked.

Future<ConsentDecision?> _open(
  WidgetTester tester, {
  ConsentDecision? current,
}) async {
  ConsentDecision? result;
  var returned = false;

  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () async {
              result = await showConsentSheet(context, current: current);
              returned = true;
            },
            child: const Text('open'),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  addTearDown(() => returned);
  return result;
}

/// Scrolls the sheet until [text] is built, and returns its finder.
///
/// The sheet is a lazy list, so anything past the fold does not exist in the
/// tree until it is scrolled near.
Future<Finder> _reach(WidgetTester tester, String text) async {
  final target = find.text(text);
  // Not built yet: scroll until the lazy list creates it. Built but below the
  // fold: it is findable and still untappable, so bring it into view either way.
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

/// Ticks a consent option by its title, scrolling the sheet to reach it.
Future<void> _tick(WidgetTester tester, String title) async {
  await tester.tap(await _reach(tester, title));
  await tester.pumpAndSettle();
}

Future<void> _tickAllRequired(WidgetTester tester, ConsentCopy copy) async {
  for (final scope in consentScopes.where((s) => s.mandatory)) {
    await _tick(tester, copy.items[scope.key]!.title);
  }
}

Finder get _agreeButton =>
    find.widgetWithText(ElevatedButton, consentCopyEn.agree);

void main() {
  testWidgets('shows everything the resident is being asked to agree to',
      (tester) async {
    await _open(tester);

    expect(find.text(consentCopyEn.title), findsOneWidget);
    expect(find.text(consentCopyEn.lede), findsOneWidget);
    // Every row of what is collected, then every permission, in order down
    // the sheet.
    for (final row in consentCopyEn.rows) {
      expect(await _reach(tester, row.label), findsOneWidget);
    }
    // The fingerprint guarantee is rich text (a bold lead then the rest), so
    // it is one Text widget whose plain text is longer than the lead alone.
    final fingerprint = find.textContaining(consentCopyEn.fingerprintLead);
    if (fingerprint.evaluate().isEmpty) {
      await tester.scrollUntilVisible(
        fingerprint,
        120,
        scrollable: find.byType(Scrollable).last,
      );
    }
    expect(fingerprint, findsOneWidget);
    for (final scope in consentScopes) {
      expect(
        await _reach(tester, consentCopyEn.items[scope.key]!.title),
        findsOneWidget,
        reason: 'missing consent item ${scope.key}',
      );
    }
    expect(await _reach(tester, consentCopyEn.rightsHeading), findsOneWidget);
  });

  testWidgets('cannot be agreed to until every required box is ticked',
      (tester) async {
    await _open(tester);

    expect(tester.widget<ElevatedButton>(_agreeButton).enabled, isFalse);

    await _tickAllRequired(tester, consentCopyEn);

    expect(tester.widget<ElevatedButton>(_agreeButton).enabled, isTrue);
  });

  testWidgets('an optional box alone does not unlock it', (tester) async {
    await _open(tester);

    await _tick(tester, consentCopyEn.items['anonymized_research']!.title);

    // Optional has to mean optional, or the consent is not freely given.
    expect(tester.widget<ElevatedButton>(_agreeButton).enabled, isFalse);
  });

  testWidgets('hands back exactly what was ticked', (tester) async {
    ConsentDecision? decision;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () async =>
                  decision = await showConsentSheet(context),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    await _tickAllRequired(tester, consentCopyEn);
    await _tick(tester, consentCopyEn.items['research_followup']!.title);
    await tester.tap(_agreeButton);
    await tester.pumpAndSettle();

    expect(decision, isNotNull);
    expect(decision!.version, consentVersion);
    expect(decision!.isComplete, isTrue);
    expect(decision!.has('research_followup'), isTrue);
    // Not ticked, so not granted.
    expect(decision!.has('anonymized_research'), isFalse);
    expect(decision!.optionalCount, 1);
  });

  testWidgets('reopens with the previous answers still ticked', (tester) async {
    await _open(
      tester,
      current: const ConsentDecision(
        version: consentVersion,
        scopes: [
          'account_processing',
          'sos_location_sharing',
          'on_device_biometric_ack',
          'contacts_informed',
        ],
      ),
    );

    // Already complete, so it can be agreed to again without re-reading.
    expect(tester.widget<ElevatedButton>(_agreeButton).enabled, isTrue);
  });

  testWidgets('says what declining means instead of just closing',
      (tester) async {
    await _open(tester);

    await tester.tap(find.text(consentCopyEn.decline));
    await tester.pumpAndSettle();

    expect(find.text(consentCopyEn.declineNote), findsOneWidget);
  });

  testWidgets('can be read in Filipino', (tester) async {
    await _open(tester);

    await tester.tap(find.text(consentCopyFil.languageLabel));
    await tester.pumpAndSettle();

    expect(find.text(consentCopyFil.title), findsOneWidget);
    expect(find.text(consentCopyEn.title), findsNothing);
    expect(
      await _reach(
        tester,
        consentCopyFil.items['sos_location_sharing']!.title,
      ),
      findsOneWidget,
    );
  });

  testWidgets('keeps what was ticked when the language changes',
      (tester) async {
    await _open(tester);
    await _tickAllRequired(tester, consentCopyEn);

    await tester.tap(find.text(consentCopyFil.languageLabel));
    await tester.pumpAndSettle();

    // The reading language is not a reason to re-ask for the permissions.
    expect(
      tester.widget<ElevatedButton>(
        find.widgetWithText(ElevatedButton, consentCopyFil.agree),
      ).enabled,
      isTrue,
    );
  });

  testWidgets('fits a narrow phone in both languages', (tester) async {
    tester.view.physicalSize = const Size(320 * 3, 640 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await _open(tester);
    // Labels like 'Ambulance requests' and 'Mga emergency contact' sit in a
    // fixed-width column beside their explanation.
    for (final row in consentCopyEn.rows) {
      await _reach(tester, row.label);
    }
    await tester.tap(find.text(consentCopyFil.languageLabel));
    await tester.pumpAndSettle();
    for (final row in consentCopyFil.rows) {
      await _reach(tester, row.label);
    }

    expect(tester.takeException(), isNull);
  });

  group('the disclosure table', () {
    /*
      The form is only worth showing if it describes the system that exists.
      Each of these is something TanzAlert actually collects today and once did
      not say so: the registration ID photos, the account details a responder is
      read on the way, and the ambulance transport flow, which takes a pickup
      point and a patient's medical condition.
    */
    for (final copy in [consentCopyEn, consentCopyFil]) {
      test('covers every collection the system performs (${copy.languageLabel})', () {
        expect(copy.rows, hasLength(8));
        for (final row in copy.rows) {
          expect(row.lead, isNotEmpty);
          expect(row.body.trim(), isNotEmpty);
        }
      });
    }

    test('declares the ambulance transport flow', () {
      final row = consentCopyEn.rows.firstWhere(
        (r) => r.label == 'Ambulance requests',
      );

      // Medical condition is sensitive personal information under RA 10173, so
      // it cannot sit unmentioned under "name and mobile".
      expect(row.body, contains('medical condition'));
      // Map-picked, not silently tracked. Residents assume worse.
      expect(row.body, contains('map'));
    });

    test('declares the documents registration already uploads', () {
      final row = consentCopyEn.rows.firstWhere(
        (r) => r.label == 'ID documents',
      );

      expect(row.body, contains('valid ID'));
      expect(row.body, contains('face photo'));
    });

    test('is versioned apart from the wording it replaced', () {
      // A grant records the version it was given under; reusing v1.0 for
      // different text would make those records say something untrue.
      expect(consentVersion, isNot('v1.0'));
    });
  });

  group('ConsentDecision', () {
    test('is incomplete when a required scope is missing', () {
      const decision = ConsentDecision(
        version: consentVersion,
        scopes: ['account_processing', 'sos_location_sharing'],
      );

      expect(decision.isComplete, isFalse);
    });

    test('flattens to one field for a multipart post', () {
      const decision = ConsentDecision(
        version: consentVersion,
        scopes: ['account_processing', 'contacts_informed'],
      );

      expect(decision.wireScopes, 'account_processing,contacts_informed');
    });
  });
}
