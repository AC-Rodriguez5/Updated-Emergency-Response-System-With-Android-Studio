import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:safealert_ui/safealert_ui.dart';

import '../../features/ambulance_transport/screens/ambulance_form_screen.dart';
import '../../features/ambulance_transport/screens/ambulance_tracking_screen.dart';
import '../../features/auth/providers/auth_provider.dart';
import '../../features/auth/screens/login_screen.dart';
import '../../features/auth/screens/pending_approval_screen.dart';
import '../../features/auth/screens/registration_step1_screen.dart';
import '../../features/auth/screens/registration_step2_screen.dart';
import '../../features/auth/screens/splash_screen.dart';
import '../../features/ble_panic_button/screens/ble_pairing_screen.dart';
import '../../features/emergency/screens/active_emergency_screen.dart';
import '../../features/emergency/screens/emergency_confirmation_screen.dart';
import '../../features/emergency/screens/emergency_history_screen.dart';
import '../../features/emergency/screens/emergency_home_screen.dart';
import '../../features/map/screens/nearby_facilities_screen.dart';
import '../../features/settings/screens/settings_screen.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();

final appRouterProvider = Provider<GoRouter>((ref) {
  final authNotifier = ref.watch(authProvider.notifier);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/splash',
    refreshListenable: authNotifier,
    redirect: (context, state) {
      final authState = authNotifier.state;
      final isLoading = authState is AuthLoading;
      final isSplash = state.matchedLocation == '/splash';
      if (isLoading || isSplash) return null;

      final isLoggedIn = authState is AuthAuthenticated;
      final isPending = authState is AuthPending;
      final isOnAuth =
          state.matchedLocation.startsWith('/login') ||
          state.matchedLocation.startsWith('/register');

      if (!isLoggedIn && !isPending && !isOnAuth) return '/login';
      if (isPending && !state.matchedLocation.startsWith('/pending')) {
        return '/pending';
      }
      if (isLoggedIn && isOnAuth) return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(
        path: '/register',
        builder: (_, _) => const RegistrationStep1Screen(),
      ),
      GoRoute(
        path: '/register/step2',
        builder: (_, state) => RegistrationStep2Screen(
          step1Data: state.extra as Map<String, dynamic>? ?? {},
        ),
      ),
      GoRoute(
        path: '/pending',
        builder: (_, _) => const PendingApprovalScreen(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (_, _, navigationShell) =>
            _UserNavigationShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/home',
                builder: (_, _) => const EmergencyHomeScreen(),
                routes: [
                  GoRoute(
                    parentNavigatorKey: _rootNavigatorKey,
                    path: 'emergency/confirm',
                    pageBuilder: (_, state) => _page(
                      state,
                      EmergencyConfirmationScreen(
                        emergencyType:
                            state.uri.queryParameters['type'] ?? 'general_sos',
                      ),
                    ),
                  ),
                  GoRoute(
                    parentNavigatorKey: _rootNavigatorKey,
                    path: 'emergency/:id',
                    pageBuilder: (_, state) => _page(
                      state,
                      ActiveEmergencyScreen(
                        emergencyId: state.pathParameters['id']!,
                      ),
                    ),
                  ),
                  GoRoute(path: 'history', redirect: (_, _) => '/activity'),
                  GoRoute(
                    parentNavigatorKey: _rootNavigatorKey,
                    path: 'ambulance/new',
                    pageBuilder: (_, state) => _page(
                      state,
                      AmbulanceFormScreen(
                        requestType:
                            state.uri.queryParameters['type'] ?? 'emergency',
                      ),
                    ),
                  ),
                  GoRoute(
                    parentNavigatorKey: _rootNavigatorKey,
                    path: 'ambulance/:id',
                    pageBuilder: (_, state) => _page(
                      state,
                      AmbulanceTrackingScreen(
                        requestId: state.pathParameters['id']!,
                      ),
                    ),
                  ),
                  GoRoute(path: 'ble', redirect: (_, _) => '/device'),
                  GoRoute(path: 'map', redirect: (_, _) => '/facilities'),
                  GoRoute(
                    parentNavigatorKey: _rootNavigatorKey,
                    path: 'settings',
                    pageBuilder: (_, state) =>
                        _page(state, const SettingsScreen()),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/activity',
                builder: (_, _) => const EmergencyHistoryScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/facilities',
                builder: (_, _) => const NearbyFacilitiesScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/device',
                builder: (_, _) => const BlePairingScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
    errorBuilder: (_, state) =>
        Scaffold(body: Center(child: Text('Page not found: ${state.error}'))),
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

class _UserNavigationShell extends StatelessWidget {
  final StatefulNavigationShell navigationShell;

  const _UserNavigationShell({required this.navigationShell});

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
          icon: Icon(Icons.home_outlined),
          selectedIcon: Icon(Icons.home_rounded),
          label: 'Home',
        ),
        NavigationDestination(
          icon: Icon(Icons.timeline_outlined),
          selectedIcon: Icon(Icons.timeline_rounded),
          label: 'Activity',
        ),
        NavigationDestination(
          icon: Icon(Icons.map_outlined),
          selectedIcon: Icon(Icons.map_rounded),
          label: 'Facilities',
        ),
        NavigationDestination(
          icon: Icon(Icons.watch_outlined),
          selectedIcon: Icon(Icons.watch_rounded),
          label: 'Device',
        ),
      ],
    ),
  );
}
