# SafeAlert Security, Performance, Reliability and Privacy PRD

**Purpose:** Defines security hardening, performance targets, data retention, retry behavior, background behavior and privacy controls.

**Included sections:** Sections 11, 12, 13, 21 and 22

> Source: SafeAlert Emergency Response System Production PRD, Version 2.0, dated May 4, 2026.
> This file was split from the original master PRD for cleaner implementation ownership.

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
