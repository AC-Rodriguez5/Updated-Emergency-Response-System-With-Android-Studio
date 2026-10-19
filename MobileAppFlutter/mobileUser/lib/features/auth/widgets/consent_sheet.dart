import 'package:flutter/material.dart';
import 'package:safealert_ui/safealert_ui.dart';

import '../../../core/consent/consent_widgets.dart';
import 'consent_content.dart';

// The sheet and its wording are one unit to a caller.
export 'consent_content.dart';

/// What somebody agreed to, and which wording they agreed to it under.
///
/// Carried through registration and recorded against the account, because the
/// form promises in writing that it will be.
class ConsentDecision {
  const ConsentDecision({required this.version, required this.scopes});

  final String version;
  final List<String> scopes;

  bool has(String scope) => scopes.contains(scope);

  int get optionalCount => scopes
      .where(
        (s) => consentScopes.any((c) => c.key == s && !c.mandatory),
      )
      .length;

  /// Whether every scope TanzAlert cannot operate without was granted.
  bool get isComplete => consentScopes
      .where((c) => c.mandatory)
      .every((c) => scopes.contains(c.key));

  /// What goes on the wire: one flat, comma-separated field, because
  /// registration is posted as multipart and nested objects do not survive it.
  String get wireScopes => scopes.join(',');
}

/// Opens the consent form over the registration page.
///
/// Returns what was agreed to, or null if it was dismissed or declined —
/// callers treat both the same way, as "not agreed".
Future<ConsentDecision?> showConsentSheet(
  BuildContext context, {
  ConsentDecision? current,
}) {
  return showModalBottomSheet<ConsentDecision>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    // Tall: this is a document to read, not a prompt to dismiss. Still short of
    // full height, so it is plainly a sheet over the form it belongs to.
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * .92,
    ),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (_) => _ConsentSheet(current: current),
  );
}

class _ConsentSheet extends StatefulWidget {
  const _ConsentSheet({this.current});

  final ConsentDecision? current;

  @override
  State<_ConsentSheet> createState() => _ConsentSheetState();
}

class _ConsentSheetState extends State<_ConsentSheet> {
  late final Set<String> _granted = {...?widget.current?.scopes};
  ConsentCopy _copy = consentCopyEn;
  bool _declined = false;

  bool get _canAgree => consentScopes
      .where((c) => c.mandatory)
      .every((c) => _granted.contains(c.key));

  void _toggle(ConsentScope scope, bool on) {
    setState(() {
      if (on) {
        _granted.add(scope.key);
        if (_canAgree) _declined = false;
      } else {
        _granted.remove(scope.key);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _header(),
        Flexible(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
            children: [
              Text(
                _copy.title,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 8),
              Text(
                _copy.lede,
                style: const TextStyle(
                  fontSize: 13.5,
                  height: 1.55,
                  color: AppColors.textMuted,
                ),
              ),
              _sectionLabel(_copy.collectHeading),
              _collectTable(),
              const SizedBox(height: 14),
              _fingerprintNote(),
              _sectionLabel(_copy.consentHeading),
              for (final scope in consentScopes) ...[
                ConsentOption(
                  title: _copy.items[scope.key]!.title,
                  subtitle: _copy.items[scope.key]!.subtitle,
                  tag: scope.mandatory ? _copy.requiredTag : _copy.optionalTag,
                  mandatory: scope.mandatory,
                  value: _granted.contains(scope.key),
                  onChanged: (on) => _toggle(scope, on),
                ),
                const SizedBox(height: 10),
              ],
              const SizedBox(height: 4),
              _rights(),
            ],
          ),
        ),
        _footer(),
      ],
    );
  }

