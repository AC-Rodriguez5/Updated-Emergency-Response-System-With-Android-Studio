import 'dart:io';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/app_input.dart';
import '../repository/auth_repository.dart';
import '../../../core/networking/api_exception.dart';

class RegistrationScreen extends ConsumerStatefulWidget {
  const RegistrationScreen({super.key});
  @override
  ConsumerState<RegistrationScreen> createState() => _RegistrationScreenState();
}

class _RegistrationScreenState extends ConsumerState<RegistrationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _badgeCtrl = TextEditingController();
  final _stationCtrl = TextEditingController();
  final _positionCtrl = TextEditingController();
  final _coverageCtrl = TextEditingController();
  String _department = 'medical';
  String? _agencyType;
  File? _credFile;
  File? _faceFile;
  bool _obscure = true;
  bool _loading = false;
  String? _error;
  final _picker = ImagePicker();

  @override
  void dispose() {
    _nameCtrl.dispose(); _emailCtrl.dispose(); _phoneCtrl.dispose();
    _passCtrl.dispose(); _badgeCtrl.dispose(); _stationCtrl.dispose();
    _positionCtrl.dispose(); _coverageCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickCredential() async {
    final picked = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
    if (picked != null) setState(() => _credFile = File(picked.path));
  }

  Future<void> _captureFace() async {
    final cameras = await availableCameras();
    if (!mounted) return;
    final front = cameras.firstWhere(
      (c) => c.lensDirection == CameraLensDirection.front,
      orElse: () => cameras.first,
    );
    final result = await Navigator.push<File>(context, MaterialPageRoute(builder: (_) => _FaceCapture(camera: front)));
    if (result != null) setState(() => _faceFile = result);
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_credFile == null) { setState(() => _error = 'Upload your credential document.'); return; }
    if (_faceFile == null) { setState(() => _error = 'Take a live face photo.'); return; }
    setState(() { _loading = true; _error = null; });
    try {
      await ref.read(authRepositoryProvider).registerResponder(
        name: _nameCtrl.text.trim(), email: _emailCtrl.text.trim(),
        password: _passCtrl.text, badgeId: _badgeCtrl.text.trim(),
        department: _department, agencyType: _agencyType,
        phone: _phoneCtrl.text.trim().isEmpty ? null : _phoneCtrl.text.trim(),
        stationName: _stationCtrl.text.trim().isEmpty ? null : _stationCtrl.text.trim(),
        position: _positionCtrl.text.trim().isEmpty ? null : _positionCtrl.text.trim(),
        coverageArea: _coverageCtrl.text.trim().isEmpty ? null : _coverageCtrl.text.trim(),
        faceFile: _faceFile,
        credFile: _credFile,
      );
      if (mounted) context.go('/pending');
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Registration failed. Try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Responder Registration')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_error != null) ...[
                Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: AppColors.softRed, borderRadius: BorderRadius.circular(8)), child: Text(_error!, style: const TextStyle(color: AppColors.alertRed))),
                const SizedBox(height: 12),
              ],
              const Text('Personal Details', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              AppInput(label: 'Full name', controller: _nameCtrl, validator: (v) => v!.trim().isEmpty ? 'Required' : null),
              const SizedBox(height: 12),
              AppInput(label: 'Email', controller: _emailCtrl, keyboardType: TextInputType.emailAddress, validator: (v) => !v!.contains('@') ? 'Enter valid email' : null),
              const SizedBox(height: 12),
              AppInput(label: 'Mobile number', controller: _phoneCtrl, keyboardType: TextInputType.phone),
              const SizedBox(height: 12),
              AppInput(label: 'Password (min 8 chars)', controller: _passCtrl, obscureText: _obscure,
                  suffix: IconButton(icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility), onPressed: () => setState(() => _obscure = !_obscure)),
                  validator: (v) => v!.length < 8 ? 'Min 8 chars' : null),
              const SizedBox(height: 20),
              const Text('Agency Information', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              AppInput(label: 'Badge / Credential number', controller: _badgeCtrl, validator: (v) => v!.trim().isEmpty ? 'Required' : null),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _department,
                decoration: const InputDecoration(labelText: 'Department'),
                items: const [
                  DropdownMenuItem(value: 'medical', child: Text('Medical')),
                  DropdownMenuItem(value: 'police', child: Text('Police (PNP)')),
                  DropdownMenuItem(value: 'fire', child: Text('Fire (BFP)')),
                  DropdownMenuItem(value: 'rescue', child: Text('Rescue')),
                  DropdownMenuItem(value: 'barangay', child: Text('Barangay')),
                ],
                onChanged: (v) => setState(() => _department = v ?? 'medical'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _agencyType,
                decoration: const InputDecoration(labelText: 'Agency type (optional)'),
                items: const [
                  DropdownMenuItem(value: 'mdrrmo', child: Text('MDRRMO')),
                  DropdownMenuItem(value: 'pnp', child: Text('PNP')),
                  DropdownMenuItem(value: 'bfp', child: Text('BFP')),
                  DropdownMenuItem(value: 'medical', child: Text('Medical')),
                  DropdownMenuItem(value: 'rescue', child: Text('Rescue')),
                  DropdownMenuItem(value: 'barangay', child: Text('Barangay')),
                  DropdownMenuItem(value: 'other', child: Text('Other')),
                ],
                onChanged: (v) => setState(() => _agencyType = v),
              ),
              const SizedBox(height: 12),
              AppInput(label: 'Station name (optional)', controller: _stationCtrl),
              const SizedBox(height: 12),
              AppInput(label: 'Position / Role (optional)', controller: _positionCtrl),
              const SizedBox(height: 12),
              AppInput(label: 'Coverage area (optional)', controller: _coverageCtrl),
              const SizedBox(height: 20),
              const Text('Verification Documents', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              _DocCard(label: 'Professional Credential', file: _credFile, icon: Icons.badge, onTap: _pickCredential),
              const SizedBox(height: 12),
              _DocCard(label: 'Live Face Photo', file: _faceFile, icon: Icons.face, onTap: _captureFace, isCamera: true),
              const SizedBox(height: 24),
              AppButton(label: 'Submit for Approval', onPressed: _submit, isLoading: _loading, backgroundColor: AppColors.responderBlue),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }
}

