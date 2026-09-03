import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

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
    (type: 'medical', label: 'Medical', icon: Icons.medical_services, color: AppColors.alertRed),
    (type: 'crime', label: 'Crime', icon: Icons.local_police, color: Color(0xFF7C3AED)),
    (type: 'fire', label: 'Fire', icon: Icons.local_fire_department, color: Color(0xFFEA580C)),
    (type: 'general_sos', label: 'SOS', icon: Icons.sos, color: AppColors.adminNavy),
  ];

  static List<EmergencyTypeButton> all({required void Function(String type) onTap}) {
    return _buttons
        .map((b) => EmergencyTypeButton(
              type: b.type,
              label: b.label,
              icon: b.icon,
              color: b.color,
              onPressed: () => onTap(b.type),
            ))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onPressed,
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.25), width: 1.5),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              child: Icon(icon, color: Colors.white, size: 28),
            ),
            const SizedBox(height: 10),
            Text(
              label,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
