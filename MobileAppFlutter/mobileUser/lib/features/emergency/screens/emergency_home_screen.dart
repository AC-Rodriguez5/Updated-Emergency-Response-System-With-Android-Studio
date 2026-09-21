import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:safealert_ui/safealert_ui.dart';

import '../../auth/providers/auth_provider.dart';
import '../../ble_panic_button/widgets/device_status_card.dart';
import '../providers/emergency_provider.dart';
import '../widgets/emergency_button.dart';

class EmergencyHomeScreen extends ConsumerWidget {
  const EmergencyHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final emergencyState = ref.watch(emergencyProvider);
    final hasActive = emergencyState is EmergencyActive;

    return Scaffold(
      appBar: AppBar(
        title: const Text('TanzAlert'),
        actions: [
          IconButton(
            tooltip: 'Settings',
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => context.push('/home/settings'),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: TanzAlertPageEntrance(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _CommandWelcome(
                name: user?.name ?? 'Tanza resident',
                location: user?.barangay != null
                    ? '${user!.barangay}, Tanza'
                    : 'Tanza, Cavite',
                hasActive: hasActive,
              ),
              if (hasActive) ...[
                const SizedBox(height: 14),
                _ActiveEmergencyBanner(
                  status: emergencyState.emergency.status,
                  emergencyId: emergencyState.emergency.id,
                  onTap: () => context.push(
                    '/home/emergency/${emergencyState.emergency.id}',
                  ),
                ),
              ],
              const SizedBox(height: 26),
              const TanzAlertSectionHeader(
                eyebrow: 'Immediate assistance',
                title: 'What do you need?',
                description:
                    'Choose the emergency type. You will confirm before anything is sent.',
              ),
              const SizedBox(height: 14),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 1.12,
                children: EmergencyTypeButton.all(
                  onTap: (type) =>
                      context.push('/home/emergency/confirm?type=$type'),
                ),
              ),
              const SizedBox(height: 28),
              const TanzAlertSectionHeader(
                eyebrow: 'Transport',
                title: 'Ambulance service',
                description:
                    'Emergency pickup, scheduled trips, and transfers.',
              ),
              const SizedBox(height: 12),
              _AmbulanceCard(
                onTap: (type) => context.push('/home/ambulance/new?type=$type'),
              ),
              const SizedBox(height: 28),
              const TanzAlertSectionHeader(
                eyebrow: 'Connected protection',
                title: 'Wearable status',
              ),
              const SizedBox(height: 12),
              const DeviceStatusCard(),
            ],
          ),
        ),
      ),
    );
  }
}

class _CommandWelcome extends StatelessWidget {
  final String name;
  final String location;
  final bool hasActive;

  const _CommandWelcome({
    required this.name,
    required this.location,
    required this.hasActive,
  });

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(20),
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
    child: Row(
      children: [
        TanzAlertSignal(
          active: !hasActive,
          color: hasActive ? AppColors.alertRed : AppColors.signalCyan,
          size: 58,
          child: Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: hasActive ? AppColors.alertRed : AppColors.signalCyan,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              hasActive ? Icons.emergency_rounded : Icons.shield_rounded,
              color: AppColors.command,
              size: 21,
            ),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                hasActive ? 'Emergency response active' : 'Protection ready',
                style: const TextStyle(
                  color: AppColors.signalCyan,
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.2,
                ),
              ),
              const SizedBox(height: 5),
              Text(
                name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 3),
              Row(
                children: [
                  const Icon(
                    Icons.location_on_outlined,
                    color: Colors.white54,
                    size: 14,
                  ),
                  const SizedBox(width: 3),
                  Flexible(
                    child: Text(
                      location,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white60,
                        fontSize: 11,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _ActiveEmergencyBanner extends StatelessWidget {
  final String status;
  final String emergencyId;
  final VoidCallback onTap;

  const _ActiveEmergencyBanner({
    required this.status,
    required this.emergencyId,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => Material(
    color: AppColors.softRed,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(16),
      side: BorderSide(color: AppColors.alertRed.withValues(alpha: .24)),
    ),
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.all(15),
        child: Row(
          children: [
            const TanzAlertSignal(
              color: AppColors.alertRed,
              size: 38,
              child: Icon(
                Icons.emergency_rounded,
                color: AppColors.alertRed,
                size: 22,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Open active emergency',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: AppColors.alertRed,
                    ),
                  ),
                  Text(
                    status.replaceAll('_', ' ').toUpperCase(),
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: .6,
                      color: AppColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.arrow_forward_rounded, color: AppColors.alertRed),
          ],
        ),
      ),
    ),
  );
}

class _AmbulanceCard extends StatelessWidget {
  final void Function(String type) onTap;
  const _AmbulanceCard({required this.onTap});

  @override
  Widget build(BuildContext context) => TanzAlertPanel(
    child: Column(
      children: [
        Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.command,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(
                Icons.emergency_rounded,
                color: AppColors.signalCyan,
              ),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'MDRRMO transport',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                  Text(
                    'Select a service type',
                    style: TextStyle(fontSize: 11, color: AppColors.textMuted),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: _AmbulanceTypeChip(
                label: 'Emergency',
                type: 'emergency',
                color: AppColors.alertRed,
                onTap: onTap,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _AmbulanceTypeChip(
                label: 'Schedule',
                type: 'schedule',
                color: AppColors.responderBlue,
                onTap: onTap,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _AmbulanceTypeChip(
                label: 'Transfer',
                type: 'transfer',
                color: AppColors.warningAmber,
                onTap: onTap,
              ),
            ),
          ],
        ),
      ],
    ),
  );
}

class _AmbulanceTypeChip extends StatelessWidget {
  final String label;
  final String type;
  final Color color;
  final void Function(String) onTap;

  const _AmbulanceTypeChip({
    required this.label,
    required this.type,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => Material(
    color: color.withValues(alpha: .07),
    borderRadius: BorderRadius.circular(10),
    child: InkWell(
      onTap: () => onTap(type),
      borderRadius: BorderRadius.circular(10),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 48),
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
        ),
      ),
    ),
  );
}
