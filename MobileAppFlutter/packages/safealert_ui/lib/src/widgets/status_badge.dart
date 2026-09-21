import 'package:flutter/material.dart';

import '../colors.dart';

class StatusBadge extends StatelessWidget {
  final String label;
  final Color backgroundColor;
  final Color textColor;

  const StatusBadge({
    super.key,
    required this.label,
    this.backgroundColor = AppColors.softBlue,
    this.textColor = AppColors.responderBlue,
  });

  factory StatusBadge.pending() => const StatusBadge(
    label: 'PENDING',
    backgroundColor: Color(0xFFFFF4D7),
    textColor: Color(0xFF9A6200),
  );

  factory StatusBadge.approved() => const StatusBadge(
    label: 'APPROVED',
    backgroundColor: AppColors.softGreen,
    textColor: Color(0xFF11753A),
  );

  factory StatusBadge.rejected() => const StatusBadge(
    label: 'REJECTED',
    backgroundColor: AppColors.softRed,
    textColor: AppColors.alertRed,
  );

  factory StatusBadge.priority(String priority) => switch (priority) {
    'critical' => const StatusBadge(
      label: 'CRITICAL',
      backgroundColor: AppColors.softRed,
      textColor: AppColors.alertRed,
    ),
    'high' => const StatusBadge(
      label: 'HIGH',
      backgroundColor: Color(0xFFFFF4D7),
      textColor: Color(0xFF9A6200),
    ),
    _ => const StatusBadge(label: 'MEDIUM'),
  };

  factory StatusBadge.fromStatus(String status) => switch (status) {
    'pending' || 'pending_review' => StatusBadge.pending(),
    'approved' ||
    'accepted' ||
    'completed' ||
    'resolved' => StatusBadge.approved(),
    'rejected' || 'cancelled' => StatusBadge.rejected(),
    'on_the_way' || 'responder_on_the_way' => const StatusBadge(
      label: 'ON THE WAY',
      backgroundColor: AppColors.softCyan,
      textColor: Color(0xFF087B8B),
    ),
    'assigned' => const StatusBadge(label: 'ASSIGNED'),
    'submitted' => const StatusBadge(label: 'SUBMITTED'),
    'needs_update' => const StatusBadge(
      label: 'NEEDS UPDATE',
      backgroundColor: Color(0xFFFFF4D7),
      textColor: Color(0xFF9A6200),
    ),
    _ => StatusBadge(label: status.toUpperCase()),
  };

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Status: $label',
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w800,
          letterSpacing: .35,
          color: textColor,
        ),
      ),
    ),
  );
}
