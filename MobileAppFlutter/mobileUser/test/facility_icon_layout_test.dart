import 'dart:math' as math;

import 'package:tanzalert_facilities/tanzalert_facilities.dart';
import 'package:flutter_test/flutter_test.dart';

EmergencyFacility at(
  String id,
  double lat,
  double lng, {
  EmergencyFacilityType type = EmergencyFacilityType.hospital,
}) =>
    EmergencyFacility(
      id: id,
      name: id,
      type: type,
      latitude: lat,
      longitude: lng,
    );

double magnitude(IconNudge n) => math.sqrt(n.dx * n.dx + n.dy * n.dy);

void main() {
  test('a facility standing alone is not moved', () {
    final nudges = facilityIconNudges([at('a', 14.39, 120.85)]);
    expect(nudges['a'], (dx: 0.0, dy: 0.0));
  });

  test('facilities far apart are all left where they are', () {
    final nudges = facilityIconNudges([
      at('a', 14.39, 120.85),
      at('b', 14.40, 120.86), // ~1.5 km away
    ]);
    expect(magnitude(nudges['a']!), 0);
    expect(magnitude(nudges['b']!), 0);
  });

  test('two facilities on the same coordinate are pushed apart', () {
    final nudges = facilityIconNudges([
      at('a', 14.3928409, 120.8547923),
      at('b', 14.3928409, 120.8547923),
    ]);

    expect(nudges['a'], isNot((dx: 0.0, dy: 0.0)));
    expect(nudges['b'], isNot((dx: 0.0, dy: 0.0)));
    // A pair reads best stacked vertically: one above, one below.
    expect(nudges['a']!.dy, lessThan(0));
    expect(nudges['b']!.dy, greaterThan(0));
    // Both sit on the ring, 2 * radius apart.
    expect(magnitude(nudges['a']!), closeTo(21, 0.001));
    expect(magnitude(nudges['b']!), closeTo(21, 0.001));
  });

  test('a compound of three spreads evenly and stays within the ring', () {
    final nudges = facilityIconNudges([
      at('mdrrmo', 14.3928409, 120.8547923, type: EmergencyFacilityType.drrmo),
      at('bfp', 14.3928409, 120.8547923,
          type: EmergencyFacilityType.fireStation),
      at('police', 14.3925697, 120.854866,
          type: EmergencyFacilityType.police),
    ]);

    expect(nudges, hasLength(3));
    for (final n in nudges.values) {
      expect(magnitude(n), closeTo(21, 0.001));
    }
    // No two icons land on the same spot.
    final spots = nudges.values
        .map((n) => '${n.dx.toStringAsFixed(3)},${n.dy.toStringAsFixed(3)}')
        .toSet();
    expect(spots, hasLength(3));
  });

  test('the layout does not depend on the order facilities arrive in', () {
    final a = at('alpha', 14.3928409, 120.8547923);
    final b = at('beta', 14.3928409, 120.8547923);
    final c = at('gamma', 14.39285, 120.85480);

    final one = facilityIconNudges([a, b, c]);
    final other = facilityIconNudges([c, b, a]);

    expect(one.keys.toSet(), other.keys.toSet());
    for (final id in one.keys) {
      expect(one[id], other[id], reason: id);
    }
  });

  test('a nudge never reaches far enough to be clipped by the marker box', () {
    // The screen sizes the marker box as the icon plus two ring radii, so a
    // nudge of exactly one radius always leaves the icon inside the box.
    const ringRadiusPx = 21.0;
    final nudges = facilityIconNudges(
      List.generate(6, (i) => at('f$i', 14.3928409, 120.8547923)),
      ringRadiusPx: ringRadiusPx,
    );
    for (final n in nudges.values) {
      expect(magnitude(n), lessThanOrEqualTo(ringRadiusPx + 0.001));
    }
  });

  test('the real Tanza municipal compound is spread, not stacked', () {
    // The MDRRMO, the fire station and the police station all sit at that one
    // compound; stacked, two of the three would be untappable.
    final compound = phEmergencyFacilitySeeds
        .where((f) => f.name.contains('Tanza'))
        .where((f) => f.type != EmergencyFacilityType.hospital)
        .toList();
    expect(compound.length, greaterThanOrEqualTo(3));

    final nudges = facilityIconNudges(compound);
    for (final f in compound) {
      expect(magnitude(nudges[f.id]!), greaterThan(0), reason: f.name);
    }
  });

  test('BFP Tanza is in the bundled baseline', () {
    final bfp = phEmergencyFacilitySeeds.where(
      (f) =>
          f.type == EmergencyFacilityType.fireStation &&
          f.name.contains('Tanza'),
    );
    expect(bfp, hasLength(1));
    expect(bfp.single.address, contains('Tanza'));
  });
}
