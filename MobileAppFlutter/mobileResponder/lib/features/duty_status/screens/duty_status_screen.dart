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

  /// [goOnDuty] is what the responder asked for, not what the switch shows.
  ///
  /// Nothing here assumes the request worked. The notifier only reports on duty
  /// once the backend has said so, and the location broadcast starts off the
  /// state that comes back rather than off the tap.
  Future<void> _setDuty(bool goOnDuty) async {
    await ref.read(dutyProvider.notifier).setOnDuty(goOnDuty);
    if (!mounted) return;
    final duty = ref.read(dutyProvider);
    if (duty.isOnDuty) {
      setState(() => _dutyStart ??= DateTime.now());
      // Delegates to the duty foreground service when it is up, so the stream
      // survives the app being pocketed.
      ref.read(locationServiceProvider).startBroadcast();
    } else {
      setState(() => _dutyStart = null);
      ref.read(locationServiceProvider).stopBroadcast();
    }
  }

  @override
  Widget build(BuildContext context) {
    final duty = ref.watch(dutyProvider);
    final isOnDuty = duty.isOnDuty;
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
                        ? duty.listening
                              ? 'Visible to dispatch · alerts will ring even '
                                    'with the app closed'
                              : 'Visible to dispatch, but this phone will not '
                                    'ring with the app closed'
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
                  const Divider(height: 24),
                  _StatusRow(
                    icon: duty.listening
                        ? Icons.notifications_active_rounded
                        : Icons.notifications_off_rounded,
                    label: 'Alerts with the app closed',
                    value: isOnDuty
                        ? duty.listening
                              ? 'Listening'
                              : 'Not listening — allow notifications'
                        : 'Starts with your duty session',
                    valueColor: !isOnDuty
                        ? AppColors.textMuted
                        : duty.listening
                        ? AppColors.successGreen
                        : AppColors.alertRed,
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
            if (duty.error != null) ...[
              const SizedBox(height: 18),
              _DutyProblem(
                message: duty.error!,
                onDismiss: ref.read(dutyProvider.notifier).dismissError,
              ),
            ],
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: duty.isChanging ? null : () => _setDuty(!isOnDuty),
              icon: duty.isChanging
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Icon(
                      isOnDuty
                          ? Icons.pause_circle_outline
                          : Icons.play_circle_fill,
                    ),
              label: Text(
                duty.isChanging
                    ? isOnDuty
                          ? 'Ending duty session…'
                          : 'Starting duty session…'
                    : isOnDuty
                    ? 'End duty session'
                    : 'Start duty session',
              ),
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

/// A duty change that did not take.
///
/// The old toggle discarded its own errors, which is the worst of the available
/// options: the responder reads "ON DUTY", dispatch reads off duty, and the call
/// goes to somebody else. Whatever went wrong is said here, in the terms that
/// matter to the person holding the phone.
class _DutyProblem extends StatelessWidget {
  const _DutyProblem({required this.message, required this.onDismiss});

  final String message;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(16, 14, 8, 14),
    decoration: BoxDecoration(
      color: AppColors.alertRed.withValues(alpha: .08),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: AppColors.alertRed.withValues(alpha: .35)),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(
          Icons.warning_amber_rounded,
          color: AppColors.alertRed,
          size: 20,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            message,
            style: const TextStyle(
              fontSize: 12.5,
              height: 1.35,
              fontWeight: FontWeight.w600,
              color: AppColors.alertRed,
            ),
          ),
        ),
        IconButton(
          tooltip: 'Dismiss',
          onPressed: onDismiss,
          icon: const Icon(Icons.close_rounded, size: 18),
          color: AppColors.alertRed,
        ),
      ],
    ),
  );
}
