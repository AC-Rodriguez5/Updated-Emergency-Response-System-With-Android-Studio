import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/networking/api_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../models/user_model.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(ref.read(dioProvider), ref.read(secureStorageProvider));
});

class AuthRepository {
  final Dio _dio;
  final SecureStorageService _storage;

  AuthRepository(this._dio, this._storage);

  Future<({UserModel user, String accessToken, String refreshToken})> login({
    required String email,
    required String password,
    bool rememberMe = false,
    String? captchaToken,
  }) async {
    try {
      final response = await _dio.post('/auth/login', data: {
        'email': email.trim().toLowerCase(),
        'password': password,
        'role': 'user',
        if (captchaToken != null && captchaToken.isNotEmpty)
          'captchaToken': captchaToken,
      });
      final data = (response.data as Map<String, dynamic>)['data'] as Map<String, dynamic>;
      final user = UserModel.fromJson(data);
      final access = data['accessToken'] as String;
      final refresh = data['refreshToken'] as String;
      await _storage.saveTokens(accessToken: access, refreshToken: refresh);
      await _storage.setRememberMe(rememberMe);
      await _storage.saveUserJson(jsonEncode(user.toJson()));
      return (user: user, accessToken: access, refreshToken: refresh);
    } on DioException catch (e) {
      throw dioErrorToApiException(e);
    }
  }

  Future<UserModel> registerUser({
    required String name,
    required String email,
    required String phone,
    required String password,
    required String streetAddress,
    required DateTime dateOfBirth,
    required String bloodType,
    required String emergencyContactName,
    required String emergencyContactNumber,
    String? captchaToken,
    String? consentVersion,
    String? consentScopes,
    required File proofOfResidency,
    required File faceCapture,
    String? municipality,
    String? barangay,
  }) async {
    try {
      final fields = <String, dynamic>{
        'name': name.trim(),
        'email': email.trim().toLowerCase(),
        'phone': phone.trim(),
        'password': password,
        'streetAddress': streetAddress.trim(),
        'dateOfBirth': dateOfBirth.toIso8601String(),
        'bloodType': bloodType,
        'emergencyContactName': emergencyContactName.trim(),
        'emergencyContactNumber': emergencyContactNumber.trim(),
        'proofOfResidency':
            await MultipartFile.fromFile(proofOfResidency.path),
        'faceCapture': await MultipartFile.fromFile(faceCapture.path),
      };
      if (municipality != null && municipality.trim().isNotEmpty) {
        fields['municipality'] = municipality.trim();
      }
      if (barangay != null && barangay.trim().isNotEmpty) {
        fields['barangay'] = barangay.trim();
      }
      /*
        Sent as a header, not a field.

        Registration is multipart, and a field can only be read after the
        server has buffered both photos — by which point the rate limiter has
        already counted the attempt, so a mistyped code used to cost one of ten
        registrations an hour. A header is readable before any of that.
      */
      // Two flat fields rather than a nested object: this is posted as
      // multipart, which has no way to carry one.
      if (consentVersion != null && consentVersion.isNotEmpty) {
        fields['consentVersion'] = consentVersion;
      }
      if (consentScopes != null && consentScopes.isNotEmpty) {
        fields['consentScopes'] = consentScopes;
      }
      final response = await _dio.post(
        '/auth/register/user',
        data: FormData.fromMap(fields),
        options: (captchaToken != null && captchaToken.isNotEmpty)
            ? Options(headers: {'x-captcha-token': captchaToken})
            : null,
      );
      final data = (response.data as Map<String, dynamic>)['data']
          as Map<String, dynamic>;
      return UserModel.fromJson(data);
    } on DioException catch (e) {
      throw dioErrorToApiException(e);
    }
  }

  Future<UserModel> getMe() async {
    try {
      final response = await _dio.get('/auth/me');
      final data = (response.data as Map<String, dynamic>)['data'] as Map<String, dynamic>;
      final user = UserModel.fromJson(data);
      await _storage.saveUserJson(jsonEncode(user.toJson()));
      return user;
    } on DioException catch (e) {
      throw dioErrorToApiException(e);
    }
  }

  Future<void> logout() async {
    try {
      final refresh = await _storage.getRefreshToken();
      if (refresh != null) {
        await _dio.post('/auth/logout', data: {'refreshToken': refresh});
      }
    } finally {
      await _storage.clearTokens();
    }
  }

  Future<UserModel?> restoreSession() async {
    final token = await _storage.getAccessToken();
    if (token == null) return null;
    final remember = await _storage.getRememberMe();
    if (!remember) {
      await _storage.clearTokens();
      return null;
    }
    try {
      return await getMe();
    } catch (_) {
      final cached = await _storage.getUserJson();
      if (cached != null) {
        return UserModel.fromJson(jsonDecode(cached) as Map<String, dynamic>);
      }
      return null;
    }
  }
}
