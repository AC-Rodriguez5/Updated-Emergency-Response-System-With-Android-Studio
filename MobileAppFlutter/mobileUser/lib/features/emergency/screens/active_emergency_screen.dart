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
import '../../auth/repository/auth_repository.dart';
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
  bool _sendingMessage = false;
  bool _reloading = false;
  Timer? _socketRenewal;
  bool _socketConnected = false;

  @override
  void initState() {
    super.initState();
    _load();
    _startLocationTracking();
    _connectSocket();
  }

  Future<void> _load() async {
    if (_reloading) return;
    _reloading = true;
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
    } finally {
      _reloading = false;
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

  /// Renews the session once, then rebuilds the socket with the fresh token.
  void _renewAndReconnect() {
    if (_socketRenewal != null || !mounted) return;
    _socketRenewal = Timer(const Duration(seconds: 5), () async {
      _socketRenewal = null;
      if (!mounted) return;
      try {
        await ref.read(authRepositoryProvider).getMe();
      } catch (_) {
        // Reconnect anyway; the failure may have been the network.
      }
      if (!mounted) return;
      _socket?.dispose();
      await _connectSocket();
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
      // A refused handshake here is an aged-out access token: renew it through
      // the API client and reconnect, rather than retrying the same one.
      _renewAndReconnect();
    });
    _socket!.onError((_) {
      if (mounted) setState(() => _socketConnected = false);
    });
    _socket!.on('emergency.updated', (_) => _load());
    _socket!.on('emergency.assigned', (_) => _load());
    _socket!.on('emergency.released', (_) => _load());
    _socket!.on('emergency.assignment_expired', (_) => _load());
    _socket!.on('emergency.responder_on_the_way', (_) => _load());
    // `emergency.message` covers every note on the incident, the resident's own
    // included, so listening for `user_message` as well only reloaded twice.
    _socket!.on('emergency.message', (_) => _load());
    _socket!.on('emergency.responder_arrived', (_) => _load());
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
    _socketRenewal?.cancel();
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
          if (em != null) _trackingPanel(em),
        ],
      ),
    );
  }

  /// Opens the composer and sends what the user typed.
  ///
  /// Deliberately one-way: dispatch can read it on the incident, and there is
  /// no reply channel in the app yet, so the sheet says so rather than leaving
  /// someone in an emergency waiting for an answer that cannot come.
  Future<void> _composeMessage() async {
    final text = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _MessageComposerSheet(),
    );
    if (text == null || text.isEmpty || !mounted) return;

    setState(() => _sendingMessage = true);
    try {
      await ref
          .read(emergencyRepositoryProvider)
          .sendMessage(emergencyId: widget.emergencyId, message: text);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Message sent to the dispatcher.')),
      );
      await _load();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not send the message. Check your connection.'),
        ),
      );
    } finally {
      if (mounted) setState(() => _sendingMessage = false);
    }
  }

  /// Metres between the responder's last reported position and ours, when both
  /// are known.
  ///
  /// Distance, not an ETA in minutes: nothing in the system knows the road
  /// network or how fast the unit is moving, and a made-up "6 min" is a promise
  /// to someone who is counting the seconds.
  double? get _responderMetres {
    final responder = _responderLatLng;
    final user = _userLatLng;
    if (responder == null || user == null) return null;
    return const Distance().as(LengthUnit.Meter, user, responder);
  }

  static String _formatMetres(double metres) => metres < 1000
      ? '${metres.round()} m'
      : '${(metres / 1000).toStringAsFixed(1)} km';

  static String _clock(DateTime at) => ActiveEmergencyTime.clock(at);

  String _caseNumber(String id) => id.length > 6
      // Short enough to read aloud down a phone line.
      ? id.substring(id.length - 6).toUpperCase()
      : id.toUpperCase();

  Widget _trackingPanel(EmergencyModel em) {
    final metres = _responderMetres;
    final lastMessage = em.userMessages.isEmpty ? null : em.userMessages.last;
    final updates = em.updatesForMe;

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      color: AppColors.surface,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 5,
                ),
                decoration: BoxDecoration(
                  color: em.isActive ? AppColors.softRed : AppColors.background,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  em.isActive
                      ? 'SOS ACTIVE - ${em.priority.toUpperCase()}'
                      : em.status.replaceAll('_', ' ').toUpperCase(),
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                    letterSpacing: .8,
                    color: em.isActive
                        ? AppColors.alertRed
                        : AppColors.textMuted,
                  ),
                ),
              ),
              const Spacer(),
              Text(
                'Case #${_caseNumber(em.id)}',
                style: const TextStyle(
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: AppColors.textMuted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: AppColors.responderBlue.withValues(alpha: .1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.local_police,
                  color: AppColors.responderBlue,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      // Once someone is assigned, who they are matters more
                      // than the status word — the status is the line below.
                      em.assignedResponder?.name.isNotEmpty == true
                          ? em.assignedResponder!.name
                          : _responderHeadline(em.status),
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _responderSubline(em),
                      style: const TextStyle(
                        fontSize: 11.5,
                        color: AppColors.textMuted,
                        height: 1.3,
                      ),
                    ),
                  ],
                ),
              ),
              if (metres != null) ...[
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      _formatMetres(metres),
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w900,
                        color: AppColors.responderBlue,
                      ),
                    ),
                    const Text(
                      'away',
                      style: TextStyle(
                        fontSize: 10,
                        color: AppColors.textMuted,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
          const SizedBox(height: 14),
          _TimelineStep(
            label: 'Received by command center',
            at: em.timeOf('created') ?? em.createdAt,
          ),
          _TimelineStep(label: 'Responder assigned', at: em.timeOf('assigned')),
          _TimelineStep(
            label: 'On the way',
            at: em.timeOf('responder_on_the_way'),
          ),
          _TimelineStep(label: 'Arrived', at: em.arrivedAt, isLast: true),
          const SizedBox(height: 12),
          Row(
            children: [
              Icon(
                _userLatLng != null
                    ? Icons.location_on
                    : Icons.location_searching,
                color: _userLatLng != null
                    ? AppColors.successGreen
                    : AppColors.warningAmber,
                size: 16,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  _userLatLng != null
                      ? 'Sharing live location'
                      : 'Waiting for GPS...',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textMuted,
                  ),
                ),
              ),
              if (!_socketConnected)
                const Text(
                  'reconnecting...',
                  style: TextStyle(fontSize: 11, color: AppColors.warningAmber),
                ),
            ],
          ),
          if (em.isActive) ...[
            const SizedBox(height: 10),
            const Text(
              'Stay where you are if it is safe. Keep the screen on so your '
              'location stays accurate.',
              style: TextStyle(
                fontSize: 11.5,
                color: AppColors.textMuted,
                height: 1.4,
              ),
            ),
          ],
          // Word from the person actually coming. Shown above the receipt for
          // the resident's own last message, because an answer outranks an echo.
          if (updates.isNotEmpty) ...[
            const SizedBox(height: 12),
            for (final update in updates.reversed.take(3).toList().reversed)
              Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(11),
                decoration: BoxDecoration(
                  color: AppColors.softGreen,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      update.actorRole == 'admin'
                          ? Icons.headset_mic
                          : Icons.local_police,
                      size: 15,
                      color: AppColors.successGreen,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            update.actorRole == 'admin'
                                ? 'Dispatch · ${_clock(update.at)}'
                                : 'Your responder · ${_clock(update.at)}',
                            style: const TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w700,
                              color: AppColors.successGreen,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            update.note ?? '',
                            style: const TextStyle(fontSize: 12.5, height: 1.3),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
          ],
          if (lastMessage != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(11),
              decoration: BoxDecoration(
                color: AppColors.softBlue,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.check_circle,
                    size: 15,
                    color: AppColors.responderBlue,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Sent ${_clock(lastMessage.at)}: ${lastMessage.note ?? ''}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11.5),
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (em.isActive) ...[
            const SizedBox(height: 14),
            AppButton(
              label: _sendingMessage ? 'Sending...' : 'Send message',
              onPressed: _sendingMessage ? null : _composeMessage,
              isLoading: _sendingMessage,
              backgroundColor: AppColors.responderBlue,
            ),
          ],
          if (em.canCancel) ...[
            const SizedBox(height: 10),
            AppOutlinedButton(
              label: _cancelling
                  ? 'Cancelling...'
                  : "I'm safe now, cancel alert",
              onPressed: _cancelling ? null : _cancel,
            ),
          ],
        ],
      ),
    );
  }

  /// The line under the responder's name: their unit and what they are doing.
  ///
  /// Falls back to the plain status sentence while nobody is assigned, or when
  /// the assignment carries no unit to name.
  String _responderSubline(EmergencyModel em) {
    final responder = em.assignedResponder;
    if (responder == null || responder.name.isEmpty) {
      return _statusMessage(em.status);
    }
    final unit = responder.unitLine;
    final state = _responderHeadline(em.status);
    return unit.isEmpty ? state : '$unit - $state';
  }

  static String _responderHeadline(String status) => switch (status) {
    'pending' => 'Waiting for dispatch',
    'assigned' => 'Responder assigned',
    'responder_on_the_way' => 'Responder on the way',
    'responder_nearby' => 'Responder nearby',
    'arrived' => 'Responder has arrived',
    'resolved' => 'Emergency resolved',
    'cancelled' => 'Alert cancelled',
    _ => 'MDRRMO responder',
  };

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

