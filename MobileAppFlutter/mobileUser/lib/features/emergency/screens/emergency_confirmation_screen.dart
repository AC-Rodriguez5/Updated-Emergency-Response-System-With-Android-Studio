import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_button.dart';
import '../../auth/providers/auth_provider.dart';
import '../providers/emergency_provider.dart';

class EmergencyConfirmationScreen extends ConsumerStatefulWidget {
  final String emergencyType;

  /// When set, the alert sends itself after this many seconds unless the user
  /// cancels — the window the SOS hold promises on the home screen. Null keeps
  /// the plain confirm-then-send flow used by the typed alerts, where the user
  /// has already told us what is happening and nothing should fire on a timer.
  final int? countdownSeconds;

  const EmergencyConfirmationScreen({
    super.key,
    required this.emergencyType,
    this.countdownSeconds,
  });

  @override
  ConsumerState<EmergencyConfirmationScreen> createState() =>
      _EmergencyConfirmationScreenState();
}

class _EmergencyConfirmationScreenState
    extends ConsumerState<EmergencyConfirmationScreen> {
  Position? _position;
  bool _locating = true;
  String? _locationError;
  bool _sending = false;

  Timer? _countdown;
  int _remaining = 0;

  /// Set when the countdown ran out before GPS answered. The alert then goes
  /// the moment a fix arrives: an SOS that silently did nothing because the
  /// phone was still finding satellites is the worst outcome here.
  bool _sendWhenLocated = false;

  bool get _isCountdown => widget.countdownSeconds != null;

  static const _labels = {
    'medical': (
      'Medical Emergency',
      Icons.medical_services,
      AppColors.alertRed,
    ),
    'crime': ('Crime / Security', Icons.local_police, Color(0xFF7C3AED)),
    'fire': ('Fire Emergency', Icons.local_fire_department, Color(0xFFEA580C)),
    'general_sos': ('General SOS', Icons.sos, AppColors.adminNavy),
  };

  @override
  void initState() {
    super.initState();
    _acquireLocation();
    if (_isCountdown) _startCountdown();
  }

  @override
  void dispose() {
    _countdown?.cancel();
    super.dispose();
  }

  void _startCountdown() {
    setState(() => _remaining = widget.countdownSeconds!);
    _countdown = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      // A tick per second, felt as well as seen: the phone may be in a pocket
      // or the user may not be able to look at it.
      HapticFeedback.selectionClick();
      setState(() => _remaining--);
      if (_remaining > 0) return;
      timer.cancel();
      _sendNow();
    });
  }

  void _cancelCountdown() {
    _countdown?.cancel();
    _countdown = null;
    setState(() => _sendWhenLocated = false);
  }

  /// Sends immediately, or as soon as a fix exists.
  Future<void> _sendNow() async {
    _countdown?.cancel();
    if (_position == null) {
      setState(() => _sendWhenLocated = true);
      if (!_locating) _acquireLocation();
      return;
    }
    await _send();
  }

  Future<void> _acquireLocation() async {
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.deniedForever) {
        setState(() {
          _locationError = 'Location permission denied. Enable in settings.';
          _locating = false;
        });
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 15),
        ),
      );
      setState(() {
        _position = pos;
        _locating = false;
      });
      _flushPendingSend();
    } catch (_) {
      try {
        final last = await Geolocator.getLastKnownPosition();
        if (last != null &&
            DateTime.now().difference(last.timestamp) <
                const Duration(seconds: 60)) {
          setState(() {
            _position = last;
            _locating = false;
          });
          _flushPendingSend();
          return;
        }
      } catch (_) {}
      setState(() {
        _locationError = 'Could not get GPS. Please try again.';
        _locating = false;
      });
    }
  }

  void _flushPendingSend() {
    if (!_sendWhenLocated || _position == null || _sending) return;
    _sendWhenLocated = false;
    _send();
  }

  Future<void> _send() async {
    if (_position == null) {
      _acquireLocation();
      return;
    }
    if (_sending) return;
    _countdown?.cancel();
    setState(() => _sending = true);
    final user = ref.read(currentUserProvider);
    final em = await ref
        .read(emergencyProvider.notifier)
        .createEmergency(
          type: widget.emergencyType,
          location: _position!,
          barangay: user?.barangay,
        );
    if (!mounted) return;
    setState(() => _sending = false);
    if (em != null) {
      context.go('/home/emergency/${em.id}');
    } else if (ref.read(emergencyProvider) is EmergencyQueued) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'No connection — alert saved and will send automatically when online.',
          ),
          duration: Duration(seconds: 4),
        ),
      );
      context.go('/home');
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to send emergency. Check your connection.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final typeLabel = _labels[widget.emergencyType]?.$1 ?? 'Emergency';
    final typeIcon = _labels[widget.emergencyType]?.$2 ?? Icons.sos;
    final typeColor = _labels[widget.emergencyType]?.$3 ?? AppColors.alertRed;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text(_isCountdown ? 'SOS countdown' : 'Confirm Emergency'),
        leading: BackButton(
          onPressed: () {
            _cancelCountdown();
            context.pop();
          },
        ),
      ),
      body: _isCountdown
          ? _countdownBody()
          : Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  const Spacer(),
                  Container(
                    width: 100,
                    height: 100,
                    decoration: BoxDecoration(
                      color: typeColor.withValues(alpha: 0.1),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(typeIcon, color: typeColor, size: 52),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    typeLabel,
                    style: const TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Your location, profile and emergency details will be sent to Tanza MDRRMO.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 14,
                      color: AppColors.textMuted,
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 32),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Column(
                      children: [
                        _InfoRow(
                          icon: Icons.location_on,
                          label: 'GPS Status',
                          value: _locating
                              ? 'Getting location...'
                              : _locationError != null
                              ? _locationError!
                              : 'Lat ${_position!.latitude.toStringAsFixed(5)}, Lng ${_position!.longitude.toStringAsFixed(5)}',
                          color: _locationError != null
                              ? AppColors.alertRed
                              : AppColors.successGreen,
                        ),
                        const Divider(height: 20),
                        _InfoRow(
                          icon: Icons.gps_fixed,
                          label: 'Accuracy',
                          value: _position != null
                              ? '±${_position!.accuracy.toStringAsFixed(0)}m'
                              : '—',
                          color: AppColors.textMuted,
                        ),
                      ],
                    ),
                  ),
                  const Spacer(),
                  if (_locationError != null)
                    Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.softRed,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        _locationError!,
                        style: const TextStyle(
                          color: AppColors.alertRed,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  AppButton(
                    label: _sending ? 'Sending...' : 'SEND EMERGENCY ALERT',
                    onPressed: _sending || _locating ? null : _send,
                    isLoading: _sending,
                    backgroundColor: typeColor,
                  ),
                  const SizedBox(height: 12),
                  AppOutlinedButton(
                    label: 'Cancel',
                    onPressed: () => context.pop(),
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
    );
  }

  /// The SOS countdown: what is about to happen, what it will send, and two
  /// ways out of it.
  ///
  /// Every line in "what gets sent" is something the system actually does. The
  /// mock also promised an SMS to two emergency contacts and a dispatcher
  /// callback; the backend has no SMS provider and no callback guarantee, so
  /// those are left out rather than promised to someone in trouble. The
  /// contact's details do travel with the alert — that much is true, and is
  /// what the third line says.
  Widget _countdownBody() {
    final waitingForGps = _position == null && _remaining <= 0;

    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Spacer(),
          Text(
            _sending
                ? 'SENDING NOW'
                : waitingForGps
                ? 'WAITING FOR GPS'
                : 'SENDING SOS IN',
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.6,
              color: AppColors.textMuted,
            ),
          ),
          const SizedBox(height: 14),
          Center(
            child: Container(
              width: 150,
              height: 150,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.alertRed.withValues(alpha: .08),
                border: Border.all(
                  color: AppColors.alertRed.withValues(alpha: .35),
                  width: 3,
                ),
              ),
              child: Center(
                child: _sending || waitingForGps
                    ? const SizedBox(
                        width: 38,
                        height: 38,
                        child: CircularProgressIndicator(
                          strokeWidth: 3,
                          color: AppColors.alertRed,
                        ),
                      )
                    : Text(
                        '$_remaining',
                        style: const TextStyle(
                          fontSize: 72,
                          fontWeight: FontWeight.w900,
                          color: AppColors.alertRed,
                          height: 1,
                        ),
                      ),
              ),
            ),
          ),
          const SizedBox(height: 28),
          const Text(
            'WHAT GETS SENT',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.3,
              color: AppColors.textMuted,
            ),
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: const Column(
              children: [
                _SentLine('Your live location, updated as you move'),
                _SentLine('Your name, blood type and home address'),
                _SentLine("Your emergency contact's name and number"),
                _SentLine('An alert to the MDRRMO Tanza command center'),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Text(
            _locating
                ? 'Getting your location…'
                : _locationError ??
                      'Location fixed to ±${_position!.accuracy.toStringAsFixed(0)} m',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 11.5,
              color: _locationError != null
                  ? AppColors.alertRed
                  : AppColors.textMuted,
            ),
          ),
          const Spacer(),
          AppButton(
            label: _sending ? 'Sending…' : 'Send now',
            onPressed: _sending ? null : _sendNow,
            isLoading: _sending,
            backgroundColor: AppColors.alertRed,
          ),
          const SizedBox(height: 12),
          AppOutlinedButton(
            label: "Cancel, I'm safe",
            onPressed: _sending
                ? null
                : () {
                    _cancelCountdown();
                    context.pop();
                  },
          ),
        ],
      ),
    );
  }
}

class _SentLine extends StatelessWidget {
  final String text;
  const _SentLine(this.text);

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 7),
    child: Row(
      children: [
        const Icon(Icons.check_circle, size: 16, color: AppColors.successGreen),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(fontSize: 12.5, height: 1.3),
          ),
        ),
      ],
    ),
  );
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.textMuted,
                ),
              ),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
