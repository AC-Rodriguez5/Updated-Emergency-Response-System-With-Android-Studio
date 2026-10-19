import 'emergency_facility.dart';

/// Verified emergency facilities around Tanza, bundled with the app.
///
/// Why bundle anything when [EmergencyFacilityService] can query Overpass for
/// the whole country? Because Overpass is a free, shared, rate-limited service.
/// While this list was being compiled, two of its mirrors answered "502 at
/// capacity" and "500 internal error" within the same minute. A drop-off picker
/// that shows nothing when that happens is unusable, so these load instantly,
/// work with no signal, and are then merged with whatever the live query adds.
///
/// Provenance: coordinates were taken from OpenStreetMap (© OpenStreetMap
/// contributors, ODbL) via Overpass on 2026-10-19, except the Tanza MDRRMO
/// entry noted below. Keep this list short and local — it is a floor, not a
/// catalogue, and the live query is what covers the rest of the Philippines.
const List<EmergencyFacility> phEmergencyFacilitySeeds = [
  // ---- Hospitals ----
  EmergencyFacility(
    id: 'seed/hospital/tanza-general',
    name: 'Tanza General Hospital',
    type: EmergencyFacilityType.hospital,
    latitude: 14.3904415,
    longitude: 120.8490805,
  ),
  EmergencyFacility(
    id: 'seed/hospital/tanza-doctors',
    name: 'Tanza Doctors Hospital',
    type: EmergencyFacilityType.hospital,
    latitude: 14.3663697,
    longitude: 120.8173577,
  ),
  EmergencyFacility(
    id: 'seed/hospital/manas',
    name: 'Manas Hospital',
    type: EmergencyFacilityType.hospital,
    latitude: 14.3705015,
    longitude: 120.8238188,
  ),
  EmergencyFacility(
    id: 'seed/hospital/divine-grace',
    name: 'Divine Grace Medical Center',
    type: EmergencyFacilityType.hospital,
    latitude: 14.397913,
    longitude: 120.8681501,
  ),
  EmergencyFacility(
    id: 'seed/hospital/gentri-medicare',
    name: 'General Trias Medicare Hospital',
    type: EmergencyFacilityType.hospital,
    latitude: 14.3736732,
    longitude: 120.8821741,
  ),
  EmergencyFacility(
    id: 'seed/hospital/mama-rachel',
    name: 'Mama Rachel Hospital of Mercy Inc.',
    type: EmergencyFacilityType.hospital,
    latitude: 14.381172,
    longitude: 120.8899254,
  ),
  EmergencyFacility(
    id: 'seed/hospital/ospital-ng-imus',
    name: 'Ospital ng Imus',
    type: EmergencyFacilityType.hospital,
    latitude: 14.3931971,
    longitude: 120.9198094,
  ),
  EmergencyFacility(
    id: 'seed/hospital/st-martin-noveleta',
    name: 'St. Martin Maternity and Pediatrics Hospital',
    type: EmergencyFacilityType.hospital,
    latitude: 14.425703,
    longitude: 120.8741989,
  ),

  // ---- Philippine Red Cross ----
  EmergencyFacility(
    id: 'seed/red-cross/cavite-chapter',
    name: 'Philippine Red Cross - Cavite Chapter',
    type: EmergencyFacilityType.redCross,
    latitude: 14.48092,
    longitude: 120.9086722,
    address: 'Padre Gomez Street, San Roque, Cavite City, Cavite',
  ),
  EmergencyFacility(
    id: 'seed/red-cross/dasmarinas-branch',
    name: 'Philippine Red Cross - Dasmariñas Branch',
    type: EmergencyFacilityType.redCross,
    latitude: 14.3276399,
    longitude: 120.940272,
  ),

  // ---- MDRRMO / DRRMO ----
  //
  // Tanza's MDRRMO is not mapped in OpenStreetMap (checked by name and by
  // `emergency=disaster_response` across the whole province). It operates from
  // the municipal hall compound, so this pin is the hall itself — verified as
  // "Pamahalaang Bayan ng Tanza" (amenity=townhall) — and the name says so
  // rather than implying a surveyed office door. Replace it with the exact
  // point when someone on the ground can supply one.
  EmergencyFacility(
    id: 'seed/drrmo/tanza-mdrrmo',
    name: 'Tanza MDRRMO (Municipal Hall compound)',
    type: EmergencyFacilityType.drrmo,
    latitude: 14.3928409,
    longitude: 120.8547923,
    address: 'Antero Soriano Highway, Barangay IV, Daang Amaya I, Tanza, Cavite',
  ),
  EmergencyFacility(
    id: 'seed/drrmo/imus-cdrrmo',
    name: 'Imus CDRRMO Command Center',
    type: EmergencyFacilityType.drrmo,
    latitude: 14.4294553,
    longitude: 120.9365519,
  ),

  // ---- Bureau of Fire Protection ----
  //
  // BFP Tanza Fire Station is not in OpenStreetMap either, and no coordinate
  // for it is published anywhere searchable (checked by `amenity=fire_station`
  // across the municipality and by name in Nominatim — the only "Tanza Fire
  // Station" hit is in Boac, Marinduque). It is here on the project owner's
  // local knowledge that it stands by the municipal hall, so like the MDRRMO
  // above it is pinned to the compound and named to say so. Narrow it when
  // someone can point at the building.
  EmergencyFacility(
    id: 'seed/fire/tanza',
    name: 'BFP Tanza Fire Station (near Municipal Hall)',
    type: EmergencyFacilityType.fireStation,
    latitude: 14.3928409,
    longitude: 120.8547923,
    address: 'Antero Soriano Highway, Barangay IV, Daang Amaya I, Tanza, Cavite',
  ),
  EmergencyFacility(
    id: 'seed/fire/bfp-cavite-hq',
    name: 'BFP Cavite Provincial Headquarters',
    type: EmergencyFacilityType.fireStation,
    latitude: 14.4287096,
    longitude: 120.9459883,
  ),
  EmergencyFacility(
    id: 'seed/fire/general-trias',
    name: 'General Trias Fire Station',
    type: EmergencyFacilityType.fireStation,
    latitude: 14.386832,
    longitude: 120.8802797,
  ),
  EmergencyFacility(
    id: 'seed/fire/trece-martires',
    name: 'Trece Martires City Fire Station',
    type: EmergencyFacilityType.fireStation,
    latitude: 14.2804816,
    longitude: 120.8683958,
  ),
  EmergencyFacility(
    id: 'seed/fire/kawit',
    name: 'Kawit Fire Station',
    type: EmergencyFacilityType.fireStation,
    latitude: 14.4357019,
    longitude: 120.8891923,
  ),

  // ---- Police ----
  EmergencyFacility(
    id: 'seed/police/tanza',
    name: 'Tanza Municipal Police Station',
    type: EmergencyFacilityType.police,
    latitude: 14.3925697,
    longitude: 120.854866,
    address: 'Antero Soriano Highway, Barangay IV, Daang Amaya I, Tanza, Cavite',
  ),
  EmergencyFacility(
    id: 'seed/police/general-trias',
    name: 'General Trias City Police Station',
    type: EmergencyFacilityType.police,
    latitude: 14.3866429,
    longitude: 120.8802391,
  ),
  EmergencyFacility(
    id: 'seed/police/naic',
    name: 'Naic Police Sub-Station',
    type: EmergencyFacilityType.police,
    latitude: 14.3404094,
    longitude: 120.7912199,
  ),
  EmergencyFacility(
    id: 'seed/police/cavite-provincial',
    name: 'Cavite Police Provincial Office',
    type: EmergencyFacilityType.police,
    latitude: 14.429704,
    longitude: 120.9406319,
  ),
];
