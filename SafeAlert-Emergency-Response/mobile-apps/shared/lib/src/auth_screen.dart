import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'api.dart';
import 'controller.dart';
import 'platform_services.dart';
import 'ui.dart';

class AuthScreen extends StatefulWidget {
  final AppController controller;
  const AuthScreen({super.key, required this.controller});
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final form = GlobalKey<FormState>();
  final email = TextEditingController(), password = TextEditingController();
  bool busy = false, remember = true;
  String? error;
  @override
  void dispose() {
    email.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> signIn() async {
    if (!form.currentState!.validate()) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.controller.login(email.text, password.text, remember);
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text('SafeAlert ${readable(widget.controller.role)}'),
    ),
    body: PageBody(
      children: [
        const Icon(
          Icons.health_and_safety_outlined,
          size: 72,
          color: SafeAlertTheme.blue,
        ),
        const SizedBox(height: 24),
        Text(
          'Ready when it matters',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 8),
        const Text('Sign in with your approved account.'),
        const SizedBox(height: 24),
        if (error != null) FeedbackPanel(error!),
        Form(
          key: form,
          child: AutofillGroup(
            child: Column(
              children: [
                TextFormField(
                  controller: email,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  decoration: const InputDecoration(labelText: 'Email'),
                  validator: emailValue,
                ),
                const SizedBox(height: 16),
                PasswordField(controller: password),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Remember this device'),
                  value: remember,
                  onChanged: busy
                      ? null
                      : (v) => setState(() => remember = v ?? false),
                ),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: busy ? null : signIn,
                    child: Text(busy ? 'Signing in…' : 'Sign in'),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        OutlinedButton(
          onPressed: busy
              ? null
              : () => Navigator.push(
                  context,
                  MaterialPageRoute<void>(
                    builder: (_) =>
                        RegistrationScreen(controller: widget.controller),
                  ),
                ),
          child: const Text('Register for approval'),
        ),
        const SizedBox(height: 24),
        const Text(
          'Registration is reviewed by an administrator. Pending and rejected accounts cannot access emergency information.',
        ),
      ],
    ),
  );
}

class RegistrationScreen extends StatefulWidget {
  final AppController controller;
  const RegistrationScreen({super.key, required this.controller});
  @override
  State<RegistrationScreen> createState() => _RegistrationScreenState();
}

class _RegistrationScreenState extends State<RegistrationScreen> {
  final form = GlobalKey<FormState>();
  final fields = <String, TextEditingController>{
    for (final name in [
      'name',
      'phone',
      'email',
      'password',
      'confirm',
      'address',
      'coverageArea',
      'departmentName',
      'responderRole',
      'credentialNumber',
    ])
      name: TextEditingController(),
  };
  DateTime? birth;
  String agency = 'medical';
  bool consent = false, busy = false, completed = false;
  String? error, registrationToken;
  final documents = <String, String>{};
  final documentNames = <String, String>{};
  bool get responder => widget.controller.role == 'responder';
  @override
  void dispose() {
    for (final c in fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  Widget field(
    String name,
    String label, {
    TextInputType? keyboard,
    bool required = true,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: TextFormField(
      controller: fields[name],
      decoration: InputDecoration(labelText: label),
      keyboardType: keyboard,
      validator: name == 'email'
          ? emailValue
          : required
          ? requiredValue
          : null,
    ),
  );
  Future<void> pick(String purpose, bool camera) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      String? path, name;
      if (camera) {
        final file = await ImagePicker().pickImage(
          source: ImageSource.camera,
          preferredCameraDevice: purpose == 'face_capture'
              ? CameraDevice.front
              : CameraDevice.rear,
          imageQuality: 85,
          maxWidth: 1800,
        );
        path = file?.path;
        name = file?.name;
      } else {
        final result = await FilePicker.platform.pickFiles(
          type: FileType.custom,
          allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'],
          allowMultiple: false,
        );
        if (result != null) {
          path = result.files.single.path;
          name = result.files.single.name;
          if (result.files.single.size > 5 * 1024 * 1024) {
            throw ApiException(
              400,
              'FILE_TOO_LARGE',
              'Choose a document smaller than 5 MB.',
            );
          }
        }
      }
      if (path == null || name == null) return;
      registrationToken ??=
          ((await widget.controller.api.request(
                    'POST',
                    '/auth/registration-session',
                    authenticated: false,
                    body: {'role': widget.controller.role},
                  ))['data']
                  as Json)['sessionToken']
              as String;
      documents[purpose] = await widget.controller.api.upload(
        path,
        name,
        purpose,
        camera ? 'camera' : 'file',
        registrationToken!,
      );
      documentNames[purpose] = name;
    } catch (e) {
      error = '$e';
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> submit() async {
    if (!form.currentState!.validate()) return;
    if (birth == null ||
        !consent ||
        documents['proof_of_residency'] == null ||
        documents['face_capture'] == null ||
        (responder && documents['credential'] == null)) {
      setState(
        () => error =
            'Choose your birth date, attach each required document, and agree to emergency location processing.',
      );
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final body = <String, dynamic>{
        for (final name in [
          'name',
          'phone',
          'email',
          'password',
          'address',
          'coverageArea',
        ])
          name: name == 'password'
              ? fields[name]!.text
              : fields[name]!.text.trim(),
        'dateOfBirth':
            '${birth!.year}-${birth!.month.toString().padLeft(2, '0')}-${birth!.day.toString().padLeft(2, '0')}',
        'consentLocation': consent,
        'registrationToken': registrationToken,
        'proofOfResidencyId': documents['proof_of_residency'],
        'faceCaptureId': documents['face_capture'],
      };
      if (responder) {
        body.addAll({
          'agencyType': agency,
          'credentialId': documents['credential'],
          for (final name in [
            'departmentName',
            'responderRole',
            'credentialNumber',
          ])
            name: fields[name]!.text.trim(),
        });
      }
      body.addAll(await registrationPush(widget.controller.api.vault));
      await widget.controller.api.request(
        'POST',
        '/auth/register/${widget.controller.role}',
        body: body,
        authenticated: false,
      );
      if (mounted) setState(() => completed = true);
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> back() async {
    if (completed ||
        await confirmAction(
          context,
          'Leave registration?',
          'Your unsubmitted form will be discarded.',
          'Leave registration',
        )) {
      if (mounted) Navigator.pop(context);
    }
  }

  Widget uploadRow(String purpose, String label, {bool cameraOnly = false}) =>
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(label, style: const TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text(
                documentNames[purpose] ??
                    (cameraOnly
                        ? 'Take a live photo using your camera.'
                        : 'JPG, PNG or PDF, up to 5 MB.'),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton.icon(
                    onPressed: busy ? null : () => pick(purpose, true),
                    icon: const Icon(Icons.camera_alt),
                    label: const Text('Use camera'),
                  ),
                  if (!cameraOnly)
                    OutlinedButton.icon(
                      onPressed: busy ? null : () => pick(purpose, false),
                      icon: const Icon(Icons.attach_file),
                      label: const Text('Choose file'),
                    ),
                  if (documents.containsKey(purpose))
                    const Chip(
                      avatar: Icon(Icons.check),
                      label: Text('Uploaded'),
                    ),
                ],
              ),
            ],
          ),
        ),
      );
  @override
  Widget build(BuildContext context) => PopScope(
    canPop: completed,
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop) back();
    },
    child: Scaffold(
      appBar: AppBar(
        title: Text(completed ? 'Awaiting approval' : 'Register'),
        leading: IconButton(
          tooltip: 'Back',
          onPressed: busy ? null : back,
          icon: const Icon(Icons.arrow_back),
        ),
      ),
      body: completed
          ? PageBody(
              children: [
                const Icon(Icons.hourglass_empty, size: 64),
                const SizedBox(height: 24),
                Text(
                  'Registration received',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 16),
                const Text(
                  'An administrator will review your documents. You can sign in after your account is approved.',
                ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Return to sign in'),
                ),
              ],
            )
          : Form(
              key: form,
              child: PageBody(
                children: [
                  Text(
                    'Your details',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 16),
                  if (error != null) FeedbackPanel(error!),
                  field('name', 'Full name'),
                  OutlinedButton.icon(
                    onPressed: busy
                        ? null
                        : () async {
                            final value = await showDatePicker(
                              context: context,
                              initialDate:
                                  birth ?? DateTime(DateTime.now().year - 18),
                              firstDate: DateTime(DateTime.now().year - 120),
                              lastDate: DateTime.now(),
                            );
                            if (value != null && mounted) {
                              setState(() => birth = value);
                            }
                          },
                    icon: const Icon(Icons.calendar_month),
                    label: Text(
                      birth == null
                          ? 'Select date of birth'
                          : 'Born ${birth!.year}-${birth!.month}-${birth!.day} · Age ${DateTime.now().year - birth!.year - (DateTime.now().month < birth!.month || (DateTime.now().month == birth!.month && DateTime.now().day < birth!.day) ? 1 : 0)}',
                    ),
                  ),
                  const SizedBox(height: 16),
                  field(
                    'phone',
                    'Contact number',
                    keyboard: TextInputType.phone,
                  ),
                  field('email', 'Email', keyboard: TextInputType.emailAddress),
                  field('address', 'Street address'),
                  field('coverageArea', 'Municipality / coverage area'),
                  PasswordField(
                    controller: fields['password']!,
                    validator: (v) => v == null || v.length < 8
                        ? 'Use at least 8 characters.'
                        : null,
                  ),
                  const SizedBox(height: 16),
                  PasswordField(
                    controller: fields['confirm']!,
                    label: 'Confirm password',
                    validator: (v) => v != fields['password']!.text
                        ? 'Passwords must match.'
                        : null,
                  ),
                  const SizedBox(height: 16),
                  uploadRow('proof_of_residency', 'Proof of residency'),
                  uploadRow(
                    'face_capture',
                    'Live face capture',
                    cameraOnly: true,
                  ),
                  if (responder) ...[
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      initialValue: agency,
                      decoration: const InputDecoration(
                        labelText: 'Agency type',
                      ),
                      items: [
                        for (final type in [
                          'medical',
                          'police',
                          'fire',
                          'rescue',
                          'other',
                        ])
                          DropdownMenuItem(
                            value: type,
                            child: Text(readable(type)),
                          ),
                      ],
                      onChanged: busy
                          ? null
                          : (v) => setState(() => agency = v!),
                    ),
                    const SizedBox(height: 16),
                    field('departmentName', 'Station / department'),
                    field('responderRole', 'Position / role'),
                    field(
                      'credentialNumber',
                      'Credential number (if applicable)',
                      required: false,
                    ),
                    uploadRow('credential', 'Professional credential'),
                  ],
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                    title: const Text(
                      'I consent to processing and sharing my location with authorized responders during an emergency.',
                    ),
                    value: consent,
                    onChanged: busy
                        ? null
                        : (v) => setState(() => consent = v ?? false),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: busy ? null : submit,
                    child: Text(busy ? 'Saving…' : 'Submit for approval'),
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
    ),
  );
}
