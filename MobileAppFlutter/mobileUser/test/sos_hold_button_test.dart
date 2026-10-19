import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_user/features/emergency/widgets/sos_hold_button.dart';

/// The hold is the only thing standing between a pocket and a dispatched
/// responder, so its timing is worth asserting rather than eyeballing.
void main() {
  int fired = 0;

  Future<void> pumpButton(WidgetTester tester) async {
    fired = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: SosHoldButton(onHoldComplete: () => fired++),
          ),
        ),
      ),
    );
  }

  testWidgets('a full three-second hold fires once', (tester) async {
    await pumpButton(tester);

    final gesture = await tester.startGesture(
      tester.getCenter(find.byType(SosHoldButton)),
    );
    await tester.pump(); // let the controller start
    expect(fired, 0);

    await tester.pump(const Duration(milliseconds: 3050));
    expect(fired, 1);

    await gesture.up();
    await tester.pumpAndSettle();
    expect(fired, 1, reason: 'releasing after the hold must not re-fire');
  });

  testWidgets('a tap sends nothing', (tester) async {
    await pumpButton(tester);

    await tester.tap(find.byType(SosHoldButton));
    await tester.pumpAndSettle();

    expect(fired, 0);
  });

  testWidgets('releasing early sends nothing', (tester) async {
    await pumpButton(tester);

    final gesture = await tester.startGesture(
      tester.getCenter(find.byType(SosHoldButton)),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 2500));
    await gesture.up();
    await tester.pumpAndSettle();

    expect(fired, 0);
  });

  testWidgets('an abandoned hold does not leave progress behind', (tester) async {
    await pumpButton(tester);

    final gesture = await tester.startGesture(
      tester.getCenter(find.byType(SosHoldButton)),
    );
    await tester.pump(); // starts the hold's ticker
    await tester.pump(const Duration(milliseconds: 1500));

    final midway = tester.widget<CircularProgressIndicator>(
      find.byType(CircularProgressIndicator),
    );
    expect(midway.value, greaterThan(0));

    await gesture.up();
    await tester.pumpAndSettle();

    final after = tester.widget<CircularProgressIndicator>(
      find.byType(CircularProgressIndicator),
    );
    expect(after.value, 0);

    // And a second, complete hold still works after an abandoned one.
    final second = await tester.startGesture(
      tester.getCenter(find.byType(SosHoldButton)),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 3050));
    expect(fired, 1);
    await second.up();
    await tester.pumpAndSettle();
  });

  testWidgets('the label tells the user what to do, and that it is working',
      (tester) async {
    await pumpButton(tester);
    expect(find.text('Hold 3 seconds'), findsOneWidget);

    final gesture = await tester.startGesture(
      tester.getCenter(find.byType(SosHoldButton)),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.text('Keep holding…'), findsOneWidget);

    await gesture.up();
    await tester.pumpAndSettle();
    expect(find.text('Hold 3 seconds'), findsOneWidget);
  });

  testWidgets('it is announced as a button with hold instructions',
      (tester) async {
    final semantics = tester.ensureSemantics();
    await pumpButton(tester);

    expect(
      find.bySemanticsLabel(
        'SOS. Press and hold for three seconds to alert MDRRMO Tanza.',
      ),
      findsOneWidget,
    );
    semantics.dispose();
  });
}
