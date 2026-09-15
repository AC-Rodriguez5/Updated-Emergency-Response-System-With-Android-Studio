# ESP32 panic button

Build with `pio run`; flash only a verified ESP32 board with `pio run --target upload`.
This maintained PlatformIO project replaces the unconfigured reference at backend/src/main.cpp.
Pins 18/19/21/22 are Medical/Crime/Fire/General SOS buttons wired to ground with internal pullups. Verify wiring before flashing.

The config characteristic exposes deviceId and firmwareVersion and accepts `{"ackEventId":"..."}`. The phone acknowledges **only after encrypted local persistence**, not after seeing a notification. The device retains up to 16 events in NVS and replays the oldest every two seconds until acknowledged. Boot counter plus sequence makes event IDs stable across reconnects and distinct after restart. Backend deduplication provides the final receipt. BLE notification payloads require MTU247; the Android client negotiates MTU on connection.

Holding a button generates one event; releasing and pressing again after one second generates another. BLE disconnection does not erase the pending queue. The prototype reports queue/full or storage failures through Serial; a physical fault indicator and enclosure validation are release hardware gates. Battery reporting is disabled until the actual divider/cell curve has been calibrated; no dummy percentage is emitted.

Device identity is checked against the account's server binding, but this prototype does not implement cryptographic device attestation or an authenticated manufacturing/provisioning flow. Validate pairing security for the deployment environment before field release. Physical tests must cover all buttons, reboot, full queue, power interruption, phone background/lock, Bluetooth loss, and server/network failure. No hardware was flashed automatically.
