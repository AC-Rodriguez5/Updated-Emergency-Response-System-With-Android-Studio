import 'package:tanzalert_facilities/tanzalert_facilities.dart';
import 'package:flutter_test/flutter_test.dart';

/// Every element below is a real Overpass response for the Tanza / Cavite
/// bounding box, trimmed to the tags that matter. They are here because
/// Philippine tagging is inconsistent enough that classification is worth
/// pinning down against actual data rather than an idealised schema.
void main() {
  group('EmergencyFacility.fromOverpass', () {
    EmergencyFacility? parse(Map<String, dynamic> tags, {Object? id = 1}) =>
        EmergencyFacility.fromOverpass({
          'type': 'node',
          'id': id,
          'lat': 14.3904415,
          'lon': 120.8490805,
          'tags': tags,
        });

    test('classifies a hospital', () {
      final f = parse({'amenity': 'hospital', 'name': 'Tanza General Hospital'});
      expect(f?.type, EmergencyFacilityType.hospital);
      expect(f?.name, 'Tanza General Hospital');
    });

    test('classifies a police station', () {
      expect(
        parse({'amenity': 'police', 'name': 'Tanza Police Station'})?.type,
        EmergencyFacilityType.police,
      );
    });

    test('classifies a BFP fire station by operator', () {
      expect(
        parse({
          'amenity': 'fire_station',
          'name': 'General Trias Fire Station',
          'operator': 'Bureau of Fire Protection',
        })?.type,
        EmergencyFacilityType.fireStation,
      );
    });

    test('a Red Cross branch tagged amenity=clinic is still Red Cross', () {
      // Real tagging of the Dasmariñas branch: amenity=clinic.
      expect(
        parse({
          'amenity': 'clinic',
          'name': 'Philippine Red Cross - Dasmariñas Branch',
        })?.type,
        EmergencyFacilityType.redCross,
      );
    });

    test('an MDRRMO is found by emergency=disaster_response', () {
      expect(
        parse({'emergency': 'disaster_response', 'name': 'Silang DRRMO'})?.type,
        EmergencyFacilityType.drrmo,
      );
    });

    test('an MDRRMO is found by office=government + emergency_management', () {
      expect(
        parse({
          'office': 'government',
          'government': 'emergency_management',
          'name': 'Indang Municipal Disaster Risk Reduction and Management Office',
        })?.type,
        EmergencyFacilityType.drrmo,
      );
    });

    test('a town hall tagged office=government is not a facility', () {
      expect(
        parse({'office': 'government', 'name': 'Pamahalaang Bayan ng Tanza'}),
        isNull,
      );
    });

    test('mall security and impounding lots tagged amenity=police are dropped', () {
      // All three are real amenity=police elements in the Cavite extract.
      expect(parse({'amenity': 'police', 'name': 'LPU-C Security'}), isNull);
      expect(
        parse({'amenity': 'police', 'name': 'Dasmariñas City Impounding Area'}),
        isNull,
      );
      expect(
        parse({'amenity': 'police', 'name': 'WalterMart Mobile Police Box'}),
        isNull,
      );
    });

    test('unnamed elements are dropped — a label needs a name', () {
      expect(parse({'amenity': 'police'}), isNull);
      expect(parse({'amenity': 'hospital', 'name': '   '}), isNull);
    });

    test('an optical shop tagged amenity=clinic is not a facility', () {
      expect(parse({'amenity': 'clinic', 'name': 'Poblete Optical'}), isNull);
    });

    test('a way carries no lat/lon of its own, only center', () {
      final f = EmergencyFacility.fromOverpass({
        'type': 'way',
        'id': 42,
        'center': {'lat': 14.3925697, 'lon': 120.854866},
        'tags': {'amenity': 'hospital', 'name': 'Ospital ng Imus'},
      });
      expect(f, isNotNull);
      expect(f!.latitude, closeTo(14.3925697, 1e-9));
      expect(f.longitude, closeTo(120.854866, 1e-9));
      expect(f.id, 'osm/way/42');
    });

    test('an element with neither lat/lon nor center is dropped', () {
      expect(
        EmergencyFacility.fromOverpass({
          'type': 'relation',
          'id': 7,
          'tags': {'amenity': 'hospital', 'name': 'Somewhere Hospital'},
        }),
        isNull,
      );
    });

    test('a street alone is not used as an address', () {
      // One addr:* tag cannot place a building, so the picker should reverse
      // geocode instead of labelling it "Antero Soriano Highway".
      final f = parse({
        'amenity': 'hospital',
        'name': 'Tanza General Hospital',
        'addr:street': 'Antero Soriano Highway',
      });
      expect(f?.address, isNull);
    });

    test('street plus municipality is used as an address', () {
      final f = parse({
        'amenity': 'hospital',
        'name': 'Tanza General Hospital',
        'addr:street': 'Antero Soriano Highway',
        'addr:city': 'Tanza',
        'addr:province': 'Cavite',
      });
      expect(f?.address, 'Antero Soriano Highway, Tanza, Cavite');
    });
  });

  group('labelWith', () {
    const hospital = EmergencyFacility(
      id: 'seed/x',
      name: 'Tanza General Hospital',
      type: EmergencyFacilityType.hospital,
      latitude: 14.3904415,
      longitude: 120.8490805,
    );

    test('name alone when nothing resolved', () {
      expect(hospital.labelWith(null), 'Tanza General Hospital');
    });

    test('name then address', () {
      expect(
        hospital.labelWith('Antero Soriano Highway, Tanza, Cavite'),
        'Tanza General Hospital, Antero Soriano Highway, Tanza, Cavite',
      );
    });

    test('the name is not repeated when the geocoder already leads with it', () {
      // Nominatim's display_name usually starts with the POI name.
      expect(
        hospital.labelWith('Tanza General Hospital, Antero Soriano Highway, Tanza'),
        'Tanza General Hospital, Antero Soriano Highway, Tanza',
      );
    });

    test('a known address wins over a resolved one', () {
      const withAddress = EmergencyFacility(
        id: 'seed/y',
        name: 'Tanza MDRRMO (Municipal Hall compound)',
        type: EmergencyFacilityType.drrmo,
        latitude: 14.3928409,
        longitude: 120.8547923,
        address: 'Antero Soriano Highway, Barangay IV, Tanza, Cavite',
      );
      expect(
        withAddress.labelWith('somewhere else entirely'),
        'Tanza MDRRMO (Municipal Hall compound), '
        'Antero Soriano Highway, Barangay IV, Tanza, Cavite',
      );
    });
  });

  group('bundled seeds', () {
    test('ids are unique', () {
      final ids = phEmergencyFacilitySeeds.map((f) => f.id).toSet();
      expect(ids.length, phEmergencyFacilitySeeds.length);
    });

    test('every seed sits inside Philippine latitude/longitude', () {
      for (final f in phEmergencyFacilitySeeds) {
        expect(f.latitude, inInclusiveRange(4.0, 21.5), reason: f.name);
        expect(f.longitude, inInclusiveRange(116.0, 127.0), reason: f.name);
      }
    });

    test('covers every facility type the legend advertises except ambulance', () {
      final types = phEmergencyFacilitySeeds.map((f) => f.type).toSet();
      expect(types, contains(EmergencyFacilityType.hospital));
      expect(types, contains(EmergencyFacilityType.police));
      expect(types, contains(EmergencyFacilityType.fireStation));
      expect(types, contains(EmergencyFacilityType.redCross));
      expect(types, contains(EmergencyFacilityType.drrmo));
    });

    test('Tanza itself has a hospital, a police station and an MDRRMO', () {
      // Tanza is the municipality this app serves; an empty map there would be
      // the one failure users would actually hit.
      final inTanza = phEmergencyFacilitySeeds
          .where((f) => f.name.toLowerCase().contains('tanza'))
          .map((f) => f.type)
          .toSet();
      expect(inTanza, contains(EmergencyFacilityType.hospital));
      expect(inTanza, contains(EmergencyFacilityType.police));
      expect(inTanza, contains(EmergencyFacilityType.drrmo));
    });
  });
}
