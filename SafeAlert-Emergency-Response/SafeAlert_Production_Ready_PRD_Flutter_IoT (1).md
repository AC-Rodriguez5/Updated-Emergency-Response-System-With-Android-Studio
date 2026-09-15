# SafeAlert Emergency Response System Production PRD

**Version:** 2.0  
**Date:** May 4, 2026  
**Status:** Implementation-ready product and technical specification  
**Target stack:** Flutter mobile apps, React TypeScript admin web, Node.js TypeScript backend, MongoDB Atlas, OpenStreetMap and ESP32 BLE panic button  
**Primary goal:** Replace the current React Native or Expo-based implementation with a production-grade Flutter mobile architecture, add a web admin panel and integrate a real ESP32 Bluetooth panic button while closing known security, performance, maintainability, testability and type-safety gaps.

---

## 1. Executive summary

SafeAlert is a multi-platform emergency-response system composed of five main components:

1. **MobileForUser**  
   A Flutter Android app for citizens. It supports registration, admin approval, login, emergency triggering, GPS sharing, nearby emergency facility discovery, responder tracking, push notifications, emergency history and ESP32 Bluetooth panic button pairing.

2. **MobileForResponder**  
   A Flutter Android app for approved responders. It supports responder registration, admin approval, login, live emergency map, emergency filtering, route guidance, live responder location sharing, response status updates and on-ground response reporting.

3. **AdminWeb**  
   A responsive React TypeScript web dashboard for administrators. It supports registration review, user and responder approval or rejection, live emergency monitoring, live responder tracking, emergency resolution, analytics, records, audit logs and system configuration.

4. **ApiServer**  
   A secure Node.js TypeScript backend that owns all access to MongoDB Atlas. Mobile and web clients must never connect directly to MongoDB Atlas. All data access must go through authenticated API endpoints and WebSocket events.

5. **ESP32 BLE Panic Button**  
   A physical Bluetooth Low Energy device with 1 power switch and 4 emergency buttons: Medical, Crime, Fire and General SOS. It pairs with the user phone and triggers the same emergency flow as in-app emergency buttons, including when the user app is in the background, subject to Android background execution limitations.

This PRD consolidates the previous SafeAlert improvement requirements with the new Flutter, AdminWeb, MongoDB Atlas, OpenStreetMap, ESP32 BLE, admin approval, background notification and analytics requirements.

---

## 2. Product objectives

### 2.1 Operational objectives

- Provide a reliable emergency reporting workflow for citizens.
- Provide responders with live, filterable and location-aware emergency assignments.
- Give administrators full control over registration approval, emergency resolution and analytics.
- Support a capstone-ready and demo-ready architecture that can later evolve into a municipal emergency coordination platform.
- Make the system maintainable enough for a development team to implement, test and extend without rewriting the core design.

### 2.2 Technical objectives

- Migrate user-facing mobile features from React Native or Expo to Flutter.
- Split mobile concerns into two dedicated apps: MobileForUser and MobileForResponder.
- Add AdminWeb as a dedicated web admin panel.
- Use MongoDB Atlas only through the backend API.
- Use OpenStreetMap for maps, markers, routing and nearby facility discovery.
- Integrate ESP32 panic button through Bluetooth Low Energy using `flutter_blue_plus`.
- Implement secure authentication, authorization, validation, rate limiting, typed contracts, retry logic, timeouts, input sanitization and audit logging.
- Replace monolithic code with modular, testable and type-safe architecture.

---

## 3. Quality targets

The documented current health scores and required targets are:

| Area | Current score | Target score | Required improvement |
|---|---:|---:|---|
| Security | 6/10 | 9/10 | Remove insecure JWT fallback secrets, enforce environment validation, use rate limits, sanitize inputs, validate all request bodies, restrict CORS, protect all routes and add audit logs |
| Performance | 7/10 | 9/10 | Reduce location-history bloat, add indexes, throttle location updates, use WebSocket delta updates, paginate records and add caching where safe |
| Maintainability | 8/10 | 9/10 | Split code into bounded modules, use clean architecture in Flutter, typed services in backend and shared API contracts |
| Testability | 6/10 | 8.5/10 | Add unit, integration, widget, API, BLE simulation and end-to-end tests for critical emergency flows |
| Type Safety | 7/10 | 9.5/10 | Replace `any` with typed interfaces, Zod schemas, inferred TypeScript types, Dart models and generated JSON serialization |

### 3.1 Target score requirements

#### Security 9/10 requires:

- Zero hardcoded secrets.
- No fallback `JWT_SECRET`.
- Environment variables validated at boot.
- All protected routes require JWT.
- Role-based access enforced for user, responder and admin.
- All incoming request bodies validated with Zod.
- All file uploads validated by size, MIME type and file signature.
- Login, registration, alert creation and admin actions rate-limited.
- CORS restricted by environment.
- Passwords hashed using Argon2id or bcrypt with secure cost.
- Refresh tokens stored hashed.
- Admin credentials seeded securely and never stored as plaintext in code.
- Audit logs for approval, rejection, status changes, login failures and emergency resolution.

#### Performance 9/10 requires:

- Active emergency list loads within 2 seconds on normal broadband.
- New emergency appears on admin and responder views within 3 seconds.
- Location updates use throttling and deduplication.
- MongoDB indexes exist for status, emergency type, createdAt, userId, responderId and geospatial queries.
- Historical location storage is capped, time-limited or archived.
- Large lists use pagination and server-side filtering.
- API request timeout policy exists on mobile, web and backend.

#### Maintainability 9/10 requires:

- Backend follows route, controller, service, repository and schema layers.
- Flutter apps follow presentation, application, domain and data layers.
- Shared domain naming is consistent across backend, mobile and web.
- API contracts are documented and typed.
- No module exceeds agreed complexity thresholds without decomposition.
- Feature flags exist for demo mode, real BLE mode and mock routing mode.

#### Testability 8.5/10 requires:

- Critical backend routes covered by integration tests.
- Flutter emergency flow covered by widget and service tests.
- BLE event parsing covered by unit tests using simulated packets.
- Web admin approval and resolve flows covered by end-to-end tests.
- CI runs lint, type checks, tests and build checks.

#### Type Safety 9.5/10 requires:

- No `any` in production TypeScript except documented boundary wrappers.
- All backend request and response payloads typed.
- Zod schemas are the source of truth for validation and inferred types.
- Flutter models use `freezed` and `json_serializable` or equivalent typed serialization.
- Web API client uses generated or manually maintained typed DTOs.

---

## 4. Scope

### 4.1 In scope

- Flutter Android app for users.
- Flutter Android app for responders.
- React TypeScript admin web dashboard.
- Shared Node.js TypeScript backend.
- MongoDB Atlas integration through backend only.
- OpenStreetMap display and routing.
- Nearby facility search for hospitals, fire stations and police stations.
- ESP32 BLE panic button integration.
- Admin-approved registrations.
- Background push notifications.
- Live location tracking.
- Live emergency status updates.
- Analytics and emergency records.
- Security hardening and validation.
- Retry logic, exponential backoff and request timeouts.
- Code quality, modularization and testability requirements.

### 4.2 Out of scope for first production release

- Native iOS app.
- Direct integration with official government dispatch systems.
- SMS gateway integration, unless later added as a plugin.
- Voice call center module.
- AI emergency classification.
- Payment features.
- Full offline-first synchronization for all modules.
- Firmware source code for ESP32, except BLE contract, event format and app-facing requirements.

---

## 5. Product roles and permissions

### 5.1 User

A citizen who requests help.

Allowed actions:

- Register with identity requirements.
- Log in only after admin approval.
- Pair ESP32 panic button.
- Trigger Medical, Crime, Fire or General SOS emergency.
- Share current location during active emergency.
- View nearby emergency facilities.
- Track assigned responder location.
- Receive push notifications.
- View own emergency history.
- Cancel an emergency only before a responder is assigned, subject to backend rules.

Not allowed:

- View other users.
- View all responders.
- Resolve emergency.
- Approve registrations.
- Directly access database.

### 5.2 Responder

An approved emergency responder.

Allowed actions:

- Register with personal details and professional credential.
- Log in only after admin approval.
- View active emergencies relevant to assigned area or agency.
- Filter emergencies by type.
- View sender details for active assigned or claimable emergencies.
- Share live responder location.
- Mark emergency as `responder_on_the_way`.
- Report on-ground outcome and submit response notes.
- Receive new emergency and proximity notifications.

Not allowed:

- Mark emergency as fully resolved.
- Approve users or responders.
- Delete emergency records.
- View registration documents outside assigned emergency context.
- Directly access database.

### 5.3 Admin

A verified system administrator.

Allowed actions:

- Log in to AdminWeb.
- Approve or reject user registrations.
- Approve or reject responder registrations.
- View submitted documents and face photos.
- View all active emergencies.
- View all responder locations when responders are on duty and GPS is enabled.
- Mark emergency as resolved.
- Review analytics and emergency records.
- View audit logs.
- Configure emergency categories, agency filters and facility settings.

Not allowed:

- Store plaintext passwords.
- Modify audit logs.
- Bypass approval history.
- Directly expose sensitive files publicly.

---

## 6. System architecture

### 6.1 Repository structure

Required structure:

```text
folder/
  backend/
    ApiServer/
      src/
        config/
        modules/
          auth/
          users/
          responders/
          registrations/
          emergencies/
          locations/
          notifications/
          analytics/
          admin/
          audit/
          facilities/
        shared/
          middleware/
          schemas/
          types/
          utils/
        app.ts
        server.ts
      tests/
      package.json
      tsconfig.json
      .env.example

  web/
    AdminWeb/
      src/
        app/
        components/
        features/
          auth/
          approvals/
          emergencies/
          map/
          responders/
          analytics/
          audit/
        services/
        types/
        routes/
      package.json
      tsconfig.json
      .env.example

  android_studio/
    MobileForUser/
      lib/
        core/
        features/
          auth/
          registration/
          emergency/
          map/
          responder_tracking/
          ble_panic_button/
          notifications/
          settings/
        shared/
        main.dart
      android/
      pubspec.yaml
      .env.example

    MobileForResponder/
      lib/
        core/
        features/
          auth/
          registration/
          emergency_map/
          route_guidance/
          location_sharing/
          response_reports/
          notifications/
          settings/
        shared/
        main.dart
      android/
      pubspec.yaml
      .env.example
```

### 6.2 Architecture principle

All clients interact only with ApiServer.

```text
ESP32 BLE Panic Button
        |
        | BLE notify
        v
MobileForUser Flutter App
        |
        | HTTPS REST + WebSocket + FCM token registration
        v
ApiServer Node.js TypeScript
        |
        | Mongoose driver
        v
MongoDB Atlas

MobileForResponder Flutter App
        |
        | HTTPS REST + WebSocket + FCM
        v
ApiServer

AdminWeb React TypeScript
        |
        | HTTPS REST + WebSocket
        v
ApiServer

ApiServer
        |
        | Push notifications
        v
FCM or selected push provider

ApiServer
        |
        | OSM or routing provider calls
        v
OpenStreetMap ecosystem
```

### 6.3 Component responsibilities

#### MobileForUser

- User identity registration.
- Live face capture.
- Proof-of-residency upload.
- Login and secure session storage.
- Emergency trigger from UI or BLE device.
- GPS permission handling.
- Location acquisition and background location sharing during active emergency.
- OpenStreetMap facility map.
- Responder tracking.
- Push notification display.
- Emergency history.

#### MobileForResponder

- Responder identity and credential registration.
- Login and secure session storage.
- Active emergency map.
- Emergency type filters.
- Fast route guidance.
- Live responder location sharing while on duty or assigned.
- Status update to `responder_on_the_way`.
- On-ground response reporting.
- Push notification display.

#### AdminWeb

