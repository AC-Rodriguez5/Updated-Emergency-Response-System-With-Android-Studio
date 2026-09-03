import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_input.dart';
import '../../emergency_map/repository/emergency_repository.dart';

class ReportFormScreen extends ConsumerStatefulWidget {
  final String emergencyId;
  const ReportFormScreen({super.key, required this.emergencyId});
  @override
  ConsumerState<ReportFormScreen> createState() => _ReportFormScreenState();
}

class _ReportFormScreenState extends ConsumerState<ReportFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _notesCtrl = TextEditingController();
  final _situationCtrl = TextEditingController();
  final _actionCtrl = TextEditingController();
  bool _loading = false;
  bool _submitted = false;

  bool get _hasDraft =>
      !_submitted &&
      (_notesCtrl.text.trim().isNotEmpty ||
          _situationCtrl.text.trim().isNotEmpty ||
          _actionCtrl.text.trim().isNotEmpty);

  @override
  void dispose() { _notesCtrl.dispose(); _situationCtrl.dispose(); _actionCtrl.dispose(); super.dispose(); }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _loading = true);
    try {
      final fullNote = 'Situation: ${_situationCtrl.text}\nActions: ${_actionCtrl.text}\nNotes: ${_notesCtrl.text}';
      await ref.read(emergencyRepositoryProvider).submitReport(widget.emergencyId, fullNote);
      setState(() => _submitted = true);
      if (mounted) Future.delayed(const Duration(seconds: 1), () { if (mounted) context.pop(); });
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<bool> _confirmLeave() async {
    if (!_hasDraft) return true;
    final shouldLeave = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Discard report?'),
        content: const Text('Your field report has unsaved text. Leave without submitting it?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep editing')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Discard')),
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
          ? const Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(Icons.check_circle, color: AppColors.successGreen, size: 64),
              SizedBox(height: 16),
              Text('Report submitted', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            ]))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Situation Assessment', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 12),
                    AppInput(label: 'Situation on arrival', controller: _situationCtrl, maxLines: 3, validator: (v) => v!.trim().isEmpty ? 'Required' : null),
                    const SizedBox(height: 16),
                    AppInput(label: 'Actions taken', controller: _actionCtrl, maxLines: 3, validator: (v) => v!.trim().isEmpty ? 'Required' : null),
                    const SizedBox(height: 16),
                    AppInput(label: 'Additional notes to admin (optional)', controller: _notesCtrl, maxLines: 3),
                    const SizedBox(height: 24),
                    AppButton(label: 'Submit Report', onPressed: _submit, isLoading: _loading),
                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),
      ),
    );
  }
}
