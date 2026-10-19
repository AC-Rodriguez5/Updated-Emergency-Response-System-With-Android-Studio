/// What the consent form says, in both languages it is offered in.
///
/// Kept apart from the widget that draws it: this is the text a municipality
/// has to be able to review and amend without reading Flutter, and every change
/// to it is a change to what residents were told.
///
/// Bump [consentVersion] whenever the wording or the scopes change. The version
/// is stored with the grant, so a record always says which text was agreed to.
library;

const String consentVersion = 'v1.1';

/// One permission the resident is asked for.
///
/// [key] is what the backend records. The four required ones are the minimum
/// TanzAlert needs to create an account and raise an alert; without them there
/// is no service to provide, which is why registration cannot continue.
class ConsentScope {
  const ConsentScope({required this.key, required this.mandatory});

  final String key;
  final bool mandatory;
}

const List<ConsentScope> consentScopes = [
  ConsentScope(key: 'account_processing', mandatory: true),
  ConsentScope(key: 'sos_location_sharing', mandatory: true),
  ConsentScope(key: 'on_device_biometric_ack', mandatory: true),
  ConsentScope(key: 'contacts_informed', mandatory: true),
  ConsentScope(key: 'anonymized_research', mandatory: false),
  ConsentScope(key: 'research_followup', mandatory: false),
];

/// A line in the "what we collect" table: a short label, then a bold lead and
/// the rest of the explanation.
class ConsentRow {
  const ConsentRow({required this.label, required this.lead, required this.body});

  final String label;
  final String lead;
  final String body;
}

class ConsentItemCopy {
  const ConsentItemCopy({required this.title, required this.subtitle});

  final String title;
  final String subtitle;
}

class ConsentCopy {
  const ConsentCopy({
    required this.languageLabel,
    required this.sheetTitle,
    required this.title,
    required this.lede,
    required this.collectHeading,
    required this.rows,
    required this.fingerprintLead,
    required this.fingerprintBody,
    required this.consentHeading,
    required this.items,
    required this.requiredTag,
    required this.optionalTag,
    required this.rightsHeading,
    required this.rightsIntro,
    required this.rights,
    required this.dpoLabel,
    required this.agree,
    required this.decline,
    required this.hint,
    required this.declineNote,
    required this.close,
    required this.tileTitle,
    required this.tilePrompt,
    required this.tileAgreed,
    required this.tileReview,
    required this.tileMissing,
  });

  final String languageLabel;
  final String sheetTitle;
  final String title;
  final String lede;
  final String collectHeading;
  final List<ConsentRow> rows;
  final String fingerprintLead;
  final String fingerprintBody;
  final String consentHeading;

  /// Keyed by [ConsentScope.key].
  final Map<String, ConsentItemCopy> items;
  final String requiredTag;
  final String optionalTag;
  final String rightsHeading;
  final String rightsIntro;
  final List<String> rights;
  final String dpoLabel;
  final String agree;
  final String decline;
  final String hint;
  final String declineNote;
  final String close;

  /// The tile on the registration form that opens all of this.
  final String tileTitle;
  final String tilePrompt;
  final String tileAgreed;
  final String tileReview;
  final String tileMissing;
}

/// Where a resident sends a data-protection question. Replace with the
/// municipality's own address before this reaches the public.
const String consentDpoContact = 'privacy@tanzalert.example';