- Admin authentication.
- Pending registration review.
- Live map of active emergencies and responders.
- Emergency resolution.
- Analytics and reporting.
- Audit log viewer.
- Admin configuration.

#### ApiServer

- Authentication and authorization.
- Request validation.
- File upload handling.
- Data persistence.
- Geospatial queries.
- Emergency lifecycle management.
- Real-time WebSocket broadcasting.
- Push notification dispatch.
- Audit logging.
- Analytics aggregation.
- Rate limiting and security middleware.

#### MongoDB Atlas

- Persistent storage for users, responders, emergencies, locations, approvals, device pairings, push tokens, analytics and audit logs.
- Must be accessed only by ApiServer.

#### ESP32 BLE Panic Button

- Broadcasts connectable BLE peripheral.
- Exposes SafeAlert service.
- Sends button event notifications.
- Sends battery level.
- Sends heartbeat.
- Supports app pairing and device binding.

---

## 7. Technology decisions

### 7.1 Mobile apps

Use Flutter for MobileForUser and MobileForResponder.

Required packages:

| Concern | Package |
|---|---|
| Routing | `go_router` |
| State management | `flutter_riverpod` |
| HTTP client | `dio` |
| JSON models | `freezed`, `json_serializable` |
| Secure token storage | `flutter_secure_storage` |
| Maps | `flutter_map`, `latlong2` |
| Location | `geolocator` |
| Background service | `flutter_background_service`, Android foreground service configuration |
| Push notifications | `firebase_messaging`, `flutter_local_notifications` |
| BLE | `flutter_blue_plus` |
| Camera | `camera` |
| File picker for ID document only | `image_picker` or native file picker with image and PDF restrictions |
| Permission handling | `permission_handler` |
| Connectivity | `connectivity_plus` |
| Local persistence | `hive` or `isar` for queued events and non-sensitive cache |

### 7.2 Admin web

Use React TypeScript with Vite.

Required libraries:

| Concern | Library |
|---|---|
| Routing | `react-router` |
| State and server cache | `@tanstack/react-query` |
| Forms | `react-hook-form` |
| Validation | `zod` |
| Map | `leaflet` or `react-leaflet` with OpenStreetMap tiles |
| Charts | `recharts` |
| Tables | `@tanstack/react-table` |
| API client | `axios` with typed DTOs |
| WebSocket | `socket.io-client` |
| UI | Tailwind CSS or an accessible component library |

### 7.3 Backend

Use Node.js, Express and TypeScript.

Required libraries:

| Concern | Library |
|---|---|
| API framework | `express` |
| MongoDB | `mongoose` |
| Validation | `zod` |
| Authentication | `jsonwebtoken` or `jose` |
| Password hashing | `argon2` preferred, bcrypt accepted |
| Rate limiting | `express-rate-limit` |
| Security headers | `helmet` |
| CORS | `cors` with whitelist |
| Sanitization | `express-mongo-sanitize`, custom string trimming and escaping |
| File uploads | `multer` or object storage signed upload flow |
| Real-time | `socket.io` |
| Logging | `pino` |
| Testing | `jest`, `supertest` |
| Environment validation | `zod` |
| Request IDs | `express-request-id` or custom middleware |

### 7.4 Database

Use MongoDB Atlas.

Required:

- Mongoose schemas with strict mode.
- Geospatial indexes.
- TTL indexes for temporary verification tokens and optional raw location retention.
- Compound indexes for active emergency queries.
- No client direct database connection.
- No hardcoded MongoDB URI.

### 7.5 Mapping and routing

Use OpenStreetMap for map tiles. For routing:

- Use OSRM, Valhalla or GraphHopper with OSM data.
- Public OSRM demo may be used only in development.
- Production must use a hosted paid routing service, self-hosted routing server or approved OSM-compatible provider.
- The app must not claim full Waze-level functionality unless turn-by-turn instructions, route recalculation and ETA are implemented.

---

## 8. Migration path from React Native or Expo to Flutter

### 8.1 Migration goals

- Preserve current emergency workflow while replacing mobile implementation with Flutter.
- Separate user and responder responsibilities into two apps.
- Standardize API contracts before rewriting UI.
- Avoid moving legacy security issues into the new stack.

### 8.2 Legacy-to-Flutter mapping

| Legacy concern | New Flutter implementation |
|---|---|
| React Native or Expo screens | Flutter feature modules with `presentation`, `application`, `domain` and `data` layers |
| React Navigation | `go_router` |
| Expo location | `geolocator` plus Android foreground service for active emergency tracking |
| Expo notifications | FCM plus `flutter_local_notifications` |
| AsyncStorage | `flutter_secure_storage` for tokens and Hive or Isar for non-sensitive cache |
| Axios or fetch | Dio with interceptors, timeouts, retry and token refresh |
| JavaScript Socket.io client | `socket_io_client` |
| JavaScript map implementation | `flutter_map` with OpenStreetMap tiles |
| Simulated IoT button | `flutter_blue_plus` BLE integration with real ESP32 GATT characteristics |
| Loose JSON objects | Dart typed models generated from API DTOs |
| Manual form checks | Central validators in Flutter forms plus backend Zod schemas |
| Monolithic screens | Small widgets, providers, services and repositories |

### 8.3 Migration phases

#### Phase M1: Backend stabilization

- Freeze current API behavior.
- Add environment validation.
- Add Zod schemas.
- Add auth middleware.
- Add role middleware.
- Add rate limiting.
- Add CORS whitelist.
- Add typed DTOs.
- Add test coverage for auth, registration, alert creation and status update.

Exit criteria:

- Existing backend tests pass.
- No protected route works without a valid token.
- No raw unvalidated JSON reaches service layer.

#### Phase M2: Shared domain contract

- Define DTOs for users, responders, registrations, emergencies, locations, facilities, notifications and analytics.
- Publish API contract in `/backend/ApiServer/docs/api-contract.md`.
- Generate or manually mirror Dart models.

Exit criteria:

- Mobile and web teams use the same field names.
- TypeScript has no `any` in API contracts.
- Dart JSON parsing tests pass.

#### Phase M3: MobileForUser Flutter app

- Implement login, approval gate, emergency home, BLE pairing, emergency send, active emergency tracking, map and notifications.
- Implement background service only during active emergency or enabled BLE monitoring.

Exit criteria:

- User can register, wait for approval, log in, pair device and send an emergency from app or BLE device.

#### Phase M4: MobileForResponder Flutter app

- Implement login, approval gate, map, emergency filters, route guidance, location sharing, responder-on-the-way and response report.

Exit criteria:

- Responder receives emergency, views route, marks on the way and sends report.

#### Phase M5: AdminWeb

- Implement login, approvals, live map, resolver flow, analytics and audit log.

Exit criteria:

- Admin can approve registrations and resolve emergencies from web dashboard.

#### Phase M6: Production readiness

- Add monitoring, crash reporting, analytics, backups, deployment scripts and CI checks.
- Run usability test and emergency workflow test.

Exit criteria:

- System satisfies target quality scores.

---

## 9. Functional requirements

## 9.1 Authentication and session management

### Requirements

AUTH-001: The system shall support three account roles: `user`, `responder` and `admin`.

AUTH-002: Registration shall create accounts in `pending` status. Pending users and responders cannot log in.

AUTH-003: Admin approval changes status from `pending` to `approved`.

AUTH-004: Admin rejection changes status from `pending` to `rejected` and records reason.

AUTH-005: User and responder login shall use email and password.

AUTH-006: Admin login shall use username and password or email and password. Any predefined admin account must be seeded from environment variables and hashed before storage. The password must not be committed in code or documentation intended for production.

AUTH-007: The backend shall issue a short-lived access token and a refresh token.

AUTH-008: Access token lifetime shall be 15 minutes by default.

AUTH-009: Refresh token lifetime shall be 30 days when Remember this device is enabled and 24 hours when disabled.

AUTH-010: Refresh tokens shall be stored hashed in the database.

AUTH-011: Logout shall revoke the active refresh token.

AUTH-012: All role-specific endpoints shall verify JWT and role.

AUTH-013: Failed login attempts shall be rate-limited by IP and account identifier.

AUTH-014: Password reset is optional for MVP but must be designed as a future module.

### Acceptance criteria

- Pending account login returns HTTP 403 with message `Account pending admin approval.`
- Rejected account login returns HTTP 403 with message `Account registration was rejected. Contact support for details.`
- Invalid credentials return a generic message and do not reveal whether email exists.
- Accessing protected endpoints without token returns HTTP 401.
- Accessing a route with the wrong role returns HTTP 403.
- Refresh token reuse after logout fails.
- Brute force test with repeated failed logins triggers rate limit.

---

## 9.2 Registration and admin approval

### User registration requirements

REG-U-001: User registration form shall collect:

- Full name
- Date of birth
- Computed age
- Proof-of-residency ID image or document
- Live face capture through camera only
- Contact number
- Email
- Password
- Confirm password
- Address or municipality coverage field
- Consent checkbox for emergency location processing

REG-U-002: Age must be computed from date of birth on client and verified on backend.

REG-U-003: Live face capture shall not allow gallery import.

REG-U-004: Proof-of-residency upload shall allow camera or file upload, subject to file validation.

REG-U-005: Backend shall scan metadata and validate file size, allowed MIME type and magic bytes.

REG-U-006: Registration shall create a pending account and a registration review record.

REG-U-007: Login shall be blocked until approval.

### Responder registration requirements

REG-R-001: Responder registration shall collect all user fields plus:

- Agency type: police, fire, medical, rescue or other
- Station or department name
- Position or role
- Professional credential document
- Credential number where applicable
- Coverage area or assigned municipality

REG-R-002: Responder cannot access emergency data until approved.

REG-R-003: Admin must be able to view credential document and approve or reject.

### Admin approval requirements

REG-A-001: AdminWeb shall show pending registrations in separate tabs for users and responders.

REG-A-002: Each review item shall show personal details, uploaded document, face capture, submitted timestamp and review status.

REG-A-003: Admin shall approve or reject with optional reason.

REG-A-004: Approval and rejection shall create audit log entries.

REG-A-005: Approved account shall receive push notification if push token exists and email notification if email module exists.

### Acceptance criteria

- User cannot submit registration with missing required fields.
- Face capture opens camera and rejects gallery-only source.
- Backend rejects oversized files.
- Backend rejects unsupported file types.
- Admin sees pending registrations within 3 seconds after submission.
- Admin approval allows login immediately.
- Admin rejection blocks login and records rejection reason.
- Audit log records admin ID, action, target account ID, timestamp and reason.

---

## 9.3 User emergency flow

### Requirements

EMG-U-001: User home screen shall show 4 primary emergency buttons:

- Medical
- Crime
- Fire
- General SOS

EMG-U-002: Each button shall map to one emergency type and priority:

| Button | Type | Default priority |
|---|---|---|
| Medical | `medical` | High |
| Crime | `crime` | Critical |
| Fire | `fire` | Critical |
| General SOS | `general_sos` | High |

EMG-U-003: Pressing an in-app button shall open a confirmation bottom sheet unless hold-to-send is used.

EMG-U-004: Holding an emergency button for 2 seconds shall submit the emergency immediately.

EMG-U-005: Emergency submission shall include:

- User ID from token
- Emergency type
- Source: `mobile_app` or `iot_ble`
- Latitude
- Longitude
- Location accuracy
- Device timestamp
- Idempotency key
- Optional notes
- Optional BLE event ID if triggered by ESP32

EMG-U-006: Backend shall reject emergency creation if user is not approved.

EMG-U-007: Backend shall prevent duplicate active emergency from same user unless user confirms creating another emergency.

EMG-U-008: After sending, app shall show active emergency screen.

EMG-U-009: Active emergency screen shall show status:

