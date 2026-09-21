import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:safealert_ui/safealert_ui.dart';

import '../../auth/providers/auth_provider.dart';
import '../../location_sharing/service/location_service.dart';
import '../providers/duty_provider.dart';

class DutyStatusScreen extends ConsumerStatefulWidget {
  const DutyStatusScreen({super.key});

  @override
  ConsumerState<DutyStatusScreen> createState() => _DutyStatusScreenState();
}

class _DutyStatusScreenState extends ConsumerState<DutyStatusScreen> {
  Position? _position;
  bool _locating = false;
  DateTime? _dutyStart;

  @override
  void initState() {
    super.initState();
    _getPosition();
  }

  Future<void> _getPosition() async {
    setState(() => _locating = true);
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.deniedForever) return;
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );
      if (mounted) setState(() => _position = position);
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  void _toggleDuty(bool isOnDuty) {
    ref.read(dutyProvider.notifier).toggle();
    if (!isOnDuty) {
      setState(() => _dutyStart = DateTime.now());
      ref.read(locationServiceProvider).startBroadcast();
    } else {
      setState(() => _dutyStart = null);
      ref.read(locationServiceProvider).stopBroadcast();
    }
  }

  @override
  Widget build(BuildContext context) {
    final isOnDuty = ref.watch(dutyProvider);
    final responder = ref.watch(currentResponderProvider);
    final stateColor = isOnDuty ? AppColors.successGreen : AppColors.textMuted;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Field readiness'),
        actions: [
          IconButton(
            tooltip: 'Refresh location',
            onPressed: _locating ? null : _getPosition,
            icon: const Icon(Icons.my_location_rounded),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: TanzAlertPageEntrance(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: [
            AnimatedContainer(
              duration: AppMotion.duration(context, AppMotion.standard),
              curve: AppMotion.curve,
              padding: const EdgeInsets.all(22),
              decoration: BoxDecoration(
                color: AppColors.command,
                borderRadius: BorderRadius.circular(20),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x26071526),
                    blurRadius: 30,
                    offset: Offset(0, 12),
                  ),
                ],
              ),
              child: Column(
                children: [
                  TanzAlertSignal(
                    active: isOnDuty,
                    color: isOnDuty
                        ? AppColors.successGreen
                        : AppColors.textMuted,
                    size: 112,
                    child: AnimatedContainer(
                      duration: AppMotion.duration(context, AppMotion.standard),
                      width: 76,
                      height: 76,
                      decoration: BoxDecoration(
                        color: stateColor.withValues(alpha: .16),
                        shape: BoxShape.circle,
                        border: Border.all(color: stateColor, width: 2),
                      ),
                      child: Icon(
                        Icons.local_police_rounded,
                        color: stateColor,
                        size: 38,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  AnimatedSwitcher(
                    duration: AppMotion.duration(context, AppMotion.fast),
                    child: Text(
                      isOnDuty ? 'ON DUTY' : 'OFF DUTY',
                      key: ValueKey(isOnDuty),
                      style: TextStyle(
                        color: stateColor,
                        fontSize: 27,
                        fontWeight: FontWeight.w900,
                        letterSpacing: .5,
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    isOnDuty
                        ? 'Visible to dispatch and sharing live location'
                        : 'Go on duty when you are ready to respond',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white60, fontSize: 12),
                  ),
                  if (isOnDuty && _dutyStart != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      'ACTIVE SINCE ${_dutyStart!.hour.toString().padLeft(2, '0')}:${_dutyStart!.minute.toString().padLeft(2, '0')}',
                      style: const TextStyle(
                        color: AppColors.signalCyan,
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.2,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 26),
            const TanzAlertSectionHeader(
              eyebrow: 'Readiness check',
              title: 'Responder status',
            ),
            const SizedBox(height: 12),
            TanzAlertPanel(
              child: Column(
                children: [
                  _StatusRow(
                    icon: Icons.badge_outlined,
                    label: 'Responder',
                    value: responder?.name ?? 'Unavailable',
                    valueColor: AppColors.textStrong,
                  ),
                  const Divider(height: 24),
                  _StatusRow(
                    icon: Icons.gps_fixed_rounded,
                    label: 'GPS signal',
                    value: _locating
                        ? 'Locating…'
                        : _position != null
                        ? 'Accurate · ${_position!.accuracy.toStringAsFixed(0)} m'
                        : 'Permission needed',
                    valueColor: _position != null
                        ? AppColors.successGreen
                        : AppColors.warningAmber,
                  ),
                  if (responder?.stationName != null) ...[
                    const Divider(height: 24),
                    _StatusRow(
                      icon: Icons.hub_outlined,
                      label: 'Station',
                      value: responder!.stationName!,
                      valueColor: AppColors.textStrong,
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () => _toggleDuty(isOnDuty),
              icon: Icon(
                isOnDuty ? Icons.pause_circle_outline : Icons.play_circle_fill,
              ),
              label: Text(isOnDuty ? 'End duty session' : 'Start duty session'),
              style: ElevatedButton.styleFrom(
                minimumSize: const Size.fromHeight(58),
                backgroundColor: isOnDuty
                    ? AppColors.alertRed
                    : AppColors.successGreen,
              ),
            ),
            if (isOnDuty) ...[
              const SizedBox(height: 12),
              AppButton(
                label: 'Open live emergency map',
                onPressed: () => context.go('/map'),
                icon: Icons.radar_rounded,
              ),
              const SizedBox(height: 10),
              AppOutlinedButton(
                label: 'View ambulance assignments',
                onPressed: () => context.go('/ambulance'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StatusRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color valueColor;

  const _StatusRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.valueColor,
  });

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: AppColors.softBlue,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, size: 19, color: AppColors.responderBlue),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppColors.textMuted,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: valueColor,
              ),
            ),
          ],
        ),
      ),
    ],
  );
}
