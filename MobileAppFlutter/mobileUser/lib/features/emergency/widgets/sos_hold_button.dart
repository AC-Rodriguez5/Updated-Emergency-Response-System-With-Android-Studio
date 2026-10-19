import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:safealert_ui/safealert_ui.dart';

/// The home screen's primary action: an SOS that must be held, not tapped.
///
/// A hold, because this dispatches the MDRRMO command center — a phone in a
/// pocket, a child playing with it, or a thumb landing while scrolling must not
/// send a responder to someone's house. Releasing early sends nothing at all.
///
/// The filling ring is the whole interface: someone in trouble should not have
/// to read anything to know it is working, or how much longer to hold.
class SosHoldButton extends StatefulWidget {
  /// Called once, when the hold completes. The caller takes it from here —
  /// this widget deliberately knows nothing about alerts or navigation.
  final VoidCallback onHoldComplete;

  final Duration holdDuration;
  final double size;

  const SosHoldButton({
    super.key,
    required this.onHoldComplete,
    this.holdDuration = const Duration(seconds: 3),
    this.size = 188,
  });

  @override
  State<SosHoldButton> createState() => _SosHoldButtonState();
}

class _SosHoldButtonState extends State<SosHoldButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _hold = AnimationController(
    vsync: this,
    duration: widget.holdDuration,
  )..addStatusListener(_onStatus);

  /// Tracked explicitly rather than read off the controller's status.
  ///
  /// `isAnimating` flips to false without the animation's *value* changing, and
  /// the ring is rebuilt by an AnimatedBuilder that only listens for value
  /// changes — so a label driven off the status could stay on "Keep holding…"
  /// forever after a hold was abandoned.
  bool _pressed = false;

  void _onStatus(AnimationStatus status) {
    if (status != AnimationStatus.completed) return;
    // Land the hold with a strong haptic: a user staring at the screen in the
    // dark, or not looking at it at all, needs to feel that it took.
    HapticFeedback.heavyImpact();
    _hold.value = 0;
    if (mounted) setState(() => _pressed = false);
    widget.onHoldComplete();
  }

  @override
  void dispose() {
    _hold.dispose();
    super.dispose();
  }

  void _startHold() {
    HapticFeedback.selectionClick();
    setState(() => _pressed = true);
    _hold.forward(from: 0);
  }

  void _abandonHold() {
    setState(() => _pressed = false);
    if (_hold.status == AnimationStatus.completed) return;
    // Wind back quickly rather than snapping, so a slipped finger reads as
    // "that did not send" instead of as a glitch.
    _hold.animateBack(0, duration: const Duration(milliseconds: 180));
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      // A screen reader should announce one button with its instructions, not
      // three fragments ("SOS", "Hold 3 seconds", and an unlabelled progress
      // ring). container + excludeSemantics collapses the subtree into one
      // node carrying the label below.
      container: true,
      excludeSemantics: true,
      label: 'SOS. Press and hold for three seconds to alert MDRRMO Tanza.',
      child: GestureDetector(
        onTapDown: (_) => _startHold(),
        onTapUp: (_) => _abandonHold(),
        onTapCancel: _abandonHold,
        child: AnimatedBuilder(
          animation: _hold,
          builder: (context, _) {
            final progress = _hold.value;
            return SizedBox(
              width: widget.size,
              height: widget.size,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  // Ring: unobtrusive track, alert-red fill as the hold builds.
                  SizedBox.expand(
                    child: CircularProgressIndicator(
                      value: progress,
                      strokeWidth: 9,
                      backgroundColor: AppColors.alertRed.withValues(
                        alpha: .14,
                      ),
                      valueColor: const AlwaysStoppedAnimation(
                        AppColors.alertRed,
                      ),
                    ),
                  ),
                  Container(
                    width: widget.size - 34,
                    height: widget.size - 34,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppColors.alertRed,
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.alertRed.withValues(alpha: .38),
                          blurRadius: progress > 0 ? 34 : 20,
                          offset: const Offset(0, 10),
                        ),
                      ],
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Text(
                          'SOS',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 44,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 2,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _pressed ? 'Keep holding…' : 'Hold 3 seconds',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: .92),
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            letterSpacing: .4,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
