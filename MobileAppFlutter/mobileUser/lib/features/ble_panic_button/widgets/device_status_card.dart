import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../service/ble_service.dart';

class DeviceStatusCard extends ConsumerWidget {
  const DeviceStatusCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ble = ref.watch(bleServiceProvider);
    final isConnected = ble.isConnected;
    final isStale = ble.isHeartbeatStale;

    final (statusColor, statusLabel, statusIcon) = isConnected && !isStale
        ? (AppColors.successGreen, 'Connected', Icons.bluetooth_connected)
        : ble.connection == BleConnectionState.scanning
        ? (AppColors.warningAmber, 'Scanning...', Icons.bluetooth_searching)
        : ble.connection == BleConnectionState.connecting
        ? (AppColors.warningAmber, 'Connecting...', Icons.bluetooth_searching)
        : (AppColors.textMuted, 'Not connected', Icons.bluetooth_disabled);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => context.push('/home/ble'),
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: isConnected && !isStale
                      ? const Color(0xFFDCFCE7)
                      : AppColors.background,
                  shape: BoxShape.circle,
                ),
                child: Icon(statusIcon, color: statusColor, size: 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'TanzAlert wearable',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: statusColor,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          statusLabel,
                          style: TextStyle(
                            fontSize: 12,
                            color: statusColor,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        if (ble.deviceId != null) ...[
                          const Text(
                            '  ·  ',
                            style: TextStyle(color: AppColors.textMuted),
                          ),
                          Text(
                            ble.deviceId!.length > 12
                                ? ble.deviceId!.substring(0, 12)
                                : ble.deviceId!,
                            style: const TextStyle(
                              fontSize: 11,
                              color: AppColors.textMuted,
                            ),
                          ),
                        ],
                      ],
                    ),
                    if (isStale && ble.deviceId != null)
                      const Padding(
                        padding: EdgeInsets.only(top: 4),
                        child: Text(
                          'Heartbeat lost — check device power',
                          style: TextStyle(
                            fontSize: 11,
                            color: AppColors.warningAmber,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              if (ble.batteryPercent != null) ...[
                _BatteryIndicator(percent: ble.batteryPercent!),
                const SizedBox(width: 8),
              ],
              const Icon(
                Icons.chevron_right,
                color: AppColors.textMuted,
                size: 20,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BatteryIndicator extends StatelessWidget {
  final int percent;
  const _BatteryIndicator({required this.percent});

  @override
  Widget build(BuildContext context) {
    final color = percent < 20
        ? AppColors.alertRed
        : percent < 50
        ? AppColors.warningAmber
        : AppColors.successGreen;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          percent < 20
              ? Icons.battery_alert
              : percent < 50
              ? Icons.battery_3_bar
              : Icons.battery_full,
          color: color,
          size: 20,
        ),
        Text(
          '$percent%',
          style: TextStyle(
            fontSize: 10,
            color: color,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}
