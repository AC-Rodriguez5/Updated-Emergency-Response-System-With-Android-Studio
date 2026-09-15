# SafeAlert MobileForResponder PRD

**Purpose:** Defines responder emergency map, filtering, route guidance, location sharing, on-the-way status and response reports.

**Included sections:** Section 9.6

> Source: SafeAlert Emergency Response System Production PRD, Version 2.0, dated May 4, 2026.
> This file was split from the original master PRD for cleaner implementation ownership.

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
