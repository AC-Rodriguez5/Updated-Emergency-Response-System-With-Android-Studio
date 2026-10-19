import 'package:flutter/material.dart';
import 'package:safealert_ui/safealert_ui.dart';

import '../../../core/consent/consent_widgets.dart';

/// The consent a transport booking asks for, at the moment it is booked.
///
/// Deliberately not part of the registration form. A transport request carries
/// a named patient, their contact and their medical condition — sensitive
/// personal information, and often about somebody who is not the account
/// holder. Asking for that at registration would make every resident agree to
/// health processing to open an account, most of them for a feature they never
/// use, and a year before the data in question exists.
///
/// Emergency bookings never see this sheet. See [showAmbulanceConsentSheet].

/// Bumped whenever this wording changes; stored with the booking it was given for.
const String ambulanceConsentVersion = 'v1.0';

const String scopeAmbulanceTransport = 'ambulance_transport';
const String scopePatientInformed = 'patient_informed';

class AmbulanceConsentCopy {
  const AmbulanceConsentCopy({
    required this.languageLabel,
    required this.sheetTitle,
    required this.title,
    required this.lede,
    required this.collectHeading,
    required this.facts,
    required this.consentHeading,
    required this.transportTitle,
    required this.transportSubtitle,
    required this.patientTitle,
    required this.patientSubtitle,
    required this.requiredTag,
    required this.agree,
    required this.cancel,
    required this.hint,
    required this.rightsNote,
    required this.close,
  });

  final String languageLabel;
  final String sheetTitle;
  final String title;
  final String lede;
  final String collectHeading;
  final List<ConsentFact> facts;
  final String consentHeading;
  final String transportTitle;
  final String transportSubtitle;
  final String patientTitle;
  final String patientSubtitle;
  final String requiredTag;
  final String agree;
  final String cancel;
  final String hint;
  final String rightsNote;
  final String close;
}

const AmbulanceConsentCopy ambulanceConsentEn = AmbulanceConsentCopy(
  languageLabel: 'EN',
  sheetTitle: 'Before this is sent',
  title: 'Who sees this request',
  lede:
      'Booking a transport shares the details below with MDRRMO dispatch and the '
      'ambulance crew assigned to you. It is not shared anywhere else.',
  collectHeading: 'What this request shares',
  facts: [
    ConsentFact(
      label: 'Pickup + drop-off',
      lead: 'The points you chose on the map.',
      body: ' So the crew can find you, and knows where the patient is going.',
    ),
    ConsentFact(
      label: 'Patient details',
      lead: 'Name, address and contact.',
      body: ' Given to the crew before they arrive, and kept with the transport record.',
    ),
    ConsentFact(
      label: 'Medical condition',
      lead: 'What you entered above.',
      body: ' Read by dispatch and the crew, so the right unit and equipment are sent.',
    ),
  ],
  consentHeading: 'Your consent',
  transportTitle: 'Use these details to send an ambulance',
  transportSubtitle:
      'Share the pickup, drop-off and patient details in this request with MDRRMO '
      'dispatch and the crew assigned to it, and keep them with the transport record.',
  patientTitle: 'The patient knows about this request',
  patientSubtitle:
      'I have told the patient that TanzAlert will hold their name, address, contact '
      'and medical condition for this transport.',
  requiredTag: 'REQUIRED',
  agree: 'Agree and send request',
  cancel: 'Cancel',
  hint: 'Consent $ambulanceConsentVersion is saved with this request.',
  rightsNote:
      'Your rights under the Data Privacy Act are in the consent you agreed to when '
      'you registered.',
  close: 'Close',
);

const AmbulanceConsentCopy ambulanceConsentFil = AmbulanceConsentCopy(
  languageLabel: 'FIL',
  sheetTitle: 'Bago ito ipadala',
  title: 'Sino ang makakakita nito',
  lede:
      'Kapag nag-book ka ng paghahatid, ibabahagi ang mga nasa ibaba sa MDRRMO '
      'dispatch at sa crew ng ambulansyang itatalaga sa iyo. Wala itong ibang '
      'pagbabahaginan.',
  collectHeading: 'Ano ang ibinabahagi nito',
  facts: [
    ConsentFact(
      label: 'Pickup + drop-off',
      lead: 'Ang mga puntong pinili mo sa mapa.',
      body: ' Para mahanap ka ng crew, at malaman kung saan dadalhin ang pasyente.',
    ),
    ConsentFact(
      label: 'Detalye ng pasyente',
      lead: 'Pangalan, tirahan at contact.',
      body:
          ' Ibinibigay sa crew bago sila dumating, at nakatago kasama ng talaan ng '
          'paghahatid.',
    ),
    ConsentFact(
      label: 'Kalagayang medikal',
      lead: 'Ang inilagay mo sa itaas.',
      body:
          ' Binabasa ng dispatch at ng crew, para tama ang unit at kagamitang '
          'ipapadala.',
    ),
  ],
  consentHeading: 'Ang pahintulot mo',
  transportTitle: 'Gamitin ang mga detalyeng ito para magpadala ng ambulansya',
  transportSubtitle:
      'Ibahagi sa MDRRMO dispatch at sa itinalagang crew ang pickup, drop-off at '
      'detalye ng pasyente sa request na ito, at itago kasama ng talaan ng paghahatid.',
  patientTitle: 'Alam ng pasyente ang request na ito',
  patientSubtitle:
      'Sinabihan ko ang pasyente na itatago ng TanzAlert ang pangalan, tirahan, '
      'contact at kalagayang medikal niya para sa paghahatid na ito.',
  requiredTag: 'KAILANGAN',
  agree: 'Sumasang-ayon ako, ipadala',
  cancel: 'Kanselahin',
  hint: 'Maitatala ang Consent $ambulanceConsentVersion kasama ng request na ito.',
  rightsNote:
      'Ang mga karapatan mo sa ilalim ng Data Privacy Act ay nasa pahintulot na '
      'sinang-ayunan mo noong nagparehistro ka.',
  close: 'Isara',
);

