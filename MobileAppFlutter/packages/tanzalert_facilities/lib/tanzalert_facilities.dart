/// Finding the nearest hospital, fire station or police station, offline first.
///
/// Both apps need the same answer to "what is near this point": the resident
/// app picks an ambulance drop-off, the responder app finds where to take a
/// patient from the scene. They had better agree, so the lookup lives here
/// rather than twice.
library;

export 'src/emergency_facility.dart';
export 'src/emergency_facility_service.dart';
export 'src/facility_icon_layout.dart';
export 'src/facility_style.dart';
export 'src/ph_emergency_facility_seeds.dart';
