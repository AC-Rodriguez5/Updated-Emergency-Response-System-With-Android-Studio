import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:safealert_ui/safealert_ui.dart';

import 'core/config/server_config.dart';
import 'core/realtime/incident_socket.dart';
import 'core/routing/app_router.dart';
import 'features/auth/providers/auth_provider.dart';
import 'features/emergency_map/models/emergency_model.dart';
import 'features/emergency_map/providers/emergency_provider.dart';
import 'features/emergency_map/repository/emergency_repository.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Hive.initFlutter();
  await Hive.openBox<String>(ServerConfigStore.boxName);
  // Before runApp, so the very first request goes to the saved address.
  ServerConfigStore.restore();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp, DeviceOrientation.portraitDown]);
  runApp(const ProviderScope(child: TanzAlertResponderApp()));
}

class TanzAlertResponderApp extends ConsumerStatefulWidget {
  const TanzAlertResponderApp({super.key});

  @override
  ConsumerState<TanzAlertResponderApp> createState() =>
      _TanzAlertResponderAppState();
}

class _TanzAlertResponderAppState extends ConsumerState<TanzAlertResponderApp> {
  /// Lets a message that arrives while the responder is on any tab still reach
  /// the screen, rather than only the one that happened to own a socket.
  final _messengerKey = GlobalKey<ScaffoldMessengerState>();

  StreamSubscription<IncidentEvent>? _eventsSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _eventsSub = ref
          .read(incidentSocketProvider)
          .events
          .listen((event) => unawaited(_announce(event)));
      _handleAuthState(ref.read(authStateProvider));
    });
  }

  @override
  void dispose() {
    unawaited(_eventsSub?.cancel());
    super.dispose();
  }

  void _handleAuthState(AuthState state) {
    final socket = ref.read(incidentSocketProvider);
    if (state is AuthAuthenticated) {
      unawaited(socket.connect());
    } else {
      socket.disconnect();
    }
  }

  /// Puts somebody else's words on screen the moment they arrive.
  ///
  /// The event itself carries no text — dispatch-only notes must never be
  /// broadcast to the resident's app, so the payload deliberately has none —
  /// which is why the incident is re-read here before anything is shown.
  Future<void> _announce(IncidentEvent event) async {
    final me = ref.read(currentResponderProvider);
    final id = event.emergencyId;
    if (me == null || id == null) return;

    if (event.isAssignmentChange) {
      _announceAssignmentChange(event, id, me.id);
      return;
    }
    if (!event.isConversation) return;
    if (event.assignedResponderId != me.id) return;

    try {
      final emergency = await ref.read(emergencyRepositoryProvider).getOne(id);
      final latest = emergency.conversation.isEmpty
          ? null
          : emergency.conversation.last;
      // Their own message coming back around is not news.
      if (latest == null || latest.actorRole == 'responder') return;

      final who = latest.actorRole == 'user' ? 'Person in the emergency' : 'Dispatch';
      _messengerKey.currentState
        ?..clearSnackBars()
        ..showSnackBar(
          SnackBar(
            duration: const Duration(seconds: 8),
            content: Text('$who: ${latest.note ?? 'sent an update'}'),
            action: SnackBarAction(
              label: 'View',
              onPressed: () => ref.read(appRouterProvider).go('/map'),
            ),
          ),
        );
    } catch (_) {
      // A missed announcement is not worth an error: the incident channel
      // still shows the message as soon as it is opened.
    }
  }

  /// Losing an assignment has to be as visible as gaining one.
  ///
  /// A dispatcher taking an incident back used to change nothing a responder
  /// could see: the card simply stopped being theirs. Said plainly, nobody
  /// drives to a scene somebody else is already handling.
  void _announceAssignmentChange(IncidentEvent event, String id, String myId) {
    // Read before the feed catches up with the event: this is the only moment
    // the app still knows the incident used to be theirs.
    EmergencyModel? previous;
    for (final emergency in ref.read(emergencyFeedProvider)) {
      if (emergency.id == id) previous = emergency;
    }
    if (previous?.assignedResponderId != myId) return;
    // A resolution keeps the same assignee, so only the hand-over cases need
    // the "is it still mine?" test.
    if (event.name != 'emergency.resolved' && event.assignedResponderId == myId) {
      return;
    }

    final message = switch (event.name) {
      'emergency.assignment_expired' =>
        'Your assignment expired without an acknowledgement and went back to dispatch.',
      'emergency.assigned' => 'This incident was reassigned to another responder.',
      'emergency.resolved' =>
        'Dispatch marked this emergency resolved. It is now in your History.',
      _ => 'Dispatch took this incident back. It is open for anyone again.',
    };

    _messengerKey.currentState
      ?..clearSnackBars()
      ..showSnackBar(
        SnackBar(
          duration: const Duration(seconds: 6),
          backgroundColor: AppColors.command,
          content: Text(message),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AuthState>(authStateProvider, (_, next) => _handleAuthState(next));

    final router = ref.watch(appRouterProvider);
    return MaterialApp.router(
      title: 'TanzAlert Responder',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: _messengerKey,
      theme: AppTheme.light,
      routerConfig: router,
    );
  }
}
