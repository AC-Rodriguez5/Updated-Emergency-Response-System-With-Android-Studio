# SafeAlert maintained system

The requirements baseline is `SafeAlert_PRD_Split/08_Emergency_Lifecycle_API_Realtime_and_Notifications_PRD.md` and the production PRD set. The maintained runtime is `backend/src/server.ts`, `admin-web/`, `mobile-apps/User/`, `mobile-apps/Responder/`, and `mobile-apps/shared/`. The ESP32 prototype is `firmware/esp32/`. Expo, the root design demo, `web/`, old backend JavaScript copies and `mobile-apps/migration_reference/` are retained as migration references and excluded from maintained builds.

## Development

Use Node 22.15 or newer. Run `npm ci` in backend and admin-web. Copy backend `.env.example` to a private `.env`, provide a strong JWT secret and a MongoDB replica-set URI, then run `npm run dev` in backend. Run `npm run dev` in admin-web with `VITE_API_URL=http://localhost:5000/api` and `VITE_SOCKET_URL=http://localhost:5000`. See `mobile-apps/README.md` for Android commands. Never use an operational database for the test suite.

For isolated browser review, `npm run test:e2e` in admin-web starts a disposable MongoDB replica set and synthetic API. The test-only identities in `backend/scripts/preview.ts` are never seeded by the production server. Backend tests also use disposable replica sets. CI in `../.github/workflows/safealert.yml` covers the maintained projects and compiles firmware without flashing it.

## Implemented behavior

- Scoped registration uploads, private document retrieval, transactional approval/rejection and audit records, approved-role login, rotating refresh sessions and revocation.
- Explicit GPS-backed SOS, owner-scoped idempotency, BLE event deduplication, atomic responder claims, HTTP 409 transition conflicts and an incident timeline.
- Separate resident and responder positions, coverage/agency dispatch, server-derived nearby status, responder reports and administrator-only resolution.
- Scoped Socket.IO events with reconnect synchronization; durable notification jobs with retry and Firebase configuration gates.
- Admin reviews, live incident maps, resolution, searchable records, analytics and audit history. Flutter registration, SOS tracking, responder travel/report, facilities/routing and background BLE queue integration.
- Backup-first dry-run migration and index tooling, health/readiness endpoints and redacted structured request logs.
- Encrypted offline Flutter diagnostic queues and authenticated, deduplicated first-party reports containing error types and symbolic frames only.

## Release boundary

See `docs/VERIFICATION.md` for completed local checks and their limits.

This implementation requires the acceptance evidence in `docs/OPERATIONS.md` before field deployment. Live Firebase/provider delivery, physical Android/ESP32 tests, signed releases, production load/recovery tests and migration on a restored operational backup are external gates. Previously committed credentials must be revoked at their providers; removing them from the current tree does not revoke them or erase Git history. No production data was migrated or deleted by this work.