- Sent
- Waiting for responder
- Responder assigned
- Responder on the way
- Responder nearby
- Response report submitted
- Resolved
- Cancelled

EMG-U-010: User may cancel only while status is `pending` or before responder assignment.

EMG-U-011: The app shall continue sharing location while emergency is active and user granted permission.

### Acceptance criteria

- Emergency can be sent in 1 to 2 taps or by 2-second hold.
- App displays GPS permission error before submitting if location is unavailable.
- Emergency created by app appears in AdminWeb and responder app within 3 seconds.
- Duplicate taps with same idempotency key create only one emergency.
- User sees active emergency status update without manual refresh.
- Cancel button disappears after responder is assigned.
- Location updates stop after emergency is resolved or cancelled.

---

## 9.4 ESP32 BLE panic button integration

### Hardware requirements

BLE-001: The ESP32 device shall contain:

- 1 on/off switch
- 4 physical buttons: Medical, Crime, Fire and General SOS
- Battery monitoring circuit or firmware-estimated battery level
- BLE advertising capability
- Unique device ID
- Firmware version

BLE-002: The device shall advertise as `SafeAlert-Panic-XXXX`, where `XXXX` is the last 4 characters of device ID.

BLE-003: The device shall use Bluetooth Low Energy, not Classic Bluetooth.

### GATT service requirements

BLE-004: The device shall expose a custom SafeAlert service.

Recommended UUIDs:

```text
SafeAlert Service UUID:
9f4d0001-7d6a-4b85-9e74-2f4d8e8d0001

Button Event Characteristic UUID:
9f4d0002-7d6a-4b85-9e74-2f4d8e8d0002
Properties: Notify, Read

Battery Characteristic UUID:
00002a19-0000-1000-8000-00805f9b34fb
Properties: Read, Notify

Heartbeat Characteristic UUID:
9f4d0003-7d6a-4b85-9e74-2f4d8e8d0003
Properties: Notify

Device Config Characteristic UUID:
9f4d0004-7d6a-4b85-9e74-2f4d8e8d0004
Properties: Write, Read
```

### Button event format

BLE-005: Button event shall be a compact JSON payload or binary payload. JSON is acceptable for MVP.

JSON payload:

```json
{
  "deviceId": "SA-ESP32-000001",
  "eventId": "deviceId-sequenceNo",
  "sequenceNo": 1024,
  "button": "medical",
  "battery": 87,
  "firmwareVersion": "1.0.0",
  "deviceTimestamp": 1730000000000
}
```

Allowed button values:

- `medical`
- `crime`
- `fire`
- `general_sos`

BLE-006: Device firmware shall debounce button presses by at least 1000 ms.

BLE-007: Flutter app shall deduplicate BLE events by `eventId`.

BLE-008: Flutter app shall reject events from unpaired device IDs.

BLE-009: BLE event shall trigger the same emergency flow as pressing the in-app button.

BLE-010: If the phone is offline, app shall queue the emergency event locally and send it when connection returns.

BLE-011: If location is unavailable when BLE event arrives, app shall use last known location only if it is not older than 60 seconds and mark `locationFreshness` as `last_known`.

BLE-012: If no usable location is available, app shall create a local pending emergency attempt and notify the user to enable location. The app must keep retrying location acquisition using exponential backoff while the foreground service is active.

### Pairing requirements

BLE-013: User shall pair device from IoT Device screen.

BLE-014: App shall scan only for devices advertising the SafeAlert service UUID.

BLE-015: App shall show discovered devices with name, signal strength and device ID.

BLE-016: App shall bind one device to one user account unless admin resets binding.

BLE-017: Pairing shall register device ID with backend.

BLE-018: Backend shall store:

- User ID
- Device ID
- Device name
- Firmware version
- Last paired timestamp
- Last seen timestamp
- Battery level
- Status

BLE-019: Re-pairing a device already bound to another user shall require admin reset or ownership verification.

### Background BLE requirements

BLE-020: MobileForUser shall run a foreground service when BLE monitoring is enabled.

BLE-021: Android notification shall state that SafeAlert is monitoring the panic button.

BLE-022: App shall attempt reconnection with exponential backoff.

BLE-023: Reconnection backoff schedule shall be 1s, 2s, 4s, 8s, 16s and max 60s with jitter.

BLE-024: App shall show disconnected state if heartbeat is missed for more than 30 seconds.

BLE-025: App shall notify user if battery is below 20 percent.

### User app IoT screen requirements

Display:

- Connection status
- Device name
- Device ID
- Battery level
- Last heartbeat
- Last button test
- Pair or unpair action
- Manual test action
- Firmware version

### Acceptance criteria

- App discovers ESP32 only when Bluetooth and location permissions are granted.
- App pairs with device and stores binding in backend.
- Pressing Medical physical button creates a Medical emergency.
- Pressing Crime physical button creates a Crime emergency.
- Pressing Fire physical button creates a Fire emergency.
- Pressing General SOS physical button creates a General SOS emergency.
- BLE event works while app is backgrounded and foreground service is active.
- Duplicate BLE button event does not create duplicate emergency.
- Disconnected device is shown within 30 seconds of heartbeat loss.
- Battery level updates in app within 10 seconds of BLE notification.
- Unknown device events are ignored and logged locally.

---

## 9.5 User map and nearby facilities

### Requirements

MAP-U-001: User app shall display OpenStreetMap tiles through `flutter_map`.

MAP-U-002: User map shall show current user location.

MAP-U-003: User map shall show nearby emergency facilities:

- Hospitals
- Police stations
- Fire departments
- Rescue stations if available

MAP-U-004: Facility data source shall be one of:

- Backend-cached Overpass API results
- Curated facility database in MongoDB
- Approved OSM-compatible provider

MAP-U-005: Mobile app must not call Overpass API heavily from client. Backend shall cache facility results.

MAP-U-006: Tapping a facility marker shall show:

- Facility name
- Type
- Contact number if available
- Distance
- Get Directions button

MAP-U-007: Get Directions shall request route from backend or approved routing provider.

MAP-U-008: When responder is assigned and on the way, user map shall show responder marker in real time.

MAP-U-009: User shall receive notification when responder is within configurable radius, default 200 meters.

### Acceptance criteria

- Nearby facilities load within 5 seconds on normal connection.
- Facility marker tap opens details panel.
- Route line appears after Get Directions.
- Responder marker updates without full map reload.
- Nearby responder notification fires once per emergency.

---

## 9.6 Responder emergency map

### Requirements

RESP-001: Responder app shall show all active emergencies allowed by responder scope.

RESP-002: Map shall show emergency markers by type and priority.

RESP-003: Responder can filter by:

- Medical
- Crime
- Fire
- General SOS
- Status
- Distance
- Priority

RESP-004: Tapping marker shall show emergency details:

- Victim name
- Emergency type
- Time sent
- Location
- Location accuracy
- Distance
- Status
- Contact number
- Emergency contacts if allowed
- Notes if provided

RESP-005: Responder can tap Get Route to see fastest route using OSM-compatible routing.

RESP-006: Responder can mark `responder_on_the_way`.

RESP-007: Only assigned responder or admin can update the assigned response state.

RESP-008: Responder cannot mark emergency as resolved.

RESP-009: Responder shall submit on-ground report with:

- Arrival timestamp
- Situation notes
- Action taken
- Needs admin resolution checkbox or flag
- Optional photos if enabled

RESP-010: Responder app shall share live location while on duty or while assigned to active emergency.

RESP-011: Responder shall receive push notification for new emergency in assigned area.

RESP-012: Responder shall receive proximity alert when near emergency, default 100 meters.

### Acceptance criteria

- New emergency appears on responder map within 3 seconds.
- Filter updates map and list immediately.
- Responder route displays within 5 seconds.
- Marking on the way updates user app and AdminWeb in real time.
- Resolve button is not present in responder app.
- On-ground report is visible to admin.
- Responder location sharing stops after going off duty and no active assignment exists.

---

## 9.7 Admin web dashboard

### Requirements

ADMIN-001: AdminWeb shall be responsive across desktop, tablet and mobile browser.

ADMIN-002: AdminWeb shall require admin authentication.

ADMIN-003: AdminWeb shall include:

- Dashboard overview
- Pending user approvals
- Pending responder approvals
- Live emergency map
- Active emergency list
- Emergency detail drawer
- Live responder location layer
- Analytics
- Emergency records
- Audit logs
- Settings

ADMIN-004: Admin dashboard overview shall show:

- Active emergencies
- Pending emergencies
- Responders on duty
- Pending registrations
- Average response time
- Average resolution time
- Stale GPS alerts

ADMIN-005: Live map shall show:

- All active emergency icons
- All responder locations when GPS is enabled
- Selected emergency details
- Legend
- Filters by type, status and agency

ADMIN-006: Admin can mark emergency as resolved only after responder report exists or admin override reason is supplied.

ADMIN-007: Marking resolved shall:

- Set emergency status to `resolved`
- Set resolved timestamp
- Record resolver admin ID
- Remove emergency from active map
- Move it into records and analytics
- Notify user and assigned responder
- Write audit log

ADMIN-008: Admin analytics shall include:

- Monthly emergency rate by type
- Average response time
- Average resolution time
- Emergency records by type
- Emergency records by status
- Responder response count
- Pending approval count
- Resolution trends

ADMIN-009: Emergency records shall show:

- Victim name
- Emergency type
- Time sent
- Time responder assigned
- Time responder on the way
- Time report submitted
- Time resolved
- Assigned responder
- Resolution notes

### Acceptance criteria

- Admin can approve or reject registration from one screen.
- Approved account can log in immediately.
- Rejected account cannot log in.
- Active emergency appears on live map within 3 seconds.
- Admin can mark resolved only with valid status conditions.
- Resolved emergency disappears from live map and appears in records.
- Analytics update after resolution.
- Every admin action creates audit log.

---

## 9.8 Emergency lifecycle

### Status model

Allowed statuses:

```text
pending
assigned
responder_on_the_way
responder_nearby
responder_report_submitted
resolved
cancelled
false_alarm
```

### Allowed transitions

| From | To | Actor |
|---|---|---|
| pending | assigned | system or responder |
| pending | cancelled | user or admin |
| assigned | responder_on_the_way | assigned responder |
| responder_on_the_way | responder_nearby | system |
| responder_nearby | responder_report_submitted | assigned responder |
| responder_report_submitted | resolved | admin |
| any active status | false_alarm | admin |
| any active status | cancelled | admin |

### Backend rules

LIFE-001: Invalid transitions shall return HTTP 409.

LIFE-002: Status updates shall be atomic.

LIFE-003: Assignment shall use optimistic locking or conditional update.

LIFE-004: A responder cannot claim an emergency already assigned to another responder unless admin reassigns it.

LIFE-005: All status changes shall write timeline events.

### Acceptance criteria

- Two responders trying to claim same emergency results in one success and one conflict.
- Timeline shows every status change.
- User, responder and admin receive real-time status updates.
- Responder cannot set status to resolved.
- Admin can resolve only from correct state or with override reason.

---

## 10. API requirements

### 10.1 Global API standards

API-001: All endpoints shall return JSON.

API-002: All protected endpoints shall require `Authorization: Bearer <token>`.

API-003: All write endpoints shall require Zod validation.

API-004: All emergency creation requests shall support `Idempotency-Key` header.

API-005: All responses shall include request ID.

API-006: Server shall reject request body larger than configured limit, default 256 KB for JSON.

API-007: File upload endpoint shall use multipart with file size limits.

API-008: All server errors shall return generic error message to client and detailed structured log to server.

API-009: All clients shall use 10-second request timeout.

API-010: Clients shall retry only safe or idempotent requests with exponential backoff.

### 10.2 Required endpoints

#### Auth

```text
POST /api/auth/register/user
POST /api/auth/register/responder
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/auth/me
```

