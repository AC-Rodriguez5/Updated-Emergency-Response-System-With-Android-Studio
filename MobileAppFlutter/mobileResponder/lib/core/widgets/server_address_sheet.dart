import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:safealert_ui/safealert_ui.dart';

import '../config/app_config.dart';
import '../config/server_config.dart';

/// Points the app at a different backend without a rebuild.
Future<void> showServerAddressSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => const _ServerAddressSheet(),
  );
}

class _ServerAddressSheet extends ConsumerStatefulWidget {
  const _ServerAddressSheet();

  @override
  ConsumerState<_ServerAddressSheet> createState() =>
      _ServerAddressSheetState();
}

class _ServerAddressSheetState extends ConsumerState<_ServerAddressSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _ctrl;
  bool _testing = false;
  bool _saving = false;
  ServerProbeResult? _probe;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(
      text: ref.read(serverConfigProvider).apiBaseUrl,
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _test() async {
    if (!_formKey.currentState!.validate()) return;
    final url = AppConfig.normalizeApiBaseUrl(_ctrl.text)!;
    setState(() {
      _testing = true;
      _probe = null;
    });
    final result = await ref.read(serverConfigProvider).probe(url);
    if (!mounted) return;
    setState(() {
      _testing = false;
      _probe = result;
    });
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final url = AppConfig.normalizeApiBaseUrl(_ctrl.text)!;
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);

    setState(() => _saving = true);
    await ref.read(serverConfigProvider).save(url);
    if (!mounted) return;

    navigator.pop();
    messenger.showSnackBar(SnackBar(content: Text('Now talking to $url')));
  }

  Future<void> _useBuildDefault() async {
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);

    await ref.read(serverConfigProvider).useBuildDefault();
    if (!mounted) return;

    navigator.pop();
    messenger.showSnackBar(
      SnackBar(content: Text('Back to ${AppConfig.defaultApiBaseUrl}')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final server = ref.watch(serverConfigProvider);
    final busy = _testing || _saving;

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: const [
                  Icon(Icons.dns_outlined, color: AppColors.responderBlue),
                  SizedBox(width: 10),
                  Text(
                    'Server address',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textStrong,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              const Text(
                'The backend this app signs in to. A Cloudflare quick tunnel is '
                'given a new address every time it starts, so paste the current '
                'one here rather than rebuilding the app.',
                style: TextStyle(
                  fontSize: 13,
                  color: AppColors.textMuted,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 18),
              AppInput(
                label: 'API base URL',
                hint: 'https://your-tunnel.trycloudflare.com',
                controller: _ctrl,
                keyboardType: TextInputType.url,
                validator: AppConfig.validateApiBaseUrl,
                onChanged: (_) {
                  if (_probe != null) setState(() => _probe = null);
                },
              ),
              const SizedBox(height: 8),
              const Text(
                'Leave off /api and it is added for you.',
                style: TextStyle(fontSize: 12, color: AppColors.textMuted),
              ),
              if (_probe != null) ...[
                const SizedBox(height: 14),
                _ProbeBanner(result: _probe!),
              ],
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: busy ? null : _test,
                      child: _testing
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Test'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: AppButton(
                      label: 'Save',
                      onPressed: busy ? null : _save,
                      isLoading: _saving,
                    ),
                  ),
                ],
              ),
              if (server.isCustom) ...[
                const SizedBox(height: 6),
                Center(
                  child: TextButton(
                    onPressed: busy ? null : _useBuildDefault,
                    child: Text(
                      'Use this build\'s address (${server.defaultApiBaseUrl})',
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 12),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 4),
              const Text(
                'Signed in already? Sign out and back in so the live map and '
                'assignments follow the new address.',
                style: TextStyle(
                  fontSize: 11,
                  color: AppColors.textMuted,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProbeBanner extends StatelessWidget {
  final ServerProbeResult result;

  const _ProbeBanner({required this.result});

  @override
  Widget build(BuildContext context) {
    final ok = result.reachable;
    final color = ok ? AppColors.successGreen : AppColors.alertRed;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ok ? AppColors.softGreen : AppColors.softRed,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            ok ? Icons.check_circle_outline : Icons.error_outline,
            size: 18,
            color: color,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              result.message,
              style: TextStyle(fontSize: 13, color: color, height: 1.35),
            ),
          ),
        ],
      ),
    );
  }
}
