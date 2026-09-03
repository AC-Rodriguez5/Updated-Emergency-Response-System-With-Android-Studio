import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:dio/dio.dart';
import '../../../../core/networking/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/status_badge.dart';
import '../models/ambulance_request_model.dart';

class AmbulanceHistoryScreen extends ConsumerStatefulWidget {
  const AmbulanceHistoryScreen({super.key});

  @override
  ConsumerState<AmbulanceHistoryScreen> createState() => _AmbulanceHistoryScreenState();
}

class _AmbulanceHistoryScreenState extends ConsumerState<AmbulanceHistoryScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  List<AmbulanceRequestModel>? _requests;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _fetch();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _fetch() async {
    setState(() { _loading = true; _error = null; });
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.get('/ambulance-requests/my', queryParameters: {'limit': 50});
      final data = (res.data as Map<String, dynamic>)['data'] as Map<String, dynamic>;
      final items = (data['items'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(AmbulanceRequestModel.fromJson)
          .toList();
      if (!mounted) return;
      setState(() {
        _requests = items;
        _loading = false;
      });
    } on DioException catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Failed to load history. Pull to retry.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final all = _requests ?? const [];
    final active = all.where((r) => r.isActive).toList();
    final past = all.where((r) => r.isClosed).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Transport Requests'),
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppColors.alertRed,
          unselectedLabelColor: AppColors.textMuted,
          indicatorColor: AppColors.alertRed,
          tabs: [
            Tab(text: 'Active (${active.length})'),
            Tab(text: 'History (${past.length})'),
          ],
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _ErrorView(message: _error!, onRetry: _fetch)
              : TabBarView(
                  controller: _tabController,
                  children: [
                    _RequestList(
                      items: active,
                      emptyTitle: 'No active requests',
                      emptyMessage: 'Submit a transport request to track its progress here.',
                      onRefresh: _fetch,
                    ),
                    _RequestList(
                      items: past,
                      emptyTitle: 'No past requests',
                      emptyMessage: 'Completed, cancelled and rejected requests appear here.',
                      onRefresh: _fetch,
                    ),
                  ],
                ),
    );
  }
}

class _RequestList extends StatelessWidget {
  final List<AmbulanceRequestModel> items;
  final String emptyTitle;
  final String emptyMessage;
  final Future<void> Function() onRefresh;

  const _RequestList({
    required this.items,
    required this.emptyTitle,
    required this.emptyMessage,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: items.isEmpty
          ? ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                const SizedBox(height: 80),
                Icon(Icons.local_shipping_outlined,
                    size: 56, color: AppColors.textMuted.withValues(alpha: 0.5)),
                const SizedBox(height: 16),
                Center(
                  child: Text(emptyTitle,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                ),
                const SizedBox(height: 6),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Text(
                    emptyMessage,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 13, color: AppColors.textMuted),
                  ),
                ),
              ],
            )
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (_, i) => _RequestCard(request: items[i]),
            ),
    );
  }
}

class _RequestCard extends StatelessWidget {
  final AmbulanceRequestModel request;
  const _RequestCard({required this.request});

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('MMM d, yyyy · h:mm a');
    final unit = request.assignedUnit;

    return InkWell(
      onTap: () => context.push('/home/ambulance/${request.id}'),
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    request.displayType,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                  ),
                ),
                StatusBadge.fromStatus(request.status),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              dateFmt.format(request.createdAt.toLocal()),
              style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
            const SizedBox(height: 12),
            _AddressRow(
              icon: Icons.my_location,
              iconColor: AppColors.alertRed,
              label: 'Pickup',
              value: request.pickupAddress,
            ),
            const SizedBox(height: 6),
            _AddressRow(
              icon: Icons.local_hospital,
              iconColor: AppColors.responderBlue,
              label: 'Drop-off',
              value: request.dropoffAddress,
            ),
            if (unit != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.directions_car, size: 14, color: AppColors.textMuted),
                    const SizedBox(width: 6),
                    Text(
                      unit.displayName,
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
                    ),
                    if ((unit.plateNumber ?? '').isNotEmpty) ...[
                      const SizedBox(width: 8),
                      Text('· ${unit.plateNumber}',
                          style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
                    ],
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _AddressRow extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String label;
  final String value;

  const _AddressRow({
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 14, color: iconColor),
        const SizedBox(width: 8),
        SizedBox(
          width: 56,
          child: Text(label,
              style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
        ),
        Expanded(
          child: Text(
            value,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12),
          ),
        ),
      ],
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 40, color: AppColors.textMuted),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
