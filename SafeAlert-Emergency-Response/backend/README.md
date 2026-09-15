# SafeAlert API

The maintained entrypoint is `src/server.ts`; `npm run build` produces `dist/server.js`. Use Node 22.15+, `npm ci`, a private configuration based on `.env.example`, and a MongoDB replica set. `npm run dev` starts development; `npm start` runs the compiled server. Old JavaScript/controller copies are migration references, outside the TypeScript runtime graph.

All responses use `{data, requestId, meta?}` or `{error:{code,message}, requestId}`. Protected requests use `Authorization: Bearer <accessToken>`. Account role and approval are rechecked in the database. Never place tokens in URLs.

| Method and route | Contract |
| --- | --- |
| POST /api/auth/registration-session | `{role:user|responder}` → scoped upload session token |
| POST /api/upload | Scoped registration bearer, multipart file/purpose/source → private file ID |
| POST /api/auth/register/user or /responder | Validated profile, consent, registrationToken and owned document IDs → pending account |
| POST /api/auth/login | `{email,password,role,rememberMe?}` → accessToken, rotating refreshToken, account |
| POST /api/auth/refresh or /logout | `{refreshToken}`; logout revokes the session family |
| GET /api/auth/me | Current approved account |
| GET /api/admin/registrations | Admin, type/status/page/limit filters |
| GET /api/admin/registrations/:id | Admin, explicit type query parameter |
| POST /api/admin/registrations/:id/approve or /reject | Admin, explicit type and optional reason; rejection UI requires a reason |
| GET /api/upload/:id | Approved owner or administrator; private evidence response |
| POST /api/emergencies | Approved user, Idempotency-Key header and `{type,source,location,notes?}` |
| GET /api/emergencies/my or /active or /:id | Account/assignment/coverage-scoped incidents |
| POST /api/emergencies/:id/assign | Eligible on-duty responder; atomic claim |
| POST /api/emergencies/:id/on-the-way or /report | Assigned responder only; lifecycle enforced |
| POST /api/emergencies/:id/cancel | Owner, pending incident only |
| POST /api/admin/emergencies/:id/resolve, /cancel or /false-alarm | Administrator only; override requires reason |
| POST /api/locations/user or /responder | Fresh actual fix; separate actor storage; emergencyId where required |
| PATCH /api/responders/me/duty | Responder duty state; cannot leave active assignment |
| POST /api/user/ble-devices/pair or /unpair | User-owned device binding; no implicit ownership transfer |
| POST /api/user/ble-events | Paired source event, stable eventId and actual location |
| POST /api/notifications/devices | Authenticated session-bound Android push registration |
| GET /api/admin/records/emergencies, /analytics/summary, /analytics/monthly, /audit-logs | Admin records, analytics and audit queries |

Read the exact request schemas in `src/routes/` and `src/controllers/` alongside the lifecycle PRD. Types: medical, crime, fire, general_sos. Statuses: pending → assigned → responder_on_the_way → responder_nearby → responder_report_submitted → resolved; cancelled and false_alarm are terminal alternatives with actor/state restrictions. Invalid transitions return 409.

Location shape: `{lat,lng,accuracyMeters,capturedAt}` with ISO timestamp and finite coordinates. Captures older than 60 seconds are rejected for new submissions; a confirmed idempotency receipt is returned before freshness validation on retries. Clients must retain the same key and payload after uncertain network outcomes. A definitive STALE_LOCATION rejection permits a new actual fix with the same key.

Socket.IO uses `auth.token`, server-assigned rooms and scoped event notifications. Clients refetch authorized REST state after connection/reconnection and event delivery. Agency rooms receive refresh hints; private incident events go only to authorized participants and administrators.

Run `npm run typecheck`, `npm test`, `npm run build`. Tests use isolated disposable replica sets. Migration commands require an explicitly supplied MIGRATION_URI and default to dry-run. See `../IMPLEMENTATION.md` and `../docs/OPERATIONS.md` for maintained clients, deployment, backup and release requirements.