const ConsentCopy consentCopyEn = ConsentCopy(
  languageLabel: 'EN',
  sheetTitle: 'Data consent',
  title: 'Your data, your call',
  lede:
      'TanzAlert only works if it can reach people when you are in danger. Here is '
      'exactly what we collect, why, and what stays with you. Nothing is shared '
      'beyond what you approve below.',
  collectHeading: 'What we collect and why',
  rows: [
    ConsentRow(
      label: 'Name + contact',
      lead: 'Account and emergency contact.',
      body:
          ' Your name, email and mobile number, stored on the TanzAlert server '
          'while your account is active.',
    ),
    ConsentRow(
      label: 'About you',
      lead: 'What a responder is told.',
      body:
          ' Your date of birth, blood type and home address, passed to the '
          'responder on their way to you.',
    ),
    ConsentRow(
      label: 'Emergency contacts',
      lead: 'Alert delivery.',
      body: ' Their name and number, used only to send your alerts.',
    ),
    ConsentRow(
      label: 'ID documents',
      lead: 'Proof you live in Tanza.',
      body:
          ' A valid ID, proof of residency and a face photo, reviewed by MDRRMO '
          'before your account opens and kept while it is active.',
    ),
    ConsentRow(
      label: 'Location',
      lead: 'Only during an SOS.',
      body:
          ' Your GPS fix is captured when you trigger an alert and kept for 1 year, '
          'then deleted.',
    ),
    ConsentRow(
      label: 'Ambulance requests',
      lead: 'Only if you book one.',
      body:
          ' The pickup and drop-off points you choose on a map, and the name, '
          'contact and medical condition of the patient. Kept with the '
          'transport record. You are asked again when you book.',
    ),
    ConsentRow(
      label: 'Fingerprint',
      lead: 'Device unlock only.',
      body: ' Stored inside the keychain device itself. Never uploaded.',
    ),
    ConsentRow(
      label: 'Device health',
      lead: 'Reliability.',
      body:
          ' Battery level, signal, and fault logs so we know your device will work '
          'when needed.',
    ),
  ],
  fingerprintLead: 'Your fingerprint never leaves the device.',
  fingerprintBody:
      ' The sensor stores an encrypted template in its own chip. TanzAlert servers '
      'never see, receive, or store it. Removing your enrollment erases it '
      'permanently.',
  consentHeading: 'Your consent',
  items: {
    'account_processing': ConsentItemCopy(
      title: 'Process my account information',
      subtitle:
          'Use my name and mobile number to create my account and contact me about '
          'my alerts.',
    ),
    'sos_location_sharing': ConsentItemCopy(
      title: 'Share my location during an SOS',
      subtitle:
          'Send my live location to my emergency contacts and responders when I '
          'trigger an alert, and only then.',
    ),
    'on_device_biometric_ack': ConsentItemCopy(
      title: 'I understand my fingerprint stays on the device',
      subtitle:
          'My fingerprint is processed and stored only inside my TanzAlert device, '
          'never on servers.',
    ),
    'contacts_informed': ConsentItemCopy(
      title: 'My emergency contacts agreed',
      subtitle:
          'I have told the people I will list as emergency contacts that TanzAlert '
          'will store their name and number and send them my alerts.',
    ),
    'anonymized_research': ConsentItemCopy(
      title: 'Help improve TanzAlert',
      subtitle:
          'Allow de-identified usage data, such as alert counts and delivery times, '
          'to be used in the TanzAlert study. Never my identity or my locations.',
    ),
    'research_followup': ConsentItemCopy(
      title: 'Contact me for feedback',
      subtitle:
          'The team may invite me to a short interview about using TanzAlert. I can '
          'say no anytime.',
    ),
  },
  requiredTag: 'REQUIRED',
  optionalTag: 'OPTIONAL',
  rightsHeading: 'Your rights under the Data Privacy Act',
  rightsIntro: 'Under Republic Act 10173, you may at any time:',
  rights: [
    'Access a copy of your data from Settings or by request',
    'Correct wrong information',
    'Delete your account and data (alerts already sent to contacts stay on their phones)',
    'Withdraw any consent in Settings; withdrawing a required one deactivates alerting',
    'Complain to the National Privacy Commission at privacy.gov.ph',
  ],
  dpoLabel: 'Data protection contact:',
  agree: 'Agree and continue',
  decline: 'I do not agree',
  hint:
      'Tick the four required boxes to continue. Consent $consentVersion is saved '
      'to your account with a timestamp.',
  declineNote:
      'Without the four required permissions, TanzAlert cannot create your account '
      'or send alerts, so registration cannot continue. You can come back anytime.',
  close: 'Close',
  tileTitle: 'Data consent',
  tilePrompt: 'Read what TanzAlert collects, and agree before continuing.',
  tileAgreed: 'Agreed',
  tileReview: 'Review',
  tileMissing: 'This has to be read and agreed before you can continue.',
);

