library;

import 'package:flutter/material.dart';
import 'src/api.dart';
import 'src/diagnostics.dart';
import 'src/auth_screen.dart';
import 'src/controller.dart';
import 'src/emergency_screens.dart';
import 'src/platform_services.dart';
import 'src/support_screens.dart';
import 'src/ui.dart';
export 'src/api.dart';
export 'src/controller.dart';

Future<void> runSafeAlert(String role) async {
  WidgetsFlutterBinding.ensureInitialized();
  const url = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: Api.defaultBase,
  );
  const release = bool.fromEnvironment('dart.vm.product');
  if (release && !url.startsWith('https://')) {
    throw StateError('Release builds require an HTTPS API_BASE_URL.');
  }
  final controller = AppController(role, Api(vault: SecureVault()));
  CrashReports.install(controller.api);
  runApp(SafeAlertApp(controller: controller));
}

class SafeAlertApp extends StatefulWidget {
  final AppController controller;
  const SafeAlertApp({super.key, required this.controller});
  @override
  State<SafeAlertApp> createState() => _SafeAlertAppState();
}

class _SafeAlertAppState extends State<SafeAlertApp>
    with WidgetsBindingObserver {
  late final PlatformServices platform;
  String page = 'home';
  String? pushAccount;
  AppController get c => widget.controller;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    platform = PlatformServices(c);
    platform.attach().then((_) => c.initialize());
    c.addListener(changed);
  }

  void changed() {
    if (c.account != null && pushAccount != recordId(c.account!)) {
      pushAccount = recordId(c.account!);
      platform.registerPush();
    }
    if (c.account == null) pushAccount = null;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && c.account != null) c.sync();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    c.removeListener(changed);
    platform.dispose();
    c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'SafeAlert ${readable(c.role)}',
    debugShowCheckedModeBanner: false,
    theme: SafeAlertTheme.light,
    home: AnimatedBuilder(
      animation: c,
      builder: (context, _) {
        if (!c.ready) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        if (c.account == null) return AuthScreen(controller: c);
        return Scaffold(
          appBar: AppBar(
            title: Text(
              c.selected != null
                  ? 'Emergency detail'
                  : switch (page) {
                      'facilities' => 'Nearby facilities',
                      'devices' => 'Panic button',
                      'history' => 'Emergency history',
                      'settings' => 'Your account',
                      _ => 'SafeAlert ${readable(c.role)}',
                    },
            ),
            leading: c.selected != null
                ? IconButton(
                    tooltip: 'Back to emergencies',
                    onPressed: () {
                      c.closeIncident();
                    },
                    icon: const Icon(Icons.arrow_back),
                  )
                : null,
            actions: [
              IconButton(
                tooltip: 'Refresh',
                onPressed: c.refreshing ? null : c.sync,
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
          drawer: Drawer(
            child: SafeArea(
              child: ListView(
                children: [
                  DrawerHeader(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.health_and_safety, size: 48),
                        const SizedBox(height: 12),
                        Text(
                          '${c.account!['name']}',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        Text(readable(c.role)),
                      ],
                    ),
                  ),
                  for (final destination in {
                    'home': (Icons.home, 'Emergencies'),
                    'facilities': (Icons.local_hospital, 'Nearby facilities'),
                    if (c.role == 'user')
                      'devices': (Icons.bluetooth, 'Panic button'),
                    'history': (Icons.history, 'Emergency history'),
                    'settings': (Icons.person, 'Your account'),
                  }.entries)
                    ListTile(
                      leading: Icon(destination.value.$1),
                      title: Text(destination.value.$2),
                      selected: page == destination.key,
                      onTap: () {
                        Navigator.pop(context);
                        setState(() {
                          page = destination.key;
                          c.selectedId = null;
                        });
                      },
                    ),
                  const Divider(),
                  ListTile(
                    leading: const Icon(Icons.logout),
                    title: const Text('Sign out'),
                    onTap: () async {
                      Navigator.pop(context);
                      if (await confirmAction(
                        context,
                        'Sign out?',
                        'Location sharing and panic button monitoring will stop on this device. Existing emergencies remain active.',
                        'Sign out',
                      )) {
                        try {
                          await c.logout();
                        } catch (e) {
                          if (context.mounted) showFeedback(context, e);
                        }
                      }
                    },
                  ),
                ],
              ),
            ),
          ),
          body: c.selected != null
              ? IncidentDetail(
                  key: ValueKey(c.selectedId),
                  controller: c,
                  incident: c.selected!,
                )
              : switch (page) {
                  'facilities' => FacilitiesScreen(controller: c),
                  'devices' => DevicesScreen(controller: c, platform: platform),
                  'history' => HistoryScreen(controller: c),
                  'settings' => PageBody(
                    children: [
                      Text(
                        'Your account',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: 16),
                      Text('${c.account!['name']}'),
                      Text('${c.account!['email']}'),
                      StatusBadge('${c.account!['status']}'),
                      Text(
                        'Coverage: ${c.account!['coverageArea'] ?? 'Contact your administrator'}',
                      ),
                      const SizedBox(height: 24),
                      const Text(
                        'Location is shared only during an active emergency, while a responder is on duty, or when panic button monitoring is enabled. Turn monitoring off from the Panic button screen.',
                      ),
                      const SizedBox(height: 16),
                      OutlinedButton(
                        onPressed: platform.registerPush,
                        child: const Text('Enable notifications'),
                      ),
                      if (c.serviceWarning != null)
                        FeedbackPanel(c.serviceWarning!, warning: true),
                    ],
                  ),
                  _ => HomeScreen(controller: c),
                },
        );
      },
    ),
  );
}
