import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/app_colors.dart';
import '../service/ble_service.dart';

class BlePairingScreen extends ConsumerWidget {
  const BlePairingScreen({super.key});

  Future<void> _run(
    BuildContext context,
    Future<void> Function() action,
  ) async {
    try {
      await action();
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error.toString().replaceFirst('Bad state: ', '')),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ble = ref.watch(bleServiceProvider);
    final controller = ref.read(bleServiceProvider.notifier);
    final connected = ble.isConnected;
    final color = connected ? AppColors.successGreen : AppColors.responderBlue;
    final status = switch (ble.connection) {
      BleConnectionState.connected => 'Connected to this phone',
      BleConnectionState.connecting => 'Connecting to wearable...',
      BleConnectionState.scanning => 'Searching nearby...',
      _ => ble.deviceId == null ? 'Add your wearable' : 'Phone disconnected',
    };
    return Scaffold(
      appBar: AppBar(
        title: const Text('My wearable'),
        actions: [
          IconButton(
            tooltip: 'Refresh device status',
            onPressed: connected ? controller.refreshStatus : null,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: color.withValues(alpha: 0.25)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.watch_outlined, size: 40, color: color),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Text(
                        ble.deviceName ?? 'TanzAlert wearable',
                        style: const TextStyle(
                          fontSize: 21,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                Text(
                  status,
                  style: TextStyle(color: color, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 6),
                Text(
                  connected
                      ? 'Your phone can relay SOS alerts while the app is running.'
                      : 'Standalone SOS uses the SIM inside your wearable. Phone mobile data works only when Bluetooth is connected.',
                  style: const TextStyle(height: 1.5),
                ),
                const SizedBox(height: 18),
                if (ble.isBusy) const LinearProgressIndicator(),
                if (!connected && !ble.isBusy) ...[
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () => _run(
                        context,
                        ble.deviceId == null
                            ? controller.startScan
                            : controller.reconnect,
                      ),
                      icon: Icon(
                        ble.deviceId == null
                            ? Icons.search
                            : Icons.bluetooth_connected,
                      ),
                      label: Text(
                        ble.deviceId == null
                            ? 'Scan for wearable'
                            : 'Reconnect',
                      ),
                    ),
                  ),
                  if (ble.deviceId != null)
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: () => _run(context, controller.startScan),
                        icon: const Icon(Icons.search),
                        label: const Text('Scan again'),
                      ),
                    ),
                ],
                if (ble.isBusy)
                  TextButton(
                    onPressed: () => _run(context, controller.disconnect),
                    child: const Text('Cancel'),
                  ),
              ],
            ),
          ),
          if (ble.message != null)
            _Panel(
              title: 'Latest update',
              children: [
                Text(ble.message!, style: const TextStyle(height: 1.5)),
              ],
            ),
          _Panel(
            title: 'Send an SOS',
            children: [
              Text(
                connected && !ble.fingerprintRequired
                    ? 'Tap and release the wearable button to send SOS. Fingerprint verification is temporarily disabled.'
                    : connected
                    ? 'This firmware still requires a fingerprint. Install the updated firmware to use button-only SOS.'
                    : 'With the updated firmware, tap and release the wearable button to send SOS without a fingerprint.',
                style: const TextStyle(height: 1.5),
              ),
              const SizedBox(height: 8),
              const Text(
                'Hold for 3 seconds only when setting up the device. A long hold opens setup mode and does not send SOS.',
                style: TextStyle(color: AppColors.textMuted, height: 1.5),
              ),
            ],
          ),
          if (connected) ...[
            _Panel(
              title: 'Device health',
              children: [
                _HealthRow(
                  icon: Icons.touch_app,
                  title: 'SOS access',
                  detail: ble.fingerprintRequired
                      ? 'Fingerprint required by installed firmware'
                      : 'Button only · temporary repair mode',
                  ready:
                      !ble.fingerprintRequired ||
                      (ble.fingerprintReady && ble.fingerprintEnrolled),
                ),
                _HealthRow(
                  icon: Icons.gps_fixed,
                  title: 'Wearable GPS',
                  detail: _gpsMessage(ble),
                  ready: ble.gpsFix,
                ),
                _HealthRow(
                  icon: Icons.outbox_outlined,
                  title: 'Undelivered alerts',
                  detail: ble.pendingCount == 0
                      ? 'No alerts waiting on the wearable'
                      : '${ble.pendingCount} waiting for delivery. Keep device powered.',
                  ready: ble.pendingCount == 0,
                ),
              ],
            ),
            _Panel(
              title: 'SOS without your phone',
              children: [
                _HealthRow(
                  icon: Icons.cell_tower,
                  title: 'Standalone cellular',
                  detail: ble.directCellularEnabled
                      ? 'Enabled on the wearable'
                      : 'Not configured. Update cellular settings below.',
                  ready: ble.directCellularEnabled,
                ),
                _HealthRow(
                  icon: Icons.sim_card_outlined,
                  title: 'Wearable SIM',
                  detail: _simMessage(ble),
                  ready:
                      ble.simStatus == 1 ||
                      (ble.simStatus == null && ble.simBrands.isNotEmpty),
                ),
                if (ble.activeApn.isNotEmpty)
                  Text(
                    'APN: ${ble.activeApn}',
                    style: const TextStyle(color: AppColors.textMuted),
                  ),
                const SizedBox(height: 12),
                Text(
                  _cellularMessage(ble),
                  style: const TextStyle(height: 1.5),
                ),
                const SizedBox(height: 8),
                Text(
                  ble.serverCertVerified
                      ? 'Server certificate verification configured.'
                      : 'Server certificate verification is not configured.',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textMuted,
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.tonalIcon(
                    onPressed:
                        !ble.directCellularEnabled ||
                            ble.cellularStatus == 'testing' ||
                            ble.pendingCount > 0
                        ? null
                        : () => _run(context, controller.testCellular),
                    icon: const Icon(Icons.network_check),
                    label: Text(
                      ble.cellularStatus == 'testing'
                          ? 'Checking SIM connection...'
                          : 'Check SIM connection',
                    ),
                  ),
                ),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: ble.cellularStatus == 'testing'
                        ? null
                        : () =>
                              _run(context, controller.updateCellularSettings),
                    icon: const Icon(Icons.sync),
                    label: const Text('Update cellular settings'),
                  ),
                ),
                const Text(
                  'Use a public HTTPS server address in app Settings. Hold the wearable button for 3 seconds, then update here. Repeat if your server address changes.',
                  style: TextStyle(
                    fontSize: 12,
                    color: AppColors.textMuted,
                    height: 1.5,
                  ),
                ),
              ],
            ),
            _Panel(
              title: 'Device details',
              children: [
                Text(ble.deviceId ?? ''),
                Text('Firmware ${ble.firmwareVersion ?? "unknown"}'),
                if (ble.lastSeen != null)
                  Text(
                    'Last response: ${TimeOfDay.fromDateTime(ble.lastSeen!).format(context)}',
                  ),
                TextButton.icon(
                  onPressed: () => _run(context, controller.disconnect),
                  icon: const Icon(Icons.bluetooth_disabled),
                  label: const Text('Disconnect phone'),
                ),
              ],
            ),
          ] else
            _Panel(
              title: 'Connection help',
              children: const [
                Text(
                  '1. Power the wearable and keep it close to your phone.\n'
                  '2. Turn on Bluetooth and allow Nearby devices permissions. Older Android phones also need Location enabled.\n'
                  '3. Disconnect the wearable from any other phone.\n'
                  '4. For first-time setup, hold its button for 3 seconds, then scan within 2 minutes. A saved wearable can reconnect without setup mode.',
                  style: TextStyle(height: 1.6),
                ),
              ],
            ),
        ],
      ),
    );
  }

  String _gpsMessage(BleDeviceState ble) {
    if (ble.gpsHardwareStatus == 2) {
      return 'GPS module not detected. Check its power and wiring. SOS can send without GPS.';
    }
    if (ble.gpsFix) {
      return 'Location available · ${ble.gpsSatellites} satellites';
    }
    return switch (ble.gpsHardwareStatus) {
      0 => 'Checking GPS connection. SOS can send before a fix.',
      1 =>
        'GPS detected · searching for satellites. Move outdoors for a clear sky view.',
      _ =>
        'Waiting for GPS · ${ble.gpsSatellites} satellites. SOS can send before a fix.',
    };
  }

  String _simMessage(BleDeviceState ble) => switch (ble.simStatus) {
    0 => 'Checking the inserted SIM...',
    1 => ble.simBrands.isEmpty ? 'SIM detected' : ble.simBrands,
    2 => 'No SIM detected. Power off the wearable and insert a SIM.',
    3 => 'SIM locked. Unlock its PIN/PUK using a phone first.',
    4 => 'SIM could not be read. Check the SIM; the wearable will retry.',
    5 => 'Cellular modem not responding. Check its power and wiring.',
    _ => ble.simBrands.isEmpty ? 'Carrier not detected yet' : ble.simBrands,
  };

  String _cellularMessage(BleDeviceState ble) => switch (ble.cellularStatus) {
    'testing' =>
      'Checking the wearable SIM, network, and server. This does not create an emergency.',
    'reachable' =>
      'Server reached through the wearable SIM. No SOS was created. Device-token delivery still needs an end-to-end hardware test.',
    'delivered' => 'The server accepted the last cellular delivery.',
    'disabled' || 'https_required' =>
      'Set a public HTTPS server address and update cellular settings.',
    'no_data' =>
      'No mobile data connection. Check the wearable SIM, data package, antenna, and signal.',
    'tls_error' =>
      'Secure connection setup failed. Check server certificate settings.',
    'modem_error' => 'Modem is not ready. Check its power and wiring.',
    'timeout' =>
      'Server did not respond. Check signal, data balance, and the saved server address.',
    'http_error' =>
      'Last cellular request returned ${ble.lastHttpStatus}. Check the server address and SIM connection; update settings if pairing has changed.',
    _ =>
      'Not checked yet. A data package alone does not confirm that the wearable can reach the server.',
  };
}

class _Panel extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _Panel({required this.title, required this.children});
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(top: 16),
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: AppColors.border),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 12),
        ...children,
      ],
    ),
  );
}

class _HealthRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String detail;
  final bool ready;
  const _HealthRow({
    required this.icon,
    required this.title,
    required this.detail,
    required this.ready,
  });
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          icon,
          color: ready ? AppColors.successGreen : AppColors.warningAmber,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 3),
              Text(
                detail,
                style: const TextStyle(color: AppColors.textMuted, height: 1.4),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}
