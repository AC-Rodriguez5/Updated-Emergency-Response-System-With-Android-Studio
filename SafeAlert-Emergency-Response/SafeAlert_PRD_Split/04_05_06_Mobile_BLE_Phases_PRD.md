# Flutter Mobile Apps - Phase M3 Implementation

## Overview

Created Flutter mobile applications for the SafeAlert Emergency Response System as defined in PRDs M1-M3:
- **User App**: Emergency alert submission, real-time location, active emergency tracking
- **Responder App**: Emergency management, map navigation, status reporting

## Files Created

### User App (`safealert_user`)

**Structure:**
```
mobile-apps/User/
├── lib/
│   ├── main.dart                 # App entry point
│   ├── app_provider.dart         # Provider setup
│   ├── router.dart               # Navigation
│   ├── emergency_dashboard.dart  # Emergency button grid
│   ├── emergency_detail.dart     # Active emergency details
│   ├── providers/
│   │   ├── auth_provider.dart    # Authentication & session
│   │   ├── location_provider.dart# GPS tracking
│   │   └── emergency_provider.dart # Emergency state
├── pubspec.yaml                  # Flutter dependencies
└── .env                          # API configuration
```

**Key Features:**
- Emergency buttons (Medical, Crime, Fire, General SOS)
- 2-second hold to send
- GPS location tracking
- Emergency type: `medical`, `crime`, `fire`, `general_sos`
- Idempotency keys for duplicate prevention
- Real-time status updates from backend
- Active emergency screen with status tracking

**API Integration:**
- POST `/api/alerts` - Create emergency
- State management with Provider pattern
- Secure token storage (Flutter Secure Storage)
- SharedPreferences for API base URL

### Responder App (`safealert_responder`)

**Structure:**
```
mobile-apps/Responder/
├── lib/
│   ├── main.dart                 # App entry point
│   ├── app_provider.dart         # Provider setup
│   ├── emergency_manager.dart    # Emergency management
│   ├── providers/
│   │   ├── auth_provider.dart    # Authentication
│   │   ├── location_provider.dart# GPS tracking
│   │   └── emergency_manager.dart # Emergency filtering & status
├── pubspec.yaml                  # Flutter dependencies
└── .env                          # API configuration
```

**Key Features:**
- Active emergency list
- Filter by type, status, priority
- Mark as "on the way"
- Submit on-ground reports
- GPS tracking while on duty
- Real-time emergency location updates

**API Integration:**
- GET `/api/alerts` - Fetch emergencies
- PATCH `/api/alerts/:id/status` - Update status
- POST `/api/alerts/:id/report` - Submit report
- State management with Provider pattern

## Architecture

### Providers Pattern
Both apps use ChangeNotifier providers for state management:
- Authentication providers
- Location providers (Geolocator)
- Emergency state management

### Key Dependencies

**Common:**
- `http` - HTTP client
- `shared_preferences` - Local storage
- `flutter_secure_storage` - Secure tokens
- `flutter_dotenv` - Environment config
- `provider` - State management
- `uuid` - Unique keys

**User App:**
- `geolocator` - GPS tracking
- `geolocator: ^11.0.0`

**Responder App:**
- `geolocator` - GPS tracking  
- `geofencing` - Location monitoring

## Backend Integration

### User App - Alert Creation
```dart
await http.post(
  Uri.parse('http://localhost:5000/api/alerts'),
  body: jsonEncode({
    'type': 'medical',
    'location': {'latitude': 19.0, 'longitude': 73.0},
    'source': 'mobile_app',
    'idempotency_key': 'emergency_med_19_73',
  }),
);
```

### Responder App - Status Update
```dart
await http.patch(
  Uri.parse('http://localhost:5000/api/alerts/${emergencyId}/status'),
  body: jsonEncode({'status': 'responding'}),
);
```

## Testing

**Backend:**
- Must be running on `http://localhost:5000`
- User must be authenticated and approved
- JWT token passed in headers

**Mobile:**
- Location permissions required
- Network permissions required
- Test with real GPS coordinates
- Test BLE integration later (Phase M3)

## Next Steps (Phase M3 continued)

1. **BLE Integration:**
   - ESP32 panic button communication
   - Flutter Blue + ESP32 BLE
   - Real-time BLE event forwarding

2. **IoT Events:**
   - ESP32 device state
   - BLE to API integration
   - Panic button triggering

3. **Testing:**
   - Integration tests
   - BLE test devices
   - Network reliability

## Notes

- Flutter version required: >=3.0.0 <4.0.0
- Backend must be running on port 5000
- User must be approved before creating emergency
- Location sharing managed via geolocator
- Idempotency keys prevent duplicate alerts