# TanzAlert

Emergency Response System for the Tanza Municipal Disaster Risk Reduction and Management Office (MDRRMO), Cavite.

Five components:

| Component | Path | Stack |
|---|---|---|
| Backend API | `backend/` | Node.js + Express + TypeScript + Mongoose + Socket.IO |
| Admin dashboard | `web/` | React 18 + Vite + Tailwind + TanStack Query + React Router |
| User mobile app | `MobileAppFlutter/mobileUser/` | Flutter + Riverpod + BLE |
| Responder mobile app | `MobileAppFlutter/mobileResponder/` | Flutter + Riverpod + flutter_map |
| Panic-button wearable | `firmware/esp32/` | ESP32-C6 + R502S-A fingerprint + NEO-6M GNSS + SIM7670/A7670 |

## The panic-button wearable

A fingerprint scan followed by a button tap raises one incident against the account the
device is paired to. See [`WIRING.md`](WIRING.md) for the breadboard build and
[`firmware/esp32/README.md`](firmware/esp32/README.md) for the full chain, in short:

- **The alert does not wait for GPS.** It is sent on the button release; a cold GNSS start
  takes minutes. The incident reaches the dashboard immediately, marked **Waiting for GPS**.
- **The incident carries the sender's registered details** — the same name, age, blood type,
  address and emergency contact the account registered with — resolved server-side from the
  device token, so the device never has to carry or transmit them.
- **The device then streams its position** into that same incident, roughly every 10 seconds,
  until a dispatcher resolves it. The first fix fills in the location and the map pin appears;
  it never creates a second incident.

Device-facing routes (device-token auth, no user session):

| Route | Purpose |
|---|---|
| `POST /api/device/emergencies` | Raise the alert. `location` is optional. |
| `POST /api/device/emergencies/location` | One streamed fix. Answers `tracking: false` once the incident is closed, which is how the stream ends. |

### Fleet view

**Devices** in the admin sidebar (`GET /api/admin/devices`) lists every paired
wearable with its owner, link status, last contact, battery, firmware, delivery path,
and whether it is currently streaming an incident. The Overview page carries a
matching tile that links to it.

Two columns answer different questions, and the distinction matters:

- **Status / Last seen** — when the backend last heard from the device. A panic
  button only contacts the server by itself when it has an alert to send, so the
  owner's phone relays a Bluetooth check-in every two minutes
  (`POST /api/user/ble-devices/:id/checkin`) to keep this meaningful. Online means
  seen within five minutes. **A device can be powered and healthy and still read
  Offline** because the owner's phone has not been near it or the app is not
  running — the page says so in as many words.
- **Readiness** — whether the device would work if pressed *right now*. The case
  worth watching for is `not_enrolled`: a paired wearable with no fingerprint
  template physically cannot raise an alert, because the firmware requires a
  verified finger before it accepts the button. Nothing else in the system would
  reveal that until someone pressed it in an emergency, so it is counted on the
  Overview tile and filterable with **Needs attention only**.

The same two steps are available to the paired phone as `POST /api/emergencies/from-iot` and
`POST /api/emergencies/from-iot/location`, for a wearable with no cellular service of its own.
Both paths carry the same event ID, so a press delivered over both still produces one incident.

### Enabling direct cellular delivery

Any HTTPS API URL turns this on, so the standard dev launch already does it — then
**re-pair the wearable** so the settings reach it:

```powershell
.\run-mobile-user.ps1 -CaFile ca.pem
```

**No APN configuration is needed for any ordinary Philippine SIM.** The firmware reads
the SIM's home network from its IMSI and picks the APN: Globe, TM and GOMO get
`internet.globe.com.ph`; Smart and TNT get `internet`; DITO gets `internet.dito.ph`;
Sun gets `minternet`. An unlisted MVNO falls through to a candidate walk — blank APN
first, since most current LTE SIMs let the network assign one — and whatever works is
remembered across reboots. Pass `-Apn <name>` only to override a private APN.

