import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_input.dart';
import '../../emergency_map/repository/emergency_repository.dart';
import '../../incident_thread/screens/incident_thread_sheet.dart';

class ReportFormScreen extends ConsumerStatefulWidget {
  final String emergencyId;
  const ReportFormScreen({super.key, required this.emergencyId});
  @override
  ConsumerState<ReportFormScreen> createState() => _ReportFormScreenState();
}

class _ReportFormScreenState extends ConsumerState<ReportFormScreen> {
  /// What a report usually says, as something to tap rather than type.
  ///
  /// A responder writing this is standing at a scene, often one-handed, often
  /// in the rain. Two taps and Send should be a complete report; typing is for
  /// the cases these lines do not cover.
  static const List<String> _situationPresets = [
    'Patient conscious and stable',
    'Patient unconscious',
    'Minor injuries, no transport needed',
    'Scene secured',
    'Fire contained',
    'Nobody found at the location',
  ];

  static const List<String> _actionPresets = [
    'First aid given',
    'Patient transported to hospital',
    'Turned over to police',
    'Waiting for ambulance',
    'No further action needed',
  ];

  final _notesCtrl = TextEditingController();
  final _situationCtrl = TextEditingController();
  final _actionCtrl = TextEditingController();
  bool _loading = false;
  bool _submitted = false;
  bool _openingChannel = false;
  String? _error;

  bool get _hasDraft =>
      !_submitted &&
      (_notesCtrl.text.trim().isNotEmpty ||
          _situationCtrl.text.trim().isNotEmpty ||
          _actionCtrl.text.trim().isNotEmpty);

  @override
  void dispose() {
    _notesCtrl.dispose();
    _situationCtrl.dispose();
    _actionCtrl.dispose();
    super.dispose();
  }

  void _append(TextEditingController controller, String text) {
    final current = controller.text.trim();
    controller.text = current.isEmpty ? text : '$current; $text';
    controller.selection = TextSelection.collapsed(
      offset: controller.text.length,
    );
    setState(() => _error = null);
  }

  Future<void> _submit() async {
    final situation = _situationCtrl.text.trim();
    final actions = _actionCtrl.text.trim();
    final notes = _notesCtrl.text.trim();

    // One filled line is a report worth having. Demanding three before anything
    // reaches dispatch is how an update ends up never being sent at all.
    if (situation.isEmpty && actions.isEmpty && notes.isEmpty) {
      setState(() => _error = 'Add at least one line, or tap one above.');
      return;
    }

    final messenger = ScaffoldMessenger.of(context);
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final note = [
        if (situation.isNotEmpty) 'Situation: $situation',
        if (actions.isNotEmpty) 'Actions: $actions',
        if (notes.isNotEmpty) 'Notes: $notes',
      ].join('\n');
      await ref
          .read(emergencyRepositoryProvider)
          .submitReport(widget.emergencyId, note);
      if (!mounted) return;
      setState(() => _submitted = true);
      Future.delayed(const Duration(seconds: 1), () {
        if (mounted) context.pop();
      });
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// The faster path when there is nothing to write down yet.
  Future<void> _openChannel() async {
    setState(() => _openingChannel = true);
    try {
      final emergency = await ref
          .read(emergencyRepositoryProvider)
          .getOne(widget.emergencyId);
      if (!mounted) return;
      await showIncidentThread(context, ref, emergency);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open the incident channel.')),
      );
    } finally {
      if (mounted) setState(() => _openingChannel = false);
    }
  }

  Future<bool> _confirmLeave() async {
    if (!_hasDraft) return true;
    final shouldLeave = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Discard report?'),
        content: const Text(
          'Your field report has unsaved text. Leave without submitting it?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep editing'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Discard'),
          ),
        ],
      ),
    );
    return shouldLeave ?? false;
  }

  Future<void> _goBack() async {
    if (await _confirmLeave() && mounted) {
      context.canPop() ? context.pop() : context.go('/map');
    }
  }

  Widget _presetRow(List<String> presets, TextEditingController controller) =>
      Wrap(
        spacing: 8,
        runSpacing: 4,
        children: [
          for (final preset in presets)
            ActionChip(
              label: Text(preset),
              labelStyle: const TextStyle(fontSize: 11.5),
              visualDensity: VisualDensity.compact,
              onPressed: _loading ? null : () => _append(controller, preset),
            ),
        ],
      );

  @override
  Widget build(BuildContext context) {
    return PopScope<Object?>(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        final shouldPop = await _confirmLeave();
        if (shouldPop && context.mounted) {
          Navigator.of(context).pop(result);
        }
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            tooltip: 'Back',
            icon: const Icon(Icons.arrow_back),
            onPressed: _goBack,
          ),
          title: const Text('Field Report'),
        ),
        body: _submitted
            ? const Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.check_circle,
                      color: AppColors.successGreen,
                      size: 64,
                    ),
                    SizedBox(height: 16),
                    Text(
                      'Sent to dispatch',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              )
            : SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.softBlue,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          const Expanded(
                            child: Text(
                              'Just need to tell dispatch something? One-tap '
                              'updates are faster than a report.',
                              style: TextStyle(fontSize: 12, height: 1.35),
                            ),
                          ),
                          const SizedBox(width: 8),
                          TextButton(
                            onPressed: _openingChannel ? null : _openChannel,
                            child: Text(
                              _openingChannel ? 'Opening…' : 'Open channel',
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    const Text(
                      'Situation on arrival',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 8),
                    _presetRow(_situationPresets, _situationCtrl),
                    const SizedBox(height: 10),
                    AppInput(
                      label: 'Situation',
                      controller: _situationCtrl,
                      maxLines: 3,
                    ),
                    const SizedBox(height: 20),
                    const Text(
                      'Actions taken',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 8),
                    _presetRow(_actionPresets, _actionCtrl),
                    const SizedBox(height: 10),
                    AppInput(
                      label: 'Actions',
                      controller: _actionCtrl,
                      maxLines: 3,
                    ),
                    const SizedBox(height: 20),
                    AppInput(
                      label: 'Anything else for dispatch (optional)',
                      controller: _notesCtrl,
                      maxLines: 3,
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        _error!,
                        style: const TextStyle(
                          color: AppColors.alertRed,
                          fontSize: 12.5,
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    AppButton(
                      label: 'Send to dispatch',
                      icon: Icons.send,
                      onPressed: _submit,
                      isLoading: _loading,
                    ),
                    const SizedBox(height: 32),
                  ],
                ),
              ),
      ),
    );
  }
}
