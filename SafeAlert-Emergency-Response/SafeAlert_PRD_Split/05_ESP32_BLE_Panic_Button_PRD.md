# SafeAlert ESP32 BLE Panic Button PRD

**Purpose:** Defines BLE hardware behavior, GATT service contract, pairing, background monitoring and IoT screen requirements.

**Included sections:** Section 9.4

> Source: SafeAlert Emergency Response System Production PRD, Version 2.0, dated May 4, 2026.
> This file was split from the original master PRD for cleaner implementation ownership.

---

## 9.4 ESP32 BLE panic button integration

### Hardware requirements

BLE-001: The ESP32 device shall contain:

- 1 on/off switch
- 4 physical buttons: Medical, Crime, Fire and General SOS
- Battery monitoring circuit or firmware-estimated battery level
- BLE advertising capability
- Unique device ID
- Firmware version

BLE-002: The device shall advertise as `SafeAlert-Panic-XXXX`, where `XXXX` is the last 4 characters of device ID.

BLE-003: The device shall use Bluetooth Low Energy, not Classic Bluetooth.

### GATT service requirements

BLE-004: The device shall expose a custom SafeAlert service.

Recommended UUIDs:

```text
SafeAlert Service UUID:
9f4d0001-7d6a-4b85-9e74-2f4d8e8d0001

Button Event Characteristic UUID:
9f4d0002-7d6a-4b85-9e74-2f4d8e8d0002
Properties: Notify, Read

Battery Characteristic UUID:
00002a19-0000-1000-8000-00805f9b34fb
Properties: Read, Notify

Heartbeat Characteristic UUID:
9f4d0003-7d6a-4b85-9e74-2f4d8e8d0003
Properties: Notify

Device Config Characteristic UUID:
9f4d0004-7d6a-4b85-9e74-2f4d8e8d0004
Properties: Write, Read
```

### Button event format

BLE-005: Button event shall be a compact JSON payload or binary payload. JSON is acceptable for MVP.

JSON payload:

```json
{
  "deviceId": "SA-ESP32-000001",
  "eventId": "deviceId-sequenceNo",
  "sequenceNo": 1024,
  "button": "medical",
  "battery": 87,
  "firmwareVersion": "1.0.0",
  "deviceTimestamp": 1730000000000
}
```

Allowed button values:

- `medical`
- `crime`
- `fire`
- `general_sos`

BLE-006: Device firmware shall debounce button presses by at least 1000 ms.

BLE-007: Flutter app shall deduplicate BLE events by `eventId`.

BLE-008: Flutter app shall reject events from unpaired device IDs.

BLE-009: BLE event shall trigger the same emergency flow as pressing the in-app button.

BLE-010: If the phone is offline, app shall queue the emergency event locally and send it when connection returns.

BLE-011: If location is unavailable when BLE event arrives, app shall use last known location only if it is not older than 60 seconds and mark `locationFreshness` as `last_known`.

BLE-012: If no usable location is available, app shall create a local pending emergency attempt and notify the user to enable location. The app must keep retrying location acquisition using exponential backoff while the foreground service is active.

### Pairing requirements

BLE-013: User shall pair device from IoT Device screen.

BLE-014: App shall scan only for devices advertising the SafeAlert service UUID.

BLE-015: App shall show discovered devices with name, signal strength and device ID.

BLE-016: App shall bind one device to one user account unless admin resets binding.

BLE-017: Pairing shall register device ID with backend.

BLE-018: Backend shall store:

- User ID
- Device ID
- Device name
- Firmware version
- Last paired timestamp
- Last seen timestamp
- Battery level
- Status

BLE-019: Re-pairing a device already bound to another user shall require admin reset or ownership verification.

### Background BLE requirements

BLE-020: MobileForUser shall run a foreground service when BLE monitoring is enabled.

BLE-021: Android notification shall state that SafeAlert is monitoring the panic button.

BLE-022: App shall attempt reconnection with exponential backoff.

BLE-023: Reconnection backoff schedule shall be 1s, 2s, 4s, 8s, 16s and max 60s with jitter.

BLE-024: App shall show disconnected state if heartbeat is missed for more than 30 seconds.

BLE-025: App shall notify user if battery is below 20 percent.

### User app IoT screen requirements

Display:

- Connection status
- Device name
- Device ID
- Battery level
- Last button test
- Pair or unpair action
- Manual test action
- Firmware version

### Acceptance criteria

- App discovers ESP32 only when Bluetooth and location permissions are granted.
- App pairs with device and stores binding in backend.
- Pressing Medical physical button creates a Medical emergency.
- Pressing Crime physical button creates a Crime emergency.
- Pressing Fire physical button creates a Fire emergency.
- Pressing General SOS physical button creates a General SOS emergency.
- BLE event works while app is backgrounded and foreground service is active.
- Duplicate BLE button event does not create duplicate emergency.
- Disconnected device is shown within 30 seconds of heartbeat loss.
- Battery level updates in app within 10 seconds of BLE notification.
- Unknown device events are ignored and logged locally.

---
