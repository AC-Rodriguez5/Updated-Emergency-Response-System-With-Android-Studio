import 'package:flutter/material.dart';

import '../colors.dart';
import '../motion.dart';

class AppButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;
  final Color? backgroundColor;
  final Color? foregroundColor;
  final IconData? icon;

  const AppButton({
    super.key,
    required this.label,
    this.onPressed,
    this.isLoading = false,
    this.backgroundColor,
    this.foregroundColor,
    this.icon,
  });

  @override
  Widget build(BuildContext context) => AnimatedScale(
    scale: onPressed == null ? .99 : 1,
    duration: AppMotion.duration(context, AppMotion.fast),
    child: ElevatedButton(
      onPressed: isLoading ? null : onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: backgroundColor ?? AppColors.responderBlue,
        foregroundColor: foregroundColor ?? Colors.white,
      ),
      child: AnimatedSwitcher(
        duration: AppMotion.duration(context, AppMotion.fast),
        child: isLoading
            ? const SizedBox.square(
                key: ValueKey('loading'),
                dimension: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : Row(
                key: ValueKey(label),
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 19),
                    const SizedBox(width: 8),
                  ],
                  Flexible(child: Text(label)),
                ],
              ),
      ),
    ),
  );
}

class AppOutlinedButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;

  const AppOutlinedButton({super.key, required this.label, this.onPressed});

  @override
  Widget build(BuildContext context) =>
      OutlinedButton(onPressed: onPressed, child: Text(label));
}
