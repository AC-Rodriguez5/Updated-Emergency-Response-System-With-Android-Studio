import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../../../core/config/app_config.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/status_badge.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/emergency_model.dart';
import '../providers/emergency_provider.dart';
import '../repository/emergency_repository.dart';

class EmergencyMapScreen extends ConsumerStatefulWidget {
  const EmergencyMapScreen({super.key});
  @override
  ConsumerState<EmergencyMapScreen> createState() => _EmergencyMapScreenState();
}

class _EmergencyMapScreenState extends ConsumerState<EmergencyMapScreen> {
  LatLng? _myLocation;
  String? _typeFilter;
  io.Socket? _socket;
  bool _loading = true;
  bool _socketConnected = false;
  final MapController _mapController = MapController();

  @override
  void initState() {
    super.initState();
    _init();
  }

  void _init() {
    // Kick off the three startup steps independently so a slow GPS fix
    // never blocks the alert feed or the live socket connection.
    unawaited(_loadFeed());
    unawaited(_connectSocket());
    unawaited(_getLocation());
  }

  Future<void> _loadFeed() async {
    if (mounted) setState(() => _loading = true);
    try {
      await ref.read(emergencyFeedProvider.notifier).refresh(type: _typeFilter);
    } catch (_) {
      // Keep stale feed visible; user can pull-to-retry via the refresh button.
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _getLocation() async {
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.deniedForever ||
          perm == LocationPermission.denied) {
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
      if (!mounted) return;
      setState(() => _myLocation = LatLng(pos.latitude, pos.longitude));
    } catch (_) {
      // GPS timeout or unavailable — map still works, just no "you are here" pin.
    }
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
    Future<void> handleEvent(dynamic data) async {
      try {
        final payload = data as Map<String, dynamic>;
        final id =
            payload['emergencyId'] as String? ??
            payload['_id'] as String? ??
            payload['id'] as String? ??
            '';
        final status = payload['status'] as String?;
        final type = payload['type'] as String?;
        final responder = ref.read(currentResponderProvider);
        final isAssignedToMe =
            payload['assignedResponderId'] != null &&
            payload['assignedResponderId'] == responder?.id;
        if (id.isEmpty) return;
        if (status == 'resolved' || status == 'cancelled') {
          ref.read(emergencyFeedProvider.notifier).remove(id);
          return;
        }
        if (type != null &&
            responder != null &&
            !isAssignedToMe &&
            !responder.canHandleEmergencyType(type)) {
          ref.read(emergencyFeedProvider.notifier).remove(id);
          return;
        }
        final full = await ref.read(emergencyRepositoryProvider).getOne(id);
        if (!full.isActive) {
          ref.read(emergencyFeedProvider.notifier).remove(id);
        } else {
          ref.read(emergencyFeedProvider.notifier).upsert(full);
        }
      } catch (_) {}
    }

    _socket!.on('emergency.created', handleEvent);
    _socket!.on('emergency.updated', handleEvent);
    _socket!.on('emergency.assigned', handleEvent);
    _socket!.on('emergency.responder_on_the_way', handleEvent);
    _socket!.on('emergency.responder_report', handleEvent);
    _socket!.on('emergency.update_requested', handleEvent);
    _socket!.on('emergency.resolved', handleEvent);
  }

  @override
  void dispose() {
    _socket?.disconnect();
    super.dispose();
  }

  Color _typeColor(String type) => switch (type) {
    'medical' => AppColors.alertRed,
    'crime' => const Color(0xFF7C3AED),
    'fire' => const Color(0xFFEA580C),
    _ => AppColors.adminNavy,
  };

  IconData _typeIcon(String type) => switch (type) {
    'medical' => Icons.medical_services,
    'crime' => Icons.local_police,
    'fire' => Icons.local_fire_department,
    _ => Icons.sos,
  };

  @override
  Widget build(BuildContext context) {
    final responder = ref.watch(currentResponderProvider);
    final rawFeed = ref.watch(emergencyFeedProvider);
    final feed = rawFeed.where((em) {
      if (em.assignedResponderId == responder?.id) return true;
      return responder?.canHandleEmergencyType(em.type) ?? true;
    }).toList();
    final criticals = feed.where((e) => e.isCritical).length;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: 'Back',
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/duty'),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Emergency Feed'),
            Text(
              '${feed.length} active${criticals > 0 ? ' • $criticals critical' : ''}',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w400),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(
              Icons.airport_shuttle_outlined,
              color: Colors.white,
            ),
            onPressed: () => context.go('/ambulance'),
          ),
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: _loadFeed,
          ),
          IconButton(
            icon: const Icon(Icons.settings_outlined, color: Colors.white),
            onPressed: () => context.go('/settings'),
          ),
        ],
      ),
      body: Column(
        children: [
          _FilterBar(
            selected: _typeFilter,
            onSelected: (t) {
              setState(() => _typeFilter = t);
              _loadFeed();
            },
          ),
          Expanded(
            child: Stack(
              children: [
                FlutterMap(
                  mapController: _mapController,
                  options: MapOptions(
                    initialCenter:
                        _myLocation ??
                        LatLng(
                          AppConfig.tanzaCenterLat,
                          AppConfig.tanzaCenterLng,
                        ),
                    initialZoom: 13,
                  ),
                  children: [
                    TileLayer(
                      urlTemplate:
                          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'com.tanzalert.app',
                    ),
                    MarkerLayer(
                      markers: [
                        if (_myLocation != null)
                          Marker(
                            point: _myLocation!,
                            child: const Icon(
                              Icons.local_police,
                              color: AppColors.responderBlue,
                              size: 32,
                            ),
                          ),
                        ...feed.map(
                          (em) => Marker(
                            point: LatLng(em.lat, em.lng),
                            child: GestureDetector(
                              onTap: () => _showDetail(context, em),
                              child: Container(
                                decoration: BoxDecoration(
                                  color: _typeColor(em.type),
                                  shape: BoxShape.circle,
                                ),
                                padding: const EdgeInsets.all(6),
                                child: Icon(
                                  _typeIcon(em.type),
                                  color: Colors.white,
                                  size: 18,
                                ),
                              ),
                            ),
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
                                  : Icon(
                                      Icons.cloud_off,
                                      size: 14,
                                      color: AppColors.warningAmber,
                                    ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              _loading
                                  ? 'Loading alerts…'
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
          if (feed.isNotEmpty)
            SizedBox(
              height: 130,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.all(12),
                itemCount: feed.length,
                separatorBuilder: (_, _) => const SizedBox(width: 10),
                itemBuilder: (_, i) => _EmergencyCard(
                  emergency: feed[i],
                  onTap: () => _showDetail(context, feed[i]),
                ),
              ),
            ),
        ],
      ),
    );
  }

  void _showDetail(BuildContext context, EmergencyModel em) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _EmergencyDetailSheet(emergency: em, ref: ref),
    );
  }
}

class _FilterBar extends StatelessWidget {
  final String? selected;
  final void Function(String?) onSelected;
  const _FilterBar({required this.selected, required this.onSelected});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          for (final (label, type) in [
            ('All', null),
            ('Medical', 'medical'),
            ('Crime', 'crime'),
            ('Fire', 'fire'),
            ('SOS', 'general_sos'),
          ])
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: FilterChip(
                label: Text(label),
                selected: selected == type,
                onSelected: (_) => onSelected(type),
                selectedColor: AppColors.softBlue,
                checkmarkColor: AppColors.responderBlue,
              ),
            ),
        ],
      ),
    );
  }
}