/// What was agreed to for one booking.
class AmbulanceConsentDecision {
  const AmbulanceConsentDecision({required this.version, required this.scopes});

  final String version;
  final List<String> scopes;

  /// The shape the booking endpoint takes.
  Map<String, dynamic> toJson() => {'version': version, 'scopes': scopes};
}

/// Opens the booking consent, and returns what was agreed to, or null if it
/// was cancelled or dismissed.
///
/// Call this only for a scheduled or transfer booking. An emergency request is
/// never gated on a dialog: standing between somebody and an ambulance to
/// collect a tick is not a trade this system makes, and the backend records
/// such a request as processed to protect life rather than by consent.
Future<AmbulanceConsentDecision?> showAmbulanceConsentSheet(
  BuildContext context, {
  required bool patientIsSomeoneElse,
}) {
  return showModalBottomSheet<AmbulanceConsentDecision>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * .88,
    ),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (_) => _AmbulanceConsentSheet(
      patientIsSomeoneElse: patientIsSomeoneElse,
    ),
  );
}

class _AmbulanceConsentSheet extends StatefulWidget {
  const _AmbulanceConsentSheet({required this.patientIsSomeoneElse});

  final bool patientIsSomeoneElse;

  @override
  State<_AmbulanceConsentSheet> createState() => _AmbulanceConsentSheetState();
}

class _AmbulanceConsentSheetState extends State<_AmbulanceConsentSheet> {
  AmbulanceConsentCopy _copy = ambulanceConsentEn;
  bool _transport = false;
  bool _patientInformed = false;

  /// Nobody has to confirm they told themselves.
  bool get _needsPatientAck => widget.patientIsSomeoneElse;

  bool get _canAgree => _transport && (!_needsPatientAck || _patientInformed);

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
              Text(_copy.title, style: Theme.of(context).textTheme.headlineMedium),
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
              ConsentFactTable(facts: _copy.facts),
              _sectionLabel(_copy.consentHeading),
              ConsentOption(
                title: _copy.transportTitle,
                subtitle: _copy.transportSubtitle,
                tag: _copy.requiredTag,
                mandatory: true,
                value: _transport,
                onChanged: (on) => setState(() => _transport = on),
              ),
              if (_needsPatientAck) ...[
                const SizedBox(height: 10),
                ConsentOption(
                  title: _copy.patientTitle,
                  subtitle: _copy.patientSubtitle,
                  tag: _copy.requiredTag,
                  mandatory: true,
                  value: _patientInformed,
                  onChanged: (on) => setState(() => _patientInformed = on),
                ),
              ],
              const SizedBox(height: 14),
              Text(
                _copy.rightsNote,
                style: const TextStyle(
                  fontSize: 11.5,
                  height: 1.5,
                  color: AppColors.textMuted,
                ),
              ),
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
                isFilipino: _copy.languageLabel == ambulanceConsentFil.languageLabel,
                englishLabel: ambulanceConsentEn.languageLabel,
                filipinoLabel: ambulanceConsentFil.languageLabel,
                onChanged: (fil) => setState(
                  () => _copy = fil ? ambulanceConsentFil : ambulanceConsentEn,
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
          AppButton(
            label: _copy.agree,
            onPressed: _canAgree
                ? () => Navigator.pop(
                    context,
                    AmbulanceConsentDecision(
                      version: ambulanceConsentVersion,
                      scopes: [
                        scopeAmbulanceTransport,
                        if (_needsPatientAck && _patientInformed)
                          scopePatientInformed,
                      ],
                    ),
                  )
                : null,
          ),
          const SizedBox(height: 6),
          TextButton(
            onPressed: () => Navigator.pop(context),
            style: TextButton.styleFrom(foregroundColor: AppColors.textMuted),
            child: Text(
              _copy.cancel,
              style: const TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
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
