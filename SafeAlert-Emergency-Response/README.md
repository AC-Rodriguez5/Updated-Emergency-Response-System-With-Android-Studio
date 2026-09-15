# SafeAlert

The maintained system uses a TypeScript backend, React AdminWeb, Flutter User and Flutter Responder, with an ESP32 panic-button prototype.

Start with [IMPLEMENTATION.md](IMPLEMENTATION.md) for setup and implemented workflows, [mobile-apps/README.md](mobile-apps/README.md) for Android, and [docs/OPERATIONS.md](docs/OPERATIONS.md) for backup-first migration and production release gates.

Install dependencies independently in `backend/` and `admin-web/` with `npm ci`. At this root, `npm run dev` starts AdminWeb, `npm run dev:backend` starts the API, and `npm run build` builds both. Flutter and firmware commands are documented in their directories. CI is in the repository's `.github/workflows/safealert.yml`.

The earlier Emergency Response App Design bundle, Expo and old web/backend source remain available as migration references. Use `npm run dev:reference` only to run the root design demo. Its original design reference is https://www.figma.com/design/Mh4G8mAiI6dBOVl3Rj3K04/Emergency-Response-App-Design.

Do not deploy operationally until the release gates have evidence from the actual services and hardware. No production database migration is run by startup or by the automated test suite.
