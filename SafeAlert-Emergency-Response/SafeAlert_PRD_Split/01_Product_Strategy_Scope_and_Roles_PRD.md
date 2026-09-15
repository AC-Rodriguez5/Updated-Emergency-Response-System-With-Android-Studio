# SafeAlert Product Strategy, Scope and Roles PRD

**Purpose:** Defines the product vision, objectives, quality targets, scope boundaries and user roles.

**Included sections:** Original preamble, Sections 1 to 5

> Source: SafeAlert Emergency Response System Production PRD, Version 2.0, dated May 4, 2026.
> This file was split from the original master PRD for cleaner implementation ownership.

---

# SafeAlert Emergency Response System Production PRD

**Version:** 2.0  
**Date:** May 4, 2026  
**Status:** Implementation-ready product and technical specification  
**Target stack:** Flutter mobile apps, React TypeScript admin web, Node.js TypeScript backend, MongoDB Atlas, OpenStreetMap and ESP32 BLE panic button  
**Primary goal:** Replace the current React Native or Expo-based implementation with a production-grade Flutter mobile architecture, add a web admin panel and integrate a real ESP32 Bluetooth panic button while closing known security, performance, maintainability, testability and type-safety gaps.

---

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
