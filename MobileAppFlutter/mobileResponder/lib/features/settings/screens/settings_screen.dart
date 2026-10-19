import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/config/server_config.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/server_address_sheet.dart';
import '../../auth/providers/auth_provider.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final responder = ref.watch(currentResponderProvider);
    final server = ref.watch(serverConfigProvider);
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: 'Back',
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go('/duty'),
        ),
        title: const Text('Settings'),
      ),
      body: ListView(
        children: [
          if (responder != null) ...[
            ListTile(
              leading: Container(width: 40, height: 40, decoration: const BoxDecoration(color: AppColors.softBlue, shape: BoxShape.circle), child: const Icon(Icons.local_police, color: AppColors.responderBlue)),
              title: Text(responder.name),
              subtitle: Text('${responder.agencyType?.toUpperCase() ?? 'Responder'} · ${responder.stationName ?? 'Tanza'}'),
            ),
            const Divider(),
          ],
          ListTile(
            leading: const Icon(Icons.notifications_outlined),
            title: const Text('Notification Preferences'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {},
          ),
          ListTile(
            leading: const Icon(Icons.location_on_outlined),
            title: const Text('Location & Privacy'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {},
          ),
          ListTile(
            leading: const Icon(Icons.help_outline),
            title: const Text('Help & Support'),
            subtitle: const Text('Contact MDRRMO: +6346-422-2100'),
            onTap: () {},
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.dns_outlined),
            title: const Text('Server address'),
            subtitle: Text(
              server.isCustom
                  ? '${server.apiBaseUrl}\nSaved on this device'
                  : '${server.apiBaseUrl}\nFrom this build',
            ),
            isThreeLine: true,
            trailing: const Icon(Icons.chevron_right),
            onTap: () => showServerAddressSheet(context),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.logout, color: AppColors.alertRed),
            title: const Text('Sign out', style: TextStyle(color: AppColors.alertRed)),
            onTap: () => ref.read(authProvider.notifier).logout(),
          ),
        ],
      ),
    );
  }
}
