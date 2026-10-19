import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:safealert_ui/safealert_ui.dart';
import '../widgets/auth_chrome.dart';
import '../widgets/consent_sheet.dart';

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
  ConsentDecision? _consent;
  bool _consentMissing = false;

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

  Future<void> _openConsent() async {
    final decision = await showConsentSheet(context, current: _consent);
    if (!mounted || decision == null) return;
    setState(() {
      _consent = decision;
      _consentMissing = false;
    });
  }

  void _next() {
    final consented = _consent?.isComplete ?? false;
    // Said beside the checkbox rather than in a snackbar: this is the foot of
    // a long form, and a message that slides in over the keyboard and leaves
    // again is the easiest thing on the page to miss.
    setState(() => _consentMissing = !consented);
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
    if (!consented) return;
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
      // Recorded against the account in step 2: the form says in writing that
      // it will be, with the version of the wording that was agreed to.
      'consentVersion': _consent!.version,
      'consentScopes': _consent!.wireScopes,
    });
  }

  @override
  Widget build(BuildContext context) {
    return AuthBackdrop(
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const AuthStepHeader(step: 1),
            const SizedBox(height: 16),
            const TanzAlertAuthHero(
              eyebrow: 'Resident registration',
              title: 'Create your TanzAlert account.',
              description:
                  'A few details so dispatch knows who needs help, and where to send it.',
              icon: Icons.how_to_reg_outlined,
            ),
            const SizedBox(height: 18),
            _accountCard(),
            const SizedBox(height: 16),
            _aboutYouCard(),
            const SizedBox(height: 16),
            _locationCard(),
            const SizedBox(height: 16),
            _emergencyContactCard(),
            const SizedBox(height: 16),
            ConsentTile(
              decision: _consent,
              onTap: _openConsent,
              error: _consentMissing ? consentCopyEn.tileMissing : null,
            ),
            const SizedBox(height: 20),
            AppButton(label: 'Continue', onPressed: _next, icon: Icons.arrow_forward),
          ],
        ),
      ),
    );
  }

  Widget _accountCard() {
    return TanzAlertPanel(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const TanzAlertSectionHeader(
            eyebrow: 'Account',
            title: 'Your details',
          ),
          const SizedBox(height: 18),
          AppInput(
            label: 'Full name',
            controller: _nameCtrl,
            prefix: const _FieldIcon(Icons.person_outline),
            validator: (v) =>
                v == null || v.trim().isEmpty ? 'Full name is required' : null,
          ),
          const SizedBox(height: 14),
          AppInput(
            label: 'Email address',
            controller: _emailCtrl,
            keyboardType: TextInputType.emailAddress,
            prefix: const _FieldIcon(Icons.alternate_email),
            validator: (v) =>
                v == null || !v.contains('@') ? 'Enter a valid email' : null,
          ),
          const SizedBox(height: 14),
          AppInput(
            label: 'Mobile number',
            controller: _phoneCtrl,
            keyboardType: TextInputType.phone,
            prefix: const _FieldIcon(Icons.phone_outlined),
            validator: (v) => v == null || v.trim().length < 7
                ? 'Enter a valid phone number'
                : null,
          ),
          const SizedBox(height: 14),
          AppInput(
            label: 'Password',
            controller: _passCtrl,
            obscureText: _obscure,
            prefix: const _FieldIcon(Icons.lock_outline),
            suffix: IconButton(
              tooltip: _obscure ? 'Show password' : 'Hide password',
              icon: Icon(
                _obscure ? Icons.visibility_off : Icons.visibility,
                size: 20,
              ),
              onPressed: () => setState(() => _obscure = !_obscure),
            ),
            validator: (v) => v == null || v.length < 8
                ? 'Password must be at least 8 characters'
                : null,
          ),
          const SizedBox(height: 14),
          AppInput(
            label: 'Confirm password',
            controller: _confirmCtrl,
            obscureText: true,
            prefix: const _FieldIcon(Icons.lock_reset_outlined),
            validator: (v) => v != _passCtrl.text ? 'Passwords do not match' : null,
          ),
        ],
      ),
    );
  }

  Widget _aboutYouCard() {
    return TanzAlertPanel(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const TanzAlertSectionHeader(
            eyebrow: 'Personal',
            title: 'About you',
            description: 'Responders are told this on the way to you.',
          ),
          const SizedBox(height: 18),
          AppInput(
            label: 'Date of birth',
            controller: _dobCtrl,
            readOnly: true,
            onTap: _pickDob,
            prefix: const _FieldIcon(Icons.cake_outlined),
            suffix: const Icon(Icons.calendar_today, size: 18),
            validator: (v) =>
                v == null || v.isEmpty ? 'Select your date of birth' : null,
          ),
          const SizedBox(height: 14),
          DropdownButtonFormField<String>(
            initialValue: _bloodType,
            // Without this a dropdown is as wide as its widest entry, which
            // overruns the field once a leading icon is taking room.
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Blood type',
              prefixIcon: _FieldIcon(Icons.bloodtype_outlined),
            ),
            hint: const Text('Select blood type'),
            items: _bloodTypes
                .map((b) => DropdownMenuItem(value: b, child: Text(b)))
                .toList(),
            onChanged: (v) => setState(() => _bloodType = v),
            validator: (v) =>
                v == null || v.isEmpty ? 'Select your blood type' : null,
          ),
        ],
      ),
    );
  }

  Widget _locationCard() {
    return TanzAlertPanel(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const TanzAlertSectionHeader(
            eyebrow: 'Location',
            title: 'Where you live',
          ),
          const SizedBox(height: 18),
          DropdownButtonFormField<String>(
            initialValue: _municipality,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Municipality / City',
              prefixIcon: _FieldIcon(Icons.location_city_outlined),
            ),
            items: const [
              DropdownMenuItem(
                value: 'Tanza',
                child: Text('Tanza (Primary)', overflow: TextOverflow.ellipsis),
              ),
              DropdownMenuItem(
                value: 'Other',
                child: Text(
                  'Other (Outside coverage)',
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
            onChanged: (v) => setState(() => _municipality = v ?? 'Tanza'),
          ),
          const SizedBox(height: 14),
          DropdownButtonFormField<String>(
            initialValue: _barangay,
            // 'Barangay III (Poblacion)' does not fit beside an icon.
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Barangay',
              prefixIcon: _FieldIcon(Icons.map_outlined),
            ),
            hint: const Text('Select barangay'),
            items: _tanzaBarangays
                .map(
                  (b) => DropdownMenuItem(
                    value: b,
                    child: Text(b, overflow: TextOverflow.ellipsis),
                  ),
                )
                .toList(),
            onChanged: (v) => setState(() => _barangay = v),
            validator: (v) =>
                v == null || v.isEmpty ? 'Select your barangay' : null,
          ),
          const SizedBox(height: 14),
          AppInput(
            label: 'Street address',
            controller: _streetCtrl,
            prefix: const _FieldIcon(Icons.home_outlined),
            validator: (v) => v == null || v.trim().length < 2
                ? 'Street address is required'
                : null,
          ),
          if (_municipality != 'Tanza') ...[
            const SizedBox(height: 14),
            const AuthNotice(
              icon: Icons.warning_amber_rounded,
              tone: AppColors.warningAmber,
              background: Color(0xFFFEF3C7),
              message:
                  'TanzAlert primarily serves Tanza Municipality. Outside-Tanza requests require admin review.',
            ),
          ],
        ],
      ),
    );
  }

  Widget _emergencyContactCard() {
    return TanzAlertPanel(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const TanzAlertSectionHeader(
            eyebrow: 'In an emergency',
            title: 'Who we call',
            description: 'The person dispatch contacts on your behalf.',
          ),
          const SizedBox(height: 18),
          AppInput(
            label: 'Contact name',
            controller: _ecNameCtrl,
            prefix: const _FieldIcon(Icons.contact_emergency_outlined),
            validator: (v) => v == null || v.trim().length < 2
                ? 'Emergency contact name is required'
                : null,
          ),
          const SizedBox(height: 14),
          AppInput(
            label: 'Contact number',
            controller: _ecNumberCtrl,
            keyboardType: TextInputType.phone,
            prefix: const _FieldIcon(Icons.phone_in_talk_outlined),
            validator: (v) => v == null || v.trim().length < 7
                ? 'Enter a valid contact number'
                : null,
          ),
        ],
      ),
    );
  }
}

/// A field's leading icon, at one weight and colour across every form.
class _FieldIcon extends StatelessWidget {
  const _FieldIcon(this.icon);

  final IconData icon;

  @override
  Widget build(BuildContext context) =>
      Icon(icon, size: 20, color: AppColors.textMuted);
}
