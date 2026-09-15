import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

class LocationProvider extends ChangeNotifier {
  Position? _position;
  bool _isLocationEnabled = false;
  StreamSubscription? _locationStream;
  Timer? _locationTimer;
  Timer? _gpsStaleTimer;

  LocationProvider() {
    _setupLocation();
  }

  bool get isLocationEnabled => _isLocationEnabled;
  Position? get position => _position;
  double? get latitude => _position?.latitude;
  double? get longitude => _position?.longitude;
  double? get accuracy => _position?.accuracy;

  Future<void> _setupLocation() async {
    final result = await Geolocator.isLocationServiceEnabled();
    if (!result) {
      _isLocationEnabled = false;
      notifyListeners();
      return;
    }

    final location = await Geolocator.checkPermission();
    if (location == LocationPermission.denied) {
      final request = await Geolocator.requestPermission();
      if (request == LocationPermission.denied) {
        _isLocationEnabled = false;
        notifyListeners();
        return;
      }
    }

    if (location == LocationPermission.deniedForever) {
      _isLocationEnabled = false;
      notifyListeners();
      return;
    }

    _isLocationEnabled = true;
    notifyListeners();

    _locationStream = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
      ),
    ).listen((Position position) {
      _position = position;
      notifyListeners();
    });

    _locationTimer?.cancel();
    _gpsStaleTimer?.cancel();

    _locationTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      _gpsStaleTimer = null;
      notifyListeners();
    });
  }

  void startTracking() {
    _locationTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      notifyListeners();
    });
  }

  void stopTracking() {
    _locationTimer?.cancel();
  }

  Future<void> cancelGpsStaleTimer() async {
    _gpsStaleTimer?.cancel();
  }
}
