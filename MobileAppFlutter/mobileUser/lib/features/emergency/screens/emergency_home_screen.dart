import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
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
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              user?.name ?? 'TanzAlert',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            Text(
              user?.barangay != null ? '${user!.barangay}, Tanza' : 'Tanza, Cavite',
              style: const TextStyle(fontSize: 11, color: AppColors.textMuted, fontWeight: FontWeight.w400),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.history),
            tooltip: 'History',
            onPressed: () => context.push('/home/history'),
          ),
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => context.push('/home/settings'),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 16),
            if (hasActive) ...[
              _ActiveEmergencyBanner(
                status: (emergencyState).emergency.status,
                emergencyId: emergencyState.emergency.id,
                onTap: () => context.push('/home/emergency/${emergencyState.emergency.id}'),
              ),
              const SizedBox(height: 16),
            ],
            const Text('Emergency', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            const Text(
              'Tap to send emergency alert to Tanza MDRRMO',
              style: TextStyle(fontSize: 13, color: AppColors.textMuted),
            ),
            const SizedBox(height: 16),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 1.1,
              children: EmergencyTypeButton.all(
                onTap: (type) => context.push('/home/emergency/confirm?type=$type'),
              ),
            ),
            const SizedBox(height: 20),
            const Text('Ambulance Transport', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            _AmbulanceCard(onTap: (type) => context.push('/home/ambulance/new?type=$type')),
            const SizedBox(height: 16),
            const Text('Keychain Status', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            const DeviceStatusCard(),
            const SizedBox(height: 16),
            _QuickLinkRow(),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
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
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.softRed,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.alertRed.withValues(alpha: 0.3)),
        ),
        child: Row(
          children: [
            const Icon(Icons.emergency, color: AppColors.alertRed),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Active Emergency', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.alertRed)),
                  Text(status.replaceAll('_', ' ').toUpperCase(), style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: AppColors.alertRed),
          ],
        ),
      ),
    );
  }
}

class _AmbulanceCard extends StatelessWidget {
  final void Function(String type) onTap;
  const _AmbulanceCard({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.local_hospital, color: AppColors.responderBlue, size: 22),
              SizedBox(width: 8),
              Text('Request Ambulance Transport', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'MDRRMO ambulance service for Tanza residents',
            style: TextStyle(fontSize: 12, color: AppColors.textMuted),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: _AmbulanceTypeChip(label: 'Emergency', type: 'emergency', color: AppColors.alertRed, onTap: onTap)),
              const SizedBox(width: 8),
              Expanded(child: _AmbulanceTypeChip(label: 'Schedule', type: 'schedule', color: AppColors.responderBlue, onTap: onTap)),
              const SizedBox(width: 8),
              Expanded(child: _AmbulanceTypeChip(label: 'Transfer', type: 'transfer', color: AppColors.warningAmber, onTap: onTap)),
            ],
          ),
        ],
      ),
    );
  }
}

class _AmbulanceTypeChip extends StatelessWidget {
  final String label;
  final String type;
  final Color color;
  final void Function(String) onTap;

  const _AmbulanceTypeChip({required this.label, required this.type, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => onTap(type),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withValues(alpha: 0.25)),
        ),
        child: Center(
          child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color)),
        ),
      ),
    );
  }
}

class _QuickLinkRow extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _QuickLink(
            icon: Icons.local_hospital_outlined,
            label: 'Nearby\nFacilities',
            onTap: () => context.push('/home/map'),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _QuickLink(
            icon: Icons.bluetooth,
            label: 'Manage\nKeychain',
            onTap: () => context.push('/home/ble'),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _QuickLink(
            icon: Icons.history,
            label: 'My\nHistory',
            onTap: () => context.push('/home/history'),
          ),
        ),
      ],
    );
  }
}

class _QuickLink extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _QuickLink({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          children: [
            Icon(icon, color: AppColors.responderBlue, size: 22),
            const SizedBox(height: 6),
            Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11, color: AppColors.textMuted, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
