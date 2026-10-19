import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:tanzalert_facilities/tanzalert_facilities.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';

/// Serves a scripted reply per request so the resilience paths can be driven
/// without touching the network: Overpass mirrors fail often enough that the
/// fallback behaviour is the part most worth testing.
class ScriptedAdapter implements HttpClientAdapter {
  ScriptedAdapter(this.replies);

  /// One entry per expected call, in order. A null entry throws, standing in
  /// for a mirror that is down.
  final List<Map<String, dynamic>?> replies;
  int calls = 0;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final reply = calls < replies.length ? replies[calls] : null;
    calls++;
    if (reply == null) {
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'mirror down',
      );
    }
    return ResponseBody.fromString(
      jsonEncode(reply),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

EmergencyFacilityService serviceWith(ScriptedAdapter adapter) {
  final dio = Dio(BaseOptions(responseType: ResponseType.json));
  dio.httpClientAdapter = adapter;
  return EmergencyFacilityService(dio: dio);
}

/// The Tanza viewport, which the bundled seeds cover.
Future<FacilityLookup> lookupTanza(
  EmergencyFacilityService service, {
  double zoom = 15,
}) =>
    service.inBounds(
      south: 14.35,
      west: 120.80,
      north: 14.45,
      east: 120.90,
      zoom: zoom,
    );

void main() {
  test('live results are merged on top of the bundled seeds', () async {
    final adapter = ScriptedAdapter([
      {
        'elements': [
          {
            'type': 'node',
            'id': 1,
            'lat': 14.3961021,
            'lon': 120.8397162,
            'tags': {
              'amenity': 'fire_station',
              'name': 'Some Unmapped-Until-Now Fire Station',
            },
          },
        ],
      },
    ]);
    final lookup = await lookupTanza(serviceWith(adapter));

    expect(lookup.liveDataReached, isTrue);
    expect(
      lookup.facilities.map((f) => f.name),
      contains('Some Unmapped-Until-Now Fire Station'),
    );
    // Seeds are still there alongside it.
    expect(
      lookup.facilities.map((f) => f.name),
      contains('Tanza General Hospital'),
    );
  });

  test('a live duplicate of a seed does not produce two pins', () async {
    // OSM's own name for the station the seeds call "Tanza Municipal Police
    // Station", at its OSM coordinates.
    final adapter = ScriptedAdapter([
      {
        'elements': [
          {
            'type': 'node',
            'id': 2,
            'lat': 14.3925697,
            'lon': 120.854866,
            'tags': {'amenity': 'police', 'name': 'Tanza Police Station'},
          },
        ],
      },
    ]);
    final lookup = await lookupTanza(serviceWith(adapter));

    final police = lookup.facilities
        .where((f) => f.type == EmergencyFacilityType.police)
        .where((f) => f.name.toLowerCase().contains('tanza'))
        .toList();
    expect(police, hasLength(1));
    expect(police.single.name, 'Tanza Municipal Police Station');
  });

  test('two different facilities of a kind 100 m apart both survive', () async {
    // A town centre can hold two distinct hospitals a block apart. Collapsing
    // them on distance alone would hide a real destination, so the names have
    // to agree before anything is dropped.
    final adapter = ScriptedAdapter([
      {
        'elements': [
          {
            'type': 'node',
            'id': 10,
            'lat': 14.3913,
            'lon': 120.8491,
            'tags': {
              'amenity': 'hospital',
              'name': 'Brand New Barangay Hospital',
            },
          },
        ],
      },
    ]);
    final lookup = await lookupTanza(serviceWith(adapter));

    final names = lookup.facilities.map((f) => f.name);
    expect(names, contains('Brand New Barangay Hospital'));
    expect(names, contains('Tanza General Hospital'));
  });

  test('the same facility mapped twice under one name collapses', () async {
    // The way centroid and the entrance node of one hospital, 96 m apart.
    final adapter = ScriptedAdapter([
      {
        'elements': [
          {
            'type': 'way',
            'id': 11,
            'center': {'lat': 14.3913, 'lon': 120.8491},
            'tags': {'amenity': 'hospital', 'name': 'Tanza General Hospital'},
          },
        ],
      },
    ]);
    final lookup = await lookupTanza(serviceWith(adapter));

    expect(
      lookup.facilities.where((f) => f.name == 'Tanza General Hospital'),
      hasLength(1),
    );
  });

  test('every mirror failing still returns the seeds', () async {
    final adapter = ScriptedAdapter([null, null, null]);
    final lookup = await lookupTanza(serviceWith(adapter));

    expect(lookup.liveDataReached, isFalse);
    expect(lookup.facilities, isNotEmpty);
    expect(
      lookup.facilities.map((f) => f.name),
      contains('Tanza General Hospital'),
    );
  });

  test('a failing mirror falls through to the next one', () async {
    final adapter = ScriptedAdapter([
      null,
      {
        'elements': [
          {
            'type': 'node',
            'id': 3,
            'lat': 14.40,
            'lon': 120.86,
            'tags': {'amenity': 'hospital', 'name': 'Second Mirror Hospital'},
          },
        ],
      },
    ]);
    final lookup = await lookupTanza(serviceWith(adapter));

    expect(adapter.calls, 2);
    expect(lookup.liveDataReached, isTrue);
    expect(
      lookup.facilities.map((f) => f.name),
      contains('Second Mirror Hospital'),
    );
  });

  test('an empty answer is reported as no live data and is not cached',
      () async {
    // This is what a regional-extract mirror does: HTTP 200, zero elements.
    // Caching it would claim Tanza has no hospital, so the next lookup must
    // query again rather than serve the empty answer back.
    final adapter = ScriptedAdapter([
      {'elements': <dynamic>[]},
      {
        'elements': [
          {
            'type': 'node',
            'id': 4,
            'lat': 14.40,
            'lon': 120.86,
            'tags': {'amenity': 'hospital', 'name': 'Later Hospital'},
          },
        ],
      },
    ]);
    final service = serviceWith(adapter);

    final first = await lookupTanza(service);
    expect(first.liveDataReached, isFalse);
    expect(first.facilities, isNotEmpty); // seeds

    final second = await lookupTanza(service);
    expect(second.liveDataReached, isTrue);
    expect(
      second.facilities.map((f) => f.name),
      contains('Later Hospital'),
    );
  });

  test('a successful answer is cached, so panning does not re-query', () async {
    final adapter = ScriptedAdapter([
      {
        'elements': [
          {
            'type': 'node',
            'id': 5,
            'lat': 14.40,
            'lon': 120.86,
            'tags': {'amenity': 'hospital', 'name': 'Cached Hospital'},
          },
        ],
      },
    ]);
    final service = serviceWith(adapter);

    await lookupTanza(service);
    // A small pan that stays inside the same coarse grid cell.
    final second = await service.inBounds(
      south: 14.36,
      west: 120.81,
      north: 14.44,
      east: 120.89,
      zoom: 15,
    );

    expect(adapter.calls, 1);
    expect(second.liveDataReached, isTrue);
    expect(
      second.facilities.map((f) => f.name),
      contains('Cached Hospital'),
    );
  });

  test('zoomed out past the live-query floor, no request is made', () async {
    final adapter = ScriptedAdapter([]);
    final lookup = await lookupTanza(serviceWith(adapter), zoom: 8);

    expect(adapter.calls, 0);
    expect(lookup.liveDataReached, isFalse);
    expect(lookup.facilities, isNotEmpty); // seeds still plot
  });

  test('only seeds inside the viewport are returned', () async {
    final adapter = ScriptedAdapter([null]);
    // A box around Tanza proper, which excludes the Cavite City Red Cross
    // chapter at 14.48, 120.90.
    final lookup = await serviceWith(adapter).inBounds(
      south: 14.36,
      west: 120.83,
      north: 14.40,
      east: 120.87,
      zoom: 15,
    );

    expect(
      lookup.facilities.map((f) => f.name),
      isNot(contains('Philippine Red Cross - Cavite Chapter')),
    );
    expect(
      lookup.facilities.map((f) => f.name),
      contains('Tanza General Hospital'),
    );
  });

  group('nearest — "hospital near me" and friends', () {
    // All mirrors down, so these exercise the bundled baseline: "nearest
    // hospital" has to keep working when Overpass does not.
    ScriptedAdapter offline() => ScriptedAdapter(const []);

    // Tanza General Hospital's own coordinates, standing in for a user there.
    const originLat = 14.3904415;
    const originLng = 120.8490805;

    test('results come back nearest first', () async {
      final lookup = await serviceWith(offline()).nearest(
        latitude: originLat,
        longitude: originLng,
        type: EmergencyFacilityType.hospital,
      );

      expect(lookup.facilities, isNotEmpty);
      expect(lookup.facilities.first.name, 'Tanza General Hospital');

      const distance = Distance();
      final origin = LatLng(originLat, originLng);
      final metres = lookup.facilities
          .map((f) => distance.as(LengthUnit.Meter, origin, f.point))
          .toList();
      for (var i = 1; i < metres.length; i++) {
        expect(metres[i], greaterThanOrEqualTo(metres[i - 1]));
      }
    });

    test('only the asked-for kind comes back', () async {
      final lookup = await serviceWith(offline()).nearest(
        latitude: originLat,
        longitude: originLng,
        type: EmergencyFacilityType.police,
      );

      expect(lookup.facilities, isNotEmpty);
      expect(
        lookup.facilities.every((f) => f.type == EmergencyFacilityType.police),
        isTrue,
      );
      expect(lookup.facilities.first.name, 'Tanza Municipal Police Station');
    });

    test('"bfp near me" from Tanza finds the Tanza station first', () async {
      // Before it was seeded, the nearest BFP result for a Tanza user was the
      // General Trias station, 3 km away in the wrong municipality.
      final lookup = await serviceWith(offline()).nearest(
        latitude: originLat,
        longitude: originLng,
        type: EmergencyFacilityType.fireStation,
      );

      expect(lookup.facilities, isNotEmpty);
      expect(
        lookup.facilities.first.name,
        'BFP Tanza Fire Station (near Municipal Hall)',
      );
    });

    test('the radius widens until something is found', () async {
      // Roughly 30 km from the only Red Cross chapters in the baseline, so the
      // first two radius steps find nothing.
      final lookup = await serviceWith(offline()).nearest(
        latitude: 14.30,
        longitude: 120.70,
        type: EmergencyFacilityType.redCross,
      );

      expect(
        lookup.facilities.map((f) => f.name),
        contains('Philippine Red Cross - Cavite Chapter'),
      );
    });

    test('name terms narrow a kind down to one place', () async {
      final lookup = await serviceWith(offline()).nearest(
        latitude: originLat,
        longitude: originLng,
        type: EmergencyFacilityType.hospital,
        nameTerms: const ['divine'],
      );

      expect(lookup.facilities, hasLength(1));
      expect(lookup.facilities.single.name, 'Divine Grace Medical Center');
    });

    test('name terms that match nothing fall back to nearest of that kind',
        () async {
      // A typo should not dead-end the search.
      final lookup = await serviceWith(offline()).nearest(
        latitude: originLat,
        longitude: originLng,
        type: EmergencyFacilityType.hospital,
        nameTerms: const ['hsopital'],
      );

      expect(lookup.facilities, isNotEmpty);
      expect(lookup.facilities.first.name, 'Tanza General Hospital');
    });

    test('a live facility closer than any seed is ranked first', () async {
      final adapter = ScriptedAdapter([
        {
          'elements': [
            {
              'type': 'node',
              'id': 99,
              // ~100 m from the origin, nearer than the seeded hospital.
              'lat': 14.3913,
              'lon': 120.8491,
              'tags': {
                'amenity': 'hospital',
                'name': 'Brand New Barangay Hospital',
              },
            },
          ],
        },
      ]);
      // Standing between the two: ~78 m from the new one, ~173 m from the
      // seeded one. (Using the seed's own coordinates as the origin would put
      // it at zero and prove nothing.)
      final lookup = await serviceWith(adapter).nearest(
        latitude: 14.3920,
        longitude: 120.8491,
        type: EmergencyFacilityType.hospital,
      );

      expect(lookup.liveDataReached, isTrue);
      expect(lookup.facilities.first.name, 'Brand New Barangay Hospital');
      expect(
        lookup.facilities.map((f) => f.name),
        contains('Tanza General Hospital'),
      );
    });

    test('with no kind given, every nearby facility kind is returned',
        () async {
      final lookup = await serviceWith(offline()).nearest(
        latitude: originLat,
        longitude: originLng,
      );

      final types = lookup.facilities.map((f) => f.type).toSet();
      expect(types.length, greaterThan(1));
    });
  });
}
