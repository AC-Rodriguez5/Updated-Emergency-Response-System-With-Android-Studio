import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:safealert_ui/safealert_ui.dart';

import '../../auth/providers/auth_provider.dart';
import '../../ble_panic_button/widgets/device_status_card.dart';
import '../providers/emergency_provider.dart';
import '../widgets/sos_hold_button.dart';

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
                eyebrow: 'In danger or not sure?',
                title: 'Hold for SOS',
                description:
                    'Alerts the MDRRMO Tanza command center with your live '
                    'location and profile. You can cancel during the countdown.',
              ),
              const SizedBox(height: 18),
              Center(
                child: SosHoldButton(
                  // The countdown is the cancel window the copy above promises.
                  onHoldComplete: () => context.push(
                    '/home/emergency/confirm?type=general_sos&countdown=5',
                  ),
                ),
              ),
              const SizedBox(height: 30),
              const TanzAlertSectionHeader(
                eyebrow: 'By dispatch priority',
                title: "Or choose what's happening",
              ),
              const SizedBox(height: 12),
              ..._EmergencyChoice.all.map(
                (choice) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _EmergencyChoiceCard(
                    choice: choice,
                    onTap: () => context.push(
                      '/home/emergency/confirm?type=${choice.type}',
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'MDRRMO coordinates with BFP and PNP Tanza when needed. '
                'You only need to tap once.',
                style: TextStyle(
                  fontSize: 11.5,
                  color: AppColors.textMuted,
                  height: 1.45,
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
                eyebrow: 'Be ready',
                title: 'What MDRRMO will receive',
                description:
                    'Sent automatically with every alert, so you never have to '
                    'explain it during one.',
              ),
              const SizedBox(height: 12),
              _ReadinessRow(
                icon: Icons.bloodtype_outlined,
                label: 'Blood type',
                value: user?.bloodType,
                missingHint: 'Not on file',
              ),
              const SizedBox(height: 8),
              _ReadinessRow(
                icon: Icons.contact_phone_outlined,
                label: 'Emergency contact',
                value: user?.emergencyContactName,
                missingHint: 'Not on file',
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

/// One of the three "what's happening" choices under the SOS button.
///
/// The order and the tier label come from the backend's own
/// `priorityFor(type)`: medical and general SOS are dispatched as `critical`,
/// fire and crime as `high`. The home screen says the same thing the dispatcher
/// will see, rather than inventing a ranking of its own.
class _EmergencyChoice {
  final String type;
  final String label;
  final String detail;
  final String tier;
  final IconData icon;
  final Color color;

  const _EmergencyChoice({
    required this.type,
    required this.label,
    required this.detail,
    required this.tier,
    required this.icon,
    required this.color,
  });

  static const all = [
    _EmergencyChoice(
      type: 'medical',
      label: 'Medical',
      detail: 'Injury, collapse, chest pain',
      tier: 'Critical',
      icon: Icons.medical_services_rounded,
      color: AppColors.alertRed,
    ),
    _EmergencyChoice(
      type: 'fire',
      label: 'Fire',
      detail: 'Smoke, gas leak, sparks',
      tier: 'High',
      icon: Icons.local_fire_department_rounded,
      color: Color(0xFFEA580C),
    ),
    _EmergencyChoice(
      // The mock labels this "Silent alert, no sound". Silent mode is not
      // built, so the copy describes what the alert is for instead of
      // promising behaviour the app does not have yet.
      type: 'crime',
      label: 'Crime',
      detail: 'Theft, assault, someone threatening you',
      tier: 'High',
      icon: Icons.local_police_rounded,
      color: Color(0xFF7C3AED),
    ),
  ];
}

class _EmergencyChoiceCard extends StatelessWidget {
  final _EmergencyChoice choice;
  final VoidCallback onTap;

  const _EmergencyChoiceCard({required this.choice, required this.onTap});

  @override
  Widget build(BuildContext context) => Material(
    color: AppColors.surface,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(16),
      side: BorderSide(color: AppColors.border),
    ),
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: choice.color.withValues(alpha: .1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(choice.icon, color: choice.color, size: 23),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    choice.label,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    choice.detail,
                    style: const TextStyle(
                      fontSize: 11.5,
                      color: AppColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: choice.color.withValues(alpha: .1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                choice.tier.toUpperCase(),
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w900,
                  letterSpacing: .7,
                  color: choice.color,
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// A single line of the "Be ready" section.
///
/// Read-only on purpose: these values are captured at registration and there
/// is no profile editor in the app yet, so the row reports what dispatch will
/// receive and flags a gap rather than linking somewhere that cannot fix it.
class _ReadinessRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? value;
  final String missingHint;

  const _ReadinessRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.missingHint,
  });

  @override
  Widget build(BuildContext context) {
    final filled = (value ?? '').trim().isNotEmpty;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Icon(
            icon,
            size: 19,
            color: filled ? AppColors.successGreen : AppColors.warningAmber,
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 12.5,
                color: AppColors.textMuted,
              ),
            ),
          ),
          Text(
            filled ? value!.trim() : missingHint,
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w800,
              color: filled ? AppColors.textStrong : AppColors.warningAmber,
            ),
          ),
        ],
      ),
    );
  }
}
