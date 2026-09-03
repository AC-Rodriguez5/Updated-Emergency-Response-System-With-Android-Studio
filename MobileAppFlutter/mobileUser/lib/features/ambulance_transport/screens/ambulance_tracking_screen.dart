import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';
import 'package:dio/dio.dart';
import '../../../../core/config/app_config.dart';
import '../../../../core/networking/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/status_badge.dart';
import '../models/ambulance_request_model.dart';

class AmbulanceTrackingScreen extends ConsumerStatefulWidget {
  final String requestId;
  const AmbulanceTrackingScreen({super.key, required this.requestId});

  @override
  ConsumerState<AmbulanceTrackingScreen> createState() => _AmbulanceTrackingScreenState();
}

class _AmbulanceTrackingScreenState extends ConsumerState<AmbulanceTrackingScreen> {
  AmbulanceRequestModel? _request;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() { _loading = true; _error = null; });
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.get('/ambulance-requests/${widget.requestId}');
      final data = (res.data as Map<String, dynamic>)['data'] as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _request = AmbulanceRequestModel.fromJson(data);
        _loading = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.response?.statusCode == 404
            ? 'Request not found.'
            : 'Failed to load request. Pull to retry.';
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Failed to load request.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Request Status'),
        actions: [
          if (_request != null)
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: Center(child: StatusBadge.fromStatus(_request!.status)),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _ErrorView(message: _error!, onRetry: _fetch)
              : _request == null
                  ? const Center(child: Text('No data'))
                  : RefreshIndicator(
                      onRefresh: _fetch,
                      child: ListView(
                        padding: EdgeInsets.zero,
                        children: [
                          _MapCard(request: _request!),
                          _StatusSummary(request: _request!),
                          if (_request!.isRejected && (_request!.rejectionReason ?? '').isNotEmpty)
                            _RejectionBanner(reason: _request!.rejectionReason!),
                          _DetailsSection(request: _request!),
                          const SizedBox(height: 24),
                        ],
                      ),
                    ),
    );
  }
}

class _MapCard extends StatelessWidget {
  final AmbulanceRequestModel request;
  const _MapCard({required this.request});

  @override
  Widget build(BuildContext context) {
    final pickup = request.pickupLat != null && request.pickupLng != null
        ? LatLng(request.pickupLat!, request.pickupLng!)
        : null;
    final dropoff = request.dropoffLat != null && request.dropoffLng != null
        ? LatLng(request.dropoffLat!, request.dropoffLng!)
        : null;

    final markers = <Marker>[
      if (pickup != null)
        Marker(
          point: pickup,
          width: 36,
          height: 36,
          alignment: Alignment.topCenter,
          child: const Icon(Icons.location_on, color: AppColors.alertRed, size: 36),
        ),
      if (dropoff != null)
        Marker(
          point: dropoff,
          width: 36,
          height: 36,
          alignment: Alignment.topCenter,
          child: const Icon(Icons.local_hospital, color: AppColors.responderBlue, size: 32),
        ),
    ];

    final center = pickup ?? dropoff ?? LatLng(AppConfig.tanzaCenterLat, AppConfig.tanzaCenterLng);

    return SizedBox(
      height: 220,
      child: FlutterMap(
        options: MapOptions(
          initialCenter: center,
          initialZoom: 13,
          interactionOptions: const InteractionOptions(flags: InteractiveFlag.none),
        ),
        children: [
          TileLayer(
            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            userAgentPackageName: 'com.tanzalert.app',
          ),
          if (pickup != null && dropoff != null)
            PolylineLayer(polylines: [
              Polyline(
                points: [pickup, dropoff],
                strokeWidth: 3,
                color: AppColors.alertRed.withValues(alpha: 0.6),
              ),
            ]),
          MarkerLayer(markers: markers),
        ],
      ),
    );
  }
}

class _StatusSummary extends StatelessWidget {
  final AmbulanceRequestModel request;
  const _StatusSummary({required this.request});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      color: AppColors.surface,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_statusLabel(request.status),
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(_statusDescription(request.status),
              style: const TextStyle(fontSize: 13, color: AppColors.textMuted)),
        ],
      ),
    );
  }
}

