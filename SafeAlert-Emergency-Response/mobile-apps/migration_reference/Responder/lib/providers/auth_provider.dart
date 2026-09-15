import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'dart:convert';

class AuthProvider extends ChangeNotifier {
  static const String _secureStorageName = 'flutter_secure_storage';
  static const String tokenKey = 'auth_token';
  static const String userKey = 'user';

  String? _token;
  Map<String, dynamic>? _user;
  bool _isLoading = true;
  String? _error;

  AuthProvider() {
    _loadSession();
  }

  bool get isAuthenticated => _token != null && _user != null;
  bool get isLoading => _isLoading;
  String? get error => _error;
  Map<String, dynamic>? get user => _user;
  String? get email => _user?['email'] as String?;
  String? get name => _user?['name'] as String?;
  String? get credentialNumber => _user?['credentialNumber'] as String?;
  String? get departmentName => _user?['departmentName'] as String?;
  String? get responderRole => _user?['responderRole'] as String?;
  String? get assignedEmergency => _user?['assigned_emergency'] as String?;

  Future<void> _loadSession() async {
    _isLoading = true;
    notifyListeners();

    final prefs = await SharedPreferences.getInstance();
    final secure = FlutterSecureStorage();

    _token = await secure.read(key: _secureStorageName + '.' + tokenKey);
    _user = json.decode(prefs.getString(userKey) ?? '{}');

    _isLoading = false;
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    _error = null;
    notifyListeners();

    try {
      final response = await http.post(
        Uri.parse('http://localhost:5000/api/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'email': email, 'password': password}),
      );

      final data = json.decode(response.body);
      if (response.statusCode == 200) {
        _token = data['token'];
        _user = data['user'];

        final prefs = await SharedPreferences.getInstance();
        final secure = FlutterSecureStorage();
        await secure.write(key: _secureStorageName + '.' + tokenKey, value: _token);
        await prefs.setString(userKey, json.encode(_user));

        notifyListeners();
      } else {
        _error = data['error'] as String?;
        notifyListeners();
        throw Exception(_error ?? 'Login failed');
      }
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      rethrow;
    }
  }

  Future<void> logout() async {
    _token = null;
    _user = null;

    final prefs = await SharedPreferences.getInstance();
    final secure = FlutterSecureStorage();
    await secure.delete(key: _secureStorageName + '.' + tokenKey);
    await prefs.remove(userKey);

    notifyListeners();
  }

  String getApiUrl() {
    final prefs = SharedPreferences.getInstance();
    return prefs.getString('api_url') ?? 'http://localhost:5000/api';
  }
}