class _EmergencyCard extends StatelessWidget {
  final EmergencyModel emergency;
  final VoidCallback onTap;
  const _EmergencyCard({required this.emergency, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 200,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: emergency.isCritical ? AppColors.softRed : AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: emergency.isCritical ? AppColors.alertRed : AppColors.border,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  emergency.displayType,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
                const Spacer(),
                StatusBadge.priority(emergency.priority),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              emergency.barangay ?? 'Tanza',
              style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
            if (emergency.isIoT) ...[
              const SizedBox(height: 4),
              const Row(
                children: [
                  Icon(Icons.sensors, size: 12, color: AppColors.responderBlue),
                  SizedBox(width: 4),
                  Text(
                    'IoT Keychain',
                    style: TextStyle(
                      fontSize: 11,
                      color: AppColors.responderBlue,
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 4),
            StatusBadge.fromStatus(emergency.status),
          ],
        ),
      ),
    );
  }
}

class _EmergencyDetailSheet extends StatelessWidget {
  final EmergencyModel emergency;
  final WidgetRef ref;
  const _EmergencyDetailSheet({required this.emergency, required this.ref});

  @override
  Widget build(BuildContext context) {
    final snap = emergency.userSnapshot;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      maxChildSize: 0.9,
      builder: (_, ctrl) => ListView(
        controller: ctrl,
        padding: const EdgeInsets.all(20),
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Text(
                  emergency.displayType,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              StatusBadge.priority(emergency.priority),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              StatusBadge.fromStatus(emergency.status),
              const SizedBox(width: 8),
              if (emergency.isIoT)
                const StatusBadge(
                  label: 'IoT KEYCHAIN',
                  backgroundColor: AppColors.softBlue,
                  textColor: AppColors.responderBlue,
                ),
            ],
          ),
          if (emergency.outsideScopeFlag) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFFEF3C7),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text(
                '⚠ Outside Tanza Municipality scope',
                style: TextStyle(
                  fontSize: 12,
                  color: AppColors.warningAmber,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
          const SizedBox(height: 16),
          _AdminUpdateRequestCard(emergency: emergency),
          const SizedBox(height: 16),
          if (snap != null) ...[
            const Divider(),
            _DetailRow('Name', snap['fullName'] as String? ?? '—'),
            if (snap['age'] != null) _DetailRow('Age', '${snap['age']}'),
            if (snap['bloodType'] != null)
              _DetailRow('Blood type', snap['bloodType'] as String),
            if (snap['emergencyContactName'] != null)
              _DetailRow(
                'Emergency contact',
                '${snap['emergencyContactName']} · ${snap['emergencyContactNumber'] ?? ''}',
              ),
          ],
          const Divider(),
          _DetailRow(
            'Location',
            '${emergency.lat.toStringAsFixed(5)}, ${emergency.lng.toStringAsFixed(5)}${emergency.accuracyMeters != null ? ' (±${emergency.accuracyMeters!.toStringAsFixed(0)}m)' : ''}',
          ),
          if (emergency.barangay != null)
            _DetailRow('Barangay', emergency.barangay!),
          if (emergency.isIoT) ...[
            if (emergency.sourceDeviceId != null)
              _DetailRow('Device ID', emergency.sourceDeviceId!),
            if (emergency.deviceBatteryAtTrigger != null)
              _DetailRow(
                'Battery at trigger',
                '${emergency.deviceBatteryAtTrigger}%',
              ),
          ],
          if (emergency.notes != null) _DetailRow('Notes', emergency.notes!),
          _DetailRow(
            'Reported',
            '${emergency.createdAt.hour.toString().padLeft(2, '0')}:${emergency.createdAt.minute.toString().padLeft(2, '0')} · ${emergency.createdAt.day}/${emergency.createdAt.month}/${emergency.createdAt.year}',
          ),
          const SizedBox(height: 20),
          _OnTheWayRow(emergency: emergency, ref: ref),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            icon: const Icon(Icons.report_outlined),
            label: const Text('Submit field report'),
            onPressed: () {
              Navigator.pop(context);
              context.push('/map/report/${emergency.id}');
            },
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _AdminUpdateRequestCard extends StatelessWidget {
  final EmergencyModel emergency;
  const _AdminUpdateRequestCard({required this.emergency});

  @override
  Widget build(BuildContext context) {
    final requests =
        emergency.timeline
            .where((e) => e.event == 'admin_update_requested')
            .toList()
          ..sort((a, b) => b.at.compareTo(a.at));
    if (requests.isEmpty) return const SizedBox.shrink();
    final latest = requests.first;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF3C7),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.warningAmber),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.mark_chat_unread,
                size: 18,
                color: AppColors.warningAmber,
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Admin requested an update',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              StatusBadge.fromStatus(latest.reportStatus ?? 'needs_update'),
            ],
          ),
          if (latest.note != null) ...[
            const SizedBox(height: 8),
            Text(
              latest.note!,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.textStrong,
                height: 1.4,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  const _DetailRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(
              label,
              style: const TextStyle(fontSize: 13, color: AppColors.textMuted),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _OnTheWayRow extends StatefulWidget {
  final EmergencyModel emergency;
  final WidgetRef ref;
  const _OnTheWayRow({required this.emergency, required this.ref});

  @override
  State<_OnTheWayRow> createState() => _OnTheWayRowState();
}

class _OnTheWayRowState extends State<_OnTheWayRow> {
  bool _loading = false;

  Future<void> _run(Future<void> Function() action) async {
    if (_loading) return;
    setState(() => _loading = true);
    try {
      await action();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed: $e'),
          backgroundColor: AppColors.alertRed,
        ),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final responder = widget.ref.read(currentResponderProvider);
    final currentId = responder?.id;
    final status = widget.emergency.status;
    final isPending = status == 'pending';
    final isMyAssignment =
        status == 'assigned' &&
        widget.emergency.assignedResponderId != null &&
        widget.emergency.assignedResponderId == currentId;
    final canSelfAccept =
        isPending && (responder?.canSelfAssign(widget.emergency.type) ?? false);
    final outOfRole =
        isPending && !(responder?.canSelfAssign(widget.emergency.type) ?? false);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ElevatedButton.icon(
          icon: const Icon(Icons.navigation),
          label: const Text('Route to scene'),
          onPressed: () {
            Navigator.pop(context);
            context.push(
              '/route',
              extra: {
                'lat': widget.emergency.lat,
                'lng': widget.emergency.lng,
                'label': '${widget.emergency.displayType} emergency',
              },
            );
          },
        ),
        if (outOfRole) ...[
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFFFEF3C7),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Row(
              children: [
                Icon(Icons.lock_outline, size: 16, color: AppColors.warningAmber),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Outside your role — only admin can assign this to you.',
                    style: TextStyle(fontSize: 12, color: AppColors.warningAmber),
                  ),
                ),
              ],
            ),
          ),
        ],
        if (canSelfAccept) ...[
          const SizedBox(height: 10),
          ElevatedButton.icon(
            icon: _loading
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.check_circle),
            label: const Text('Accept Emergency'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.responderBlue,
              foregroundColor: Colors.white,
            ),
            onPressed: _loading
                ? null
                : () => _run(() async {
                    await widget.ref
                        .read(emergencyRepositoryProvider)
                        .claimEmergency(widget.emergency.id);
                    if (context.mounted) {
                      Navigator.pop(context);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text(
                            'Emergency accepted — you are now assigned.',
                          ),
                          backgroundColor: AppColors.successGreen,
                        ),
                      );
                      await widget.ref
                          .read(emergencyFeedProvider.notifier)
                          .refresh();
                    }
                  }),
          ),
        ],
        if (isMyAssignment) ...[
          const SizedBox(height: 10),
          ElevatedButton.icon(
            icon: _loading
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.directions_car),
            label: const Text('On the way'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.successGreen,
              foregroundColor: Colors.white,
            ),
            onPressed: _loading
                ? null
                : () => _run(() async {
                    await widget.ref
                        .read(emergencyRepositoryProvider)
                        .markOnTheWay(widget.emergency.id);
                    if (context.mounted) {
                      Navigator.pop(context);
                      await widget.ref
                          .read(emergencyFeedProvider.notifier)
                          .refresh();
                    }
                  }),
          ),
        ],
      ],
    );
  }
}
