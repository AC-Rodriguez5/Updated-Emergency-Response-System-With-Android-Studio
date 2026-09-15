# SafeAlert MobileForUser Emergency and Facilities PRD

**Purpose:** Defines user emergency submission, active emergency tracking, location sharing, maps and nearby emergency facilities.

**Included sections:** Sections 9.3 and 9.5

> Source: SafeAlert Emergency Response System Production PRD, Version 2.0, dated May 4, 2026.
> This file was split from the original master PRD for cleaner implementation ownership.

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
