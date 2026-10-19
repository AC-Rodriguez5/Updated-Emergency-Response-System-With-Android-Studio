import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/user_model.dart';
import '../repository/auth_repository.dart';

sealed class AuthState {}

class AuthLoading extends AuthState {}

class AuthUnauthenticated extends AuthState {}

class AuthPending extends AuthState {
  final UserModel user;
  AuthPending(this.user);
}

class AuthAuthenticated extends AuthState {
  final UserModel user;
  AuthAuthenticated(this.user);
}

class AuthError extends AuthState {
  final String message;
  AuthError(this.message);
}

class AuthNotifier extends ChangeNotifier {
  final AuthRepository _repo;
  AuthState _state = AuthLoading();

  AuthNotifier(this._repo);

  AuthState get state => _state;

  void _emit(AuthState next) {
    _state = next;
    notifyListeners();
  }

  Future<void> initialize() async {
    _emit(AuthLoading());
    try {
      final user = await _repo.restoreSession();
      if (user == null) {
        _emit(AuthUnauthenticated());
      } else if (user.approvalStatus == 'approved' && user.isApproved) {
        _emit(AuthAuthenticated(user));
      } else {
        _emit(AuthPending(user));
      }
    } catch (_) {
      _emit(AuthUnauthenticated());
    }
  }

  Future<void> login({
    required String email,
    required String password,
    bool rememberMe = false,
    String? captchaToken,
  }) async {
    _emit(AuthLoading());
    try {
      final result = await _repo.login(
        email: email,
        password: password,
        rememberMe: rememberMe,
        captchaToken: captchaToken,
      );
      final user = result.user;
      if (user.approvalStatus == 'approved' && user.isApproved) {
        _emit(AuthAuthenticated(user));
      } else {
        _emit(AuthPending(user));
      }
    } on Exception catch (e) {
      _emit(AuthError(e.toString()));
      rethrow;
    }
  }

  Future<void> logout() async {
    await _repo.logout();
    _emit(AuthUnauthenticated());
  }

  UserModel? get currentUser {
    final s = _state;
    if (s is AuthAuthenticated) return s.user;
    if (s is AuthPending) return s.user;
    return null;
  }
}

final authProvider = ChangeNotifierProvider<AuthNotifier>((ref) {
  final notifier = AuthNotifier(ref.read(authRepositoryProvider));
  notifier.initialize();
  return notifier;
});

final authStateProvider = Provider<AuthState>((ref) {
  return ref.watch(authProvider).state;
});

final currentUserProvider = Provider<UserModel?>((ref) {
  return ref.watch(authProvider).currentUser;
});
