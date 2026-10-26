import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile_user/features/ble_panic_button/screens/ble_pairing_screen.dart';
import 'package:mobile_user/features/ble_panic_button/service/ble_service.dart';

class _UnusedBox implements Box<String> {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeBle extends BleService {
  int reconnects = 0;
  int scans = 0;
  _FakeBle(BleDeviceState initial) : super(Dio(), _UnusedBox()) {
    state = initial;
  }
  @override
  Future<void> reconnect() async {
    reconnects++;
  }

  @override
  Future<void> startScan() async {
    scans++;
  }

  @override
  Future<void> disconnect({bool clearState = false}) async {}
}

void main() {
  Future<void> show(WidgetTester tester, _FakeBle service) async {
    tester.view.physicalSize = const Size(360, 780);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [bleServiceProvider.overrideWith((ref) => service)],
        child: const MaterialApp(home: BlePairingScreen()),
      ),
    );
  }

  testWidgets('saved wearable has separate reconnect and scan controls', (
    tester,
  ) async {
    final service = _FakeBle(const BleDeviceState(deviceId: 'SA-ESP32-TEST'));
    await show(tester, service);
    await tester.tap(find.text('Reconnect'));
    await tester.tap(find.text('Scan again'));
    expect(service.reconnects, 1);
    expect(service.scans, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('repair mode shows button instructions and real GPS readiness', (
    tester,
  ) async {
    final service = _FakeBle(
      const BleDeviceState(
        connection: BleConnectionState.connected,
        deviceId: 'SA-ESP32-TEST',
        fingerprintRequired: false,
        gpsFix: false,
        directCellularEnabled: true,
        cellularStatus: 'no_data',
      ),
    );
    await show(tester, service);
    expect(
      find.textContaining('Fingerprint verification is temporarily disabled'),
      findsOneWidget,
    );
    expect(find.text('Enroll fingerprint'), findsNothing);
    await tester.scrollUntilVisible(find.text('Wearable GPS'), 200);
    expect(find.textContaining('Waiting for GPS'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Check SIM connection'), 200);
    expect(find.textContaining('No mobile data connection'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('legacy firmware is never presented as fingerprint-free', (
    tester,
  ) async {
    await show(
      tester,
      _FakeBle(const BleDeviceState(connection: BleConnectionState.connected)),
    );
    expect(
      find.textContaining('This firmware still requires a fingerprint'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'missing GPS and SIM show installation checks, not satellite search',
    (tester) async {
      await show(
        tester,
        _FakeBle(
          const BleDeviceState(
            connection: BleConnectionState.connected,
            gpsHardwareStatus: 2,
            simStatus: 2,
          ),
        ),
      );
      await tester.scrollUntilVisible(find.text('Wearable GPS'), 200);
      expect(find.textContaining('GPS module not detected'), findsOneWidget);
      expect(find.textContaining('Waiting for GPS'), findsNothing);
      await tester.scrollUntilVisible(find.text('Wearable SIM'), 200);
      expect(find.textContaining('No SIM detected.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('detected GPS without fix and locked SIM explain next steps', (
    tester,
  ) async {
    await show(
      tester,
      _FakeBle(
        const BleDeviceState(
          connection: BleConnectionState.connected,
          gpsHardwareStatus: 1,
          gpsFix: false,
          simStatus: 3,
          simBrands: 'Old carrier',
        ),
      ),
    );
    await tester.scrollUntilVisible(find.text('Wearable GPS'), 200);
    expect(find.textContaining('GPS detected · searching'), findsOneWidget);
    expect(find.textContaining('Location available'), findsNothing);
    await tester.scrollUntilVisible(find.text('Wearable SIM'), 200);
    expect(find.textContaining('SIM locked.'), findsOneWidget);
    expect(find.text('Old carrier'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('startup checks remain distinct from a live location', (
    tester,
  ) async {
    await show(
      tester,
      _FakeBle(
        const BleDeviceState(
          connection: BleConnectionState.connected,
          gpsHardwareStatus: 0,
          simStatus: 0,
        ),
      ),
    );
    await tester.scrollUntilVisible(find.text('Wearable GPS'), 200);
    expect(find.textContaining('Checking GPS connection'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Wearable SIM'), 200);
    expect(find.text('Checking the inserted SIM...'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
