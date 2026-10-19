import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:safealert_ui/safealert_ui.dart';

import '../../../core/constants/incident_updates.dart';
import '../../../core/realtime/incident_socket.dart';
import '../../emergency_map/models/emergency_model.dart';
import '../../emergency_map/repository/emergency_repository.dart';

/// The running conversation on one incident.
///
/// Three people can be talking about the same emergency and only one of them is
/// standing in it. A field report is written afterwards and read later; this is
/// for the two minutes while it matters — and for deciding, per line, whether
/// the person who raised the alert should hear it.
Future<void> showIncidentThread(
  BuildContext context,
  WidgetRef ref,
  EmergencyModel emergency,
) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _IncidentThreadSheet(emergency: emergency),
  );
}

class _IncidentThreadSheet extends ConsumerStatefulWidget {
  final EmergencyModel emergency;

  const _IncidentThreadSheet({required this.emergency});

  @override
  ConsumerState<_IncidentThreadSheet> createState() =>
      _IncidentThreadSheetState();
}

class _IncidentThreadSheetState extends ConsumerState<_IncidentThreadSheet> {
  final _controller = TextEditingController();
  late EmergencyModel _emergency = widget.emergency;
  bool _tellResident = false;
  bool _sending = false;
  String? _error;
  StreamSubscription<IncidentEvent>? _sub;

  @override
  void initState() {
    super.initState();
    unawaited(_refresh());
    // Without this the channel is a snapshot: a dispatcher could answer while
    // the responder is looking straight at the thread and nothing would move.
    _sub = ref.read(incidentSocketProvider).events.listen((event) {
      if (event.emergencyId == widget.emergency.id) unawaited(_refresh());
    });
  }

  @override
  void dispose() {
    unawaited(_sub?.cancel());
    _controller.dispose();
    super.dispose();
  }

  /// The incident carried in from the map can be a socket payload with no
  /// timeline on it, so the thread always re-reads the full record.
  Future<void> _refresh() async {
    try {
      final fresh = await ref
          .read(emergencyRepositoryProvider)
          .getOne(widget.emergency.id);
      if (mounted) setState(() => _emergency = fresh);
    } catch (_) {
      // Not worth an error banner: the thread still shows whatever arrived
      // with the incident, and sending does not depend on this.
    }
  }

  Future<void> _send({String? code, String? text, bool? toResident}) async {
    final message = (text ?? _controller.text).trim();
    if (message.isEmpty) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final updated = await ref
          .read(emergencyRepositoryProvider)
          .sendMessage(
            _emergency.id,
            message: message,
            audience: (toResident ?? _tellResident) ? 'all' : 'dispatch',
            code: code,
          );
      if (!mounted) return;
      setState(() {
        _emergency = updated;
        _controller.clear();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Could not send that. $e');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final entries = _emergency.conversation;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.82,
        child: Column(
          children: [
            const SizedBox(height: 12),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 10),
              child: Row(
                children: [
                  const Icon(Icons.forum_outlined, color: AppColors.responderBlue),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      '${_emergency.displayType} · incident channel',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textStrong,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Refresh',
                    icon: const Icon(Icons.refresh, size: 20),
                    onPressed: () => unawaited(_refresh()),
                  ),
                ],
              ),
            ),
            Expanded(
              child: entries.isEmpty
                  ? const Center(
                      child: Padding(
                        padding: EdgeInsets.all(32),
                        child: Text(
                          'Nothing said yet. A one-tap update below reaches '
                          'dispatch immediately.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: AppColors.textMuted),
                        ),
                      ),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                      itemCount: entries.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 10),
                      itemBuilder: (_, i) => _ThreadBubble(entry: entries[i]),
                    ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: Text(
                  _error!,
                  style: const TextStyle(
                    color: AppColors.alertRed,
                    fontSize: 12,
                  ),
                ),
              ),
            const Divider(height: 1),
            SizedBox(
              height: 46,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                itemCount: responderQuickUpdates.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (_, i) {
                  final update = responderQuickUpdates[i];
                  return ActionChip(
                    avatar: Icon(
                      update.tellResident
                          ? Icons.record_voice_over_outlined
                          : Icons.headset_mic_outlined,
                      size: 15,
                      color: update.tellResident
                          ? AppColors.successGreen
                          : AppColors.responderBlue,
                    ),
                    label: Text(update.label),
                    labelStyle: const TextStyle(fontSize: 12),
                    onPressed: _sending
                        ? null
                        : () => _send(
                            code: update.code,
                            text: update.message,
                            toResident: update.tellResident,
                          ),
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              child: Column(
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _controller,
                          minLines: 1,
                          maxLines: 3,
                          maxLength: 500,
                          textInputAction: TextInputAction.send,
                          onSubmitted: (_) => _send(),
                          decoration: const InputDecoration(
                            hintText: 'Type an update…',
                            counterText: '',
                            isDense: true,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton.filled(
                        onPressed: _sending ? null : () => _send(),
                        icon: _sending
                            ? const SizedBox.square(
                                dimension: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.send, size: 18),
                      ),
                    ],
                  ),
                  SwitchListTile.adaptive(
                    value: _tellResident,
                    onChanged: _sending
                        ? null
                        : (v) => setState(() => _tellResident = v),
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    title: const Text(
                      'Also tell the person in danger',
                      style: TextStyle(fontSize: 13),
                    ),
                    subtitle: Text(
                      _tellResident
                          ? 'They will see this on their tracking screen.'
                          : 'Dispatch and you only.',
                      style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ThreadBubble extends StatelessWidget {
  final EmergencyTimelineEvent entry;

  const _ThreadBubble({required this.entry});

  @override
  Widget build(BuildContext context) {
    final fromResident =
        entry.actorRole == 'user' || entry.event == 'user_message';
    final mine = entry.actorRole == 'responder';
    final quick = quickUpdateForCode(entry.code);
    final toResident = entry.audience == 'all';

    final (Color background, Color border, String who) = fromResident
        ? (AppColors.softRed, AppColors.alertRed, 'Person in the emergency')
        : mine
        ? (AppColors.softBlue, AppColors.responderBlue, 'You')
        : (const Color(0xFFFEF3C7), AppColors.warningAmber, 'Dispatch');

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.82,
        ),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: background,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: border.withValues(alpha: .35)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    who,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: border,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    _clock(entry.at),
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.textMuted,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                quick?.message ?? entry.note ?? _labelForEvent(entry.event),
                style: const TextStyle(
                  fontSize: 13.5,
                  height: 1.35,
                  color: AppColors.textStrong,
                ),
              ),
              if (mine || entry.actorRole == 'admin') ...[
                const SizedBox(height: 6),
                Row(
                  children: [
                    Icon(
                      toResident
                          ? Icons.record_voice_over_outlined
                          : Icons.headset_mic_outlined,
                      size: 12,
                      color: AppColors.textMuted,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      toResident ? 'Seen by the resident' : 'Dispatch only',
                      style: const TextStyle(
                        fontSize: 10.5,
                        color: AppColors.textMuted,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  static String _labelForEvent(String event) => switch (event) {
    'responder_report' => 'Field report filed.',
    'admin_update_requested' => 'Dispatch asked for an update.',
    _ => event.replaceAll('_', ' '),
  };

  static String _clock(DateTime at) {
    final local = at.toLocal();
    return '${local.hour.toString().padLeft(2, '0')}:'
        '${local.minute.toString().padLeft(2, '0')}';
  }
}