class _DocCard extends StatelessWidget {
  final String label;
  final File? file;
  final IconData icon;
  final VoidCallback onTap;
  final bool isCamera;
  const _DocCard({required this.label, this.file, required this.icon, required this.onTap, this.isCamera = false});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: file != null ? AppColors.successGreen : AppColors.border, width: file != null ? 2 : 1),
        ),
        child: Row(
          children: [
            if (file != null)
              ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.file(file!, width: 56, height: 56, fit: BoxFit.cover))
            else
              Container(width: 48, height: 48, decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(8)), child: Icon(isCamera ? Icons.camera_alt : icon, color: AppColors.textMuted)),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              Text(file != null ? '✓ Captured' : isCamera ? 'Take selfie' : 'Tap to upload', style: TextStyle(fontSize: 12, color: file != null ? AppColors.successGreen : AppColors.textMuted)),
            ])),
            Icon(file != null ? Icons.check_circle : Icons.chevron_right, color: file != null ? AppColors.successGreen : AppColors.textMuted),
          ],
        ),
      ),
    );
  }
}

class _FaceCapture extends StatefulWidget {
  final CameraDescription camera;
  const _FaceCapture({required this.camera});
  @override
  State<_FaceCapture> createState() => _FaceCaptureState();
}

class _FaceCaptureState extends State<_FaceCapture> {
  late CameraController _ctrl;
  late Future<void> _init;
  @override
  void initState() { super.initState(); _ctrl = CameraController(widget.camera, ResolutionPreset.medium); _init = _ctrl.initialize(); }
  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  Future<void> _capture() async {
    final img = await _ctrl.takePicture();
    if (mounted) Navigator.pop(context, File(img.path));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: FutureBuilder(
        future: _init,
        builder: (_, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          return Stack(fit: StackFit.expand, children: [
            CameraPreview(_ctrl),
            Positioned(bottom: 40, left: 0, right: 0, child: Column(children: [
              const Text('Center your face', style: TextStyle(color: Colors.white, fontSize: 16)),
              const SizedBox(height: 24),
              GestureDetector(
                onTap: _capture,
                child: Container(width: 72, height: 72, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle), child: const Icon(Icons.camera, color: AppColors.responderBlue, size: 36)),
              ),
            ])),
            Positioned(top: 48, left: 16, child: IconButton(icon: const Icon(Icons.close, color: Colors.white), onPressed: () => Navigator.pop(context))),
          ]);
        },
      ),
    );
  }
}
