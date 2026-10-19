import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../../../core/networking/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/app_input.dart';
import '../../auth/providers/auth_provider.dart';
import 'map_picker_screen.dart';

class AmbulanceFormScreen extends ConsumerStatefulWidget {
  final String requestType;
  const AmbulanceFormScreen({super.key, required this.requestType});

  @override
  ConsumerState<AmbulanceFormScreen> createState() => _AmbulanceFormScreenState();
}

class _AmbulanceFormScreenState extends ConsumerState<AmbulanceFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _patientNameCtrl = TextEditingController();
  final _patientAddressCtrl = TextEditingController();
  final _patientContactCtrl = TextEditingController();
  final _patientConditionCtrl = TextEditingController();
  final _patientSpecialCtrl = TextEditingController();
  final _accompanyingNameCtrl = TextEditingController();
  final _accompanyingContactCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();

  DateTime? _requestedDate;
  TimeOfDay? _requestedTime;
  bool _loading = false;
  String? _error;
  bool _isTanzaCitizen = true;

  MapPickerResult? _pickupLocation;
  MapPickerResult? _dropoffLocation;

  late bool _needsTimeWindow;

  @override
  void initState() {
    super.initState();
    _needsTimeWindow = widget.requestType != 'emergency';
  }

  @override
  void dispose() {
    _patientNameCtrl.dispose(); _patientAddressCtrl.dispose();
    _patientContactCtrl.dispose(); _patientConditionCtrl.dispose();
    _patientSpecialCtrl.dispose(); _accompanyingNameCtrl.dispose();
    _accompanyingContactCtrl.dispose(); _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickPickupLocation() async {
    final result = await Navigator.of(context).push<MapPickerResult>(
      MaterialPageRoute(
        builder: (_) => MapPickerScreen(
          title: 'Select Pickup Location',
          mode: MapPickerMode.pickup,
          initialLat: _pickupLocation?.lat,
          initialLng: _pickupLocation?.lng,
          initialLabel: _pickupLocation?.label,
        ),
      ),
    );
    if (result != null) setState(() => _pickupLocation = result);
  }

  Future<void> _pickDropoffLocation() async {
    final result = await Navigator.of(context).push<MapPickerResult>(
      MaterialPageRoute(
        builder: (_) => MapPickerScreen(
          title: 'Select Drop-off Location',
          mode: MapPickerMode.dropoff,
          initialLat: _dropoffLocation?.lat,
          initialLng: _dropoffLocation?.lng,
          initialLabel: _dropoffLocation?.label,
        ),
      ),
    );
    if (result != null) setState(() => _dropoffLocation = result);
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now().add(const Duration(days: 1)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 90)),
    );
    if (picked != null) setState(() => _requestedDate = picked);
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: const TimeOfDay(hour: 15, minute: 0),
    );
    if (picked != null) {
      if (picked.hour < 15 || picked.hour > 18 || (picked.hour == 18 && picked.minute > 0)) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Schedule/Transfer only allowed 3:00 PM – 7:00 PM.')),
          );
        }
        return;
      }
      setState(() => _requestedTime = picked);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_pickupLocation == null) {
      setState(() => _error = 'Select a pickup location on the map.');
      return;
    }
    if (_dropoffLocation == null) {
      setState(() => _error = 'Select a drop-off location on the map.');
      return;
    }
    if (_needsTimeWindow) {
      if (_requestedDate == null || _requestedTime == null) {
        setState(() => _error = 'Select date and time for Schedule/Transfer.');
        return;
      }
    }
    setState(() { _loading = true; _error = null; });
    try {
      final user = ref.read(currentUserProvider);
      final dio = ref.read(dioProvider);
      final body = <String, dynamic>{
        'requestType': widget.requestType,
        'patient': {
          'fullName': _patientNameCtrl.text.trim(),
          'address': _patientAddressCtrl.text.trim(),
          'contactNumber': _patientContactCtrl.text.trim(),
          'medicalCondition': _patientConditionCtrl.text.trim(),
          if (_patientSpecialCtrl.text.trim().isNotEmpty)
            'specialRequirements': _patientSpecialCtrl.text.trim(),
        },
        'pickupLocation': {
          'type': 'Point',
          'coordinates': [_pickupLocation!.lng, _pickupLocation!.lat],
          'addressLabel': _pickupLocation!.label,
        },
        'dropOffLocation': {
          'type': 'Point',
          'coordinates': [_dropoffLocation!.lng, _dropoffLocation!.lat],
          'addressLabel': _dropoffLocation!.label,
        },
        'isTanzaCitizen': _isTanzaCitizen,
        if (user?.barangay != null) 'barangay': user!.barangay,
        if (_accompanyingNameCtrl.text.trim().isNotEmpty)
          'accompanyingPerson': {
            'fullName': _accompanyingNameCtrl.text.trim(),
            'contactNumber': _accompanyingContactCtrl.text.trim(),
          },
        if (_needsTimeWindow && _requestedDate != null)
          'requestedDate': _requestedDate!.toIso8601String().split('T').first,
        if (_needsTimeWindow && _requestedTime != null)
          'requestedTime':
              '${_requestedTime!.hour.toString().padLeft(2, '0')}:${_requestedTime!.minute.toString().padLeft(2, '0')}',
        if (_notesCtrl.text.trim().isNotEmpty) 'notes': _notesCtrl.text.trim(),
      };
      final res = await dio.post('/ambulance-requests', data: body);
      final data = (res.data as Map<String, dynamic>)['data'] as Map<String, dynamic>;
      final reqId = data['_id'] as String;
      if (mounted) context.go('/home/ambulance/$reqId');
    } on DioException catch (e) {
      final ex = dioErrorToApiException(e);
      setState(() => _error = ex.message);
    } catch (_) {
      setState(() => _error = 'Failed to submit request. Try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final typeLabel = switch (widget.requestType) {
      'emergency' => 'Emergency Transport',
      'schedule' => 'Scheduled Transport',
      'transfer' => 'Hospital Transfer',
      _ => 'Transport Request',
    };
    final typeColor =
        widget.requestType == 'emergency' ? AppColors.alertRed : AppColors.responderBlue;

    return Scaffold(
      appBar: AppBar(title: Text(typeLabel)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (widget.requestType == 'emergency')
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.softRed,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.priority_high, color: AppColors.alertRed),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Emergency request — goes directly to admin for priority review.',
                          style: TextStyle(color: AppColors.alertRed, fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
              if (widget.requestType != 'emergency')
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.softBlue,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'Schedule and Transfer requests are available 3:00 PM – 7:00 PM only.',
                    style: TextStyle(color: AppColors.responderBlue, fontSize: 13),
                  ),
                ),

              // ── Location section ──────────────────────────────────────
              const SizedBox(height: 20),
              const Text(
                'Locations',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 12),
              _LocationCard(
                label: 'Pickup Location',
                icon: Icons.trip_origin,
                iconColor: AppColors.successGreen,
                result: _pickupLocation,
                onTap: _pickPickupLocation,
              ),
              const SizedBox(height: 10),
              _LocationCard(
                label: 'Drop-off Location',
                icon: Icons.location_on,
                iconColor: AppColors.alertRed,
                result: _dropoffLocation,
                onTap: _pickDropoffLocation,
              ),

              // ── Patient info ──────────────────────────────────────────
              const SizedBox(height: 20),
              const Text(
                'Patient Information',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 12),
              AppInput(
                label: 'Patient full name',
                controller: _patientNameCtrl,
                validator: (v) => v!.trim().isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              AppInput(
                label: 'Patient address',
                controller: _patientAddressCtrl,
                validator: (v) => v!.trim().isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              AppInput(
                label: 'Contact number',
                controller: _patientContactCtrl,
                keyboardType: TextInputType.phone,
                validator: (v) => v!.trim().length < 7 ? 'Enter valid number' : null,
              ),
              const SizedBox(height: 12),
              AppInput(
                label: 'Medical condition',
                controller: _patientConditionCtrl,
                maxLines: 3,
                validator: (v) => v!.trim().isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              AppInput(
                label: 'Special requirements (optional)',
                controller: _patientSpecialCtrl,
                maxLines: 2,
              ),

              // ── Accompanying person ───────────────────────────────────
              const SizedBox(height: 20),
              const Text(
                'Accompanying Person',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 12),
              AppInput(
                label: 'Accompanying person name (optional)',
                controller: _accompanyingNameCtrl,
              ),
              const SizedBox(height: 12),
              AppInput(
                label: 'Accompanying person contact',
                controller: _accompanyingContactCtrl,
                keyboardType: TextInputType.phone,
              ),

              // ── Tanza citizen toggle ──────────────────────────────────
              const SizedBox(height: 20),
              Row(
                children: [
                  const Text(
                    'Tanza Citizen/Resident',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                  ),
                  const Spacer(),
                  Switch(
                    value: _isTanzaCitizen,
                    onChanged: (v) => setState(() => _isTanzaCitizen = v),
                    activeThumbColor: typeColor,
                  ),
                ],
              ),
              const SizedBox(height: 4),
              const Text(
                'Tanza residents receive priority in MDRRMO review.',
                style: TextStyle(fontSize: 12, color: AppColors.textMuted),
              ),

              // ── Schedule window ───────────────────────────────────────
              if (_needsTimeWindow) ...[
                const SizedBox(height: 20),
                const Text(
                  'Schedule',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        icon: const Icon(Icons.calendar_today, size: 16),
                        label: Text(
                          _requestedDate == null
                              ? 'Select date'
                              : '${_requestedDate!.day}/${_requestedDate!.month}/${_requestedDate!.year}',
                        ),
                        onPressed: _pickDate,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: OutlinedButton.icon(
                        icon: const Icon(Icons.access_time, size: 16),
                        label: Text(
                          _requestedTime == null
                              ? 'Select time'
                              : '${_requestedTime!.hour.toString().padLeft(2, '0')}:${_requestedTime!.minute.toString().padLeft(2, '0')}',
                        ),
                        onPressed: _pickTime,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                const Text(
                  'Available times: 3:00 PM – 7:00 PM only',
                  style: TextStyle(fontSize: 11, color: AppColors.textMuted),
                ),
              ],

              const SizedBox(height: 20),
              AppInput(
                label: 'Additional notes (optional)',
                controller: _notesCtrl,
                maxLines: 3,
              ),
              const SizedBox(height: 24),

              if (_error != null) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.softRed,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    _error!,
                    style: const TextStyle(color: AppColors.alertRed),
                  ),
                ),
                const SizedBox(height: 12),
              ],

              AppButton(
                label: 'Submit Request',
                onPressed: _submit,
                isLoading: _loading,
                backgroundColor: typeColor,
              ),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }
}

class _LocationCard extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color iconColor;
  final MapPickerResult? result;
  final VoidCallback onTap;

  const _LocationCard({
    required this.label,
    required this.icon,
    required this.iconColor,
    required this.result,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isSet = result != null;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isSet ? AppColors.surface : AppColors.background,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSet ? iconColor : AppColors.border,
            width: isSet ? 1.5 : 1,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: iconColor, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textMuted,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 2),
                  if (isSet) ...[
                    Text(
                      result!.label,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textStrong,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${result!.lat.toStringAsFixed(5)}, ${result!.lng.toStringAsFixed(5)}',
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.textMuted,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ] else
                    const Text(
                      'Tap to select on map',
                      style: TextStyle(
                        fontSize: 14,
                        color: AppColors.textMuted,
                      ),
                    ),
                ],
              ),
            ),
            Icon(
              isSet ? Icons.edit_location_alt : Icons.map_outlined,
              color: isSet ? iconColor : AppColors.textMuted,
            ),
          ],
        ),
      ),
    );
  }
}
