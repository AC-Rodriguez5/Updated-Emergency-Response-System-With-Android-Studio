import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/duty/duty_service.dart';
import '../../../core/networking/api_client.dart';
import '../../../core/realtime/incident_socket.dart';
import '../../auth/providers/auth_provider.dart';

/// What the Duty tab is allowed to claim.
///
/// The switch used to be a plain bool that flipped on tap and threw away
/// whatever the backend said: `_syncDutyStatus` caught every error and
/// discarded it, so a failed POST left the phone reading "ON DUTY" while
/// dispatch had the responder as off duty and sent the call elsewhere. A duty
/// state the responder can act on has to be the one the server holds.
class DutyState {
  const DutyState({
    this.isOnDuty = false,
    this.isChanging = false,
    this.listening = false,
    this.error,
  });

  final bool isOnDuty;

  /// A toggle in flight. The switch is held still until the server answers.
  final bool isChanging;

  /// Whether the phone will keep receiving alerts with the app closed — the
  /// duty foreground service is up.
  final bool listening;

  final String? error;

  DutyState copyWith({
    bool? isOnDuty,
    bool? isChanging,
    bool? listening,
    String? error,
    bool clearError = false,
  }) => DutyState(
    isOnDuty: isOnDuty ?? this.isOnDuty,
    isChanging: isChanging ?? this.isChanging,
    listening: listening ?? this.listening,
    error: clearError ? null : (error ?? this.error),
  );
}

class DutyNotifier extends StateNotifier<DutyState> {
  DutyNotifier(this._dio, this._socket, {bool initialOnDuty = false})
    : super(DutyState(isOnDuty: initialOnDuty)) {
    _restore(initialOnDuty);
  }

  final Dio _dio;
  final IncidentSocket _socket;

  /// Puts the app back where the shift left it.
  ///
  /// A responder who is on duty when Android reclaims the process — or who
  /// simply reboots the phone — comes back to an app that reads "OFF DUTY" and
  /// a backend that still has them on it. Worse, nothing is listening. The
  /// server's answer wins, and if it says on duty the service is started again.
  Future<void> _restore(bool initialOnDuty) async {
    final running = await DutyService.isRunning;
    if (!mounted) return;
    state = state.copyWith(listening: running);
    if (running) {
      await _socket.setDelegatedToDutyService(true);
      if (!initialOnDuty) return;
    }
    if (initialOnDuty && !running) {
      await _startListening();
    }
  }

  /// The one entry point the UI uses. [wantOnDuty] is what the responder asked
  /// for, not what the switch currently shows.
  Future<void> setOnDuty(bool wantOnDuty) async {
    if (state.isChanging) return;
    state = state.copyWith(isChanging: true, clearError: true);

    try {
      await _dio.post<dynamic>(
        '/responders/duty',
        data: {'status': wantOnDuty ? 'on_duty' : 'off_duty'},
      );
    } catch (error) {
      // The switch does not move. Dispatch's view and the responder's view of
      // whether help is available have to be the same view.
      state = state.copyWith(
        isChanging: false,
        error: wantOnDuty
            ? 'Could not go on duty — dispatch was not reachable. Check the '
                  'connection and try again.'
            : 'Could not end the duty session. You are still shown as on duty '
                  'to dispatch.',
      );
      return;
    }

    if (wantOnDuty) {
      await _startListening();
    } else {
      await _stopListening();
    }
    if (!mounted) return;
    state = state.copyWith(isOnDuty: wantOnDuty, isChanging: false);
  }

  Future<void> _startListening() async {
    final started = await DutyService.start();
    if (!mounted) return;
    if (!started) {
      // On duty as far as dispatch is concerned, but this phone will go quiet
      // the moment it is pocketed. Said plainly rather than left to be found
      // out during a call.
      state = state.copyWith(
        isOnDuty: true,
        isChanging: false,
        listening: false,
        error:
            'On duty, but notifications are blocked for TanzAlert. Alerts '
            'cannot ring on this phone until you allow them in Settings.',
      );
      return;
    }
    await _socket.setDelegatedToDutyService(true);
    if (!mounted) return;
    state = state.copyWith(listening: true);
  }

  Future<void> _stopListening() async {
    DutyService.stop();
    await _socket.setDelegatedToDutyService(false);
    if (!mounted) return;
    state = state.copyWith(listening: false);
  }

  /// Called when the app comes back to the foreground, to catch the case where
  /// the OS killed the service out from under an on-duty responder.
  Future<void> ensureListening() async {
    if (!state.isOnDuty) return;
    final running = await DutyService.isRunning;
    if (running) {
      if (!mounted) return;
      state = state.copyWith(listening: true);
      return;
    }
    await _startListening();
  }

  void dismissError() => state = state.copyWith(clearError: true);
}

final dutyProvider = StateNotifierProvider<DutyNotifier, DutyState>((ref) {
  // The server's duty status, carried on the responder record that login and
  // session restore both return.
  final responder = ref.watch(currentResponderProvider);
  return DutyNotifier(
    ref.read(dioProvider),
    ref.read(incidentSocketProvider),
    initialOnDuty: responder?.isOnDuty ?? false,
  );
});
