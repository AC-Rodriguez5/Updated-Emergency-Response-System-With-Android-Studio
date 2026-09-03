import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../../../../core/config/app_config.dart';
import '../../../../core/storage/secure_storage.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/status_badge.dart';
import '../models/emergency_model.dart';
import '../providers/emergency_provider.dart';
import '../repository/emergency_repository.dart';

class ActiveEmergencyScreen extends ConsumerStatefulWidget {
  final String emergencyId;
  const ActiveEmergencyScreen({super.key, required this.emergencyId});

  @override
  ConsumerState<ActiveEmergencyScreen> createState() =>
      _ActiveEmergencyScreenState();
}

class _ActiveEmergencyScreenState extends ConsumerState<ActiveEmergencyScreen> {
  EmergencyModel? _emergency;
  LatLng? _userLatLng;
  LatLng? _responderLatLng;
  io.Socket? _socket;
  StreamSubscription? _locationSub;
  bool _loading = true;
  bool _cancelling = false;
  bool _socketConnected = false;

  @override
  void initState() {
    super.initState();
    _load();
    _startLocationTracking();
    _connectSocket();
  }

  Future<void> _load() async {
    try {
      final em = await ref
          .read(emergencyRepositoryProvider)
          .getEmergency(widget.emergencyId);
      final notifier = ref.read(emergencyProvider.notifier);
      if (em.isActive) {
        notifier.setActive(em);
      } else {
        notifier.reset();
      }
      if (mounted) {
        setState(() {
          _emergency = em;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _startLocationTracking() {
    _locationSub =
        Geolocator.getPositionStream(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 10,
          ),
        ).listen((pos) async {
          if (!mounted) return;
          setState(() => _userLatLng = LatLng(pos.latitude, pos.longitude));
          await ref
              .read(emergencyRepositoryProvider)
              .sendLocation(location: pos, emergencyId: widget.emergencyId);
        });
  }

  Future<void> _connectSocket() async {
    final token = await ref.read(secureStorageProvider).getAccessToken();
    _socket = io.io(
      AppConfig.apiBaseUrl.replaceAll('/api', ''),
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableForceNew()
          .setReconnectionDelay(2000)
          .setReconnectionDelayMax(10000)
          .build(),
    );
    _socket!.onConnect((_) {
      if (mounted) setState(() => _socketConnected = true);
    });
    _socket!.onDisconnect((_) {
      if (mounted) setState(() => _socketConnected = false);
    });
    _socket!.onConnectError((_) {
      if (mounted) setState(() => _socketConnected = false);
    });
    _socket!.onError((_) {
      if (mounted) setState(() => _socketConnected = false);
    });
    _socket!.on('emergency.updated', (_) => _load());
    _socket!.on('emergency.assigned', (_) => _load());
    _socket!.on('emergency.responder_on_the_way', (_) => _load());
    _socket!.on('emergency.resolved', (data) {
      _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Emergency resolved by MDRRMO.')),
        );
      }
    });
    _socket!.on('location.responder_updated', (data) {
      final d = data as Map;
      final coords = d['coordinates'] as List?;
      if (coords != null && coords.length >= 2) {
        setState(
          () => _responderLatLng = LatLng(
            (coords[1] as num).toDouble(),
            (coords[0] as num).toDouble(),
          ),
        );
      }
    });
    _socket!.emit('join:emergency', widget.emergencyId);
  }

  Future<void> _cancel() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Cancel Emergency'),
        content: const Text(
          'Are you sure you want to cancel this emergency alert?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('No'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text(
              'Cancel Alert',
              style: TextStyle(color: AppColors.alertRed),
            ),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    setState(() => _cancelling = true);
    try {
      await ref
          .read(emergencyRepositoryProvider)
          .cancelEmergency(widget.emergencyId, reason: 'User cancelled');
      ref.read(emergencyProvider.notifier).reset();
      if (mounted) context.go('/home');
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  @override
  void dispose() {
    _locationSub?.cancel();
    _socket?.disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final em = _emergency;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Active Emergency'),
        leading: BackButton(onPressed: () => context.go('/home')),
        actions: [
          if (em != null)
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: StatusBadge.fromStatus(em.status),
            ),
        ],
      ),
      body: Column(
              children: [
                Expanded(
                  child: Stack(
                    children: [
                      FlutterMap(
                    options: MapOptions(
                      initialCenter:
                          _userLatLng ??
                          LatLng(
                            AppConfig.tanzaCenterLat,
                            AppConfig.tanzaCenterLng,
                          ),
                      initialZoom: 15,
                    ),
                    children: [
                      TileLayer(
                        urlTemplate:
                            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        userAgentPackageName: 'com.tanzalert.app',
                      ),
                      MarkerLayer(
                        markers: [
                          if (_userLatLng != null)
                            Marker(
                              point: _userLatLng!,
                              child: const Icon(
                                Icons.my_location,
                                color: AppColors.alertRed,
                                size: 32,
                              ),
                            ),
                          if (_responderLatLng != null)
                            Marker(
                              point: _responderLatLng!,
                              child: const Icon(
                                Icons.local_police,
                                color: AppColors.responderBlue,
                                size: 32,
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                  if (_loading || !_socketConnected)
                    Positioned(
                      top: 8,
                      left: 8,
                      right: 8,
                      child: Material(
                        color: Colors.transparent,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.92),
                            borderRadius: BorderRadius.circular(20),
                            boxShadow: const [
                              BoxShadow(
                                color: Colors.black12,
                                blurRadius: 4,
                                offset: Offset(0, 2),
                              ),
                            ],
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              SizedBox(
                                width: 14,
                                height: 14,
                                child: _loading
                                    ? const CircularProgressIndicator(
                                        strokeWidth: 2,
                                      )
                                    : const Icon(
                                        Icons.cloud_off,
                                        size: 14,
                                        color: AppColors.warningAmber,
                                      ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                _loading
                                    ? 'Loading emergency…'
                                    : 'Reconnecting to live feed…',
                                style: const TextStyle(fontSize: 12),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.all(20),
                  color: AppColors.surface,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (em != null) ...[
                        Row(
                          children: [
                            Text(
                              em.displayType,
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const Spacer(),
                            StatusBadge.fromStatus(em.status),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _statusMessage(em.status),
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.textMuted,
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],
                      Row(
                        children: [
                          const Icon(
                            Icons.location_on,
                            color: AppColors.alertRed,
                            size: 16,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            _userLatLng != null
                                ? 'Sharing live location'
                                : 'Waiting for GPS...',
                            style: const TextStyle(
                              fontSize: 13,
                              color: AppColors.textMuted,
                            ),
                          ),
                          const Spacer(),
                          if (_userLatLng != null)
                            Container(
                              width: 8,
                              height: 8,
                              decoration: const BoxDecoration(
                                color: AppColors.successGreen,
                                shape: BoxShape.circle,
                              ),
                            ),
                        ],
                      ),
                      if (em != null && em.canCancel) ...[
                        const SizedBox(height: 16),
                        AppOutlinedButton(
                          label: _cancelling
                              ? 'Cancelling...'
                              : 'Cancel Emergency',
                          onPressed: _cancelling ? null : _cancel,
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  String _statusMessage(String status) => switch (status) {
    'pending' => 'Waiting for MDRRMO admin to dispatch a responder.',
    'assigned' => 'A responder has been assigned to your emergency.',
    'responder_on_the_way' => 'Responder is on the way. Track them on the map.',
    'responder_nearby' => 'Responder is nearby.',
    'arrived' => 'Responder has arrived at your location.',
    'resolved' => 'Emergency resolved. Thank you.',
    'cancelled' => 'Emergency cancelled.',
    _ => status,
  };
}