#### Admin approvals

```text
GET  /api/admin/registrations?type=user|responder&status=pending
GET  /api/admin/registrations/:id
POST /api/admin/registrations/:id/approve
POST /api/admin/registrations/:id/reject
```

#### Emergencies

```text
POST /api/emergencies
GET  /api/emergencies/active
GET  /api/emergencies/my
GET  /api/emergencies/:id
POST /api/emergencies/:id/cancel
POST /api/emergencies/:id/assign
POST /api/emergencies/:id/on-the-way
POST /api/emergencies/:id/report
POST /api/admin/emergencies/:id/resolve
```

#### Locations

```text
POST /api/locations/user
POST /api/locations/responder
GET  /api/emergencies/:id/location-history
GET  /api/responders/locations/live
```

#### BLE devices

```text
POST /api/user/ble-devices/pair
GET  /api/user/ble-devices
POST /api/user/ble-devices/:id/unpair
POST /api/user/ble-events
```

#### Facilities and routing

```text
GET  /api/facilities/nearby?lat=&lng=&type=&radius=
GET  /api/routes?fromLat=&fromLng=&toLat=&toLng=
```

#### Analytics

```text
GET /api/admin/analytics/summary
GET /api/admin/analytics/monthly
GET /api/admin/analytics/resolution-times
GET /api/admin/records/emergencies
GET /api/admin/audit-logs
```

### 10.3 Example Zod validation

Required backend pattern:

```ts
const createEmergencySchema = z.object({
  type: z.enum(["medical", "crime", "fire", "general_sos"]),
  source: z.enum(["mobile_app", "iot_ble"]),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracyMeters: z.number().min(0).max(5000),
    capturedAt: z.string().datetime()
  }),
  notes: z.string().trim().max(500).optional(),
  bleEventId: z.string().trim().max(100).optional()
});
```

Acceptance criteria:

- Invalid emergency type returns HTTP 400.
- Latitude outside range returns HTTP 400.
- Notes longer than 500 characters return HTTP 400.
- Extra unexpected fields are stripped or rejected according to schema policy.

---

## 11. Security requirements

### 11.1 Secrets and environment

SEC-001: No `.env` files with real values shall be committed.

SEC-002: `.env.example` shall exist for backend, web and mobile projects.

SEC-003: Backend must validate required environment variables at startup.

SEC-004: Backend must crash on production startup if required secrets are missing.

SEC-005: JWT secret must be at least 32 bytes if HS256 is used.

SEC-006: Production admin seed credentials must come from environment variables.

SEC-007: Seeded admin password must be hashed before database storage.

Acceptance criteria:

- Starting production backend without `JWT_SECRET` fails.
- Starting production backend without MongoDB URI fails.
- Secret scanner finds no committed secret.
- Admin password is not visible in source files.

### 11.2 Input validation and sanitization

SEC-010: All API inputs must pass Zod validation.

SEC-011: Raw `req.body` must not be used directly in services.

SEC-012: Backend shall trim string fields.

SEC-013: Backend shall reject NoSQL operator injection such as `$gt` in user-controlled JSON.

SEC-014: Backend shall sanitize HTML-capable fields.

SEC-015: File uploads shall validate extension, MIME type, magic bytes and size.

Acceptance criteria:

- Malicious JSON with `$ne` in email field does not bypass login.
- HTML script input is stored safely or rejected.
- Oversized upload is rejected.
- Unsupported upload type is rejected.

### 11.3 Rate limiting and brute force protection

SEC-020: Add `rateLimit` middleware.

Minimum limits:

| Endpoint group | Limit |
|---|---|
| Login | 5 failed attempts per 15 minutes per IP plus email |
| Registration | 10 attempts per hour per IP |
| Emergency creation | 10 attempts per minute per user |
| File upload | 20 uploads per hour per account |
| Admin actions | 60 actions per minute per admin |
| Refresh token | 30 attempts per hour per account |

SEC-021: Repeated failed login attempts shall introduce temporary lockout.

SEC-022: Rate limit responses shall not reveal whether account exists.

Acceptance criteria:

- Sixth failed login attempt within window returns HTTP 429.
- Rate limit reset is logged.
- Rate limit does not block unrelated users sharing same network unnecessarily when account-based key is available.

### 11.4 CORS and headers

SEC-030: CORS shall allow only configured origins.

SEC-031: Development CORS can allow localhost origins only.

SEC-032: Production CORS must not use `*`.

SEC-033: Use Helmet with safe defaults.

SEC-034: Disable `x-powered-by`.

Acceptance criteria:

- Request from unapproved origin is blocked.
- Production config does not contain wildcard CORS.
- Security headers exist in API responses.

### 11.5 Authorization

SEC-040: User can access only own profile, devices and emergency history.

SEC-041: Responder can access only emergency data allowed by agency or assignment scope.

SEC-042: Admin can access all review, analytics and resolution data.

SEC-043: File documents require signed access or authenticated protected route.

SEC-044: Audit logs are append-only.

Acceptance criteria:

- User A cannot fetch User B emergency history.
- Responder cannot fetch pending registration documents.
- Non-admin cannot resolve emergency.
- Audit log cannot be edited by API.

---

## 12. Performance and data retention requirements

### 12.1 Location update policy

PERF-001: User location updates during active emergency shall be sent every 5 seconds or when movement exceeds 10 meters, whichever comes first.

PERF-002: Responder location updates while on duty or assigned shall be sent every 5 seconds or when movement exceeds 10 meters.

PERF-003: Backend shall reject location updates with impossible speed unless admin override or low confidence flag is used.

PERF-004: Location updates shall include accuracy and timestamp.

### 12.2 Location history bloat control

PERF-010: Active emergency shall store current location directly on emergency document.

PERF-011: Detailed location samples shall be stored in separate `location_samples` collection.

PERF-012: Active emergency location history shall be capped to last 100 samples in query responses.

PERF-013: Raw location samples may be retained for 30 days for active investigation, then downsampled or purged according to policy.

PERF-014: Resolved emergency shall retain summary route, important timestamps and last known location.

PERF-015: Use TTL index for raw samples if retention policy allows.

### 12.3 MongoDB indexes

Required indexes:

```text
users: email unique, status, createdAt
responders: email unique, status, agencyType, coverageArea
emergencies: status + createdAt
emergencies: type + status
emergencies: userId + createdAt
emergencies: assignedResponderId + status
emergencies: currentLocation 2dsphere
location_samples: emergencyId + capturedAt
location_samples: actorId + actorType + capturedAt
audit_logs: createdAt
push_tokens: accountId + platform
ble_devices: deviceId unique, userId
```

Acceptance criteria:

- Active emergency query uses index.
- Geospatial nearby query uses 2dsphere index.
- Location sample collection does not grow indefinitely without retention plan.
- Dashboard with 100 active emergencies remains responsive.

---

## 13. Reliability requirements

### 13.1 Request timeouts

REL-001: Mobile and web API clients shall use 10-second timeout.

REL-002: Backend outbound routing or map requests shall use 10-second timeout.

REL-003: Long admin exports, if added later, must be asynchronous.

### 13.2 Retry and exponential backoff

REL-010: Mobile apps shall retry idempotent requests with exponential backoff.

REL-011: Emergency creation uses idempotency key to safely retry.

REL-012: Location updates may be dropped if stale, but active emergency status updates must be retried.

REL-013: Retry schedule shall be 1s, 2s, 4s, 8s and max 30s with jitter.

REL-014: App shall show visible error if emergency request fails after max retries.

### 13.3 Offline handling

REL-020: If emergency trigger occurs offline, app shall queue request locally with encrypted or protected local storage when possible.

REL-021: App shall clearly show `Waiting for connection to send emergency`.

REL-022: Once online, app shall send queued emergency request automatically.

REL-023: Queued emergency older than 10 minutes shall ask user whether to send or discard unless it came from active BLE trigger and no successful alert exists.

Acceptance criteria:

- Network timeout does not freeze app.
- Retried emergency request does not create duplicates.
- Offline state is visible.
- Recovery from offline sends queued emergency when network returns.

---

## 14. Real-time and notification requirements

### 14.1 WebSocket

RT-001: Use Socket.io for live updates.

RT-002: Authenticated clients join role-specific rooms:

```text
user:{userId}
responder:{responderId}
admin:live
emergency:{emergencyId}
agency:{agencyType}:{coverageArea}
```

RT-003: Server emits:

```text
emergency.created
emergency.updated
emergency.assigned
emergency.responder_on_the_way
emergency.responder_nearby
emergency.resolved
location.user_updated
location.responder_updated
registration.created
registration.reviewed
```

RT-004: WebSocket connection shall verify access token.

RT-005: Clients shall reconnect with exponential backoff.

RT-006: Polling may exist only as fallback.

Acceptance criteria:

- Admin receives new registration without page refresh.
- Responder receives new emergency without manual refresh.
- User receives assigned responder update without manual refresh.
- Expired token disconnects or requires refresh.

### 14.2 Push notifications

NOTIF-001: Use Firebase Cloud Messaging unless project chooses another provider.

NOTIF-002: Mobile apps shall register push token after login.

NOTIF-003: Push token shall be associated with account ID, device ID, platform and timestamp.

NOTIF-004: User notifications:

- Responder assigned
- Responder on the way
- Responder nearby
- Emergency resolved
- Device disconnected
- Panic button low battery

NOTIF-005: Responder notifications:

- New emergency in area
- Emergency assigned
- Route or proximity alert
- Admin resolved emergency

NOTIF-006: Background notification tap shall deep-link to relevant emergency screen.

Acceptance criteria:

- Push token registers after login.
- Push notification arrives when app is backgrounded.
- Tapping notification opens correct screen.
- Logging out removes or invalidates push token.

---

## 15. Analytics requirements

### 15.1 Events to track

ANA-001: Track product and operational events:

- Registration submitted
- Registration approved
- Registration rejected
- User login success
- Responder login success
- Emergency created
- Emergency assigned
- Responder on the way
- Responder nearby
- Responder report submitted
- Emergency resolved
- Emergency cancelled
- BLE paired
- BLE disconnected
- BLE button pressed
- Notification delivered if provider supports callback
- Notification opened

ANA-002: Analytics events shall avoid storing sensitive document images or passwords.

ANA-003: Analytics shall support monthly reports.

### 15.2 Admin analytics

Required charts and metrics:

- Monthly emergency counts by type.
- Average response time by emergency type.
- Average resolution time by emergency type.
- Emergency records by type.
- Emergency records by status.
- Responder workload.
- Approval volume.
- Most common emergency areas using geospatial aggregation or area tags.

Acceptance criteria:

- Monthly chart updates when emergency is resolved.
- Emergency records table can filter by date range, type and status.
- Average resolution time excludes unresolved emergencies.
- Analytics API returns results within 3 seconds for last 12 months.

---

## 16. UI and UX requirements

### 16.1 Shared design principles

UX-001: UI shall be clean, urgent and accessible.

UX-002: Emergency actions shall be visually dominant.

UX-003: Red shall be used for critical action and danger only.

UX-004: Blue shall be used for navigation and responder actions.

UX-005: Green shall represent safe, resolved or connected state.

UX-006: Amber shall represent warning, pending or stale state.

UX-007: Every screen shall include loading, empty and error states.

UX-008: Touch targets shall be at least 44 by 44 px.

UX-009: Color must not be the only status indicator.

UX-010: Text must remain readable under outdoor conditions.

---

### 16.2 Design System

#### Typography
Use SF Pro Display (or system font equivalent) with 3-weight scale:
- **Body**: 17px regular, line-height 1.5
- **Title 1**: 34px bold
- **Title 2**: 28px semibold
- **Title 3**: 22px semibold

#### Color Palette

