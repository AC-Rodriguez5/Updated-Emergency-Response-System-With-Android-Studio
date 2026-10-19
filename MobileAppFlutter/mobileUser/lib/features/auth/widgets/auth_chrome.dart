import 'package:flutter/material.dart';
import 'package:safealert_ui/safealert_ui.dart';

/// The shared furniture of the signed-out screens: sign-in and both steps of
/// registration. One place, so the three of them cannot drift apart.

/// The page itself — a wash of daylight at the top, so the dark hero card has
/// something to sit on instead of a flat sheet of grey.
class AuthBackdrop extends StatelessWidget {
  const AuthBackdrop({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.fromLTRB(20, 12, 20, 32),
  });

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFE6EFFA), AppColors.background],
            stops: [0, .42],
          ),
        ),
        child: SafeArea(
          child: SingleChildScrollView(
            padding: padding,
            child: TanzAlertPageEntrance(child: child),
          ),
        ),
      ),
    );
  }
}

/// Where somebody is in a multi-step form, and the way back out of it.
///
/// Replaces an AppBar: the gradient runs to the top of the page, and a bar
/// would cut a hard grey line across it.
class AuthStepHeader extends StatelessWidget {
  const AuthStepHeader({
    super.key,
    required this.step,
    this.totalSteps = 2,
    this.onBack,
  });

  final int step;
  final int totalSteps;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Semantics(
          button: true,
          label: 'Back',
          child: InkWell(
            onTap: onBack ?? () => Navigator.maybePop(context),
            borderRadius: BorderRadius.circular(12),
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.border),
              ),
              child: const Icon(
                Icons.arrow_back,
                size: 19,
                color: AppColors.textStrong,
              ),
            ),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Semantics(
            label: 'Step $step of $totalSteps',
            child: ExcludeSemantics(
              child: Row(
                children: [
                  for (var i = 1; i <= totalSteps; i += 1) ...[
                    if (i > 1) const SizedBox(width: 6),
                    Expanded(
                      child: Container(
                        height: 5,
                        decoration: BoxDecoration(
                          color: i <= step
                              ? AppColors.responderBlue
                              : AppColors.border,
                          borderRadius: BorderRadius.circular(3),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: 14),
        ExcludeSemantics(
          child: Text(
            'Step $step of $totalSteps',
            style: Theme.of(context).textTheme.labelSmall,
          ),
        ),
      ],
    );
  }
}

/// Something went wrong, said in the same voice on every signed-out screen.
class AuthErrorBanner extends StatelessWidget {
  const AuthErrorBanner({super.key, required this.message, this.onFixServer});

  final String message;

  /// Offered only when the app could not reach the backend at all.
  final VoidCallback? onFixServer;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: AppColors.softRed,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.alertRed.withValues(alpha: .22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(
                Icons.error_outline,
                color: AppColors.alertRed,
                size: 20,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  message,
                  style: const TextStyle(
                    color: AppColors.alertRed,
                    fontSize: 14,
                    height: 1.35,
                  ),
                ),
              ),
            ],
          ),
          if (onFixServer != null)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: onFixServer,
                icon: const Icon(Icons.dns_outlined, size: 16),
                label: const Text('Change server address'),
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.alertRed,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  minimumSize: const Size(0, 34),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  textStyle: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// A quiet note that is not an error — what happens next, or a caveat about
/// where TanzAlert can actually help.
class AuthNotice extends StatelessWidget {
  const AuthNotice({
    super.key,
    required this.message,
    this.icon = Icons.info_outline,
    this.tone = AppColors.responderBlue,
    this.background = AppColors.softBlue,
  });

  final String message;
  final IconData icon;
  final Color tone;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: tone, size: 19),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(fontSize: 12.5, height: 1.4, color: tone),
            ),
          ),
        ],
      ),
    );
  }
}
