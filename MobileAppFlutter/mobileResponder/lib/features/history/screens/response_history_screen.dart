import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:safealert_ui/safealert_ui.dart';

import '../../emergency_map/models/emergency_model.dart';
import '../../emergency_map/repository/emergency_repository.dart';

/// The calls this responder saw through to the end.
///
/// Only incidents they were assigned to and that a dispatcher then resolved —
/// a record of work actually done, not a copy of the municipal log. The live
/// feed drops an incident the moment it closes, which is correct for a feed
/// and useless as a record; this is where it lands instead.
class ResponseHistoryScreen extends ConsumerStatefulWidget {
  const ResponseHistoryScreen({super.key});

  @override
  ConsumerState<ResponseHistoryScreen> createState() =>
      _ResponseHistoryScreenState();
}

class _ResponseHistoryScreenState extends ConsumerState<ResponseHistoryScreen> {
  List<EmergencyModel> _resolved = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await ref.read(emergencyRepositoryProvider).getHistory();
      if (!mounted) return;
      setState(() {
        _resolved = items;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load your history. $e';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Response History'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh),
            onPressed: _loading ? null : _load,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
            ? ListView(
                padding: const EdgeInsets.all(24),
                children: [
                  Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: AppColors.alertRed),
                  ),
                ],
              )
            : _resolved.isEmpty
            ? ListView(
                padding: const EdgeInsets.fromLTRB(28, 80, 28, 28),
                children: const [
                  Icon(
                    Icons.inventory_2_outlined,
                    size: 56,
                    color: AppColors.textMuted,
                  ),
                  SizedBox(height: 14),
                  Text(
                    'Nothing here yet',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textStrong,
                    ),
                  ),
                  SizedBox(height: 6),
                  Text(
                    'An emergency appears here once you were the assigned '
                    'responder and dispatch marked it resolved.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 13, color: AppColors.textMuted),
                  ),
                ],
              )
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: _resolved.length,
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (_, i) => _HistoryCard(emergency: _resolved[i]),
              ),
      ),
    );
  }
}

class _HistoryCard extends StatelessWidget {
  final EmergencyModel emergency;

  const _HistoryCard({required this.emergency});

  @override
  Widget build(BuildContext context) {
    final myReport = emergency.timeline
        .where((e) => e.event == 'responder_report')
        .toList();
    final closedAt = emergency.resolvedAt;

    return Container(
      padding: const EdgeInsets.all(14),
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
                  emergency.displayType,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: AppColors.textStrong,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.softGreen,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: const Text(
                  'RESOLVED',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: AppColors.successGreen,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            emergency.barangay ?? 'Tanza',
            style: const TextStyle(fontSize: 12.5, color: AppColors.textMuted),
          ),
          const SizedBox(height: 10),
          _Row(label: 'Reported', value: _stamp(emergency.createdAt)),
          if (closedAt != null) _Row(label: 'Resolved', value: _stamp(closedAt)),
          if (myReport.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                myReport.last.note ?? 'Field report filed.',
                style: const TextStyle(fontSize: 12.5, height: 1.35),
              ),
            ),
          ],
        ],
      ),
    );
  }

  static String _stamp(DateTime at) {
    final local = at.toLocal();
    return '${local.hour.toString().padLeft(2, '0')}:'
        '${local.minute.toString().padLeft(2, '0')} · '
        '${local.day}/${local.month}/${local.year}';
  }
}

class _Row extends StatelessWidget {
  final String label;
  final String value;

  const _Row({required this.label, required this.value});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 3),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 78,
          child: Text(
            label,
            style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(
              fontSize: 12.5,
              color: AppColors.textStrong,
            ),
          ),
        ),
      ],
    ),
  );
}
