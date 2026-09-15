# SafeAlert Testing, CI, Release and Implementation Checklist PRD

**Purpose:** Defines test coverage, CI quality gates, release plan, acceptance summary, implementation checklist and final development guidance.

**Included sections:** Sections 23 to 28

> Source: SafeAlert Emergency Response System Production PRD, Version 2.0, dated May 4, 2026.
> This file was split from the original master PRD for cleaner implementation ownership.

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

---

## 28. Final development guidance

This PRD intentionally treats the request for direct MongoDB Atlas access from every app as a system requirement to connect to the existing database through the backend, not as direct client-to-database access. Direct MongoDB access from mobile or web clients is not acceptable for production because it exposes credentials and bypasses authorization.

The first development milestone must be the backend contract and security foundation. Flutter apps and AdminWeb should be built against stable API DTOs. The ESP32 BLE device should be integrated through a simulation first, then through real hardware once the GATT contract is confirmed.

---
