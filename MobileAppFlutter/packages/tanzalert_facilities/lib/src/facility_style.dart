import 'package:flutter/material.dart';

import 'emergency_facility.dart';

/// How a facility is drawn and named.
typedef FacilityStyle = ({IconData icon, Color color, String label});

/// The one place that decides what a hospital pin looks like.
///
/// A responder standing at a scene and a resident choosing a drop-off are
/// reading the same map of the same town; a hospital that is red in one app and
/// blue in the other is a map they have to learn twice.
FacilityStyle facilityStyleFor(EmergencyFacilityType type) => switch (type) {
  EmergencyFacilityType.hospital => (
    icon: Icons.local_hospital,
    color: Color(0xFFE5484D),
    label: 'Hospital',
  ),
  EmergencyFacilityType.redCross => (
    icon: Icons.volunteer_activism,
    color: Color(0xFFBE123C),
    label: 'Red Cross',
  ),
  EmergencyFacilityType.drrmo => (
    icon: Icons.emergency_share,
    color: Color(0xFF2563EB),
    label: 'MDRRMO',
  ),
  EmergencyFacilityType.fireStation => (
    icon: Icons.local_fire_department,
    color: Color(0xFFEA580C),
    label: 'Fire station',
  ),
  EmergencyFacilityType.police => (
    icon: Icons.local_police,
    color: Color(0xFF7C3AED),
    label: 'Police station',
  ),
  EmergencyFacilityType.ambulanceStation => (
    icon: Icons.airport_shuttle,
    color: Color(0xFF0E7490),
    label: 'Ambulance station',
  ),
};

/// The kinds worth offering first for a given emergency.
///
/// A medical call ends at a hospital far more often than anywhere else, so that
/// is what the map opens on; the rest stay one tap away rather than being
/// hidden, because the exception is exactly when nobody has time to search.
EmergencyFacilityType defaultFacilityTypeFor(String emergencyType) =>
    switch (emergencyType) {
      'medical' => EmergencyFacilityType.hospital,
      'fire' => EmergencyFacilityType.fireStation,
      'crime' => EmergencyFacilityType.police,
      _ => EmergencyFacilityType.hospital,
    };
