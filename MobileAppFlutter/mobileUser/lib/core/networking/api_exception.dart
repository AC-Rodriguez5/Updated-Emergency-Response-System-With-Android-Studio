class ApiException implements Exception {
  final String message;
  final String? code;
  final int? statusCode;

  const ApiException({required this.message, this.code, this.statusCode});

  factory ApiException.fromMap(Map<String, dynamic> map, int? statusCode) {
    final error = map['error'] as Map<String, dynamic>?;
    return ApiException(
      message: error?['message'] as String? ?? 'An error occurred',
      code: error?['code'] as String?,
      statusCode: statusCode,
    );
  }

  bool get isUnauthorized => statusCode == 401;
  bool get isForbidden => statusCode == 403;
  bool get isNotApproved => code == 'ACCOUNT_NOT_APPROVED';
  bool get isRateLimited => statusCode == 429;

  /// The security check, in any of the ways it can go wrong. A challenge is
  /// spent as soon as it is submitted, so all of these mean the same thing to a
  /// screen: draw a new one.
  bool get isCaptchaFailure =>
      code == 'CAPTCHA_REQUIRED' ||
      code == 'CAPTCHA_INVALID' ||
      code == 'CAPTCHA_UNAVAILABLE';

  @override
  String toString() => 'ApiException($statusCode, $code): $message';
}