| Role | Hex Code | Usage |
|---|---|---|
| Primary Red | `#E52834` | Emergency actions, danger, critical alerts |
| Primary Blue | `#0A84FF` | Navigation, responder actions, links |
| Primary Green | `#34C759` | Safe, resolved, connected states |
| Primary Amber | `#FFB81C` | Warning, pending, stale states |
| Primary Purple | `#AF52DE` | Secondary accents, decorative elements |
| Background White | `#FFFFFF` | Primary content backgrounds |
| Background Gray | `#F5F5F5` | Secondary backgrounds, cards |
| Background Dark | `#1C1C1E` | Dark mode backgrounds |
| Text Primary | `#000000` | Primary text content |
| Text Secondary | `#737373` | Subtitles, captions, helper text |

#### Layout Structure

**Mobile Apps (User & Responder)**
- Single sidebar navigation drawer
- Emergency home as default landing page
- Bottom sheet for confirmations
- Full-width content area with max-width constraints

**Admin Web Dashboard**
- Left sidebar navigation (fixed width ~250px)
- Top header bar for search and user menu
- Main content area with responsive grid
- Breakpoints: mobile (<768px), tablet (768-1024px), desktop (>1024px)

#### Components

**Emergency Button Card**
- Full-width rectangular container with rounded corners (12px radius)
- Large emergency icon (64x64px)
- Label text below icon
- Color coded by type:
  - Medical: Red background
  - Crime: Purple background
  - Fire: Orange background
  - General SOS: Blue background
- Hold-to-send: 2-second activation threshold

**Registration Form**
- Two-column layout for desktop, single column for mobile
- Input fields with clear labels and validation feedback
- Live face capture camera preview
- File upload zone with drag-and-drop support
- Consent checkbox at bottom with terms link

**Approval Review Card**
- Applicant information at top
- Photo/document preview in card body
- Approval/Reject action buttons at bottom
- Reason text area for rejection
- Timestamp of submission

**Map Interface**
- Full-screen container with scrollable viewport
- Emergency markers by type and priority color
- Filter panel overlay at top or side
- Responder location markers with pulse animation
- Touch gestures: pinch-to-zoom, drag, tap-to-select

**Status Timeline**
- Vertical line with circular nodes
- Colored badges for each status
- Timestamp below each node
- Collapse/expand capability for detail

#### Responsive Behavior

| Breakpoint | Width | Layout |
|---|---|---|
| Mobile | < 768px | Single column, hamburger nav |
| Tablet | 768-1024px | Two-column where appropriate |
| Desktop | > 1024px | Full sidebar, multi-column content |

#### Responsive Behavior

| Breakpoint | Width | Layout |
|---|---|---|
| Mobile | < 768px | Single column, hamburger nav |
| Tablet | 768-1024px | Two-column where appropriate |
| Desktop | > 1024px | Full sidebar, multi-column content |

---

### 16.3 Accessibility Requirements

A11Y-001: All UI components must meet WCAG 2.1 AA compliance.

A11Y-002: Color contrast ratios must be at least 4.5:1 for normal text and 3:1 for large text.

A11Y-003: Emergency buttons must be reachable with one thumb on devices 5-6 inches.

A11Y-004: All interactive elements must be focusable and accessible via keyboard.

A11Y-005: Screen reader announcements for status changes must be concise and timed appropriately.

A11Y-006: Visual indicators must be accompanied by text labels or icons (not color alone).

A11Y-007: Video content must include captions and transcripts.

A11Y-008: Animations must respect reduced-motion preferences.

---

### 16.4 Flutter Implementation Notes

#### Color Implementation
```dart
class SafeAlertColors {
  static const emergencyRed = Color(0xFFE52834);
  static const responderBlue = Color(0xFF0A84FF);
  static const safeGreen = Color(0xFF34C759);
  static const warningAmber = Color(0xFFFFB81C);
  static const accentPurple = Color(0xFFAF52DE);
  static const backgroundWhite = Color(0xFFFFFFFF);
  static const backgroundGray = Color(0xFFF5F5F5);
  static const textPrimary = Color(0xFF000000);
  static const textSecondary = Color(0xFF737373);
}
```

#### Theme Implementation
```dart
ThemeData lightTheme = ThemeData(
  useMaterial3: true,
  colorScheme: ColorScheme.fromSeed(
    seedColor: SafeAlertColors.emergencyRed,
    brightness: Brightness.light,
  ),
  appBarTheme: AppBarTheme(
    centerTitle: true,
    elevation: 0,
    backgroundColor: SafeAlertColors.backgroundWhite,
  ),
  cardTheme: CardTheme(
    elevation: 2,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(12),
    ),
  ),
  bottomSheetTheme: BottomSheetThemeData(
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(
        top: Radius.circular(20),
      ),
    ),
  ),
);
```

