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
    final bleNotifier = ref.read(bleServiceProvider.notifier);

    return Scaffold(
      appBar: AppBar(title: const Text('BLE Keychain')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _DeviceCard(ble: ble),
            const SizedBox(height: 24),
            if (!ble.isConnected) ...[
              const Text('How to pair', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              const Text(
                '1. Turn on your TanzAlert keychain (press the switch).\n'
                '2. Hold it near your phone.\n'
                '3. Tap "Scan for Keychain" below.',
                style: TextStyle(fontSize: 14, color: AppColors.textMuted, height: 1.6),
              ),
              const SizedBox(height: 24),
              AppButton(
                label: ble.connection == BleConnectionState.scanning ? 'Scanning...' : 'Scan for Keychain',
                onPressed: ble.connection == BleConnectionState.scanning
                    ? null
                    : () async {
                        final messenger = ScaffoldMessenger.of(context);
                        final btState = await FlutterBluePlus.adapterState.first;
                        if (btState != BluetoothAdapterState.on) {
                          messenger.showSnackBar(
                            const SnackBar(content: Text('Please enable Bluetooth first.')),
                          );
                          return;
                        }
                        bleNotifier.startScan();
                      },
                backgroundColor: AppColors.responderBlue,
              ),
            ] else ...[
              const Text('Keychain Buttons', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              const Text(
                'Each button triggers an emergency type. A single press is all that is needed.',
                style: TextStyle(fontSize: 13, color: AppColors.textMuted),
              ),
              const SizedBox(height: 16),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: 1.4,
                children: const [
                  _KeychainButton(label: 'Medical', icon: Icons.medical_services, color: AppColors.alertRed),
                  _KeychainButton(label: 'Crime', icon: Icons.local_police, color: Color(0xFF7C3AED)),
                  _KeychainButton(label: 'Fire', icon: Icons.local_fire_department, color: Color(0xFFEA580C)),
                  _KeychainButton(label: 'SOS', icon: Icons.sos, color: AppColors.adminNavy),
                ],
              ),
              const SizedBox(height: 24),
              AppOutlinedButton(
                label: 'Disconnect Keychain',
                onPressed: () => bleNotifier.disconnect(),
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
    final isConnected = ble.isConnected;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: isConnected ? const Color(0xFFDCFCE7) : AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isConnected ? AppColors.successGreen : AppColors.border, width: isConnected ? 2 : 1),
      ),
      child: Column(
        children: [
          Icon(
            isConnected ? Icons.bluetooth_connected : Icons.bluetooth_disabled,
            color: isConnected ? AppColors.successGreen : AppColors.textMuted,
            size: 48,
          ),
          const SizedBox(height: 12),
          Text(
            isConnected ? (ble.deviceName ?? 'TanzAlert Keychain') : 'No keychain paired',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: isConnected ? AppColors.successGreen : AppColors.textMuted,
            ),
          ),
          if (isConnected) ...[
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (ble.batteryPercent != null) ...[
                  Icon(Icons.battery_full, size: 14, color: AppColors.textMuted),
                  const SizedBox(width: 2),
                  Text('${ble.batteryPercent}%', style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
                  const SizedBox(width: 12),
                ],
                if (ble.lastSeen != null)
                  Text(
                    'Last seen: ${_formatTime(ble.lastSeen!)}',
                    style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
                  ),
              ],
            ),
            if (ble.isHeartbeatStale) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(20)),
                child: const Text('Heartbeat lost', style: TextStyle(fontSize: 11, color: AppColors.warningAmber, fontWeight: FontWeight.w700)),
              ),
            ],
          ],
        ],
      ),
    );
  }

  String _formatTime(DateTime t) {
    final diff = DateTime.now().difference(t);
    if (diff.inSeconds < 5) return 'just now';
    if (diff.inSeconds < 60) return '${diff.inSeconds}s ago';
    return '${diff.inMinutes}m ago';
  }
}

class _KeychainButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  const _KeychainButton({required this.label, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 6),
          Text(label, style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