class _RejectionBanner extends StatelessWidget {
  final String reason;
  const _RejectionBanner({required this.reason});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.softRed,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.alertRed.withValues(alpha: 0.4)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.cancel_outlined, color: AppColors.alertRed),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Rejection reason',
                    style: TextStyle(fontSize: 12, color: AppColors.alertRed, fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(reason, style: const TextStyle(fontSize: 13, color: AppColors.alertRed)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DetailsSection extends StatelessWidget {
  final AmbulanceRequestModel request;
  const _DetailsSection({required this.request});

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('MMM d, yyyy · h:mm a');
    final shortId =
        request.id.length > 8 ? request.id.substring(request.id.length - 8).toUpperCase() : request.id.toUpperCase();
    final unit = request.assignedUnit;
    final responder = request.assignedResponder;

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Card(
            title: 'Request',
            children: [
              _Row(label: 'Request ID', value: '#$shortId'),
              _Row(label: 'Type', value: request.displayType),
              _Row(label: 'Date submitted', value: dateFmt.format(request.createdAt.toLocal())),
              if (request.updatedAt != null)
                _Row(label: 'Last updated', value: dateFmt.format(request.updatedAt!.toLocal())),
            ],
          ),
          const SizedBox(height: 12),
          _Card(
            title: 'Locations',
            children: [
              _Row(
                label: 'Pickup',
                value: request.pickupAddress,
                icon: Icons.my_location,
                iconColor: AppColors.alertRed,
              ),
              _Row(
                label: 'Drop-off',
                value: request.dropoffAddress,
                icon: Icons.local_hospital,
                iconColor: AppColors.responderBlue,
              ),
            ],
          ),
          const SizedBox(height: 12),
          _Card(
            title: 'Assigned Resources',
            children: [
              _Row(
                label: 'Ambulance unit',
                value: unit == null ? 'Awaiting assignment' : unit.displayName,
                muted: unit == null,
              ),
              _Row(
                label: 'Plate number',
                value: unit?.plateNumber ?? '—',
                muted: unit?.plateNumber == null,
              ),
              _Row(
                label: 'Responder',
                value: responder?.name ?? 'Awaiting assignment',
                muted: responder == null,
              ),
              if (responder?.roleLabel.isNotEmpty == true)
                _Row(label: 'Role', value: responder!.roleLabel),
              if ((responder?.phone ?? '').isNotEmpty)
                _Row(label: 'Contact', value: responder!.phone!),
            ],
          ),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _Card({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textMuted,
                  letterSpacing: 0.4)),
          const SizedBox(height: 10),
          ...children,
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  final String label;
  final String value;
  final IconData? icon;
  final Color? iconColor;
  final bool muted;

  const _Row({
    required this.label,
    required this.value,
    this.icon,
    this.iconColor,
    this.muted = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 16, color: iconColor ?? AppColors.textMuted),
            const SizedBox(width: 8),
          ],
          SizedBox(
            width: 110,
            child: Text(label,
                style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: muted ? AppColors.textMuted : null,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 40, color: AppColors.textMuted),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

String _statusLabel(String s) => switch (s) {
      'pending_review' => 'Awaiting Admin Review',
      'approved' => 'Approved — Awaiting Dispatch',
      'assigned' => 'Ambulance Assigned',
      'on_the_way' => 'Ambulance On the Way',
      'arrived_pickup' => 'Arrived at Pickup',
      'patient_onboard' => 'Patient Onboard',
      'completed' => 'Transport Completed',
      'rejected' => 'Request Rejected',
      'cancelled' => 'Request Cancelled',
      _ => s,
    };

String _statusDescription(String s) => switch (s) {
      'pending_review' => 'MDRRMO admin is reviewing your request.',
      'approved' => 'Your request is approved. Admin is assigning an ambulance.',
      'assigned' => 'An ambulance and responder have been assigned.',
      'on_the_way' => 'Your ambulance is en route to your pickup location.',
      'arrived_pickup' => 'The ambulance has arrived at your pickup location.',
      'patient_onboard' => 'The patient is onboard. En route to drop-off.',
      'completed' => 'Transport has been completed. Thank you.',
      'rejected' => 'Your request was rejected. See reason below.',
      'cancelled' => 'This request was cancelled.',
      _ => '',
    };
