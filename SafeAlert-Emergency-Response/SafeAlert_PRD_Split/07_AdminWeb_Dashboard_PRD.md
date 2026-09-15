# SafeAlert AdminWeb Dashboard PRD

**Purpose:** Defines admin dashboard modules, approval queues, live emergency monitoring, responder tracking, resolution, analytics and records.

**Included sections:** Section 9.7

> Source: SafeAlert Emergency Response System Production PRD, Version 2.0, dated May 4, 2026.
> This file was split from the original master PRD for cleaner implementation ownership.

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
