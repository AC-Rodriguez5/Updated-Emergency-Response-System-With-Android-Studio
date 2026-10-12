# TanzAlert ESP32 firmware

This firmware targets an **ESP32-C6-DevKitC-1**, R502S-A fingerprint reader, GY-NEO6MV2 GNSS receiver, a single emergency button and LED, and a SIM7670/A7670 carrier board. The C6 needs Arduino core 3.x, which PlatformIO gets from the pioarduino platform fork - the official espressif32 platform ships core 2.x and does not support the C6 at all. The console runs over the board's **native USB port**, not the UART bridge port, so that UART0 is free for the scanner, UART1 for the GNSS receiver, and the low-power UART for the modem. A stable event ID is stored in NVS before delivery, so BLE reconnects and LTE retries cannot create a second incident.

## How one press becomes an incident

1. **Scan the enrolled finger.** Three LED pulses, and a 30-second authorisation window opens.
2. **Tap the button inside that window.** The alert is written to NVS and sent immediately - one LED pulse. It does *not* wait for satellites: a cold GNSS start takes minutes and a victim cannot stand still through one.
3. The backend files the incident against the **account this device is paired to**, copying that account's registered details (name, age, blood type, address, emergency contact) onto the incident, and pushes it to the admin dashboard. With no fix yet it is marked **Waiting for GPS**.
4. The device then **streams its position about every 10 seconds into that same incident** until a dispatcher resolves it. The first valid fix fills in the location and the map pin appears.
5. Each accepted delivery answers with a revision number, which the device logs as `Server confirmed <id> revision <n>` and signals with three pulses.

The stream ends only on an explicit server reply saying the incident is closed. A dropped reply leaves the device transmitting rather than going quiet on a live alert, and the active event ID survives a reset so a brown-out mid-incident resumes streaming on boot.

Delivery takes whichever paths are available. Over LTE the device posts straight to `/api/device/emergencies` and `/api/device/emergencies/location` with its own device token. Over BLE it notifies the paired phone, which relays to `/api/emergencies/from-iot` and `/api/emergencies/from-iot/location` and writes the server's answer back to the device. Both paths carry the same event ID, so a press delivered twice still produces exactly one incident.

Build with:

```powershell
python -m platformio run -d firmware/esp32
```

Flash only after checking every connection in [WIRING.md](WIRING.md). Plug the cable into the
board's native **USB** port (Windows lists it as `USB Serial Device (COMx)`), not the `COM`/UART
bridge port, so the same cable serves upload and the serial monitor:

```powershell
python -m platformio run -d firmware/esp32 -t upload
python -m platformio run -d firmware/esp32 -t monitor
```