`-CaFile` names a root CA already loaded into the modem's own filesystem with
`AT+CCERTDOWN`. With it, the wearable verifies the backend's certificate. Without it,
traffic is still encrypted but the server is not authenticated, which exposes the
device token to a man-in-the-middle — the firmware says so on every boot and the
pairing screen shows the row as not-ready. See
[`firmware/esp32/README.md`](firmware/esp32/README.md#direct-cellular-delivery) for how
to load the CA, the full carrier table, and the `l` / `a` / `c` / `t` serial checks that
bring this up. `t` is the acceptance test: it posts to `/api/health` over cellular and
tells you whether a button press would reach dispatch with the phone switched off.

Mobile apps reach the backend over a Cloudflare quick tunnel so a physical phone (not on the dev laptop's LAN) can hit `localhost:5000` during development.

## Prerequisites

- Node.js 18+
- Flutter 3.47+ (Dart 3.13+) — verified on 3.47.0; the Android build targets AGP 9.1, which older Flutter releases reject
- JDK 24 or newer — the Android modules compile at Java 24, so an older JDK fails with `invalid source release: 24`.
  Android Studio's bundled JBR 25 is what this repo is verified against; point Flutter at it with:
  `flutter config --jdk-dir="C:\Program Files\Android\Android Studio\jbr"`
- Android SDK + a device with USB debugging enabled
- MongoDB Atlas cluster (or any MongoDB instance)
- Windows Developer Mode enabled (Flutter plugin builds need symlink support)

### Android toolchain

Both Flutter apps (`MobileAppFlutter/mobileUser`, `MobileAppFlutter/mobileResponder`) pin the same versions:

| Component | Version |
|---|---|
| Gradle wrapper | 9.7.0 |
| Android Gradle Plugin | 9.1.0 |
| Kotlin Gradle Plugin | 2.4.0 |
| Java source/target + Kotlin `jvmTarget` | 24 |
| `desugar_jdk_libs` | 2.1.5 |

Kotlin's JVM target is set through the KGP `kotlin { compilerOptions { } }` block rather than the
deprecated `android { kotlinOptions { } }` DSL, which Kotlin 2.x no longer accepts.

## First-time setup

**1. Backend env**

Copy `backend/.env.example` to `backend/.env` and fill in:

- `MONGODB_URI` — full connection string with username, password, and database name
- `JWT_SECRET` and `JWT_REFRESH_SECRET` — 32+ random chars each (generate with `openssl rand -base64 48`)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` — seeded on backend boot

**2. Install deps**

```powershell
# Backend
cd backend
npm install

# Admin web
cd ../web
npm install

# Flutter apps
cd ../MobileAppFlutter/mobileUser
flutter pub get
cd ../mobileResponder
flutter pub get
```

**3. Cloudflare tunnel binary**

Download `cloudflared.exe` from https://github.com/cloudflare/cloudflared/releases/latest and place it at `tools/cloudflared.exe`.

## Running the system

Each script opens a long-running process — run in separate terminals.

**Terminal 1 — Backend**
```powershell
.\start-backend.bat
```
Listens on `http://localhost:5000`. Seeds the admin account on first boot.

**Terminal 2 — Cloudflare tunnel**
```powershell
.\start-tunnel.ps1
```
Writes the public URL to `tunnel-url.txt`. The mobile app run scripts read this file.

**Terminal 3 — Admin dashboard**
```powershell
cd web
npm run dev
```
Opens at `http://localhost:5173/`. Vite proxies `/api` and `/socket.io` to `localhost:5000`.

**Terminal 4 — User mobile app** (after tunnel is up)
```powershell
.\run-mobile-user.ps1
```

**Terminal 5 — Responder mobile app** (after tunnel is up)
```powershell
.\run-mobile-responder.ps1
```

Both scripts inject the tunnel URL as `--dart-define=API_BASE_URL=…` and pick the first connected device. If multiple devices are attached, pass `-d <deviceId>` yourself.

## Notes

- **Tunnel URL rotates** on each restart. Re-run the mobile launch scripts after restarting the tunnel so the new URL is baked in.
- **Admin credentials** live in `backend/.env` (never commit). The backend re-seeds the admin on every dev boot.
- **Mongo database name** is set in the URI's path (e.g. `.../tanzalert?...`).
- **Android package IDs**: `com.tanzalert.mobile_user`, `com.tanzalert.mobile_responder`.
- **Type checks**: `npm run typecheck` in `backend/` and `web/`. `flutter analyze` in each Flutter app.
