import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/app_input.dart';

const _tanzaBarangays = [
  'Amaya I', 'Amaya II', 'Amaya III', 'Amaya IV', 'Amaya V', 'Amaya VI',
  'Amaya VII', 'Bagtas', 'Biga', 'Biwas', 'Bucal', 'Bunga', 'Calibuyo',
  'Capipisa', 'Daang Amaya I', 'Daang Amaya II', 'Daang Amaya III',
  'Halayhay', 'Julugan I', 'Julugan II', 'Julugan III', 'Julugan IV',
  'Julugan V', 'Julugan VI', 'Julugan VII', 'Julugan VIII', 'Lambingan',
  'Mulawin', 'Paradahan I', 'Paradahan II', 'Punta I', 'Punta II',
  'Sahud Ulan', 'Sanja Mayor', 'Santol', 'Tanauan', 'Tres Cruses',
  'Barangay I (Poblacion)', 'Barangay II (Poblacion)',
  'Barangay III (Poblacion)', 'Barangay IV (Poblacion)',
];

class RegistrationStep1Screen extends StatefulWidget {
  const RegistrationStep1Screen({super.key});

  @override
  State<RegistrationStep1Screen> createState() => _RegistrationStep1ScreenState();
}

const _bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

class _RegistrationStep1ScreenState extends State<RegistrationStep1Screen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  final _streetCtrl = TextEditingController();
  final _dobCtrl = TextEditingController();
  final _ecNameCtrl = TextEditingController();
  final _ecNumberCtrl = TextEditingController();
  String _municipality = 'Tanza';
  String? _barangay;
  String? _bloodType;
  DateTime? _dob;
  bool _obscure = true;
  bool _consent = false;

  @override
  void dispose() {
    _nameCtrl.dispose(); _emailCtrl.dispose(); _phoneCtrl.dispose();
    _passCtrl.dispose(); _confirmCtrl.dispose();
    _streetCtrl.dispose(); _dobCtrl.dispose();
    _ecNameCtrl.dispose(); _ecNumberCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDob() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _dob ?? DateTime(now.year - 25, now.month, now.day),
      firstDate: DateTime(now.year - 120),
      lastDate: now,
    );
    if (picked != null) {
      setState(() {
        _dob = picked;
        _dobCtrl.text =
            '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
      });
    }
  }

  void _next() {
    if (!_formKey.currentState!.validate()) return;
    if (_dob == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select your date of birth.')),
      );
      return;
    }
    if (_bloodType == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select your blood type.')),
      );
      return;
    }
    if (!_consent) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please accept consent to location sharing.')),
      );
      return;
    }
    context.push('/register/step2', extra: {
      'name': _nameCtrl.text.trim(),
      'email': _emailCtrl.text.trim().toLowerCase(),
      'phone': _phoneCtrl.text.trim(),
      'password': _passCtrl.text,
      'municipality': _municipality,
      'barangay': _barangay ?? '',
      'streetAddress': _streetCtrl.text.trim(),
      'dateOfBirth': _dob!.toIso8601String(),
      'bloodType': _bloodType!,
      'emergencyContactName': _ecNameCtrl.text.trim(),
      'emergencyContactNumber': _ecNumberCtrl.text.trim(),
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Create Account'),
        leading: const BackButton(),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(4),
          child: LinearProgressIndicator(
            value: 0.5,
            backgroundColor: AppColors.border,
            color: AppColors.alertRed,
          ),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Personal Information', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              const Text('Step 1 of 2 — Basic details', style: TextStyle(fontSize: 14, color: AppColors.textMuted)),
              const SizedBox(height: 24),
              AppInput(
                label: 'Full name',
                controller: _nameCtrl,
                validator: (v) => v == null || v.trim().isEmpty ? 'Full name is required' : null,
              ),
              const SizedBox(height: 16),
              AppInput(
                label: 'Email address',
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                validator: (v) => v == null || !v.contains('@') ? 'Enter a valid email' : null,
              ),
              const SizedBox(height: 16),
              AppInput(
                label: 'Mobile number',
                controller: _phoneCtrl,
                keyboardType: TextInputType.phone,
                validator: (v) => v == null || v.trim().length < 7 ? 'Enter a valid phone number' : null,
              ),
              const SizedBox(height: 16),
              AppInput(
                label: 'Password',
                controller: _passCtrl,
                obscureText: _obscure,
                suffix: IconButton(
                  icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility),
                  onPressed: () => setState(() => _obscure = !_obscure),
                ),
                validator: (v) => v == null || v.length < 8 ? 'Password must be at least 8 characters' : null,
              ),
              const SizedBox(height: 16),
              AppInput(
                label: 'Confirm password',
                controller: _confirmCtrl,
                obscureText: true,
                validator: (v) => v != _passCtrl.text ? 'Passwords do not match' : null,
              ),
              const SizedBox(height: 24),
              const Text('Personal Details', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              AppInput(
                label: 'Date of birth',
                controller: _dobCtrl,
                readOnly: true,
                onTap: _pickDob,
                suffix: const Icon(Icons.calendar_today, size: 18),
                validator: (v) => v == null || v.isEmpty ? 'Select your date of birth' : null,
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _bloodType,
                decoration: const InputDecoration(labelText: 'Blood type'),
                hint: const Text('Select blood type'),
                items: _bloodTypes
                    .map((b) => DropdownMenuItem(value: b, child: Text(b)))
                    .toList(),
                onChanged: (v) => setState(() => _bloodType = v),
                validator: (v) => v == null || v.isEmpty ? 'Select your blood type' : null,
              ),
              const SizedBox(height: 24),
              const Text('Location', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _municipality,
                decoration: const InputDecoration(labelText: 'Municipality / City'),
                items: const [
                  DropdownMenuItem(value: 'Tanza', child: Text('Tanza (Primary)')),
                  DropdownMenuItem(value: 'Other', child: Text('Other (Outside coverage)')),
                ],
                onChanged: (v) => setState(() => _municipality = v ?? 'Tanza'),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _barangay,
                decoration: const InputDecoration(labelText: 'Barangay'),
                hint: const Text('Select barangay'),
                items: _tanzaBarangays.map((b) => DropdownMenuItem(value: b, child: Text(b))).toList(),
                onChanged: (v) => setState(() => _barangay = v),
                validator: (v) => v == null || v.isEmpty ? 'Select your barangay' : null,
              ),
              const SizedBox(height: 16),
              AppInput(
                label: 'Street address',
                controller: _streetCtrl,
                validator: (v) =>
                    v == null || v.trim().length < 2 ? 'Street address is required' : null,
              ),
              const SizedBox(height: 24),
              const Text('Emergency Contact', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              AppInput(
                label: 'Contact name',
                controller: _ecNameCtrl,
                validator: (v) =>
                    v == null || v.trim().length < 2 ? 'Emergency contact name is required' : null,
              ),
              const SizedBox(height: 16),
              AppInput(
                label: 'Contact number',
                controller: _ecNumberCtrl,
                keyboardType: TextInputType.phone,
                validator: (v) =>
                    v == null || v.trim().length < 7 ? 'Enter a valid contact number' : null,
              ),
              const SizedBox(height: 24),
              if (_municipality != 'Tanza')
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF3C7),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.warning_amber, color: AppColors.warningAmber),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'TanzAlert primarily serves Tanza Municipality. Outside-Tanza requests require admin review.',
                          style: TextStyle(fontSize: 12, color: AppColors.warningAmber),
                        ),
                      ),
                    ],
                  ),
                ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Checkbox(
                    value: _consent,
                    onChanged: (v) => setState(() => _consent = v ?? false),
                    activeColor: AppColors.alertRed,
                  ),
                  const Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(top: 12),
                      child: Text(
                        'I consent to emergency location sharing with Tanza MDRRMO during active emergencies.',
                        style: TextStyle(fontSize: 13),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              AppButton(label: 'Continue', onPressed: _next),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }
}
