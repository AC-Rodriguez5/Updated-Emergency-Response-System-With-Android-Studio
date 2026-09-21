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

  Future<bool> createFromIot({required Map<String, dynamic> payload}) async {
    state = EmergencyCreating();
    try {
      final em = await _repo.createFromIot(payload: payload);
      setActive(em);
      return true;
    } on ApiException catch (e) {
      if (e.statusCode == null) {
        await _syncService.queueIot(payload);
        state = EmergencyQueued();
        return true;
      }
      state = EmergencyError('Failed to send IoT emergency: ${e.message}');
      return false;
    } catch (_) {
      state = EmergencyError('Failed to send IoT emergency.');
      return false;
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
