# SafeAlert System Architecture, Tech Stack and Migration PRD

**Purpose:** Defines the target system architecture, repository structure, technology decisions and React Native or Expo to Flutter migration path.

**Included sections:** Sections 6 to 8

> Source: SafeAlert Emergency Response System Production PRD, Version 2.0, dated May 4, 2026.
> This file was split from the original master PRD for cleaner implementation ownership.

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
