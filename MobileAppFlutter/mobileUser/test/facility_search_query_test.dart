import 'package:tanzalert_facilities/tanzalert_facilities.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_user/features/ambulance_transport/models/facility_search_query.dart';

void main() {
  FacilitySearchQuery parse(String s) => FacilitySearchQuery.parse(s);

  group('proximity queries', () {
    test('"Hospital near me" is a nearest-hospital question', () {
      final q = parse('Hospital near me');
      expect(q.type, EmergencyFacilityType.hospital);
      expect(q.proximity, isTrue);
      expect(q.terms, isEmpty);
      expect(q.isFacilitySearch, isTrue);
    });

    test('the same works for every other facility kind', () {
      expect(parse('police near me').type, EmergencyFacilityType.police);
      expect(parse('nearest fire station').type,
          EmergencyFacilityType.fireStation);
      expect(parse('red cross nearby').type, EmergencyFacilityType.redCross);
      expect(parse('closest mdrrmo').type, EmergencyFacilityType.drrmo);
      expect(parse('ambulance station near me').type,
          EmergencyFacilityType.ambulanceStation);
    });

    test('acronyms and Tagalog wording are understood', () {
      expect(parse('bfp').type, EmergencyFacilityType.fireStation);
      expect(parse('pnp').type, EmergencyFacilityType.police);
      expect(parse('prc').type, EmergencyFacilityType.redCross);
      expect(parse('ospital na malapit').type, EmergencyFacilityType.hospital);
      expect(parse('ospital na malapit').proximity, isTrue);
      expect(parse('pinakamalapit na pulis').type, EmergencyFacilityType.police);
      expect(parse('bumbero').type, EmergencyFacilityType.fireStation);
    });

    test('a bare kind is still a facility search', () {
      final q = parse('hospital');
      expect(q.isFacilitySearch, isTrue);
      expect(q.proximity, isFalse); // ranked by distance regardless
    });

    test('punctuation and case do not matter', () {
      final q = parse('  HOSPITAL, NEAR ME!!  ');
      expect(q.type, EmergencyFacilityType.hospital);
      expect(q.proximity, isTrue);
    });
  });

  group('narrowing a kind by name', () {
    test('"divine grace hospital" keeps the name as search terms', () {
      final q = parse('divine grace hospital');
      expect(q.type, EmergencyFacilityType.hospital);
      expect(q.terms, ['divine', 'grace']);
    });

    test('filler words are not treated as part of a name', () {
      final q = parse('find me the nearest hospital please');
      expect(q.type, EmergencyFacilityType.hospital);
      expect(q.proximity, isTrue);
      expect(q.terms, isEmpty);
    });
  });

  group('place queries', () {
    test('a place name is not a facility search', () {
      final q = parse('Daang Amaya I');
      expect(q.isFacilitySearch, isFalse);
      expect(q.type, isNull);
    });

    test('empty input is inert', () {
      final q = parse('   ');
      expect(q.isFacilitySearch, isFalse);
      expect(q.raw, isEmpty);
      expect(q.terms, isEmpty);
    });
  });

  group('matching is word-bounded', () {
    test('"er" inside another word does not mean emergency room', () {
      // Without word boundaries, "Mother Teresa" would match the "er" keyword
      // and be answered as a nearest-hospital query.
      expect(parse('Mother Teresa Street').type, isNull);
    });

    test('"police" inside "policy" does not match', () {
      expect(parse('policy office').type, isNull);
    });

    test('"fire" still matches as its own word', () {
      expect(parse('fire').type, EmergencyFacilityType.fireStation);
    });
  });

  group('kind precedence', () {
    test('"red cross" wins over the generic blood/medical words', () {
      expect(
        parse('philippine red cross near me').type,
        EmergencyFacilityType.redCross,
      );
    });

    test('a hospital phrase beats the bare "medical" keyword', () {
      final q = parse('medical center near me');
      expect(q.type, EmergencyFacilityType.hospital);
      // "center" must not survive as a name term, or it would filter out every
      // hospital that is not literally called "Center".
      expect(q.terms, isEmpty);
    });
  });
}
