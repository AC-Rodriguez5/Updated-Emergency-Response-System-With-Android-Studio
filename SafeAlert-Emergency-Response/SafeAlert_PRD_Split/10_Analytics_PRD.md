# SafeAlert Analytics PRD

**Purpose:** Defines operational analytics events, admin analytics metrics, charts and acceptance criteria.

**Included sections:** Section 15

> Source: SafeAlert Emergency Response System Production PRD, Version 2.0, dated May 4, 2026.
> This file was split from the original master PRD for cleaner implementation ownership.

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
