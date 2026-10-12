import 'package:flutter/material.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_button.dart';
import '../service/ble_service.dart';

class BlePairingScreen extends ConsumerWidget {
  const BlePairingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ble = ref.watch(bleServiceProvider);
    final controller = ref.read(bleServiceProvider.notifier);
    final enrolling =
        ble.enrollmentStatus == 'starting' ||
        ble.enrollmentStatus == 'place_first' ||
        ble.enrollmentStatus == 'remove_finger' ||
        ble.enrollmentStatus == 'place_second';

    return Scaffold(
      appBar: AppBar(title: const Text('TanzAlert device')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _DeviceCard(ble: ble),
            if (ble.message != null) ...[
              const SizedBox(height: 12),
              _Notice(message: ble.message!),
            ],
            const SizedBox(height: 24),
            if (!ble.isConnected) ...[
              const Text(
                'Pair your wearable',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              const Text(
                '1. Power the ESP32 and modem from their correct supplies.\n'
                '2. Hold the emergency button for 3 seconds. If a finger is already enrolled, scan it first.\n'
                '3. Keep the device near this phone and scan within 2 minutes.',
                style: TextStyle(
                  fontSize: 14,
                  color: AppColors.textMuted,
                  height: 1.6,
                ),
              ),
              const SizedBox(height: 24),
              AppButton(
                label: ble.connection == BleConnectionState.scanning
                    ? 'Scanning…'
                    : 'Scan for device',
                onPressed: ble.connection == BleConnectionState.scanning
                    ? null
                    : () async {
                        final messenger = ScaffoldMessenger.of(context);
                        final adapterState =
                            await FlutterBluePlus.adapterState.first;
                        if (adapterState != BluetoothAdapterState.on) {
                          messenger.showSnackBar(
                            const SnackBar(
                              content: Text('Please enable Bluetooth first.'),
                            ),
                          );
                          return;
                        }
                        await controller.startScan();
                      },
                backgroundColor: AppColors.responderBlue,
              ),
            ] else ...[
              const Text(
                'Device setup',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 12),
              _ReadinessRow(
                icon: Icons.fingerprint,
                label: 'Fingerprint scanner',
                value: !ble.fingerprintReady
                    ? 'Not detected'
                    : ble.fingerprintEnrolled
                    ? 'Enrolled'
                    : 'Ready to enroll',
                ready: ble.fingerprintReady && ble.fingerprintEnrolled,
              ),
              _ReadinessRow(
                icon: Icons.gps_fixed,
                label: 'Emergency location',
                value: 'SIM7670/A7670 GNSS',
                ready: true,
              ),
              _ReadinessRow(
                icon: Icons.cell_tower,
                label: 'Direct cellular delivery',
                value: !ble.directCellularEnabled
                    ? 'Off — this build has no HTTPS API URL or APN'
                    : ble.serverCertVerified
                    ? 'On, server certificate verified'
                    : 'On, but the server certificate is NOT verified',
                // Deliberately not "ready" when the certificate is unverified:
                // delivery works, but the device token rides on a session that a
                // man-in-the-middle could read, and that should not look green.
                ready: ble.directCellularEnabled && ble.serverCertVerified,
              ),
              const SizedBox(height: 20),
              if (!ble.fingerprintEnrolled)
                AppButton(
                  label: enrolling
                      ? 'Follow the sensor prompts…'
                      : 'Enroll fingerprint',
                  onPressed: !ble.fingerprintReady || enrolling
                      ? null
                      : () async {
                          final messenger = ScaffoldMessenger.of(context);
                          try {
                            await controller.enrollFingerprint();
                          } catch (error) {
                            messenger.showSnackBar(
                              SnackBar(content: Text(error.toString())),
                            );
                          }
                        },
                  backgroundColor: AppColors.responderBlue,
                ),
              if (!ble.fingerprintEnrolled) const SizedBox(height: 16),
              const _EmergencyInstructions(),
              const SizedBox(height: 24),
              AppOutlinedButton(
                label: 'Disconnect device',
                onPressed: () => controller.disconnect(),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DeviceCard extends StatelessWidget {
  final BleDeviceState ble;
  const _DeviceCard({required this.ble});

  @override
  Widget build(BuildContext context) {
    final connected = ble.isConnected;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: connected ? const Color(0xFFDCFCE7) : AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: connected ? AppColors.successGreen : AppColors.border,
          width: connected ? 2 : 1,
        ),
      ),
      child: Column(
        children: [
          Icon(
            connected ? Icons.watch : Icons.bluetooth_disabled,
            color: connected ? AppColors.successGreen : AppColors.textMuted,
            size: 48,
          ),
          const SizedBox(height: 12),
          Text(
            connected
                ? (ble.deviceName ?? 'TanzAlert wearable')
                : 'No device connected',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: connected ? AppColors.successGreen : AppColors.textMuted,
            ),
          ),
          if (connected && ble.deviceId != null) ...[
            const SizedBox(height: 4),
            Text(
              ble.deviceId!,
              style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
          ],
          if (ble.isHeartbeatStale) ...[
            const SizedBox(height: 8),
            const Text(
              'Heartbeat lost — check power and Bluetooth',
              style: TextStyle(
                fontSize: 12,
                color: AppColors.warningAmber,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  final String message;
  const _Notice({required this.message});

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: const Color(0xFFFFF7ED),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: const Color(0xFFFED7AA)),
    ),
    child: Text(message, style: const TextStyle(fontSize: 13, height: 1.4)),
  );
}

class _ReadinessRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final bool ready;
  const _ReadinessRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.ready,
  });

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Row(
      children: [
        Icon(icon, color: ready ? AppColors.successGreen : AppColors.textMuted),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.textMuted,
                ),
              ),
            ],
          ),
        ),
        Icon(
          ready ? Icons.check_circle : Icons.info_outline,
          color: ready ? AppColors.successGreen : AppColors.warningAmber,
          size: 20,
        ),
      ],
    ),
  );
}

class _EmergencyInstructions extends StatelessWidget {
  const _EmergencyInstructions();

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: AppColors.background,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: AppColors.border),
    ),
    child: const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Send an emergency',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
        SizedBox(height: 8),
        Text(
          'Scan the enrolled finger. The LED blinks three times when verified. Then tap the emergency button within 30 seconds. The SOS is sent immediately and the device keeps streaming GPS until dispatch resolves the incident.',
          style: TextStyle(
            fontSize: 13,
            color: AppColors.textMuted,
            height: 1.5,
          ),
        ),
      ],
    ),
  );
}
