import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:safealert_ui/safealert_ui.dart';

import '../../features/ambulance_assignments/screens/ambulance_detail_screen.dart';
import '../../features/ambulance_assignments/screens/ambulance_list_screen.dart';
import '../../features/auth/providers/auth_provider.dart';
import '../../features/auth/screens/login_screen.dart';
import '../../features/auth/screens/pending_approval_screen.dart';
import '../../features/auth/screens/registration_screen.dart';
import '../../features/auth/screens/splash_screen.dart';
import '../../features/duty_status/screens/duty_status_screen.dart';
import '../../features/facilities/screens/nearby_facilities_screen.dart';
import '../../features/history/screens/response_history_screen.dart';
import '../../features/emergency_map/screens/emergency_map_screen.dart';
import '../../features/response_reports/screens/report_form_screen.dart';
import '../../features/route_guidance/screens/route_guidance_screen.dart';
import '../../features/settings/screens/settings_screen.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();

final appRouterProvider = Provider<GoRouter>((ref) {
  final authNotifier = ref.watch(authProvider.notifier);
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/splash',
    refreshListenable: authNotifier,
    redirect: (context, state) {
      final authState = ref.read(authStateProvider);
      if (authState is AuthLoading || state.matchedLocation == '/splash') {
        return null;
      }
      final isLoggedIn = authState is AuthAuthenticated;
      final isPending = authState is AuthPending;
      final isOnAuth =
          state.matchedLocation.startsWith('/login') ||
          state.matchedLocation.startsWith('/register');
      if (!isLoggedIn && !isPending && !isOnAuth) return '/login';
      if (isPending && !state.matchedLocation.startsWith('/pending')) {
        return '/pending';
      }
      if (isLoggedIn && isOnAuth) return '/duty';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(path: '/register', builder: (_, _) => const RegistrationScreen()),
      GoRoute(
        path: '/pending',
        builder: (_, _) => const PendingApprovalScreen(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (_, _, navigationShell) =>
            _ResponderNavigationShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/duty',
                builder: (_, _) => const DutyStatusScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/map',
                builder: (_, _) => const EmergencyMapScreen(),
                routes: [
                  GoRoute(
                    parentNavigatorKey: _rootNavigatorKey,
                    path: 'report/:id',
                    pageBuilder: (_, state) => _page(
                      state,
                      ReportFormScreen(
                        emergencyId: state.pathParameters['id']!,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/ambulance',
                builder: (_, _) => const AmbulanceListScreen(),
                routes: [
                  GoRoute(
                    parentNavigatorKey: _rootNavigatorKey,
                    path: ':id',
                    pageBuilder: (_, state) => _page(
                      state,
                      AmbulanceDetailScreen(
                        requestId: state.pathParameters['id']!,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/history',
                builder: (_, _) => const ResponseHistoryScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/settings',
                builder: (_, _) => const SettingsScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '/facilities',
        pageBuilder: (_, state) {
          final extra = state.extra as Map<String, dynamic>? ?? {};
          return _page(
            state,
            NearbyFacilitiesScreen(
              lat: (extra['lat'] as num?)?.toDouble() ?? 14.355,
              lng: (extra['lng'] as num?)?.toDouble() ?? 120.885,
              emergencyType: extra['type'] as String? ?? 'medical',
            ),
          );
        },
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '/route',
        pageBuilder: (_, state) {
          final extra = state.extra as Map<String, dynamic>? ?? {};
          return _page(
            state,
            RouteGuidanceScreen(
              lat: (extra['lat'] as num?)?.toDouble() ?? 14.355,
              lng: (extra['lng'] as num?)?.toDouble() ?? 120.885,
              label: extra['label'] as String? ?? 'Destination',
            ),
          );
        },
      ),
    ],
    errorBuilder: (_, state) =>
        Scaffold(body: Center(child: Text('Not found: ${state.error}'))),
  );
});

CustomTransitionPage<void> _page(GoRouterState state, Widget child) =>
    CustomTransitionPage<void>(
      key: state.pageKey,
      child: child,
      transitionDuration: AppMotion.page,
      reverseTransitionDuration: AppMotion.standard,
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        if (MediaQuery.disableAnimationsOf(context)) return child;
        final curved = CurvedAnimation(
          parent: animation,
          curve: AppMotion.curve,
        );
        return FadeTransition(
          opacity: curved,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0, .025),
              end: Offset.zero,
            ).animate(curved),
            child: child,
          ),
        );
      },
    );

class _ResponderNavigationShell extends StatelessWidget {
  final StatefulNavigationShell navigationShell;

  const _ResponderNavigationShell({required this.navigationShell});

  @override
  Widget build(BuildContext context) => Scaffold(
    body: TweenAnimationBuilder<double>(
      key: ValueKey(navigationShell.currentIndex),
      tween: Tween(begin: 0, end: 1),
      duration: AppMotion.duration(context, AppMotion.standard),
      curve: AppMotion.curve,
      builder: (_, value, child) => Opacity(
        opacity: value,
        child: Transform.translate(
          offset: Offset(0, 8 * (1 - value)),
          child: child,
        ),
      ),
      child: navigationShell,
    ),
    bottomNavigationBar: NavigationBar(
      selectedIndex: navigationShell.currentIndex,
      onDestinationSelected: (index) => navigationShell.goBranch(
        index,
        initialLocation: index == navigationShell.currentIndex,
      ),
      destinations: const [
        NavigationDestination(
          icon: Icon(Icons.shield_outlined),
          selectedIcon: Icon(Icons.shield_rounded),
          label: 'Duty',
        ),
        NavigationDestination(
          icon: Icon(Icons.radar_outlined),
          selectedIcon: Icon(Icons.radar_rounded),
          label: 'Live Map',
        ),
        NavigationDestination(
          icon: Icon(Icons.emergency_outlined),
          selectedIcon: Icon(Icons.emergency_rounded),
          label: 'Ambulance',
        ),
        NavigationDestination(
          icon: Icon(Icons.history_outlined),
          selectedIcon: Icon(Icons.history_rounded),
          label: 'History',
        ),
        NavigationDestination(
          icon: Icon(Icons.settings_outlined),
          selectedIcon: Icon(Icons.settings_rounded),
          label: 'Settings',
        ),
      ],
    ),
  );
}
