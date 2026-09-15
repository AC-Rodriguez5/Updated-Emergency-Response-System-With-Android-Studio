# SafeAlert Emergency Lifecycle, API, Real-Time and Notifications PRD

**Purpose:** Defines emergency statuses, allowed transitions, API standards, required endpoints, WebSocket events and push notifications.

**Included sections:** Sections 9.8, 10 and 14

> Source: SafeAlert Emergency Response System Production PRD, Version 2.0, dated May 4, 2026.
> This file was split from the original master PRD for cleaner implementation ownership.

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
