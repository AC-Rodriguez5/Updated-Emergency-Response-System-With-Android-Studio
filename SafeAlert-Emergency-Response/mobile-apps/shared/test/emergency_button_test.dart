import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:safealert_mobile/src/emergency_screens.dart';

void main() {
  testWidgets(
    'two second hold triggers once; short tap requests confirmation',
    (tester) async {
      final triggers = <bool>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: HoldEmergencyButton(
              type: 'medical',
              enabled: true,
              onTrigger: (held) async {
                triggers.add(held);
              },
            ),
          ),
        ),
      );
      expect(triggers, isEmpty);
      await tester.tap(find.byType(FilledButton));
      await tester.pump();
      expect(triggers, [false]);
      triggers.clear();
      final gesture = await tester.startGesture(
        tester.getCenter(find.byType(FilledButton)),
      );
      await tester.pump(const Duration(milliseconds: 1999));
      expect(triggers, isEmpty);
      await tester.pump(const Duration(milliseconds: 1));
      expect(triggers, [true]);
      await gesture.up();
      await tester.pump();
      expect(triggers, [true]);
    },
  );
  testWidgets('disabled emergency control cannot trigger', (tester) async {
    var count = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: HoldEmergencyButton(
            type: 'fire',
            enabled: false,
            onTrigger: (_) async {
              count++;
            },
          ),
        ),
      ),
    );
    await tester.tap(find.byType(FilledButton));
    await tester.pump(const Duration(seconds: 3));
    expect(count, 0);
  });
}