#### Emergency Button Component
```dart
class EmergencyButton extends StatelessWidget {
  final EmergencyButtonConfig config;
  final VoidCallback onPressed;
  
  const EmergencyButton({
    required this.config,
    required this.onPressed,
  });
  
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => _showConfirmation(context),
      onPanStart: (_) => _startHoldTimer(),
      onPanEnd: (_) => _cancelHoldTimer(),
      child: Container(
        width: double.infinity,
        padding: EdgeInsets.symmetric(vertical: 40, horizontal: 32),
        decoration: BoxDecoration(
          color: config.color,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: config.color.withValues(alpha: 0.3),
              blurRadius: 12,
              offset: Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              config.icon,
              size: 64,
              color: Colors.white,
            ),
            SizedBox(height: 12),
            Text(
              config.label,
              style: TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

---

Required screens:

1. Splash and startup check
2. Login
3. Registration
4. Pending approval
5. Emergency home
6. Emergency confirmation
7. Active emergency tracking
8. Map and nearby facilities
9. Facility details
10. IoT device pairing
11. Emergency history
12. Settings
13. Permission education screens
14. Notification detail deep link

---

### 16.2.1 Detailed Screen Specifications

Each mobile screen uses consistent layout: sidebar navigation (left), content area (right), bottom action bar (when applicable).

#### 1. Splash and Startup Check
**Layout:**
- Full-screen gradient background (Red to Purple diagonal)
- App logo centered at top (80px height)
- Loading spinner or welcome animation
- Permission checklist overlay (location, camera, Bluetooth, notifications)
- "Get Started" button at bottom

**Content:**
- Permission status icons (checkmark or prohibition)
- Brief educational tooltip for each permission
- "Continue" button disabled until critical permissions granted

---

#### 2. Login Screen
**Layout:**
- Header: "Welcome Back" (Title 1)
- Email input field (large, 60px height)
- Password input field (with toggle visibility)
- "Remember this device" checkbox with label
- "Forgot Password" link (secondary text)
- Login button (full width, primary color)
- Footer: "Don't have an account? Register link"

**Validation:**
- Real-time email format check
- Password strength indicator
- Clear error messages

---

#### 3. Registration Screen
**Layout:**
- Two-column grid for desktop, single column for mobile
- Section headers with icons
- Input fields with floating labels
- File upload zones (dashed border, drag-and-drop)
- Live camera preview for face capture
- Consent checkbox at bottom

**Fields:**
- Full name (required)
- Date of birth (computed age display)
- Contact number (with country code picker)
- Email (validated)
- Password (min 8 characters, strength indicator)
- Address/municipality
- Proof of residency upload (ID image/PDF)
- Live face capture (camera preview)
- Consent checkbox

---

#### 4. Pending Approval Screen
**Layout:**
- Header: "Your Registration is Pending"
- Illustration/icon of review process
- Status timeline: Submitted → Reviewing → Approved
- Estimated wait time display
- Support contact link
- Logout button at bottom

---

#### 5. Emergency Home Screen
**Layout:**
- Header: User name + profile icon
- Emergency buttons grid (4 large cards, 2 columns)
- Status section: Device status, active emergency indicator
- Quick stats: Total emergencies sent, average response time
- Bottom navigation or FAB for quick action

**Emergency Buttons:**
- Medical (Red)
- Crime (Purple)
- Fire (Orange)
- General SOS (Blue)

---

#### 6. Emergency Confirmation Screen
**Layout:**
- Large emergency icon at top
- Title: Emergency type (e.g., "Medical Emergency")
- Location display with pin icon
- Timestamp display
- Cancel button (destructive, red)
- Educational note: "Our team is notified immediately"
- Progress indicator showing steps remaining

---

#### 7. Active Emergency Tracking Screen
**Layout:**
- Header: Emergency type + status badge
- Map full-screen with responder marker when assigned
- Status timeline at top or bottom
- Contact info card
- Notes/text area for updates
- Share location toggle
- Emergency type filter chip bar

**Status Display:**
- Sent → Waiting for responder (amber badge)
- Responder assigned (blue badge)
- Responder on the way (green badge with pulse)
- Responder nearby (green badge with proximity indicator)
- Response submitted
- Resolved (green badge)

---

#### 8. Map and Nearby Facilities Screen
**Layout:**
- Map container (full viewport minus header/footer)
- Header with location button, search
- Filter chip bar (facility types)
- Marker popup details on tap
- Distance and contact info overlay

**Markers:**
- Hospitals: Green cross icon
- Police stations: Blue shield icon
- Fire departments: Orange fire icon
- Rescue stations: Purple star icon

---

#### 9. Facility Details Screen
**Layout:**
- Header: Facility name + type badge
- Map showing facility location
- Contact card with call button
- Distance indicator
- Operating hours
- Get Directions button
- Back button at top

---

#### 10. IoT Device Pairing Screen
**Layout:**
- Header: "Pair Panic Button"
- Status: Scanning / Paired / Disconnected
- Device info card when paired:
  - Device name
  - Device ID
  - Battery level with icon
  - Firmware version
  - Last seen timestamp
- Pair button (scanning state)
- Unpair button (destructive)
- Manual test button
- Reconnection status indicator

---

#### 11. Emergency History Screen
**Layout:**
- Header: "Emergency History"
- List of past emergencies
- Each item shows:
  - Type icon
  - Date/time
  - Status
  - Responder name (if assigned)
  - Resolution notes (resolved)
- Pull-to-refresh
- Export to PDF option

---

#### 12. Settings Screen
**Layout:**
- Header: "Settings"
- Groups:
  - Account (edit profile, change password)
  - Device (BLE device management)
  - Notifications (toggle by type)
  - Privacy (data settings, clear cache)
  - About (version, help, support)
- Toggle switches for preferences
- Section dividers

---

### 16.3 MobileForResponder Detailed Screens

Each responder screen uses: sidebar navigation, full-width content, action buttons at bottom.

#### 1. Splash and Startup Check
Same as User app but with responder-specific branding (agency logo).

---

#### 2. Login Screen
Same as User app login.

---

#### 3. Registration Screen
**Additional fields vs User:**
- Agency type (police, fire, medical, rescue, other)
- Station/department name
- Position/role
- Coverage area
- Professional credential upload
- Credential number
- Face capture (required)

---

#### 4. Pending Approval Screen
Same as User app.

---

#### 5. On-Duty Toggle Screen
**Layout:**
- Header: "On Duty Status"
- Large toggle switch (On/Off)
- Status indicator (green when on, gray when off)
- Current duty time display
- Warning message when off duty
- Emergency alert if on duty without assignment

---

#### 6. Active Emergency Map Screen
**Layout:**
- Header: "Active Emergencies"
- Filter panel (type, status, priority)
- Map with emergency markers
- List of available emergencies (scrollable)
- Tap marker → open emergency detail
- FAB: "My Location" refresh

**Emergency Markers:**
- Color by type (same as user app)
- Priority indicated by pulsing intensity
- Assigned emergencies show responder avatar
- Distance chip below marker

---

#### 7. Emergency Filter Panel
**Layout:**
- Horizontal scroll chips
- Type filter: Medical, Crime, Fire, General SOS
- Status filter: All, Pending, Assigned, On the Way
- Priority filter: All, High, Critical
- Distance sort option
- Reset button

---

#### 8. Emergency Detail Screen
**Layout:**
- Header: Emergency type + status badge
- Victim information card
- Location map with pin
- Timestamp display
- Distance indicator
- Contact card
- Notes section
- Timeline of events

---

#### 9. Route Guidance Screen
**Layout:**
- Full-screen map with route overlay
- Navigation button (large, bottom)
- ETA display
- Current speed indicator
- Turn-by-turn instructions (expandable)
- Pause/Resume navigation controls
- Report arrival button

---

#### 10. Response Report Form
**Layout:**
- Header: "Response Report"
- Arrival timestamp (auto-filled)
- Situation notes (text area)
- Actions taken (checklist)
- Additional notes
- Photo upload (optional)
- Submit button (full width)

---

#### 11. Notification Detail Deep Link
Tapping notification opens relevant screen with deep link parameters.

---

#### 12. Settings Screen
Same as User app settings.

---

### 16.4 AdminWeb Detailed Screens

Admin web uses responsive layout: left sidebar navigation (~250px), header bar, main content area.

#### 1. Admin Login Screen
**Layout:**
- Centered card on gradient background
- Logo at top
- Email/username and password fields
- Login button
- "Forgot Password" link
- Footer with support contact

---

#### 2. Overview Dashboard Screen
**Layout:**
- Header: "Dashboard"
- Statistics row (4 cards):
  - Active emergencies
  - Pending approvals
  - Responders on duty
  - Average response time
- Live map section
- Recent activity feed
- Alerts section (stale GPS, high-priority emergencies)

**Map Features:**
- Toggle for responder locations
- Emergency markers
- Type/priority filters
- Time range selector

---

#### 3. Pending User Approvals Screen
**Layout:**
- Header: "User Approvals"
- Filter tabs: All, Pending, Approved, Rejected
- Card grid for pending applications
- Each card shows:
  - Applicant photo
  - Full name
  - Contact info
  - Submission date
  - Status badge

**Card Actions:**
- View details button
- Approve button
- Reject button (with reason modal)

---

#### 4. Pending Responder Approvals Screen
Same layout as User Approvals but with responder-specific fields visible.

---

#### 5. Live Emergency Map Screen
**Layout:**
- Header: "Live Map"
- Filter sidebar (type, status, agency)
- Main map area
- Emergency detail drawer (right side)
- Responder count indicator

**Detail Drawer:**
- Emergency info
- Current location
- Status timeline
- Assigned responder (if any)
- Resolve action (admin only)

---

#### 6. Emergency Detail Drawer
**Content:**
- Emergency type + priority badge
- Victim information
- Location with map thumbnail
- Status timeline
- Timeline events list
- Contact information
- Notes
- Actions: Assign responder, Resolve, Cancel

---

#### 7. Active Responders Screen
**Layout:**
- Header: "Active Responders"
- List of responders on duty
- Each row shows:
  - Responder photo and name
  - Agency/position
  - Current location (with coordinates)
  - Status indicator
  - Last update timestamp
- Map toggle
- Filter by agency

---

#### 8. Emergency Records Screen
**Layout:**
- Header: "Emergency Records"
- Date range picker
- Filter sidebar (type, status, date range)
- Table view with sortable columns:
  - ID
  - Victim name
  - Type
  - Status
  - Created date
  - Resolved date
  - Actions (view, export)
- Pagination controls
- Export to PDF/CSV

---

#### 9. Analytics Screen
**Layout:**
- Header: "Analytics"
- Date range selector
- Charts row:
  - Monthly emergency counts (bar chart)
  - Response time by type (grouped bar)
  - Resolution trends (line chart)
- Tables:
  - Top responders by response count
  - Emergency hotspots (geospatial)
- Export button

---

#### 10. Audit Logs Screen
**Layout:**
- Header: "Audit Logs"
- Search bar
- Filter sidebar (actor, action, date)
- Table with:
  - Timestamp
  - Actor name and role
  - Action
  - Target
  - Details
- Pagination
- Export option

---

#### 11. Settings Screen
**Layout:**
- Header: "Settings"
- Sections:
  - System configuration
  - Emergency categories
  - Coverage areas
  - Email templates
  - Logo upload
- Save button

---

### 16.5 Responsive Layout Guidelines

**Desktop (>1024px):**
- Left sidebar navigation (fixed ~250px)
- Top header bar (search, user menu, notifications)
- Main content area (scrollable)

**Tablet (768-1024px):**
- Collapsible sidebar (hamburger menu)
- Single column content
- Cards stack vertically
- Charts resize proportionally

**Mobile (<768px):**
- Hamburger navigation (bottom or top)
- Full-width cards
- Simplified charts (stacked instead of grouped)
- Touch-optimized targets (minimum 44x44px)
- Bottom sheet overlays for confirmations

---

### 16.6 Iconography

All icons use Material Design 3 icon set with custom additions.

#### Emergency Type Icons
- **Medical**: `medical_services` (red)
- **Crime**: `security` (purple)
- **Fire**: `emergency` (orange)
- **General SOS**: `call_sos` (blue)
- **Police**: `security` (blue)
- **Fire Department**: `emergency` (orange)
- **Hospital**: `local_hospital` (green)
- **Fire Station**: `local_fire_department` (orange)
- **Police Station**: `local_police` (blue)
- **Ambulance**: `ev_station` (green)

#### Status Icons
- **Active**: `radio_button_checked` (green)
- **Pending**: `hourglass_empty` (amber)
- **Complete**: `check_circle` (green)
- **Error**: `error` (red)
- **Warning**: `warning` (amber)
- **Info**: `info` (blue)
- **Location**: `my_location` (blue)
- **GPS**: `gps_fixed` (green)

#### Navigation Icons
- **Home**: `home` (white)
- **Search**: `search` (white)
- **Notifications**: `notifications` (white)
- **Settings**: `settings` (white)
- **Profile**: `person` (white)
- **Menu**: `menu` (white)
- **Close**: `close` (white)
- **Arrow Back**: `arrow_back` (white)
- **Arrow Forward**: `arrow_forward` (white)

**Icon Size Standards:**
- Large: 64px (emergency buttons)
- Medium: 48px (navigation, cards)
- Small: 24px (toolbar, chips)
- Tiny: 18px (secondary actions)

---

### 16.7 Visual Style Guide

#### Shapes and Corners
- **Small**: 4px (buttons, small chips)
- **Medium**: 8px (inputs, standard cards)
- **Large**: 12px (emergency buttons, primary cards)
- **X-Large**: 20px (bottom sheets, modals)
- **Round**: 50px (circular elements, avatars)

#### Spacing System
- **xs**: 4px (tight spacing)
- **sm**: 8px (compact spacing)
- **md**: 16px (standard spacing)
- **lg**: 24px (section spacing)
- **xl**: 32px (page spacing)
- **2xl**: 48px (hero spacing)

#### Shadows
```dart
BoxShadow lightShadow = BoxShadow(
  color: Colors.black.withValues(alpha: 0.08),
  blurRadius: 4,
  offset: Offset(0, 2),
);

BoxShadow mediumShadow = BoxShadow(
  color: Colors.black.withValues(alpha: 0.12),
  blurRadius: 8,
  offset: Offset(0, 4),
);

BoxShadow largeShadow = BoxShadow(
  color: Colors.black.withValues(alpha: 0.16),
  blurRadius: 12,
  offset: Offset(0, 6),
);
```

#### Gradients
- **Primary**: Red (#E52834) to Purple (#AF52DE), 135deg
- **Emergency**: Red (#E52834) to Dark Red (#9E1B24), 45deg
- **Success**: Green (#34C759) to Light Green (#84D768), 90deg
- **Warning**: Amber (#FFB81C) to Orange (#FF9800), 45deg

---

## 3. Technical Architecture
8. Emergency detail
9. Route guidance
10. Response report form
11. Notification detail deep link
12. Settings

### 16.4 AdminWeb screens

Required screens:

1. Admin login
2. Overview dashboard
3. Pending user approvals
4. Pending responder approvals
5. Live emergency map
6. Emergency detail drawer
7. Active responders
8. Emergency records
9. Analytics
10. Audit logs
11. Settings

Acceptance criteria:

- All screens render correctly on target sizes.
- Forms show field-level validation.
- Empty states explain what to do next.
- Error states include retry where applicable.
- Emergency buttons are reachable with one hand on common phone sizes.

---

## 17. Backend data model

### 17.1 User

```ts
interface User {
  id: string;
  role: "user";
  fullName: string;
  dateOfBirth: string;
  age: number;
  contactNumber: string;
  email: string;
  passwordHash: string;
  address: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  proofOfResidencyFileId: string;
  faceCaptureFileId: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}
```

### 17.2 Responder

```ts
interface Responder {
  id: string;
  role: "responder";
  fullName: string;
  dateOfBirth: string;
  age: number;
  contactNumber: string;
  email: string;
  passwordHash: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  agencyType: "police" | "fire" | "medical" | "rescue" | "other";
  stationName: string;
  position: string;
  credentialNumber?: string;
  credentialFileId: string;
  faceCaptureFileId: string;
  coverageArea: string;
  dutyStatus: "off_duty" | "on_duty" | "busy";
  currentLocation?: GeoPoint;
  createdAt: string;
  updatedAt: string;
}
```

### 17.3 Emergency

```ts
interface Emergency {
  id: string;
  userId: string;
  type: "medical" | "crime" | "fire" | "general_sos";
  priority: "medium" | "high" | "critical";
  source: "mobile_app" | "iot_ble";
  status:
    | "pending"
    | "assigned"
    | "responder_on_the_way"
    | "responder_nearby"
    | "responder_report_submitted"
    | "resolved"
    | "cancelled"
    | "false_alarm";
  currentLocation: GeoPoint;
  locationAccuracyMeters: number;
  assignedResponderId?: string;
  assignedAt?: string;
  responderOnTheWayAt?: string;
  responderNearbyAt?: string;
  reportSubmittedAt?: string;
  resolvedAt?: string;
  resolvedByAdminId?: string;
  cancellationReason?: string;
  resolutionNotes?: string;
  bleEventId?: string;
  idempotencyKey: string;
  timeline: EmergencyTimelineEvent[];
  createdAt: string;
  updatedAt: string;
}
```

### 17.4 Location sample

```ts
interface LocationSample {
  id: string;
  emergencyId?: string;
  actorId: string;
  actorType: "user" | "responder";
  location: GeoPoint;
  accuracyMeters: number;
  speedMetersPerSecond?: number;
  capturedAt: string;
  receivedAt: string;
}
```

### 17.5 BLE device

```ts
interface BleDevice {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  firmwareVersion: string;
  batteryLevel: number;
  status: "paired" | "connected" | "disconnected" | "unpaired";
  lastSeenAt?: string;
  pairedAt: string;
  unpairedAt?: string;
}
```

### 17.6 Audit log

```ts
interface AuditLog {
  id: string;
  actorId: string;
  actorRole: "admin" | "responder" | "user" | "system";
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}
```

---

## 18. Flutter architecture

### 18.1 Layering

Each Flutter app shall use feature-first clean architecture.

```text
feature/
  data/
    datasources/
    dto/
    repositories/
  domain/
    entities/
    repositories/
    usecases/
  application/
    providers/
    controllers/
  presentation/
    screens/
    widgets/