  Widget _header() {
    return Column(
      children: [
        const SizedBox(height: 10),
        Container(
          width: 40,
          height: 4,
          decoration: BoxDecoration(
            color: AppColors.border,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 8, 10),
          child: Row(
            children: [
              const Icon(
                Icons.privacy_tip_outlined,
                size: 19,
                color: AppColors.responderBlue,
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Text(
                  _copy.sheetTitle,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: AppColors.textStrong,
                  ),
                ),
              ),
              ConsentLanguageToggle(
                isFilipino: _copy.languageLabel == consentCopyFil.languageLabel,
                englishLabel: consentCopyEn.languageLabel,
                filipinoLabel: consentCopyFil.languageLabel,
                onChanged: (fil) => setState(
                  () => _copy = fil ? consentCopyFil : consentCopyEn,
                ),
              ),
              IconButton(
                tooltip: _copy.close,
                icon: const Icon(Icons.close, size: 20),
                color: AppColors.textMuted,
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
      ],
    );
  }

  Widget _sectionLabel(String text) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 22, 0, 10),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(
          fontSize: 10.5,
          fontWeight: FontWeight.w800,
          letterSpacing: 1.3,
          color: AppColors.textMuted,
        ),
      ),
    );
  }

  Widget _collectTable() {
    return ConsentFactTable(
      facts: [
        for (final row in _copy.rows)
          ConsentFact(label: row.label, lead: row.lead, body: row.body),
      ],
    );
  }

  Widget _fingerprintNote() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.softGreen,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: AppColors.successGreen.withValues(alpha: .35),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.fingerprint, size: 20, color: AppColors.successGreen),
          const SizedBox(width: 10),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: _copy.fingerprintLead,
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  TextSpan(text: _copy.fingerprintBody),
                ],
              ),
              style: const TextStyle(
                fontSize: 12.5,
                height: 1.5,
                color: AppColors.textStrong,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _rights() {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Theme(
        // The default expander draws its own dividers on top of the border.
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 14),
          childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
          expandedCrossAxisAlignment: CrossAxisAlignment.start,
          shape: const Border(),
          title: Text(
            _copy.rightsHeading,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: AppColors.textStrong,
              height: 1.3,
            ),
          ),
          children: [
            Text(
              _copy.rightsIntro,
              style: const TextStyle(
                fontSize: 12.5,
                height: 1.55,
                color: AppColors.textMuted,
              ),
            ),
            const SizedBox(height: 6),
            for (final right in _copy.rights)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Padding(
                      padding: EdgeInsets.only(top: 6, right: 8),
                      child: _Bullet(),
                    ),
                    Expanded(
                      child: Text(
                        right,
                        style: const TextStyle(
                          fontSize: 12.5,
                          height: 1.55,
                          color: AppColors.textMuted,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 12),
            Text(
              _copy.dpoLabel,
              style: const TextStyle(
                fontSize: 12.5,
                color: AppColors.textMuted,
              ),
            ),
            const SizedBox(height: 2),
            const SelectableText(
              consentDpoContact,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: AppColors.responderBlue,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _footer() {
    return Container(
      padding: EdgeInsets.fromLTRB(
        20,
        14,
        20,
        16 + MediaQuery.viewPaddingOf(context).bottom,
      ),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_declined) ...[
            Container(
              padding: const EdgeInsets.all(13),
              decoration: BoxDecoration(
                color: AppColors.softRed,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                _copy.declineNote,
                style: const TextStyle(
                  fontSize: 12.5,
                  height: 1.5,
                  color: AppColors.alertRed,
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
          AppButton(
            label: _copy.agree,
            onPressed: _canAgree
                ? () => Navigator.pop(
                    context,
                    ConsentDecision(
                      version: consentVersion,
                      // Recorded in the order the form asks, not the order they
                      // were ticked, so two identical grants read identically.
                      scopes: consentScopes
                          .map((c) => c.key)
                          .where(_granted.contains)
                          .toList(),
                    ),
                  )
                : null,
          ),
          const SizedBox(height: 6),
          TextButton(
            onPressed: () => setState(() => _declined = true),
            style: TextButton.styleFrom(foregroundColor: AppColors.textMuted),
            child: Text(
              _copy.decline,
              style: const TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                decoration: TextDecoration.underline,
              ),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            _copy.hint,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 11.5,
              height: 1.5,
              color: AppColors.textMuted,
            ),
          ),
        ],
      ),
    );
  }
}

class _Bullet extends StatelessWidget {
  const _Bullet();

  @override
  Widget build(BuildContext context) => Container(
    width: 4,
    height: 4,
    decoration: const BoxDecoration(
      color: AppColors.textMuted,
      shape: BoxShape.circle,
    ),
  );
}

/// The row on the registration form that opens the consent sheet, and reports
/// afterwards what was agreed to.
class ConsentTile extends StatelessWidget {
  const ConsentTile({
    super.key,
    required this.decision,
    required this.onTap,
    this.error,
    this.copy = consentCopyEn,
  });

  final ConsentDecision? decision;
  final VoidCallback onTap;
  final String? error;
  final ConsentCopy copy;

  @override
  Widget build(BuildContext context) {
    final agreed = decision?.isComplete ?? false;
    return TanzAlertPanel(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(16),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 14, 12, 14),
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: agreed
                            ? AppColors.softGreen
                            : error != null
                            ? AppColors.softRed
                            : AppColors.softBlue,
                        borderRadius: BorderRadius.circular(11),
                      ),
                      child: Icon(
                        agreed
                            ? Icons.verified_outlined
                            : Icons.privacy_tip_outlined,
                        size: 20,
                        color: agreed
                            ? AppColors.successGreen
                            : error != null
                            ? AppColors.alertRed
                            : AppColors.responderBlue,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            copy.tileTitle,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w800,
                              color: AppColors.textStrong,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            agreed
                                ? '${copy.tileAgreed} - ${decision!.version} - '
                                      '${decision!.scopes.length}/${consentScopes.length}'
                                : copy.tilePrompt,
                            style: TextStyle(
                              fontSize: 12,
                              height: 1.4,
                              color: agreed
                                  ? AppColors.successGreen
                                  : AppColors.textMuted,
                              fontWeight: agreed
                                  ? FontWeight.w700
                                  : FontWeight.w400,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      agreed ? copy.tileReview : '',
                      style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
                        color: AppColors.responderBlue,
                      ),
                    ),
                    const Icon(
                      Icons.chevron_right,
                      size: 20,
                      color: AppColors.textMuted,
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
              child: Text(
                error!,
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.alertRed,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