Uploading does not erase NVS, so a device that was already paired keeps its device token,
`provisioned` flag and fingerprint-enrolled flag across re-flashes. Run
`python -m platformio run -d firmware/esp32 -t erase` first if you want a factory-fresh device
(the sensor's stored fingerprint template lives in the sensor, not in NVS, and is unaffected).

The boot banner on the monitor shows the firmware version, `deviceId`, whether the fingerprint
sensor answered, the pin map the binary was built with, and the live button level. If the sensor
line says `NOT RESPONDING`, fix wiring before anything else.

Single keys typed into the monitor run built-in hardware checks without recompiling: `p` for pad
levels, `b` for a button test, `f` to hunt for the scanner across baud rates and swapped wires,
`m` for a modem AT test, and `g` for a GNSS check. See [WIRING.md](WIRING.md) for what each
result means. `g` is the one that separates the two GNSS faults that look identical from the
app: no NMEA bytes at all means the receiver is unwired or unpowered, while bytes without a fix
means the wiring is right and it is still searching.

`deviceId` is the chip's full 6-byte factory MAC. Earlier firmware derived it from the low half
of the C6's EUI-64, which is the Espressif OUI plus filler and therefore identical on every
ESP32-C6, so a fleet of wearables would all have claimed the same identity. Any device paired
under the old scheme has to be paired again once.

Pair from the Flutter app while logged in and approved. The server issues a rotated device token during pairing; the app transfers it to the ESP32 without retaining a phone copy. Fingerprint enrollment captures the same finger twice into sensor slot 1.

## Direct cellular delivery

With this on, the wearable posts alerts and GPS fixes to the backend **itself** over
LTE, using its own device token. The phone is no longer in the delivery path — it is
only needed to pair and to enroll a finger. BLE relay stays available as a fallback,
and both paths carry the same event ID so a press delivered over both still produces
exactly one incident.

Two things have to be true, and both come from the app's build:

| Dart define | Effect |
|---|---|
| `API_BASE_URL` | Must be `https://…`. The firmware refuses plaintext outright. |
| `CELLULAR_APN` | Your carrier's APN. Empty means direct delivery stays off. |
| `MODEM_CA_FILE` | Optional, but see below. Filename of a root CA **already on the modem**. |

```powershell
# From the repo root, with .\start-tunnel.ps1 already running:
.\run-mobile-user.ps1 -Apn internet -CaFile ca.pem
```

Then **re-pair the wearable** — the APN, API URL and CA filename all reach it in the
pairing write, so a device paired before this change keeps its old settings until it
is paired again.

### Loading the CA, and what happens without one

`MODEM_CA_FILE` names a certificate in the **modem's own filesystem**, not a file in
this repo — a PEM will not fit in a BLE write. Load it once over the modem's AT
interface; it survives reboots.

```
AT+CCERTDOWN="ca.pem",1939     <- byte length of the PEM that follows
-----BEGIN CERTIFICATE-----
...                             <- end the command line with CRLF, each PEM line with LF
-----END CERTIFICATE-----
AT+CCERTLIST                    <- confirm: +CCERTLIST: "ca.pem"
```

Use the root CA that signs your API's certificate. For a Cloudflare tunnel in
development that is ISRG Root X1 (Let's Encrypt).

With a CA provisioned, the firmware sets `AT+CSSLCFG="authmode",0,1` and verifies the
server. **Without one it falls back to `authmode 0`:** traffic is still encrypted, but
the server is not authenticated, so a man-in-the-middle could read this device's
bearer token and impersonate it. The firmware logs that on every boot, the boot banner
says `NOT VERIFIED`, and the app's pairing screen shows the row as not-ready rather
than green. Fine for a bench run; close it before deploying.

SNI is enabled unconditionally (`AT+CSSLCFG="enableSNI",0,1`). Without it a
shared-IP host — Cloudflare, most PaaS — serves the wrong certificate and the
handshake fails in a way that reads like a CA problem.

### Bringing it up

The data bearer and the SSL context are configured once per boot and cached, because
an open incident posts a fix every 10 seconds and re-dialling each time would add
seconds to every position update. A failed request drops the cached bearer so the next
attempt re-dials.

Three serial keys exist for exactly this, in the order you want them:

| Key | Use |
|---|---|
| `l` | LTE preflight: `CPIN`, `CSQ`, `CREG`, `CPSI`, `CGACT`, plus what was provisioned. Direct delivery fails at one of these and the HTTP error never says which. |
| `c` | Lists the modem's certificates and compares them against the provisioned filename. "No CA loaded" and "wrong filename provisioned" fail the handshake identically; this is the only way to tell them apart. |
| `t` | One-shot `GET <apiBase>/health` over cellular. Proves bearer, TLS, DNS and the backend end to end without pressing the button and raising a real incident. |

`t` is the acceptance test. If it prints `direct LTE delivery works end to end`, a
button press will reach dispatch with the phone switched off. A 7xx code there is a
TLS or network error rather than an HTTP status — check `c` next, and confirm the API
host matches the certificate it actually serves.

The R502S-A is configured for its usual 57,600 baud default. The NEO-6M is read at its 9,600 baud default and is never configured by the firmware. The modem UART is configured for 115,200 baud; change it in `src/main.cpp` if your carrier uses another rate. The modem sits on the C6's low-power UART, whose pads are fixed at GPIO 4/5 - a `static_assert` refuses to build if those two constants are edited, because a relocated LP_UART produces a modem that never answers and looks exactly like a wiring fault.

Before deploying the backend migration, restore a production backup into an isolated database and run `npm run hardware:migration:check` from `backend`. Resolve every duplicate device ID it reports before allowing Mongoose to create the new global unique index. The check is read-only.