```

### 18.2 State management

Use Riverpod providers.

Rules:

- UI widgets cannot call Dio directly.
- UI widgets call controllers or use cases.
- Repositories handle API and local data source coordination.
- API DTOs map to domain entities.
- Background services must use isolated service classes.

### 18.3 API client requirements

- Dio base client with access token interceptor.
- Refresh token interceptor.
- 10-second timeout.
- Retry interceptor for idempotent endpoints.
- Request ID logging.
- Automatic logout on refresh failure.
- User-friendly error mapper.

### 18.4 Secure storage

- Access and refresh tokens stored in `flutter_secure_storage`.
- Non-sensitive cache stored in Hive or Isar.
- BLE device ID can be stored locally but must also be validated with backend.
- Emergency queue should avoid storing excessive PII.

Acceptance criteria:

- Flutter analyzer shows no errors.
- No direct API call from presentation layer.
- Token refresh works without user re-login when Remember this device is enabled.
- Expired session redirects to login.

---

## 19. AdminWeb architecture

### 19.1 Structure

```text
src/
  app/
    App.tsx
    router.tsx
    providers.tsx
  features/
    auth/
    approvals/
    emergencies/
    map/
    responders/
    analytics/
    audit/
  components/
    ui/
    layout/
  services/
    apiClient.ts
    socketClient.ts
  types/
    api.ts
    domain.ts
```

### 19.2 AdminWeb requirements

- Use typed API client.
- No `any` in production code.
- Use Zod for form validation.
- Use React Query for server state.
- Use WebSocket for live map updates.
- Use responsive layout with breakpoints for desktop, tablet and mobile.
- Use protected routes.
- Use audit-friendly admin actions.

Acceptance criteria:

- `npm run typecheck` passes.
- `npm run lint` passes.
- Admin pages are accessible only to admin role.
- Live map updates via WebSocket.
- Registration review forms validate before submission.

---

## 20. Backend architecture

### 20.1 Module pattern

Each backend module shall follow:

```text
module/
  module.routes.ts
  module.controller.ts
  module.service.ts
  module.repository.ts
  module.schema.ts
  module.types.ts
  module.test.ts
```

### 20.2 Middleware requirements

Required middleware order:

1. Request ID
2. Security headers
3. CORS whitelist
4. Body parser with size limit
5. Mongo sanitize
6. Rate limiter by route group
7. Authentication where required
8. Role guard where required
9. Zod validation
10. Controller
11. Error handler

### 20.3 Error handling

Backend error response:

```json
{
  "requestId": "req_123",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields need to be corrected.",
    "details": []
  }
}
```

Rules:

- Do not expose stack trace in production.
- Do not expose database errors to client.
- Log full error server-side with request ID.
- Return user-friendly messages.

Acceptance criteria:

- Invalid input returns structured validation error.
- Database outage returns safe generic message.
- Server logs include request ID.
- Production response never includes stack trace.

---

## 21. Background behavior requirements

### 21.1 User app

The User app shall run background services only for specific justified cases:

- Active emergency location sharing.
- BLE panic button monitoring when user enabled it.
- Push notification handling.

Android requirement:

- Use foreground service for continuous location or BLE monitoring.
- Show persistent notification while monitoring.
- Request battery optimization exclusion only with clear explanation.

### 21.2 Responder app

The Responder app shall run background services only when:

- Responder is on duty.
- Responder is assigned to active emergency.
- Push notification handling is required.

Acceptance criteria:

- App does not continuously track location when user or responder is logged out.
- Foreground service notification appears during active tracking.
- Background tracking stops after emergency resolved or off-duty state.
- Push notifications work even when app is backgrounded.

---

## 22. Compliance, privacy and data protection

PRIV-001: Collect only data required for emergency use and approval.

PRIV-002: Show consent statement before location sharing.

PRIV-003: Do not expose ID documents in public URLs.

PRIV-004: Store file access through signed URLs or authenticated protected routes.

PRIV-005: Redact sensitive data from logs.

PRIV-006: Emergency location data retention must follow configured retention policy.

PRIV-007: Admin viewing of documents must be audit logged.

PRIV-008: Users should be informed that GPS tracking is active during an emergency.

Acceptance criteria:

- Logs do not contain passwords or tokens.
- Admin document view creates audit log.
- Active tracking indicator is visible.
- Resolved emergency retains only required data.

---

## 23. Testing requirements

### 23.1 Backend tests

Required coverage:

- Registration validation.
- Login approved, pending, rejected and invalid account cases.
- Rate limit behavior.
- JWT and role guard.
- Emergency creation.
- Idempotency key.
- Status transition.
- Admin resolution.
- File upload validation.
- Location update validation.
- Analytics aggregation.

### 23.2 Flutter user app tests

Required coverage:

- Registration form validation.
- Live camera capture flow mock.
- Login pending approval handling.
- Emergency button confirmation.
- Hold-to-send.
- BLE event parsing.
- BLE deduplication.
- Offline emergency queue.
- Active emergency status updates.
- Map marker rendering.

### 23.3 Flutter responder app tests

Required coverage:

- Login approval handling.
- Emergency filter behavior.
- Marker tap detail.
- On-the-way status update.
- Route request.
- Proximity notification.
- Response report submission.

### 23.4 AdminWeb tests

Required coverage:

- Admin login.
- Registration approval.
- Registration rejection.
- Live map event display.
- Emergency detail drawer.
- Resolve emergency flow.
- Analytics rendering.
- Audit log view.

### 23.5 End-to-end critical scenario

Scenario:

1. User registers.
2. Admin approves user.
3. Responder registers.
4. Admin approves responder.
5. User pairs ESP32 device.
6. User presses Fire button on ESP32.
7. User app sends emergency with GPS.
8. AdminWeb and responder app receive emergency.
9. Responder marks on the way.
10. User app shows responder marker.
11. Responder arrives and submits report.
12. Admin resolves emergency.
13. User and responder receive resolved notification.
14. Analytics records updated.

Acceptance criteria:

- Full scenario completes without manual database changes.
- No duplicate emergency is created.
- All status changes appear in timeline.
- Audit logs exist for admin actions.
- Analytics contains resolved record.

---

## 24. CI, code quality and deployment requirements

### 24.1 CI pipeline

Required checks:

Backend:

```text
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

AdminWeb:

```text
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Flutter apps:

```text
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
```

### 24.2 Code quality gates

- No committed `node_modules`.
- No committed `.env`.
- No TypeScript `any` without explicit approval comment.
- Flutter analyzer has zero errors.
- Backend test suite passes.
- AdminWeb typecheck passes.
- Critical route tests pass.
- Secret scan passes.

### 24.3 Deployment

- Backend deploys with environment variables from hosting provider.
- AdminWeb deploys separately from backend.
- Mobile apps use environment-specific API base URL.
- MongoDB Atlas URI is backend-only.
- Production uses HTTPS only.
- WebSocket uses secure transport in production.

---

## 25. Release plan

### Release 1: Secure backend foundation

Deliverables:

- ApiServer folder.
- Environment validation.
- Auth and role middleware.
- Zod validation.
- Rate limiting.
- CORS whitelist.
- User, responder, admin and emergency schemas.
- Registration and approval APIs.
- Emergency lifecycle APIs.
- Location APIs.
- Test suite for critical backend flows.

Exit criteria:

- Security score reaches at least 8.5/10.
- Protected routes cannot be accessed without correct role.
- API contract published.

### Release 2: MobileForUser Flutter MVP

Deliverables:

- Registration with ID upload and live camera capture.
- Pending approval screen.
- Login with Remember this device.
- Emergency home.
- Emergency creation.
- Active emergency tracking.
- OpenStreetMap facility map.
- Push notifications.
- BLE pairing and button event handling.

Exit criteria:

- User can create emergency from app and ESP32.
- User receives responder status notifications.
- BLE source is recorded in backend.

### Release 3: MobileForResponder Flutter MVP

Deliverables:

- Responder registration with credential upload.
- Pending approval screen.
- Login.
- Active emergency map.
- Filters.
- Route display.
- Responder location sharing.
- On-the-way status.
- Response report.

Exit criteria:

- Responder can receive, view and respond to emergency.
- Responder cannot resolve emergency.
- User sees responder marker.

### Release 4: AdminWeb MVP

Deliverables:

- Admin login.
- Approval management.
- Live emergency map.
- Responder tracking.
- Emergency resolution.
- Analytics.
- Records.
- Audit logs.

Exit criteria:

- Admin can approve registrations and resolve emergency.
- Resolved emergency moves to analytics.
- Audit log captures admin actions.

### Release 5: Production hardening

Deliverables:

- CI quality gates.
- Monitoring.
- Crash reporting.
- Database indexes.
- Data retention jobs.
- E2E tests.
- Security review.
- Performance test with 100 active emergencies.

Exit criteria:

- Target health scores achieved.
- Full E2E emergency scenario passes.
- Team can deploy using documented instructions.

---

## 26. Acceptance criteria summary

The system is implementation-ready when:

- MobileForUser is Flutter and can send emergency from UI and ESP32 BLE.
- MobileForResponder is Flutter and can respond without resolving.
- AdminWeb can approve accounts and resolve emergencies.
- ApiServer is the only component connected to MongoDB Atlas.
- OpenStreetMap is used for all map views.
- Routing works through OSM-compatible provider.
- Push notifications work in background.
- Background location and BLE monitoring comply with Android foreground service requirements.
- JWT secrets are secure and not hardcoded.
- All request payloads are validated with Zod.
- `rateLimit` protects sensitive endpoints.
- CORS is restricted.
- Location history is capped, indexed and retained according to policy.
- `any` is removed from production TypeScript.
- Client API calls use timeouts and retry logic.
- Inputs are sanitized.
- Tests cover critical emergency lifecycle.
- Quality target scores are achieved.

---

## 27. Implementation checklist

### Backend

- [ ] Create ApiServer project.
- [ ] Add TypeScript strict mode.
- [ ] Add environment validation.
- [ ] Add MongoDB Atlas connection.
- [ ] Add user, responder, admin and emergency schemas.
- [ ] Add auth routes.
- [ ] Add refresh token rotation.
- [ ] Add role middleware.
- [ ] Add Zod validation middleware.
- [ ] Add rate limit middleware.
- [ ] Add CORS whitelist.
- [ ] Add file upload validation.
- [ ] Add emergency lifecycle service.
- [ ] Add location update service.
- [ ] Add BLE device pairing API.
- [ ] Add facility and route APIs.
- [ ] Add Socket.io rooms and events.
- [ ] Add push notification service.
- [ ] Add analytics aggregations.
- [ ] Add audit logs.
- [ ] Add tests.

### MobileForUser

- [ ] Create Flutter app.
- [ ] Add routing.
- [ ] Add Riverpod.
- [ ] Add Dio API client.
- [ ] Add secure token storage.
- [ ] Add registration flow.
- [ ] Add camera face capture.
- [ ] Add ID upload.
- [ ] Add login and approval gate.
- [ ] Add emergency home.
- [ ] Add emergency confirmation.
- [ ] Add active emergency tracking.
- [ ] Add location service.
- [ ] Add background service.
- [ ] Add OSM map.
- [ ] Add nearby facilities.
- [ ] Add responder tracking.
- [ ] Add BLE pairing.
- [ ] Add BLE event handling.
- [ ] Add push notifications.
- [ ] Add offline queue.
- [ ] Add tests.

### MobileForResponder

- [ ] Create Flutter app.
- [ ] Add registration and credential upload.
- [ ] Add login and approval gate.
- [ ] Add on-duty status.
- [ ] Add live emergency map.
- [ ] Add filters.
- [ ] Add route view.
- [ ] Add responder location sharing.
- [ ] Add on-the-way action.
- [ ] Add response report.
- [ ] Add push notifications.
- [ ] Add proximity alert.
- [ ] Add tests.

### AdminWeb

- [ ] Create React TypeScript app.
- [ ] Add admin login.
- [ ] Add protected routes.
- [ ] Add approval queues.
- [ ] Add document viewer.
- [ ] Add live emergency map.
- [ ] Add responder location layer.
- [ ] Add emergency detail drawer.
- [ ] Add resolve flow.
- [ ] Add analytics.
- [ ] Add records.
- [ ] Add audit log.
- [ ] Add responsive layout.
- [ ] Add tests.

---

## 28. Final development guidance

This PRD intentionally treats the request for direct MongoDB Atlas access from every app as a system requirement to connect to the existing database through the backend, not as direct client-to-database access. Direct MongoDB access from mobile or web clients is not acceptable for production because it exposes credentials and bypasses authorization.

The first development milestone must be the backend contract and security foundation. Flutter apps and AdminWeb should be built against stable API DTOs. The ESP32 BLE device should be integrated through a simulation first, then through real hardware once the GATT contract is confirmed.

---

## A. Design System Appendices

This appendix contains the complete visual design system extracted from the SafeAlert Figma design.

### A.1 Color Palette

| Role | Hex Code | RGBA | Usage |
|------|----------|------|-------|
| Primary Red | `#E52834` | rgba(229, 40, 52, 1) | Emergency actions, danger, critical alerts |
| Primary Blue | `#0A84FF` | rgba(10, 132, 255, 1) | Navigation, responder actions, links |
| Primary Green | `#34C759` | rgba(52, 199, 89, 1) | Safe, resolved, connected states |
| Primary Amber | `#FFB81C` | rgba(255, 184, 28, 1) | Warning, pending, stale states |
| Primary Purple | `#AF52DE` | rgba(175, 82, 222, 1) | Secondary accents, decorative elements |
| Background White | `#FFFFFF` | rgba(255, 255, 255, 1) | Primary content backgrounds |
| Background Gray | `#F5F5F5` | rgba(245, 245, 245, 1) | Secondary backgrounds, cards |
| Background Dark | `#1C1C1E` | rgba(28, 28, 30, 1) | Dark mode backgrounds |
| Text Primary | `#000000` | rgba(0, 0, 0, 1) | Primary text content |
| Text Secondary | `#737373` | rgba(115, 115, 115, 1) | Subtitles, captions, helper text |

