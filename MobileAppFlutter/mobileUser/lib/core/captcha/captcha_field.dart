import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:safealert_ui/safealert_ui.dart';

import 'captcha_service.dart';

/// The handle a screen keeps on its [CaptchaField].
///
/// Create one in `initState`, dispose it, and read [token] when submitting.
class CaptchaFieldController {
  /// The box somebody types their reading of the picture into.
  final TextEditingController input = TextEditingController();

  CaptchaChallenge? _challenge;
  VoidCallback? _refresh;
  bool Function()? _check;

  /// What to send as `captchaToken`, or null when there is nothing to send —
  /// either the deployment asks for no check, or nothing has been typed yet.
  String? get token {
    final challenge = _challenge;
    final answer = input.text.trim();
    if (challenge == null || answer.isEmpty) return null;
    return challenge.tokenFor(answer);
  }

  /// Draws a new picture and clears what was typed. Call this after the backend
  /// rejects an answer: the old one has been spent either way.
  void refresh() => _refresh?.call();

  /// Whether the screen may go ahead, complaining in place if it may not.
  ///
  /// True when no check is being asked for, so a screen can call this
  /// unconditionally.
  bool validate() => _check?.call() ?? true;

  void dispose() {
    _refresh = null;
    _check = null;
    input.dispose();
  }
}

/// The security check, shown on the form rather than sprung on somebody after
/// they press the button.
///
/// Renders nothing at all unless the backend asks for its own challenge
/// ([CaptchaMode.builtin]) — under a hosted provider the screens open that
/// provider's sheet instead, and with no check at all there is nothing to draw.
class CaptchaField extends ConsumerStatefulWidget {
  const CaptchaField({
    super.key,
    required this.controller,
    this.label = 'Security check',
    this.background = AppColors.surface,
  });

  final CaptchaFieldController controller;
  final String label;

  /// The card's fill. Defaults to the usual white; a screen that already sits
  /// this inside a white panel passes the page background instead, so it reads
  /// as an inset well rather than a card stacked on a card.
  final Color background;

  @override
  ConsumerState<CaptchaField> createState() => _CaptchaFieldState();
}

class _CaptchaFieldState extends ConsumerState<CaptchaField> {
  CaptchaMode? _mode;
  bool _loading = true;
  String? _loadError;
  String? _answerError;

  @override
  void initState() {
    super.initState();
    widget.controller._refresh = _load;
    widget.controller._check = _check;
    _load();
  }

  @override
  void dispose() {
    widget.controller._refresh = null;
    widget.controller._check = null;
    super.dispose();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _loadError = null;
      _answerError = null;
    });

    final service = ref.read(captchaServiceProvider);
    final mode = await service.mode();
    if (!mounted) return;

    if (mode != CaptchaMode.builtin) {
      setState(() {
        _mode = mode;
        _loading = false;
      });
      return;
    }

    try {
      final challenge = await service.fetchChallenge();
      if (!mounted) return;
      widget.controller._challenge = challenge;
      widget.controller.input.clear();
      setState(() {
        _mode = mode;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      widget.controller._challenge = null;
      setState(() {
        _mode = mode;
        _loading = false;
        _loadError = 'Could not load the security check.';
      });
    }
  }

  bool _check() {
    if (_mode != CaptchaMode.builtin) return true;

    if (widget.controller._challenge == null) {
      setState(() => _answerError = 'Tap retry to load the security check.');
      return false;
    }
    if (widget.controller.input.text.trim().isEmpty) {
      setState(() => _answerError = 'Enter the characters shown above.');
      return false;
    }
    setState(() => _answerError = null);
    return true;
  }

  @override
  Widget build(BuildContext context) {
    // Nothing to show until the backend has been asked, and nothing to show at
    // all unless it draws its own challenge.
    if (_mode == null || _mode != CaptchaMode.builtin) {
      return const SizedBox.shrink();
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      decoration: BoxDecoration(
        color: widget.background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.verified_user_outlined,
                size: 18,
                color: AppColors.responderBlue,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  widget.label,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textStrong,
                  ),
                ),
              ),
              IconButton(
                tooltip: 'New image',
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.refresh, size: 20),
                color: AppColors.textMuted,
                onPressed: _loading ? null : _load,
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: AspectRatio(
              // Matches the picture the backend draws, so it scales to the
              // card's width without being stretched.
              aspectRatio: 3,
              child: _picture(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: widget.controller.input,
            enabled: widget.controller._challenge != null,
            textCapitalization: TextCapitalization.characters,
            autocorrect: false,
            enableSuggestions: false,
            textInputAction: TextInputAction.done,
            inputFormatters: [
              // The alphabet the backend draws from, and nothing else: a phone
              // keyboard offers plenty that could never be in the picture.
              FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]')),
              const _UpperCaseFormatter(),
            ],
            onChanged: (_) {
              if (_answerError != null) setState(() => _answerError = null);
            },
            decoration: InputDecoration(
              hintText: 'Type the characters above',
              errorText: _answerError,
              isDense: true,
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _picture() {
    if (_loading) {
      return Container(
        color: AppColors.surface,
        alignment: Alignment.center,
        child: const SizedBox(
          width: 22,
          height: 22,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }

    final challenge = widget.controller._challenge;
    if (challenge == null) {
      return Container(
        color: AppColors.softRed,
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                _loadError ?? 'The security check is unavailable.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.alertRed, fontSize: 12),
              ),
            ),
            TextButton(onPressed: _load, child: const Text('Retry')),
          ],
        ),
      );
    }

    return Semantics(
      image: true,
      label: 'Security check characters',
      child: Image.memory(
        challenge.image,
        fit: BoxFit.contain,
        // The picture is 240x80 and a phone is wider than that, so it is always
        // being scaled up.
        filterQuality: FilterQuality.medium,
        gaplessPlayback: true,
      ),
    );
  }
}

class _UpperCaseFormatter extends TextInputFormatter {
  const _UpperCaseFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    // So what somebody types reads back the same as the picture in front of
    // them. The backend does not care about case either way.
    return TextEditingValue(
      text: newValue.text.toUpperCase(),
      selection: newValue.selection,
      composing: TextRange.empty,
    );
  }
}
