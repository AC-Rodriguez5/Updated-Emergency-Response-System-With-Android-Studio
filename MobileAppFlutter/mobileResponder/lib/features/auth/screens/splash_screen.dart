import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../providers/auth_provider.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});
  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    Future.delayed(const Duration(milliseconds: 1800), _navigate);
  }

  void _navigate() {
    if (!mounted) return;
    final state = ref.read(authStateProvider);
    if (state is AuthAuthenticated) {
      context.go('/duty');
    } else if (state is AuthPending) {
      context.go('/pending');
    } else {
      context.go('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(authStateProvider, (_, next) {
      if (!mounted) return;
      if (next is AuthAuthenticated) {
        context.go('/duty');
      } else if (next is AuthPending) {
        context.go('/pending');
      } else if (next is AuthUnauthenticated) {
        context.go('/login');
      }
    });
    return Scaffold(
      backgroundColor: AppColors.adminNavy,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 88, height: 88,
              decoration: BoxDecoration(color: AppColors.responderBlue, borderRadius: BorderRadius.circular(24)),
              child: const Icon(Icons.local_police, color: Colors.white, size: 48),
            ),
            const SizedBox(height: 24),
            const Text('TanzAlert', style: TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: Colors.white)),
            const SizedBox(height: 8),
            Text('Responder App', style: TextStyle(fontSize: 14, color: Colors.white.withValues(alpha: 0.6))),
            const SizedBox(height: 64),
            const CircularProgressIndicator(color: AppColors.responderBlue),
          ],
        ),
      ),
    );
  }
}
