import 'package:tanzalert_facilities/tanzalert_facilities.dart';

/// What the user meant by what they typed in the drop-off search box.
///
/// "hospital near me" is a proximity question about one kind of facility, not
/// a place name to geocode, and the two need different answers: the first is
/// served from the facility list sorted by distance, the second from a
/// place-name lookup. This splits one free-text line into that decision.
class FacilitySearchQuery {
  /// The kind of facility asked for, or null when the text names no kind.
  final EmergencyFacilityType? type;

  /// Whether the wording explicitly asked for proximity ("near me",
  /// "nearest", "malapit"). A bare "hospital" is already ranked by distance,
  /// so this only drives wording in the UI.
  final bool proximity;

  /// Words left after the kind and the proximity wording are removed — the
  /// part that narrows a kind down to a particular place, as in the "divine
  /// grace" of "divine grace hospital".
  final List<String> terms;

  final String raw;

  const FacilitySearchQuery({
    required this.raw,
    this.type,
    this.proximity = false,
    this.terms = const [],
  });

  /// True when this should be answered from the facility list rather than by
  /// geocoding the text as a place name.
  bool get isFacilitySearch => type != null;

  /// Phrases that name a kind of facility, longest first within each kind so
  /// "medical center" is consumed before "medical". Tagalog terms are included
  /// because this app serves a Tanza audience: "ospital", "pulis", "bumbero"
  /// are what people actually type.
  static const Map<EmergencyFacilityType, List<String>> _keywords = {
    EmergencyFacilityType.hospital: [
      'medical center',
      'medical centre',
      'emergency room',
      'hospital',
      'ospital',
      'medical',
      'doctor',
      'er',
    ],
    EmergencyFacilityType.redCross: [
      'philippine red cross',
      'red cross',
      'redcross',
      'prc',
      'blood bank',
    ],
    EmergencyFacilityType.drrmo: [
      'disaster risk reduction',
      'mdrrmo',
      'cdrrmo',
      'bdrrmo',
      'drrmo',
      'disaster',
      'rescue',
    ],
    EmergencyFacilityType.fireStation: [
      'fire station',
      'fire department',
      'bumbero',
      'bombero',
      'firetruck',
      'bfp',
      'fire',
    ],
    EmergencyFacilityType.police: [
      'police station',
      'police',
      'pulis',
      'pnp',
      'precinct',
    ],
    EmergencyFacilityType.ambulanceStation: [
      'ambulance station',
      'ambulance',
    ],
  };

  static const List<String> _proximityPhrases = [
    'near me',
    'nearest',
    'nearby',
    'closest',
    'close to me',
    'around me',
    'pinakamalapit',
    'malapit sa akin',
    'malapit',
  ];

  /// Words that carry no search intent and would otherwise be treated as part
  /// of a facility's name.
  static const Set<String> _stopWords = {
    'a',
    'an',
    'the',
    'to',
    'in',
    'at',
    'of',
    'me',
    'my',
    'any',
    'find',
    'show',
    'search',
    'go',
    'take',
    'please',
    'sa',
    'ng',
    'na',
    'ako',
  };

  static FacilitySearchQuery parse(String input) {
    final raw = input.trim();
    // Keep letters, digits and spaces: punctuation only gets in the way of
    // phrase matching, and hyphens join words that should be separate.
    var text = raw
        .toLowerCase()
        .replaceAll(RegExp(r"[^a-z0-9ñ\s]"), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    if (text.isEmpty) return FacilitySearchQuery(raw: raw);

    var proximity = false;
    for (final phrase in _proximityPhrases) {
      final re = RegExp('\\b${RegExp.escape(phrase)}\\b');
      if (re.hasMatch(text)) {
        proximity = true;
        text = text.replaceAll(re, ' ');
      }
    }

    EmergencyFacilityType? type;
    for (final entry in _keywords.entries) {
      for (final keyword in entry.value) {
        final re = RegExp('\\b${RegExp.escape(keyword)}\\b');
        if (re.hasMatch(text)) {
          type = entry.key;
          text = text.replaceAll(re, ' ');
          break;
        }
      }
      if (type != null) break;
    }

    final terms = text
        .split(RegExp(r'\s+'))
        .map((w) => w.trim())
        .where((w) => w.isNotEmpty && !_stopWords.contains(w))
        .toList();

    return FacilitySearchQuery(
      raw: raw,
      type: type,
      proximity: proximity,
      terms: terms,
    );
  }
}
