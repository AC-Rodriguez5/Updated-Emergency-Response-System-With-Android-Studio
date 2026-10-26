import 'package:flutter/material.dart';
import 'package:safealert_ui/safealert_ui.dart';

/// The pieces every consent form in the app is built from.
///
/// Shared so the registration sheet and the ambulance booking sheet cannot
/// drift into looking like two different products asking two different
/// questions. The wording differs; the furniture does not.

/// A permission, with its explanation and whether it can be declined.
class ConsentOption extends StatelessWidget {
  const ConsentOption({
    super.key,
    required this.title,
    required this.subtitle,
    required this.tag,
    required this.mandatory,
    required this.value,
    required this.onChanged,
  });

  final String title;
  final String subtitle;
  final String tag;
  final bool mandatory;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => onChanged(!value),
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          padding: const EdgeInsets.fromLTRB(8, 11, 12, 12),
          decoration: BoxDecoration(
            color: value ? AppColors.softBlue : AppColors.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: value ? AppColors.responderBlue : AppColors.border,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Checkbox(
                value: value,
                onChanged: (v) => onChanged(v ?? false),
                activeColor: AppColors.responderBlue,
                visualDensity: VisualDensity.compact,
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            style: const TextStyle(
                              fontSize: 13.5,
                              fontWeight: FontWeight.w800,
                              height: 1.35,
                              color: AppColors.textStrong,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        ConsentTag(label: tag, strong: mandatory),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 12,
                        height: 1.5,
                        color: AppColors.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// REQUIRED or OPTIONAL, said the same way on every form.
class ConsentTag extends StatelessWidget {
  const ConsentTag({super.key, required this.label, required this.strong});

  final String label;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: strong ? AppColors.responderBlue : AppColors.background,
        borderRadius: BorderRadius.circular(999),
        border: strong ? null : Border.all(color: AppColors.border),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 9,
          fontWeight: FontWeight.w800,
          letterSpacing: .8,
          color: strong ? Colors.white : AppColors.textMuted,
        ),
      ),
    );
  }
}

/// English or Filipino, for a document somebody has to actually understand.
class ConsentLanguageToggle extends StatelessWidget {
  const ConsentLanguageToggle({
    super.key,
    required this.isFilipino,
    required this.englishLabel,
    required this.filipinoLabel,
    required this.onChanged,
  });

  final bool isFilipino;
  final String englishLabel;
  final String filipinoLabel;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _option(englishLabel, !isFilipino, () => onChanged(false)),
          _option(filipinoLabel, isFilipino, () => onChanged(true)),
        ],
      ),
    );
  }

  Widget _option(String label, bool selected, VoidCallback onTap) {
    return Semantics(
      selected: selected,
      button: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: selected ? AppColors.responderBlue : Colors.transparent,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w800,
              letterSpacing: .5,
              color: selected ? Colors.white : AppColors.textMuted,
            ),
          ),
        ),
      ),
    );
  }
}

/// One line of a "what we collect and why" table: a short label, a bold lead
/// and the rest of the explanation.
class ConsentFact {
  const ConsentFact({
    required this.label,
    required this.lead,
    required this.body,
  });

  final String label;
  final String lead;
  final String body;
}

/// The table both consent forms state their collection in.
class ConsentFactTable extends StatelessWidget {
  const ConsentFactTable({super.key, required this.facts});

  final List<ConsentFact> facts;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          for (var i = 0; i < facts.length; i += 1) ...[
            if (i > 0) const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 11, 14, 11),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 104,
                    child: Text(
                      facts[i].label,
                      style: const TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w800,
                        color: AppColors.textStrong,
                        height: 1.35,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: facts[i].lead,
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              color: AppColors.textStrong,
                            ),
                          ),
                          TextSpan(text: facts[i].body),
                        ],
                      ),
                      style: const TextStyle(
                        fontSize: 12.5,
                        height: 1.5,
                        color: AppColors.textMuted,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  
  }
}
