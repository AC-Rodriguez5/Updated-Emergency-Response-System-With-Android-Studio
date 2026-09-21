import 'package:flutter/material.dart';

abstract final class AppMotion {
  static const fast = Duration(milliseconds: 160);
  static const standard = Duration(milliseconds: 200);
  static const page = Duration(milliseconds: 240);
  static const curve = Cubic(0.22, 1, 0.36, 1);

  static Duration duration(BuildContext context, Duration preferred) =>
      MediaQuery.disableAnimationsOf(context) ? Duration.zero : preferred;
}

class TanzAlertPageEntrance extends StatefulWidget {
  final Widget child;
  final double offset;

  const TanzAlertPageEntrance({
    super.key,
    required this.child,
    this.offset = 10,
  });

  @override
  State<TanzAlertPageEntrance> createState() => _TanzAlertPageEntranceState();
}

class _TanzAlertPageEntranceState extends State<TanzAlertPageEntrance>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _opacity;
  late final Animation<Offset> _position;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: AppMotion.page);
    final curved = CurvedAnimation(parent: _controller, curve: AppMotion.curve);
    _opacity = curved;
    _position = Tween<Offset>(
      begin: Offset(0, widget.offset / 100),
      end: Offset.zero,
    ).animate(curved);
    _controller.forward();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.value = 1;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
    opacity: _opacity,
    child: SlideTransition(position: _position, child: widget.child),
  );
}

class TanzAlertSignal extends StatefulWidget {
  final Color color;
  final double size;
  final bool active;
  final Widget? child;

  const TanzAlertSignal({
    super.key,
    this.color = const Color(0xFF22D3EE),
    this.size = 48,
    this.active = true,
    this.child,
  });

  @override
  State<TanzAlertSignal> createState() => _TanzAlertSignalState();
}

class _TanzAlertSignalState extends State<TanzAlertSignal>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final shouldAnimate =
        widget.active && !MediaQuery.disableAnimationsOf(context);
    if (shouldAnimate && !_controller.isAnimating) {
      _controller.repeat();
    } else if (!shouldAnimate && _controller.isAnimating) {
      _controller.stop();
      _controller.value = 0;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.disableAnimationsOf(context);
    return SizedBox.square(
      dimension: widget.size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          if (widget.active && !reduce)
            AnimatedBuilder(
              animation: _controller,
              builder: (_, __) => Container(
                width: widget.size * (.55 + _controller.value * .45),
                height: widget.size * (.55 + _controller.value * .45),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: widget.color.withValues(
                    alpha: .18 * (1 - _controller.value),
                  ),
                ),
              ),
            ),
          widget.child ??
              Container(
                width: widget.size * .42,
                height: widget.size * .42,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: widget.color,
                ),
              ),
        ],
      ),
    );
  }
}
