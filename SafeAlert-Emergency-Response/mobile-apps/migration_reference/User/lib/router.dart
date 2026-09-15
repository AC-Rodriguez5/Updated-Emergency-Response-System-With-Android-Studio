import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'emergency_dashboard.dart';
import 'app_provider.dart';
import 'providers/emergency_provider.dart';

GoRouter router = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(
      path: '/',
      name: 'home',
      builder: (context, state) {
        return Consumer<EmergencyProvider>(
          builder: (context, emergency, _) {
            if (emergency.isActive) {
              return ActiveEmergencyScreen(emergencyId: emergency.activeEmergencyId!);
            }
            return const EmergencyDashboard();
          },
        );
      },
    ),
  ],
);
