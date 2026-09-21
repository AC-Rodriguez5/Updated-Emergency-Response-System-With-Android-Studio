# TanzAlert ESP32 firmware

This firmware targets an ESP32 DevKit, R502S-A fingerprint reader, a single emergency button and LED, and a SIM7670/A7670 carrier board. It sends exact GNSS coordinates over BLE to the authenticated Flutter app. A stable event ID is stored in NVS before delivery, so BLE reconnects and LTE retries cannot create a second incident.

Build with:

```powershell
python -m platformio run -d firmware/esp32
```

Flash only after checking every connection in [WIRING.md](WIRING.md):

```powershell
python -m platformio run -d firmware/esp32 -t upload
```

Pair from the Flutter app while logged in and approved. The server issues a rotated device token during pairing; the app transfers it to the ESP32 without retaining a phone copy. Fingerprint enrollment captures the same finger twice into sensor slot 1.

Direct LTE delivery is deliberately provisioned only when the app is built with an HTTPS API URL, a cellular APN, and `MODEM_TLS_VALIDATED=true`. Before enabling it, configure and verify the exact carrier/firmware SSL profile against your production certificate. BLE-to-phone delivery remains available while LTE is disabled.

Example Flutter build values:

```powershell
flutter run --dart-define=API_BASE_URL=https://api.example.com/api --dart-define=CELLULAR_APN=internet --dart-define=MODEM_TLS_VALIDATED=false
```

The R502S-A is configured for its usual 57,600 baud default. The modem UART is configured for 115,200 baud; change it in `src/main.cpp` if your carrier uses another rate.

Before deploying the backend migration, restore a production backup into an isolated database and run `npm run hardware:migration:check` from `backend`. Resolve every duplicate device ID it reports before allowing Mongoose to create the new global unique index. The check is read-only.
