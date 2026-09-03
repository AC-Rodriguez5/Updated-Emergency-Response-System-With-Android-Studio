import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/status_badge.dart';
import '../models/ambulance_request_model.dart';
import '../repository/ambulance_repository.dart';
import '../../location_sharing/service/location_service.dart';

class AmbulanceDetailScreen extends ConsumerStatefulWidget {
  final String requestId;
  const AmbulanceDetailScreen({super.key, required this.requestId});
  @override
  ConsumerState<AmbulanceDetailScreen> createState() => _AmbulanceDetailScreenState();
}

class _AmbulanceDetailScreenState extends ConsumerState<AmbulanceDetailScreen> {
  AmbulanceRequestModel? _req;
  bool _loading = true;
  String? _actionError;
  bool _broadcastStarted = false;

  @override
  void initState() { super.initState(); _load(); }

  @override
  void dispose() {
    if (_broadcastStarted) {
      ref.read(locationServiceProvider).stopBroadcast();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final list = await ref.read(ambulanceRepositoryProvider).getMyAssigned();
      final idx = list.indexWhere((r) => r.id == widget.requestId);
      final req = idx >= 0 ? list[idx] : null;
      setState(() { _req = req; _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  Future<void> _action(Future<AmbulanceRequestModel> Function() fn) async {
    setState(() => _actionError = null);
    try {
      final updated = await fn();
      setState(() => _req = updated);
      if (updated.status == 'completed' && mounted) context.go('/duty');
    } on Exception catch (e) { setState(() => _actionError = e.toString()); }
  }

  @override
  Widget build(BuildContext context) {
    final req = _req;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: 'Back',
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go('/ambulance'),
        ),
        title: Text(req?.displayType ?? 'Assignment'),
        actions: req != null ? [Padding(padding: const EdgeInsets.only(right: 12), child: StatusBadge.fromStatus(req.status))] : null,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : req == null
              ? const Center(child: Text('Assignment not found'))
              : SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (req.isEmergencyPriority)
                        Container(
                          width: double.infinity, color: AppColors.alertRed, padding: const EdgeInsets.all(12),
                          child: const Row(children: [Icon(Icons.priority_high, color: Colors.white), SizedBox(width: 8), Text('CRITICAL — Emergency ambulance request', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700))]),
                        ),
                      SizedBox(
                        height: 220,
                        child: FlutterMap(
                          options: MapOptions(initialCenter: LatLng(req.pickupLat, req.pickupLng), initialZoom: 14),
                          children: [
                            TileLayer(
                              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                              userAgentPackageName: 'com.tanzalert.app',
                            ),
                            MarkerLayer(markers: [
                              Marker(point: LatLng(req.pickupLat, req.pickupLng), child: const Icon(Icons.location_on, color: AppColors.successGreen, size: 32)),
                              Marker(point: LatLng(req.dropLat, req.dropLng), child: const Icon(Icons.location_on, color: AppColors.alertRed, size: 32)),
                            ]),
                          ],
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _Section('Patient', [
                              _Row('Name', req.patient['fullName'] as String? ?? '—'),
                              _Row('Contact', req.patient['contactNumber'] as String? ?? '—'),
                              _Row('Condition', req.patient['medicalCondition'] as String? ?? '—'),
                              if (req.patient['specialRequirements'] != null) _Row('Special needs', req.patient['specialRequirements'] as String),
                            ]),
                            if (req.accompanyingPerson != null) ...[
                              const SizedBox(height: 16),
                              _Section('Accompanying Person', [
                                _Row('Name', req.accompanyingPerson!['fullName'] as String? ?? '—'),
                                _Row('Contact', req.accompanyingPerson!['contactNumber'] as String? ?? '—'),
                              ]),
                            ],
                            const SizedBox(height: 16),
                            _Section('Route', [
                              _Row('Pickup', req.pickupLocation['addressLabel'] as String? ?? '—'),
                              _Row('Drop-off', req.dropOffLocation['addressLabel'] as String? ?? '—'),
                              if (req.requestedTime != null) _Row('Scheduled', '${req.requestedDate?.substring(0, 10) ?? ''} ${req.requestedTime}'),
                            ]),
                            if (req.assignedAmbulanceUnitId != null) ...[
                              const SizedBox(height: 16),
                              _Section('Ambulance', [_Row('Unit', 'Unit assigned (ID: ${req.assignedAmbulanceUnitId})')]),
                            ],
                            if (_actionError != null) ...[
                              const SizedBox(height: 12),
                              Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: AppColors.softRed, borderRadius: BorderRadius.circular(8)), child: Text(_actionError!, style: const TextStyle(color: AppColors.alertRed, fontSize: 13))),
                            ],
                            const SizedBox(height: 24),
                            _ActionButtons(req: req, onAction: _action, onNavigate: (lat, lng, label) {
                              ref.read(locationServiceProvider).startBroadcast(ambulanceRequestId: req.id);
                              setState(() => _broadcastStarted = true);
                              context.push('/route', extra: {'lat': lat, 'lng': lng, 'label': label});
                            }),
                            const SizedBox(height: 32),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }
}

class _ActionButtons extends StatelessWidget {
  final AmbulanceRequestModel req;
  final Future<void> Function(Future<AmbulanceRequestModel> Function()) onAction;
  final void Function(double lat, double lng, String label) onNavigate;
  const _ActionButtons({required this.req, required this.onAction, required this.onNavigate});

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      AppButton(
        label: 'Navigate to Pickup',
        icon: Icons.navigation,
        onPressed: () => onNavigate(req.pickupLat, req.pickupLng, 'Pickup: ${req.pickupLocation['addressLabel'] ?? ''}'),
      ),
      const SizedBox(height: 10),
      if (req.status == 'assigned')
        AppButton(label: 'Mark: On the Way', onPressed: () => onAction(() => _resolveRepo(context).markOnTheWay(req.id))),
      if (req.status == 'on_the_way')
        AppButton(label: 'Mark: Arrived at Pickup', onPressed: () => onAction(() => _resolveRepo(context).markArrivedPickup(req.id))),
      if (req.status == 'arrived_pickup') ...[
        AppButton(label: 'Navigate to Drop-off', icon: Icons.navigation, onPressed: () => onNavigate(req.dropLat, req.dropLng, 'Drop-off: ${req.dropOffLocation['addressLabel'] ?? ''}'), backgroundColor: AppColors.successGreen),
        const SizedBox(height: 10),
        AppButton(label: 'Mark: Patient Onboard', onPressed: () => onAction(() => _resolveRepo(context).markPatientOnboard(req.id))),
      ],
      if (req.status == 'patient_onboard')
        AppButton(label: 'Complete Transport', onPressed: () => onAction(() => _resolveRepo(context).complete(req.id)), backgroundColor: AppColors.successGreen),
    ]);
  }

  AmbulanceRepository _resolveRepo(BuildContext context) {
    return ProviderScope.containerOf(context).read(ambulanceRepositoryProvider);
  }
}

class _Section extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _Section(this.title, this.children);

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.border)),
          child: Column(children: children),
        ),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  final String label;
  final String value;
  const _Row(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 110, child: Text(label, style: const TextStyle(fontSize: 13, color: AppColors.textMuted))),
        Expanded(child: Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
      ]),
    );
  }
}