### A.2 Typography Scale

| Style | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|--------|
| Title 1 | 34px | Bold | 1.2 | Page headers, major sections |
| Title 2 | 28px | Semibold | 1.3 | Screen headers |
| Title 3 | 22px | Semibold | 1.4 | Section headers |
| Body Large | 18px | Regular | 1.5 | Callouts, labels |
| Body | 17px | Regular | 1.5 | Main content text |
| Body Small | 14px | Regular | 1.4 | Helper text, captions |
| Caption | 12px | Regular | 1.3 | Metadata, hints |

### A.3 Emergency Button Specifications

| Type | Icon | Color | Priority | Hold Timeout |
|------|------|-------|----------|--------------|
| Medical | `medical_services` | Red (`#E52834`) | High | 2 seconds |
| Crime | `security` | Purple (`#AF52DE`) | Critical | 2 seconds |
| Fire | `emergency` | Orange (`#FF9800`) | Critical | 2 seconds |
| General SOS | `call_sos` | Blue (`#0A84FF`) | High | 2 seconds |

**Button Dimensions:**
- Width: 100% of container (minimum 340px)
- Padding: 40px vertical, 32px horizontal
- Border radius: 12px
- Icon size: 64px
- Label font size: 24px

### A.4 Card Specifications

| Card Type | Border Radius | Elevation | Background | Usage |
|-----------|---------------|-----------|------------|-------|
| Emergency Button | 12px | Medium | Type color | Emergency actions |
| Facility Card | 12px | Medium | White | Map results |
| Approval Card | 12px | Medium | White | Pending reviews |
| Emergency Status | 12px | Medium | White | Timeline items |
| Stats Card | 12px | Light | Gray (`#F5F5F5`) | Dashboard |

### A.5 Spacing System

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4px | Tight spacing, icons |
| `sm` | 8px | Compact spacing |
| `md` | 16px | Standard spacing |
| `lg` | 24px | Section spacing |
| `xl` | 32px | Page spacing |
| `2xl` | 48px | Hero spacing |

### A.6 Border Radius System

| Token | Radius | Usage |
|-------|--------|-------|
| `sm` | 4px | Small buttons, chips |
| `md` | 8px | Inputs, standard cards |
| `lg` | 12px | Primary cards, emergency buttons |
| `xl` | 20px | Bottom sheets, modals |
| `full` | 50px | Circles, avatars |

### A.7 Shadow System

| Depth | Blur Radius | Offset Y | Color Alpha | Usage |
|-------|-------------|----------|-------------|-------|
| 1 | 4px | 2px | 8% | Subtle elevation |
| 2 | 8px | 4px | 12% | Medium elevation |
| 3 | 12px | 6px | 16% | Primary elevation |
| 4 | 20px | 12px | 20% | Modal backdrops |

### A.8 Gradient Definitions

| Name | Start Color | End Color | Angle | Usage |
|------|-------------|-----------|-------|-------|
| Primary | `#E52834` | `#AF52DE` | 135deg | Gradients, backgrounds |
| Emergency | `#E52834` | `#9E1B24` | 45deg | Emergency actions |
| Success | `#34C759` | `#84D768` | 90deg | Completed actions |
| Warning | `#FFB81C` | `#FF9800` | 45deg | Warnings, alerts |

---

## B. Screen Layout Standards

### B.1 Mobile App Layout

All mobile screens follow this layout structure:

```
┌─────────────────────────────────────────┐
│  Navigation Drawer (when open)          │
│  ┌─────────────────────────────────────┐│
│  │  [Logo]                             ││
│  │  [User Profile]                     ││
│  │  [Settings]                         ││
│  │  [Help]                             ││
│  │  [Logout]                           ││
│  └─────────────────────────────────────┘│
│           │                              │
├───────────┼──────────────────────────────┤
│           │  [Content Area]              │
│           │  ┌─────────────────────────┐ │
│           │  │ [Top App Bar]           │ │
│           │  ├─────────────────────────┤ │
│           │  │   [Main Content]        │ │
│           │  │                         │ │
│           │  │                         │ │
│           │  │                         │ │
│           │  ├─────────────────────────┤ │
│           │  │   [Bottom Action Bar]   │ │
│           │  └─────────────────────────┘ │
│           │                              │
│           │  Status Bar                  │
└───────────┴──────────────────────────────┘
```

**Content Area Constraints:**
- Max width: 600px (wraps to single column on smaller screens)
- Padding: 16px on sides
- Min height: Full screen minus app bars

### B.2 Admin Web Layout

Admin web follows a sidebar layout:

```
┌──────────────────────────────────────────────────────────────┐
│  [Header Bar]                                                 │
│  ┌─────────────┬─────────────────────────────────────────────┐
│  │             │                                              │
│  │  Sidebar    │                                              │
│  │  Navigation │   [Main Content Area]                       │
│  │             │                                              │
│  │             │                                              │
│  │             │                                              │
│  │             │                                              │
│  └─────────────┴─────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────────┘
```

**Sidebar:**
- Width: 250px (fixed)
- Height: Full screen minus header
- Navigation items: Full height, icon + text

**Header Bar:**
- Height: 56px
- Content: Search bar (left), User menu (right)

**Main Content:**
- Flex grow: 1
- Padding: 24px
- Min height: 0 (fills remaining space)

### B.3 Responsive Breakpoints

| Breakpoint | Width | Layout Behavior |
|------------|-------|-----------------|
| `xs` | < 576px | Single column, bottom nav |
| `sm` | 576-768px | Single column, hamburger nav |
| `md` | 768-1024px | Two columns where appropriate |
| `lg` | 1024-1280px | Standard sidebar |
| `xl` | > 1280px | Full sidebar, multi-column |

---

## C. Component Implementation Examples

### C.1 Flutter Theme Setup

```dart
// lib/theme/safe_alert_theme.dart
import 'package:flutter/material.dart';

class SafeAlertTheme {
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: Colors.red,
        brightness: Brightness.light,
      ),
      appBarTheme: const AppBarTheme(
        centerTitle: true,
        elevation: 0,
        backgroundColor: Colors.white,
        titleTextStyle: TextStyle(
          color: Colors.black,
          fontSize: 20,
          fontWeight: FontWeight.w600,
        ),
      ),
      cardTheme: CardTheme(
        elevation: 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.grey[100],
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide.none,
        ),
        contentPadding: EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 16,
        ),
      ),
    );
  }
}
```

### C.2 Emergency Button Component

```dart
// lib/components/emergency_button.dart
import 'package:flutter/material.dart';

enum EmergencyType {
  medical('Medical', Colors.red, Icons.medical_services),
  crime('Crime', Colors.purple, Icons.security),
  fire('Fire', Colors.orange, Icons.emergency),
  sos('General SOS', Colors.blue, Icons.call_sos);

  const EmergencyType(
    this.label,
    this.color,
    this.icon,
  );

  final String label;
  final Color color;
  final IconData icon;
}

class EmergencyButton extends StatelessWidget {
  final EmergencyType type;
  final VoidCallback onPressed;
  final bool isLoading;

  const EmergencyButton({
    super.key,
    required this.type,
    required this.onPressed,
    this.isLoading = false,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _showConfirmationDialog,
      onLongPress: () {
        _startHoldTimer();
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 32),
        decoration: BoxDecoration(
          color: type.color,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: type.color.withValues(alpha: 0.3),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              type.icon,
              size: 64,
              color: Colors.white,
            ),
            const SizedBox(height: 12),
            Text(
              type.label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  void _showConfirmationDialog() {
    showModalBottomSheet(
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Trigger $type Emergency?',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 16),
              Text(
                'Your location will be shared with the nearest responders.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => Navigator.pop(context),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      icon: const Icon(Icons.cancel, size: 20),
                      label: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () {
                        Navigator.pop(context);
                        onPressed();
                      },
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      icon: const Icon(Icons.send, size: 20),
                      label: const Text('Send'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

### C.3 Status Badge Widget

```dart
// lib/widgets/status_badge.dart
import 'package:flutter/material.dart';

enum EmergencyStatus {
  sent,
  awaitingResponder,
  responderAssigned,
  responderOnTheWay,
  responderNearby,
  responseSubmitted,
  resolved;

  Color get badgeColor {
    switch (this) {
      case sent:
      case awaitingResponder:
        return Colors.amber;
      case responderAssigned:
      case responderOnTheWay:
      case responderNearby:
        return Colors.green;
      case responseSubmitted:
        return Colors.grey;
      case resolved:
        return Colors.green;
    }
  }

  IconData get icon {
    switch (this) {
      case sent:
      case awaitingResponder:
        return Icons.hourglass_empty;
      case responderAssigned:
        return Icons.local_police;
      case responderOnTheWay:
      case responderNearby:
        return Icons.location_on;
      case responseSubmitted:
        return Icons.check;
      case resolved:
        return Icons.check_circle;
    }
  }

  String get label => '';
}

class StatusBadge extends StatelessWidget {
  final EmergencyStatus status;

  const StatusBadge({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: status.badgeColor.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: status.badgeColor,
          width: 1,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            status.icon,
            size: 14,
            color: status.badgeColor,
          ),
          const SizedBox(width: 6),
          Text(
            status.label,
            style: TextStyle(
              color: status.badgeColor,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
```

---

## D. Design Do's and Don'ts

### Do:
- Use large, clearly labeled emergency buttons
- Show status with both color and text/icon
- Provide clear feedback on button presses
- Use bottom sheets for confirmations
- Keep emergency actions thumb-reachable
- Show loading states for all async operations

### Don't:
- Don't use color alone to convey status
- Don't hide critical information
- Don't use destructive colors for non-critical actions
- Don't make touch targets smaller than 44x44px
- Don't use animations that could confuse in emergencies
- Don't rely on text-only labels for icons

---

**Appendix End**
