# TanzAlert

Emergency Response System for the Tanza Municipal Disaster Risk Reduction and Management Office (MDRRMO), Cavite.

Four components:

| Component | Path | Stack |
|---|---|---|
| Backend API | `backend/` | Node.js + Express + TypeScript + Mongoose + Socket.IO |
| Admin dashboard | `web/` | React 18 + Vite + Tailwind + TanStack Query + React Router |
| User mobile app | `MobileAppFlutter/mobileUser/` | Flutter + Riverpod + BLE |
| Responder mobile app | `MobileAppFlutter/mobileResponder/` | Flutter + Riverpod + flutter_map |

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
