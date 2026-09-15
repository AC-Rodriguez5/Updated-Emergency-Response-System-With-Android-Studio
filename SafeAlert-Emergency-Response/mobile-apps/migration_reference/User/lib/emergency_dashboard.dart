import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'providers/emergency_provider.dart';
import 'providers/location_provider.dart';
import 'app_provider.dart';

class EmergencyDashboard extends StatelessWidget {
  const EmergencyDashboard({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Emergency Alert'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.share),
            onPressed: () {
              final emergencyProvider = context.read<EmergencyProvider>();
              context.push('/emergency/${emergencyProvider.activeEmergencyId}', extra: {
                'emergencyType': emergencyProvider.activeType.value,
                'isEmergencyActive': true,
              });
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: EmergencyDashboardGrid(),
          ),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            onPressed: () {
              context.read<EmergencyProvider>().cancelEmergency();
            },
            icon: const Icon(Icons.close),
            label: const Text('Cancel Emergency'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}

class EmergencyDashboardGrid extends StatelessWidget {
  const EmergencyDashboardGrid({super.key});

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisSpacing: 16,
      mainAxisSpacing: 16,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      children: [
        _EmergencyButton(
          type: EmergencyType.medical,
          title: 'Medical',
          icon: Icons.person_injury,
          color: Colors.blue,
        ),
        _EmergencyButton(
          type: EmergencyType.crime,
          title: 'Crime',
          icon: Icons.warning,
          color: Colors.red,
        ),
        _EmergencyButton(
          type: EmergencyType.fire,
          title: 'Fire',
          icon: Icons.local_fire_department,
          color: Colors.orange,
        ),
        _EmergencyButton(
          type: EmergencyType.generalSos,
          title: 'General SOS',
          icon: Icons.emergency,
          color: Colors.red,
        ),
      ],
    );
  }
}

class _EmergencyButton extends StatelessWidget {
  final EmergencyType type;
  final String title;
  final IconData icon;
  final Color color;

  const _EmergencyButton({
    required this.type,
    required this.title,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 4,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      child: InkWell(
        onTap: () {
          _handleTap(context);
        },
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 40,
              color: color,
            ),
            const SizedBox(height: 8),
            Text(
              title,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.black,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _handleTap(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (context) {
        return Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Send $title Emergency?',
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: Colors.black,
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'Location will be automatically recorded.',
                style: TextStyle(
                  color: Colors.grey,
                ),
              ),
              const SizedBox(height: 32),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        final location = context.read<LocationProvider>().position;
                        context.read<EmergencyProvider>().handleHoldToSend(
                          type,
                          title,
                          '',
                          location,
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.orange,
                        foregroundColor: Colors.white,
                      ),
                      child: const Text(
                        'Hold for SOS',
                        style: TextStyle(fontSize: 16),
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        final location = context.read<LocationProvider>().position;
                        context.read<EmergencyProvider>().handleHoldToSend(
                          type,
                          title,
                          '',
                          location,
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.blue,
                        foregroundColor: Colors.white,
                      ),
                      child: const Text(
                        'Tap to SOS',
                        style: TextStyle(fontSize: 16),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}
