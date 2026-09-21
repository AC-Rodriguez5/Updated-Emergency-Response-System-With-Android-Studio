import 'package:flutter/material.dart';
import 'package:safealert_ui/safealert_ui.dart';

class EmergencyTypeButton extends StatelessWidget {
  final String type;
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onPressed;

  const EmergencyTypeButton({
    super.key,
    required this.type,
    required this.label,
    required this.icon,
    required this.color,
    required this.onPressed,
  });

  static const _buttons = [
    (
      type: 'medical',
      label: 'Medical',
      icon: Icons.medical_services_rounded,
      color: AppColors.alertRed,
    ),
    (
      type: 'crime',
      label: 'Crime',
      icon: Icons.local_police_rounded,
      color: Color(0xFF7C3AED),
    ),
    (
      type: 'fire',
      label: 'Fire',
      icon: Icons.local_fire_department_rounded,
      color: Color(0xFFEA580C),
    ),
    (
      type: 'general_sos',
      label: 'General SOS',
      icon: Icons.sos_rounded,
      color: AppColors.command,
    ),
  ];

  static List<EmergencyTypeButton> all({
    required void Function(String type) onTap,
  }) => _buttons
      .map(
        (button) => EmergencyTypeButton(
          type: button.type,
          label: button.label,
          icon: button.icon,
          color: button.color,
          onPressed: () => onTap(button.type),
        ),
      )
      .toList();

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: 'Report $label emergency',
    child: Material(
      color: color.withValues(alpha: .065),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: color.withValues(alpha: .18)),
      ),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(13),
                  boxShadow: [
                    BoxShadow(
                      color: color.withValues(alpha: .2),
                      blurRadius: 16,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: Icon(icon, color: Colors.white, size: 24),
              ),
              const Spacer(),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: color,
                ),
              ),
              const SizedBox(height: 2),
              const Text(
                'Tap to continue',
                style: TextStyle(fontSize: 10, color: AppColors.textMuted),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
