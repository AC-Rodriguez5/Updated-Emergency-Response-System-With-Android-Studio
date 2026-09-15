import 'package:flutter/material.dart';
import 'api.dart';

class SafeAlertTheme {
  static const blue = Color(0xFF0A84FF),
      red = Color(0xFFE52834),
      green = Color(0xFF34C759),
      amber = Color(0xFFFFB81C),
      ink = Color(0xFF1C1C1E);
  static ThemeData get light => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(seedColor: blue).copyWith(
      primary: blue,
      onPrimary: ink,
      error: red,
      onError: Colors.white,
      surface: Colors.white,
    ),
    scaffoldBackgroundColor: const Color(0xFFF5F5F5),
    textTheme: const TextTheme(
      bodyLarge: TextStyle(fontSize: 17, height: 1.5),
      bodyMedium: TextStyle(fontSize: 17, height: 1.4),
      headlineSmall: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: ink,
      centerTitle: false,
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      margin: const EdgeInsets.symmetric(vertical: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
      filled: true,
      fillColor: Colors.white,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(48, 52),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(minimumSize: const Size(48, 52)),
    ),
    scrollbarTheme: ScrollbarThemeData(
      thumbColor: WidgetStateProperty.all(Colors.blueGrey),
      thickness: WidgetStateProperty.all(5),
      radius: const Radius.circular(8),
    ),
  );
}

class PageBody extends StatelessWidget {
  final List<Widget> children;
  const PageBody({super.key, required this.children});
  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.topCenter,
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 600),
      child: ListView(padding: const EdgeInsets.all(16), children: children),
    ),
  );
}

class FeedbackPanel extends StatelessWidget {
  final String message;
  final VoidCallback? retry;
  final bool warning;
  const FeedbackPanel(
    this.message, {
    super.key,
    this.retry,
    this.warning = false,
  });
  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(warning ? Icons.info_outline : Icons.error_outline),
                const SizedBox(width: 12),
                Expanded(child: Text(message)),
              ],
            ),
            if (retry != null)
              TextButton(onPressed: retry, child: const Text('Try again')),
          ],
        ),
      ),
    ),
  );
}

class StatusBadge extends StatelessWidget {
  final String status;
  const StatusBadge(this.status, {super.key});
  @override
  Widget build(BuildContext context) => Chip(
    avatar: Icon(switch (status) {
      'resolved' => Icons.check_circle,
      'cancelled' || 'false_alarm' => Icons.cancel_outlined,
      'pending' => Icons.hourglass_empty,
      _ => Icons.emergency_share,
    }, size: 20),
    label: Text(readable(status)),
    backgroundColor: switch (status) {
      'resolved' => SafeAlertTheme.green.withValues(alpha: .2),
      'pending' => SafeAlertTheme.amber.withValues(alpha: .3),
      _ => SafeAlertTheme.blue.withValues(alpha: .1),
    },
  );
}

class PasswordField extends StatefulWidget {
  final TextEditingController controller;
  final String label;
  final String? Function(String?)? validator;
  const PasswordField({
    super.key,
    required this.controller,
    this.label = 'Password',
    this.validator,
  });
  @override
  State<PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<PasswordField> {
  bool hidden = true;
  @override
  Widget build(BuildContext context) => TextFormField(
    controller: widget.controller,
    obscureText: hidden,
    autofillHints: const [AutofillHints.password],
    validator: widget.validator ?? requiredValue,
    decoration: InputDecoration(
      labelText: widget.label,
      suffixIcon: IconButton(
        tooltip: hidden ? 'Show password' : 'Hide password',
        onPressed: () => setState(() => hidden = !hidden),
        icon: Icon(hidden ? Icons.visibility : Icons.visibility_off),
      ),
    ),
  );
}

String? requiredValue(String? value) =>
    value == null || value.trim().isEmpty ? 'This field is required.' : null;
String? emailValue(String? value) =>
    value == null ||
        !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(value.trim())
    ? 'Enter a valid email address.'
    : null;
Future<bool> confirmAction(
  BuildContext context,
  String title,
  String detail,
  String action, {
  bool danger = false,
}) async =>
    await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            24,
            8,
            24,
            24 + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title, style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 16),
              Text(detail),
              const SizedBox(height: 24),
              OutlinedButton(
                autofocus: true,
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Keep current state'),
              ),
              const SizedBox(height: 12),
              FilledButton(
                style: danger
                    ? FilledButton.styleFrom(
                        backgroundColor: SafeAlertTheme.red,
                        foregroundColor: Colors.white,
                      )
                    : null,
                onPressed: () => Navigator.pop(context, true),
                child: Text(action),
              ),
            ],
          ),
        ),
      ),
    ) ??
    false;
void showFeedback(BuildContext context, Object message) => ScaffoldMessenger.of(
  context,
).showSnackBar(SnackBar(content: Text('$message')));
String localTime(Object? time) {
  final parsed = DateTime.tryParse('$time')?.toLocal();
  if (parsed == null) return 'Time unavailable';
  return '${parsed.year}-${parsed.month.toString().padLeft(2, '0')}-${parsed.day.toString().padLeft(2, '0')} ${parsed.hour.toString().padLeft(2, '0')}:${parsed.minute.toString().padLeft(2, '0')} (device time)';
}
