import 'dart:io';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_button.dart';
import '../repository/auth_repository.dart';
import '../../../core/networking/api_exception.dart';

class RegistrationStep2Screen extends ConsumerStatefulWidget {
  final Map<String, dynamic> step1Data;
  const RegistrationStep2Screen({super.key, required this.step1Data});

  @override
  ConsumerState<RegistrationStep2Screen> createState() => _RegistrationStep2ScreenState();
}

class _RegistrationStep2ScreenState extends ConsumerState<RegistrationStep2Screen> {
  File? _idFile;
  File? _faceFile;
  bool _loading = false;
  String? _error;
  final _picker = ImagePicker();

  Future<void> _pickId() async {
    final picked = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
    if (picked != null) setState(() => _idFile = File(picked.path));
  }

  Future<void> _captureFace() async {
    final cameras = await availableCameras();
    if (!mounted) return;
    final front = cameras.firstWhere(
      (c) => c.lensDirection == CameraLensDirection.front,
      orElse: () => cameras.first,
    );
    final result = await Navigator.push<File>(
      context,
      MaterialPageRoute(builder: (_) => _FaceCaptureScreen(camera: front)),
    );
    if (result != null) setState(() => _faceFile = result);
  }

  Future<void> _submit() async {
    if (_idFile == null) {
      setState(() => _error = 'Please upload your proof of residency ID.');
      return;
    }
    if (_faceFile == null) {
      setState(() => _error = 'Please take a live face photo.');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      final repo = ref.read(authRepositoryProvider);
      final d = widget.step1Data;
      await repo.registerUser(
        name: d['name'] as String,
        email: d['email'] as String,
        phone: d['phone'] as String,
        password: d['password'] as String,
        streetAddress: d['streetAddress'] as String,
        dateOfBirth: DateTime.parse(d['dateOfBirth'] as String),
        bloodType: d['bloodType'] as String,
        emergencyContactName: d['emergencyContactName'] as String,
        emergencyContactNumber: d['emergencyContactNumber'] as String,
        municipality: d['municipality'] as String?,
        barangay: d['barangay'] as String?,
        proofOfResidency: _idFile!,
        faceCapture: _faceFile!,
      );
      if (mounted) context.go('/pending');
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Registration failed. Please try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Create Account'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(4),
          child: LinearProgressIndicator(
            value: 1.0,
            backgroundColor: AppColors.border,
            color: AppColors.alertRed,
          ),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Identity Verification', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            const Text('Step 2 of 2 — ID and face capture', style: TextStyle(fontSize: 14, color: AppColors.textMuted)),
            const SizedBox(height: 24),
            if (_error != null) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: AppColors.softRed, borderRadius: BorderRadius.circular(8)),
                child: Text(_error!, style: const TextStyle(color: AppColors.alertRed)),
              ),
              const SizedBox(height: 16),
            ],
            _FileUploadCard(
              title: 'Proof of Residency / Valid ID',
              subtitle: 'Upload a clear photo of your government-issued ID',
              file: _idFile,
              icon: Icons.badge_outlined,
              onTap: _pickId,
            ),
            const SizedBox(height: 16),
            _FileUploadCard(
              title: 'Live Face Photo',
              subtitle: 'Take a selfie using your front camera',
              file: _faceFile,
              icon: Icons.face_retouching_natural,
              onTap: _captureFace,
              isCamera: true,
            ),
            const SizedBox(height: 24),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.softBlue,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Row(
                children: [
                  Icon(Icons.info_outline, color: AppColors.responderBlue, size: 20),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Your account requires admin approval before you can use TanzAlert. You will be notified once reviewed.',
                      style: TextStyle(fontSize: 12, color: AppColors.responderBlue),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            AppButton(label: 'Submit for Approval', onPressed: _submit, isLoading: _loading),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}

class _FileUploadCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final File? file;
  final IconData icon;
  final VoidCallback onTap;
  final bool isCamera;

  const _FileUploadCard({
    required this.title,
    required this.subtitle,
    required this.file,
    required this.icon,
    required this.onTap,
    this.isCamera = false,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: file != null ? AppColors.successGreen : AppColors.border,
            width: file != null ? 2 : 1,
          ),
        ),
        child: file != null
            ? Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.file(file!, width: 60, height: 60, fit: BoxFit.cover),
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                      const SizedBox(height: 4),
                      const Text('Captured ✓', style: TextStyle(color: AppColors.successGreen, fontSize: 12)),
                    ],
                  )),
                  const Icon(Icons.check_circle, color: AppColors.successGreen),
                ],
              )
            : Row(
                children: [
                  Container(
                    width: 48, height: 48,
                    decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(8)),
                    child: Icon(isCamera ? Icons.camera_alt : Icons.upload_file, color: AppColors.textMuted),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                        const SizedBox(height: 2),
                        Text(subtitle, style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right, color: AppColors.textMuted),
                ],
              ),
      ),
    );
  }
}

class _FaceCaptureScreen extends StatefulWidget {
  final CameraDescription camera;
  const _FaceCaptureScreen({required this.camera});

  @override
  State<_FaceCaptureScreen> createState() => _FaceCaptureScreenState();
}

class _FaceCaptureScreenState extends State<_FaceCaptureScreen> {
  late CameraController _controller;
  late Future<void> _initFuture;

  @override
  void initState() {
    super.initState();
    _controller = CameraController(widget.camera, ResolutionPreset.medium);
    _initFuture = _controller.initialize();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _capture() async {
    final image = await _controller.takePicture();
    if (mounted) Navigator.pop(context, File(image.path));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: FutureBuilder(
        future: _initFuture,
        builder: (_, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          return Stack(
            fit: StackFit.expand,
            children: [
              CameraPreview(_controller),
              Positioned(
                bottom: 40,
                left: 0, right: 0,
                child: Column(
                  children: [
                    const Text(
                      'Position your face in the center',
                      style: TextStyle(color: Colors.white, fontSize: 16),
                    ),
                    const SizedBox(height: 24),
                    GestureDetector(
                      onTap: _capture,
                      child: Container(
                        width: 72, height: 72,
                        decoration: const BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.camera, color: AppColors.alertRed, size: 36),
                      ),
                    ),
                  ],
                ),
              ),
              Positioned(
                top: 48, left: 16,
                child: IconButton(
                  icon: const Icon(Icons.close, color: Colors.white),
                  onPressed: () => Navigator.pop(context),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
