import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:hive/hive.dart';

import '../models/emergency_model.dart';
import '../repository/emergency_repository.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/services/offline_sync_service.dart';

sealed class EmergencyState {}

class EmergencyIdle extends EmergencyState {}

class EmergencyCreating extends EmergencyState {}

class EmergencyQueued extends EmergencyState {}

class EmergencyActive extends EmergencyState {
  final EmergencyModel emergency;
  EmergencyActive(this.emergency);
}

class EmergencyError extends EmergencyState {
  final String message;
  EmergencyError(this.message);
}

/// Outcome of relaying one hardware alert to the backend.
class IotDelivery {
  /// False only when the wearable should keep the alert queued and retry.
  final bool accepted;

  /// The server-side incident, when one was created on this attempt.
  final EmergencyModel? emergency;

  const IotDelivery({required this.accepted, this.emergency});
}

class EmergencyNotifier extends StateNotifier<EmergencyState> {
  static const _activeEmergencyCacheKey = 'active_emergency';

  final EmergencyRepository _repo;
  final OfflineSyncService _syncService;
  final Box<String> _activeEmergencyBox;

  EmergencyNotifier(this._repo, this._syncService, this._activeEmergencyBox)
    : super(_initialState(_activeEmergencyBox));

  static EmergencyState _initialState(Box<String> box) {
    final raw = box.get(_activeEmergencyCacheKey);
    if (raw == null) return EmergencyIdle();
    try {
      final emergency = EmergencyModel.fromJson(
        jsonDecode(raw) as Map<String, dynamic>,
      );
      return emergency.isActive ? EmergencyActive(emergency) : EmergencyIdle();
    } catch (_) {
      return EmergencyIdle();
    }
  }

  Future<void> loadActiveEmergency() async {
    try {
      final emergency = await _repo.getCurrentActiveEmergency();
      if (emergency == null) {
        if (state is! EmergencyQueued) reset();
        return;
      }
      setActive(emergency);
    } catch (_) {
      // Keep the cached active emergency visible when the network is unavailable.
    }
  }

  Future<void> refreshEmergency(String emergencyId, {String? status}) async {
    final current = state is EmergencyActive
        ? (state as EmergencyActive).emergency
        : null;

    if (_isTerminalStatus(status)) {
      if (current?.id == emergencyId) reset();
      return;
    }

    try {
      final emergency = await _repo.getEmergency(emergencyId);
      if (emergency.isActive) {
        setActive(emergency);
      } else if (current?.id == emergencyId) {
        reset();
      }
    } catch (_) {
      await loadActiveEmergency();
    }
  }

  Future<EmergencyModel?> createEmergency({
    required String type,
    required Position location,
    String? barangay,
    String? notes,
  }) async {
    state = EmergencyCreating();
    try {
      final em = await _repo.createEmergency(
        type: type,
        location: location,
        barangay: barangay,
        notes: notes,
      );
      setActive(em);
      return em;
    } on ApiException catch (e) {
      if (e.statusCode == null) {
        _syncService.queueManual(
          type: type,
          location: location,
          barangay: barangay,
          notes: notes,
        );
        state = EmergencyQueued();
        return null;
      }
      state = EmergencyError(e.message);
      return null;
    } catch (_) {
      state = EmergencyError(
        'Failed to send emergency. Check your connection.',
      );
      return null;
    }
  }

  /// Delivers a hardware panic-button alert.
  ///
  /// Returns [IotDelivery.accepted] false only when the alert must stay on the
  /// wearable for a later retry. A network failure still counts as accepted: the
  /// payload is handed to the offline queue, so re-sending it from the device
  /// would duplicate it. [IotDelivery.emergency] is null in exactly that case,
  /// because no server-side incident exists yet to report a revision for.
  Future<IotDelivery> createFromIot({
    required Map<String, dynamic> payload,
  }) async {
    state = EmergencyCreating();
    try {
      final em = await _repo.createFromIot(payload: payload);
      setActive(em);
      return IotDelivery(accepted: true, emergency: em);
    } on ApiException catch (e) {
      if (e.statusCode == null) {
        await _syncService.queueIot(payload);
        state = EmergencyQueued();
        return const IotDelivery(accepted: true);
      }
      state = EmergencyError('Failed to send IoT emergency: ${e.message}');
      return const IotDelivery(accepted: false);
    } catch (_) {
      state = EmergencyError('Failed to send IoT emergency.');
      return const IotDelivery(accepted: false);
    }
  }

  /// Relays one GNSS fix from the wearable and reports back what the server says.
  ///
  /// Returns null when the fix could not be delivered, which leaves the wearable
  /// transmitting — the safe default, since a lost reply must never be read as
  /// "the incident is closed".
  Future<EmergencyModel?> sendIotLocation({
    required Map<String, dynamic> payload,
  }) async {
    try {
      final em = await _repo.sendIotLocation(payload: payload);
      if (em.isActive) {
        setActive(em);
      } else {
        reset();
      }
      return em;
    } catch (_) {
      return null;
    }
  }

  void setActive(EmergencyModel em) {
    if (!em.isActive) {
      reset();
      return;
    }
    unawaited(
      _activeEmergencyBox.put(
        _activeEmergencyCacheKey,
        jsonEncode(em.toJson()),
      ),
    );
    state = EmergencyActive(em);
  }

  void reset() {
    unawaited(_activeEmergencyBox.delete(_activeEmergencyCacheKey));
    state = EmergencyIdle();
  }

  static bool _isTerminalStatus(String? status) {
    return status == 'resolved' || status == 'cancelled';
  }
}

final emergencyProvider =
    StateNotifierProvider<EmergencyNotifier, EmergencyState>(
      (ref) => EmergencyNotifier(
        ref.read(emergencyRepositoryProvider),
        ref.read(offlineSyncServiceProvider),
        Hive.box<String>('active_emergency'),
      ),
    );

final myEmergenciesProvider = FutureProvider<List<EmergencyModel>>((ref) {
  return ref.read(emergencyRepositoryProvider).getMyEmergencies();
});
