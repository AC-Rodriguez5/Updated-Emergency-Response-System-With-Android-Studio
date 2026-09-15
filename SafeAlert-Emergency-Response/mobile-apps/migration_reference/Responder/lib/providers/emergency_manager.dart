import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';
import 'package:geolocator/geolocator.dart';

class EmergencyManagerProvider extends ChangeNotifier {
  Map<String, dynamic> _emergencies = {};
  String? _selectedEmergencyId;
  bool _isSubmitting = false;

  Map<String, dynamic> get emergencies => _emergencies;
  String? get selectedEmergencyId => _selectedEmergencyId;

  EmergencyManagerProvider() {
    _loadEmergencies();
  }

  Future<void> _loadEmergencies() async {
    try {
      final response = await http.get(
        Uri.parse('http://localhost:5000/api/alerts'),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        _emergencies = data['data'] as List? ?? {};
        notifyListeners();
      }
    } catch (e) {
      notifyListeners();
    }
  }

  Future<void> markOnTheWay(String emergencyId) async {
    _isSubmitting = true;
    notifyListeners();

    try {
      final response = await http.patch(
        Uri.parse('http://localhost:5000/api/alerts/${emergencyId}/status'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'status': 'responding'}),
      );

      if (response.statusCode == 200) {
        notifyListeners();
      }
    } catch (e) {
      notifyListeners();
    } finally {
      _isSubmitting = false;
      notifyListeners();
    }
  }

  Future<void> submitReport(String emergencyId) async {
    _isSubmitting = true;
    notifyListeners();

    try {
      final response = await http.post(
        Uri.parse('http://localhost:5000/api/alerts/${emergencyId}/report'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'status': 'resolved',
          'location': {
            'latitude': _location?.latitude,
            'longitude': _location?.longitude,
          },
          'arrival_time': DateTime.now().toIso8601String(),
          'notes': 'Ground report submitted',
          'needs_admin': false,
        }),
      );

      if (response.statusCode == 200) {
        _emergencies.remove(emergencyId);
        notifyListeners();
      }
    } catch (e) {
      notifyListeners();
    } finally {
      _isSubmitting = false;
      notifyListeners();
    }
  }

  Position? _location;
  Timer? _locationTimer;

  void startLocationTracking() {
    _locationTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      _location = Position(19.0, 73.0, 0, DateTime.now());
      notifyListeners();
    });
  }

  void stopLocationTracking() {
    _locationTimer?.cancel();
  }
}
