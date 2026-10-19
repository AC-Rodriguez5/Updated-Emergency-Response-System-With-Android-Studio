import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/status_badge.dart';
import '../providers/emergency_provider.dart';

class EmergencyHistoryScreen extends ConsumerWidget {
  const EmergencyHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final historyAsync = ref.watch(myEmergenciesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Emergency History')),
      body: historyAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (list) => list.isEmpty
            ? const Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.history, size: 48, color: AppColors.textMuted),
                    SizedBox(height: 12),
                    Text(
                      'No emergency history',
                      style: TextStyle(color: AppColors.textMuted),
                    ),
                  ],
                ),
              )
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: list.length,
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (_, i) {
                  final em = list[i];
                  return GestureDetector(
                    onTap: em.isActive
                        ? () => context.push('/home/emergency/${em.id}')
                        : null,
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            em.type == 'medical'
                                ? Icons.medical_services
                                : em.type == 'fire'
                                ? Icons.local_fire_department
                                : em.type == 'crime'
                                ? Icons.local_police
                                : Icons.sos,
                            color: AppColors.alertRed,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  em.displayType,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                Text(
                                  '${em.createdAt.day}/${em.createdAt.month}/${em.createdAt.year}',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: AppColors.textMuted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          StatusBadge.fromStatus(em.status),
                        ],
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}
