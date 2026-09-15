import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';
import 'package:geolocator/geolocator.dart';

enum EmergencyType {
  medical,
  crime,
  fire,
  generalSos,
}

extension EmergencyTypeString on EmergencyType {
  String get value {
    switch (this) {
      case EmergencyType.medical:
        return 'medical';
      case EmergencyType.crime:
        return 'crime';
      case EmergencyType.fire:
        return 'fire';
      case EmergencyType.generalSos:
        return 'general_sos';
    }
  }
}

class EmergencyProvider extends ChangeNotifier {
  EmergencyType? _activeType;
  bool _isActive = false;
  String? _activeEmergencyId;
  bool _isSubmitting = false;
  bool _isCancelled = false;

  EmergencyProvider() {
    _activeType = EmergencyType.generalSos;
    _submitEmergencyInternal(
      type: _activeType!,
      title: 'Emergency SOS',
      notes: 'Critical situation',
      location: Position(19.0, 73.0, 0, DateTime.now()),
      isHold: false,
    );
  }

  EmergencyType get activeType => _activeType ?? EmergencyType.medical;
  bool get isActive => _isActive;
  String? get activeEmergencyId => _activeEmergencyId;
  bool get isSubmitting => _isSubmitting;
  bool get isCancelled => _isCancelled;

  void _submitEmergencyInternal({
    required EmergencyType type,
    required String title,
    required String notes,
    required Position location,
    required bool isHold,
  }) async {
    _isSubmitting = true;
    notifyListeners();

    try {
      final response = await http.post(
        Uri.parse('http://localhost:5000/api/emergencies'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'type': type.value,
          'location': {
            'latitude': location.latitude,
            'longitude': location.longitude,
            'accuracy': location.accuracy,
          },
          'notes': notes,
          'source': 'mobile_app',
          'idempotencyKey': const Uuid().v4(),
        }),
      );

      if (response.statusCode == 201) {
        _activeEmergencyId = const Uuid().v4();
        _isActive = true;
        notifyListeners();
      } else {
        _isSubmitting = false;
        notifyListeners();
      }
    } catch (e) {
      _isSubmitting = false;
      notifyListeners();
      rethrow;
    }
  }

  void handleHoldToSend(EmergencyType type, String title, String notes) {
    _activeType = type;
    notifyListeners();

    _submitEmergencyInternal(
      type: type,
      title: title,
      notes: notes,
      location: Position(19.0, 73.0, 0, DateTime.now()),
      isHold: true,
    );
  }

  String? _getApiUrl() {
    return 'http://localhost:5000';
  }

  Future<void> cancelEmergency() async {
    if (_isActive && _isCancelled == false) {
      _isCancelled = true;
      notifyListeners();
    }
  }
}
