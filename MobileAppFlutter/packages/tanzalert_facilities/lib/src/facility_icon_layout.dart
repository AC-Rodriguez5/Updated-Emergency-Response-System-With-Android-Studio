import 'dart:math' as math;

import 'emergency_facility.dart';

/// How far an icon is drawn from its true point, in logical pixels.
typedef IconNudge = ({double dx, double dy});

const IconNudge _noNudge = (dx: 0.0, dy: 0.0);

/// Spreads icons that would otherwise stack on top of each other.
///
/// Philippine municipal compounds routinely hold the MDRRMO, the fire station
/// and the police station within a few dozen metres — in Tanza, two of them
/// share one coordinate. Drawn as-is, the last icon painted covers the others
/// completely and they cannot be tapped at all.
///
/// This nudges each member of such a cluster onto a small ring around the
/// shared point, purely for display: the facility's own coordinates are what
/// get logged and navigated to, and are never changed. Keep [ringRadiusPx]
/// well under half the marker box so an icon cannot be clipped.
///
/// Returns a nudge for every facility, zero for the ones that stand alone.
Map<String, IconNudge> facilityIconNudges(
  List<EmergencyFacility> facilities, {
  double clusterMetres = 40,
  double ringRadiusPx = 21,
}) {
  // Sorting by id makes the layout stable: without it, a facility could hop
  // around the ring whenever the list came back from Overpass in a new order.
  final ordered = facilities.toList()..sort((a, b) => a.id.compareTo(b.id));

  final clusters = <List<EmergencyFacility>>[];
  for (final facility in ordered) {
    final cluster = clusters.firstWhere(
      (c) => _metresBetween(c.first, facility) < clusterMetres,
      orElse: () {
        final fresh = <EmergencyFacility>[];
        clusters.add(fresh);
        return fresh;
      },
    );
    cluster.add(facility);
  }

  final nudges = <String, IconNudge>{};
  for (final cluster in clusters) {
    if (cluster.length == 1) {
      nudges[cluster.single.id] = _noNudge;
      continue;
    }
    for (var i = 0; i < cluster.length; i++) {
      // Start at the top and go clockwise, so a pair reads as one above and
      // one below rather than as an arbitrary diagonal.
      final angle = (2 * math.pi * i / cluster.length) - (math.pi / 2);
      nudges[cluster[i].id] = (
        dx: ringRadiusPx * math.cos(angle),
        dy: ringRadiusPx * math.sin(angle),
      );
    }
  }
  return nudges;
}

double _metresBetween(EmergencyFacility a, EmergencyFacility b) {
  const metresPerDegree = 111320.0;
  final dLat = (a.latitude - b.latitude) * metresPerDegree;
  final meanLat = (a.latitude + b.latitude) / 2 * math.pi / 180;
  final dLng =
      (a.longitude - b.longitude) * metresPerDegree * math.cos(meanLat);
  return math.sqrt(dLat * dLat + dLng * dLng);
}
