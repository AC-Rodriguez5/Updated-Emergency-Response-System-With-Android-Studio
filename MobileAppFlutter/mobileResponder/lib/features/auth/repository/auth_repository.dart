import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/networking/api_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../models/responder_model.dart';

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ref.read(dioProvider), ref.read(secureStorageProvider)),
);

class AuthRepository {
  final Dio _dio;
  final SecureStorageService _storage;
  AuthRepository(this._dio, this._storage);

  Future<({ResponderModel responder, String accessToken, String refreshToken})> login({
    required String email,
    required String password,
    bool rememberMe = false,
  }) async {
    try {
      final response = await _dio.post('/auth/login', data: {
        'email': email.trim().toLowerCase(),
        'password': password,
        'role': 'responder',
      });
      final data = (response.data as Map<String, dynamic>)['data'] as Map<String, dynamic>;
      final responder = ResponderModel.fromJson(data);
      await _storage.saveTokens(accessToken: data['accessToken'] as String, refreshToken: data['refreshToken'] as String);
      await _storage.setRememberMe(rememberMe);
      await _storage.saveUserJson(jsonEncode(responder.toJson()));
      return (responder: responder, accessToken: data['accessToken'] as String, refreshToken: data['refreshToken'] as String);
    } on DioException catch (e) { throw dioErrorToApiException(e); }
  }

  Future<ResponderModel> registerResponder({
    required String name, required String email, required String password,
    required String badgeId, required String department,
    String? phone, String? agencyType, String? stationName,
    String? position, String? coverageArea,
    File? faceFile, File? credFile,
  }) async {
    try {
      final formData = FormData.fromMap({
        'name': name.trim(),
        'email': email.trim().toLowerCase(),
        'password': password,
        'badgeId': badgeId.trim(),
        'department': department,
        if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
        'agencyType': ?agencyType,
        'stationName': ?stationName,
        'position': ?position,
        'coverageArea': ?coverageArea,
        if (faceFile != null)
          'faceCapture': await MultipartFile.fromFile(faceFile.path, filename: 'face.jpg'),
        if (credFile != null)
          'credential': await MultipartFile.fromFile(credFile.path, filename: 'credential.jpg'),
      });
      final response = await _dio.post('/auth/register/responder', data: formData);
      final data = (response.data as Map<String, dynamic>)['data'] as Map<String, dynamic>;
      return ResponderModel.fromJson(data);
    } on DioException catch (e) { throw dioErrorToApiException(e); }
  }

  Future<ResponderModel> getMe() async {
    try {
      final response = await _dio.get('/auth/me');
      final data = (response.data as Map<String, dynamic>)['data'] as Map<String, dynamic>;
      final r = ResponderModel.fromJson(data);
      await _storage.saveUserJson(jsonEncode(r.toJson()));
      return r;
    } on DioException catch (e) { throw dioErrorToApiException(e); }
  }

  Future<void> logout() async {
    try {
      final refresh = await _storage.getRefreshToken();
      if (refresh != null) await _dio.post('/auth/logout', data: {'refreshToken': refresh});
    } finally { await _storage.clearTokens(); }
  }

  Future<ResponderModel?> restoreSession() async {
    final token = await _storage.getAccessToken();
    if (token == null) return null;
    final remember = await _storage.getRememberMe();
    if (!remember) { await _storage.clearTokens(); return null; }
    try {
      return await getMe();
    } catch (_) {
      final cached = await _storage.getUserJson();
      if (cached != null) return ResponderModel.fromJson(jsonDecode(cached) as Map<String, dynamic>);
      return null;
    }
  }
}
