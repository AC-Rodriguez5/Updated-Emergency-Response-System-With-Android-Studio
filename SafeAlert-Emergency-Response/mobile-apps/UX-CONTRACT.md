# Mobile interaction contract

Source: production PRDs 03, 04, 05, 06, 08, 09 and 14. The API enforces identity, dispatch scope, lifecycle and ownership; UI does not grant permissions.

| Capability | Canonical owner | Behavior |
|---|---|---|
| Form | `shared/lib/src/ui.dart` / Material Form | Labelled required fields, inline validation, values retained on error; duplicate submits disabled |
| Select/Listbox | Material DropdownButtonFormField | Authored Material popup, same options on both apps |
| Date | Material showDatePicker / typed report timestamp | Local Gregorian dates; ISO date-only for birth and UTC for event timestamps |
| Scrollbar | Material ScrollbarTheme | Visible scroll affordance; body owns natural scroll |
| Toast | Shared ScaffoldMessenger and inline feedback | Critical failure remains in screen; snackbar only secondary acknowledgement |
| CRUD | Shared controller and API | Server acknowledgement precedes success; 409 refreshes server state |
| Confirmation | Shared Material modal bottom sheet | Explicit action, cancel available, emergency tap confirms; hold for two seconds submits |

App launch restores a session and existing incidents, never creates an SOS. Encrypted queued attempts are keyed by account, persisted before sending, and reuse the same idempotency key. Manual attempts older than ten minutes require send/discard review; BLE attempts remain queued until delivered or explicitly discarded. Uncertain deliveries are reconciled before creating another incident. Cancelling an incident requires a server response and is only offered to users in pending state.

Both apps show loading, empty and retry states. Emergency details show current status, last server update, GPS freshness, route errors and timeline. Live notifications trigger authenticated REST reconciliation; polling runs only while sockets are disconnected. User location tracking exists only with an active incident; responder tracking while on duty or actively assigned. BLE monitoring requires explicit opt-in and a foreground service notification. Logging out stops platform services and unregisters push tokens.

Registration creates a pending account, uses session-scoped private document uploads and camera-only face capture. Required location-processing consent is obtained in registration. Secrets and queue contents use Android encrypted storage. Offline state and background monitoring failures are visible. Hardware, FCM delivery and real navigation require physical-device release verification.