/// One row of the tracking timeline. A step with no timestamp has not happened
/// yet and is drawn as pending rather than hidden, so the whole sequence is
/// visible from the first second.
class _TimelineStep extends StatelessWidget {
  final String label;
  final DateTime? at;
  final bool isLast;

  const _TimelineStep({required this.label, this.at, this.isLast = false});

  @override
  Widget build(BuildContext context) {
    final done = at != null;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            Container(
              width: 11,
              height: 11,
              margin: const EdgeInsets.only(top: 4),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: done ? AppColors.successGreen : AppColors.border,
              ),
            ),
            if (!isLast)
              Container(
                width: 2,
                height: 20,
                color: done ? AppColors.successGreen : AppColors.border,
              ),
          ],
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Padding(
            padding: EdgeInsets.only(bottom: isLast ? 0 : 9),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: done ? FontWeight.w700 : FontWeight.w500,
                      color: done ? AppColors.textStrong : AppColors.textMuted,
                    ),
                  ),
                ),
                Text(
                  done ? ActiveEmergencyTime.clock(at!) : 'pending',
                  style: TextStyle(
                    fontSize: 11,
                    color: done ? AppColors.textMuted : AppColors.border,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Clock formatting shared by the panel and its timeline rows.
class ActiveEmergencyTime {
  const ActiveEmergencyTime._();

  static String clock(DateTime at) {
    final h = at.hour % 12 == 0 ? 12 : at.hour % 12;
    final m = at.minute.toString().padLeft(2, '0');
    return '$h:$m ${at.hour < 12 ? 'AM' : 'PM'}';
  }
}

/// The message composer, as its own widget so the text controller lives exactly
/// as long as the sheet does.
///
/// Disposing a controller straight after `showModalBottomSheet` returns looks
/// harmless and is not: the route is still playing its exit animation, the
/// `TextField` is still mounted and still depending on inherited widgets, and
/// tearing its controller out from under it trips
/// `InheritedElement.debugDeactivated` — a red screen in the middle of an
/// emergency, on the one screen that must never fail.
class _MessageComposerSheet extends StatefulWidget {
  const _MessageComposerSheet();

  @override
  State<_MessageComposerSheet> createState() => _MessageComposerSheetState();
}

class _MessageComposerSheetState extends State<_MessageComposerSheet> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        18,
        20,
        20 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Message the dispatcher',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          const Text(
            'Goes to the MDRRMO dispatcher handling your alert and to the '
            'responder assigned to you. Their replies appear on this screen.',
            style: TextStyle(
              fontSize: 12,
              color: AppColors.textMuted,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _controller,
            autofocus: true,
            maxLength: 500,
            minLines: 2,
            maxLines: 5,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              hintText: 'e.g. We are on the second floor, gate is locked',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          const SizedBox(height: 6),
          AppButton(
            label: 'Send to dispatcher',
            backgroundColor: AppColors.responderBlue,
            onPressed: () => Navigator.pop(context, _controller.text.trim()),
          ),
        ],
      ),
    );
  }
}