const ConsentCopy consentCopyFil = ConsentCopy(
  languageLabel: 'FIL',
  sheetTitle: 'Pahintulot sa datos',
  title: 'Datos mo, ikaw ang masusunod',
  lede:
      'Gumagana lang ang TanzAlert kung maaabot nito ang mga tao kapag nasa panganib '
      'ka. Narito nang eksakto kung anong datos ang kinukuha namin, bakit, at ano '
      'ang nananatili sa iyo. Walang ibabahagi nang lagpas sa papayagan mo sa ibaba.',
  collectHeading: 'Ano ang kinokolekta at bakit',
  rows: [
    ConsentRow(
      label: 'Pangalan + contact',
      lead: 'Account at pang-emergency na contact.',
      body:
          ' Ang pangalan, email at numero mo, nakatago sa TanzAlert server '
          'habang aktibo ang account mo.',
    ),
    ConsentRow(
      label: 'Tungkol sa iyo',
      lead: 'Ang sinasabi sa responder.',
      body:
          ' Petsa ng kapanganakan, blood type at tirahan mo, ipinapaalam sa '
          'responder habang papunta sa iyo.',
    ),
    ConsentRow(
      label: 'Mga emergency contact',
      lead: 'Paghahatid ng alerto.',
      body: ' Pangalan at numero nila, gagamitin lang para ipadala ang mga alerto mo.',
    ),
    ConsentRow(
      label: 'Mga dokumento',
      lead: 'Patunay na taga-Tanza ka.',
      body:
          ' Valid ID, patunay ng paninirahan, at larawan ng mukha; sinusuri ng '
          'MDRRMO bago mabuksan ang account mo at itinatago habang aktibo ito.',
    ),
    ConsentRow(
      label: 'Lokasyon',
      lead: 'Tuwing SOS lang.',
      body:
          ' Kukunin ang GPS mo kapag nag-trigger ka ng alerto, itatago nang 1 taon, '
          'pagkatapos ay buburahin.',
    ),
    ConsentRow(
      label: 'Hiling na ambulansya',
      lead: 'Kapag may ipinahatid ka lang.',
      body:
          ' Ang pickup at drop-off na pipiliin mo sa mapa, pati ang pangalan, '
          'contact at kalagayang medikal ng pasyente. Nakatago kasama ng '
          'talaan ng paghahatid. Tatanungin ka ulit kapag nag-request ka.',
    ),
    ConsentRow(
      label: 'Fingerprint',
      lead: 'Pambukas lang ng device.',
      body: ' Nakatago mismo sa loob ng keychain device. Hindi ina-upload kailanman.',
    ),
    ConsentRow(
      label: 'Kalagayan ng device',
      lead: 'Pagiging maaasahan.',
      body:
          ' Baterya, signal, at fault logs para tiyak na gagana ang device mo kapag '
          'kailangan.',
    ),
  ],
  fingerprintLead: 'Hindi lumalabas ng device ang fingerprint mo.',
  fingerprintBody:
      ' Naka-encrypt itong nakatago sa sariling chip ng sensor. Hindi ito nakikita, '
      'natatanggap, o naitatago ng TanzAlert servers. Kapag binura mo ang '
      'enrollment, tuluyan itong mawawala.',
  consentHeading: 'Ang pahintulot mo',
  items: {
    'account_processing': ConsentItemCopy(
      title: 'Iproseso ang impormasyon ng account ko',
      subtitle:
          'Gamitin ang pangalan at numero ko para gumawa ng account at makontak ako '
          'tungkol sa mga alerto ko.',
    ),
    'sos_location_sharing': ConsentItemCopy(
      title: 'Ibahagi ang lokasyon ko tuwing SOS',
      subtitle:
          'Ipadala ang live na lokasyon ko sa mga emergency contact at responder '
          'kapag nag-trigger ako ng alerto, at doon lamang.',
    ),
    'on_device_biometric_ack': ConsentItemCopy(
      title: 'Nauunawaan kong nasa device lang ang fingerprint ko',
      subtitle:
          'Pinoproseso at iniimbak ang fingerprint ko sa loob lamang ng TanzAlert '
          'device ko, hindi kailanman sa servers.',
    ),
    'contacts_informed': ConsentItemCopy(
      title: 'Pumayag ang mga emergency contact ko',
      subtitle:
          'Sinabihan ko ang mga taong ililista ko na itatago ng TanzAlert ang '
          'pangalan at numero nila at makakatanggap sila ng mga alerto ko.',
    ),
    'anonymized_research': ConsentItemCopy(
      title: 'Tumulong pagbutihin ang TanzAlert',
      subtitle:
          'Payagan ang de-identified na datos ng paggamit, tulad ng bilang ng alerto '
          'at bilis ng paghahatid, para sa pag-aaral ng TanzAlert. Hindi kasama ang '
          'pagkakakilanlan o lokasyon ko.',
    ),
    'research_followup': ConsentItemCopy(
      title: 'Kontakin ako para sa feedback',
      subtitle:
          'Maaari akong imbitahan ng team sa maikling panayam tungkol sa paggamit ng '
          'TanzAlert. Puwede akong tumanggi anumang oras.',
    ),
  },
  requiredTag: 'KAILANGAN',
  optionalTag: 'OPSYONAL',
  rightsHeading: 'Mga karapatan mo sa ilalim ng Data Privacy Act',
  rightsIntro: 'Sa ilalim ng Republic Act 10173, maaari mong gawin anumang oras:',
  rights: [
    'Humingi ng kopya ng datos mo sa Settings o sa pamamagitan ng kahilingan',
    'Itama ang maling impormasyon',
    'Burahin ang account at datos mo (ang mga alertong naipadala na sa contacts ay mananatili sa kanilang telepono)',
    'Bawiin ang anumang pahintulot sa Settings; kapag binawi ang isang kailangan, hihinto ang pag-aalerto',
    'Magreklamo sa National Privacy Commission sa privacy.gov.ph',
  ],
  dpoLabel: 'Contact para sa proteksyon ng datos:',
  agree: 'Sumasang-ayon ako, magpatuloy',
  decline: 'Hindi ako sumasang-ayon',
  hint:
      'Lagyan ng tsek ang apat na kailangang kahon para magpatuloy. Maitatala ang '
      'Consent $consentVersion sa account mo kasama ang oras.',
  declineNote:
      'Kung wala ang apat na kailangang pahintulot, hindi makakagawa ng account o '
      'makakapagpadala ng alerto ang TanzAlert, kaya hindi maaaring magpatuloy ang '
      'pagpapatala. Maaari kang bumalik anumang oras.',
  close: 'Isara',
  tileTitle: 'Pahintulot sa datos',
  tilePrompt:
      'Basahin kung ano ang kinokolekta ng TanzAlert, at sumang-ayon bago magpatuloy.',
  tileAgreed: 'Sumang-ayon',
  tileReview: 'Suriin',
  tileMissing: 'Kailangan itong basahin at sang-ayunan bago makapagpatuloy.',
);
