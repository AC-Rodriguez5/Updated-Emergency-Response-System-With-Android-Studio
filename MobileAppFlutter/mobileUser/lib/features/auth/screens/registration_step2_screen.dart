import 'dart:io';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:safealert_ui/safealert_ui.dart';
import '../../../core/captcha/captcha_field.dart';
import '../../../core/captcha/captcha_service.dart';
import '../repository/auth_repository.dart';
import '../../../core/networking/api_exception.dart';
import '../widgets/auth_chrome.dart';

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
  final _captcha = CaptchaFieldController();

  @override
  void dispose() {
    _captcha.dispose();
    super.dispose();
  }

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
    // Answered on the form above, when the deployment draws its own challenge.
    // A no-op otherwise, so this reads the same either way.
    if (!_captcha.validate()) return;
    setState(() { _loading = true; _error = null; });
    try {
      final captcha = ref.read(captchaServiceProvider);
      var captchaToken = _captcha.token;
      if (captchaToken == null && await captcha.mode() == CaptchaMode.webview) {
        // A hosted provider: its widget cannot live on the form, so it opens
        // here instead.
        if (!mounted) return;
        captchaToken = await captcha.solve(context);
        if (captchaToken == null) {
          setState(() => _error = 'Security check cancelled. Please try again.');
          return;
        }
      }

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
        captchaToken: captchaToken,
        consentVersion: d['consentVersion'] as String?,
        consentScopes: d['consentScopes'] as String?,
      );
      if (mounted) context.go('/pending');
    } on ApiException catch (e) {
      // The challenge is spent whether or not it was read correctly, so a
      // rejected one has to be replaced before they can try again.
      if (e.isCaptchaFailure) _captcha.refresh();
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Registration failed. Please try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthBackdrop(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AuthStepHeader(step: 2),
          const SizedBox(height: 16),
          const TanzAlertAuthHero(
            eyebrow: 'Resident registration',
            title: 'Verify it is really you.',
            description:
                'A valid ID and a live photo. MDRRMO reviews both before your account opens.',
            icon: Icons.verified_user_outlined,
          ),
          const SizedBox(height: 18),
          if (_error != null) ...[
            AuthErrorBanner(message: _error!),
            const SizedBox(height: 16),
          ],
          _identityCard(),
          const SizedBox(height: 16),
          const AuthNotice(
            message:
                'Your account requires admin approval before you can use TanzAlert. '
                'You will be notified once it has been reviewed.',
          ),
          const SizedBox(height: 16),
          _submitCard(),
        ],
      ),
    );
  }

  Widget _identityCard() {
    return TanzAlertPanel(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const TanzAlertSectionHeader(
            eyebrow: 'Identity',
            title: 'Proof of residency',
            description: 'Both are required, and both stay with MDRRMO.',
          ),
          const SizedBox(height: 18),
          _FileUploadCard(
            title: 'Proof of residency / valid ID',
            subtitle: 'A clear photo of your government-issued ID',
            file: _idFile,
            icon: Icons.badge_outlined,
            onTap: _pickId,
          ),
          const SizedBox(height: 12),
          _FileUploadCard(
            title: 'Live face photo',
            subtitle: 'A selfie taken with your front camera',
            file: _faceFile,
            icon: Icons.face_retouching_natural,
            onTap: _captureFace,
            isCamera: true,
          ),
        ],
      ),
    );
  }

  Widget _submitCard() {
    return TanzAlertPanel(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const TanzAlertSectionHeader(
            eyebrow: 'Final step',
            title: 'Confirm and submit',
          ),
          const SizedBox(height: 16),
          CaptchaField(
            controller: _captcha,
            // Inside a white panel, so the challenge reads as an inset well.
            background: AppColors.background,
          ),
          const SizedBox(height: 18),
          AppButton(
            label: 'Submit for approval',
            onPressed: _submit,
            isLoading: _loading,
          ),
        ],
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
    final done = file != null;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Ink(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: done ? AppColors.softGreen : AppColors.background,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: done ? AppColors.successGreen : AppColors.border,
            ),
          ),
          child: Row(
            children: [
              if (done)
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Image.file(
                    file!,
                    width: 46,
                    height: 46,
                    fit: BoxFit.cover,
                  ),
                )
              else
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    color: AppColors.softBlue,
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: Icon(icon, size: 21, color: AppColors.responderBlue),
                ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 13.5,
                        color: AppColors.textStrong,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      done ? 'Captured - tap to replace' : subtitle,
                      style: TextStyle(
                        color: done
                            ? AppColors.successGreen
                            : AppColors.textMuted,
                        fontSize: 12,
                        fontWeight: done ? FontWeight.w700 : FontWeight.w400,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                done
                    ? Icons.check_circle
                    : isCamera
                    ? Icons.photo_camera_outlined
                    : Icons.chevron_right,
                color: done ? AppColors.successGreen : AppColors.textMuted,
                size: done ? 22 : 20,
              ),
            ],
          ),
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
