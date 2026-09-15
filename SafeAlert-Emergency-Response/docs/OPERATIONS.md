# Deployment and acceptance runbook

## Before rollout

1. Revoke previously committed database/service credentials at their providers, issue unique replacement secrets through the deployment secret store, rotate JWT_SECRET and review administrator accounts. Existing sessions will be invalidated by JWT rotation. Do not copy any historical `.env` into deployment. No default administrator credentials are provisioned.
2. Take an encrypted database backup and record its timestamp, checksum, collections and counts. Restore it into a separate restricted replica set. Verify record samples, evidence attachments and owner references before testing a migration.
3. Set MIGRATION_URI to that restored database. Run `npm run migration:check` and `npm run indexes:check` in backend; neither loads operational `.env`. Resolve every reported missing coverage area, credential/hash, status or owner manually. Only after reviewing the dry-run report, set MIGRATION_ALLOW_WRITES=backup-verified and rerun with `-- --apply` against the restored database. Compare counts and identities and run the acceptance flow there. Record the reviewed report before scheduling any production migration.
4. Build immutable backend/admin artifacts and signed Android packages. Configure HTTPS/WSS, explicit ALLOWED_ORIGINS, replica-set MONGODB_URI, JWT_SECRET, Firebase Application Default Credentials and FCM_ENABLED=true. Configure contracted/self-hosted OVERPASS_URL and ROUTING_URL and an appropriate OSM-compatible tile provider. Set TRUST_PROXY_HOPS only to the actual trusted proxy count. Do not expose MongoDB publicly.
5. Run one API/notification-worker instance initially: Socket.IO room delivery and rate limits are currently process-local. Horizontal scaling requires a shared socket adapter and shared rate-limit store plus distributed job testing before increasing replicas.

## Monitoring and recovery

`/health` checks the process; `/ready` checks MongoDB connectivity and requires configured push/maps in production. Provider configuration is not proof of remote provider health: run synthetic provider probes separately. Structured HTTP logs include request ID, status and duration, never payloads or tokens. Collect them centrally; alert on sustained 5xx, readiness failures, rising latency, stale active positions and growing notification backlog. `/api/admin/operations` exposes emergency job backlog and pending outbox records. Authenticated Flutter errors are queued in encrypted storage and sent to the first-party diagnostics endpoint after successful sync. Only error types and symbolic frames are collected, without exception messages or file paths. Administrators can retrieve reports at /api/admin/diagnostics; reports expire after 30 days. Pre-login failures, native process crashes and abrupt OS kills need platform crash tooling and physical validation before release.

Location samples expire after 30 days. Notification jobs and temporary uploads have TTL policies in their models. Incidents, registration evidence and audit records are retained; no automatic deletion of those records is introduced. Approve an organization-specific retention policy and implement a reviewed archival/deletion job before accepting an operational retention commitment.

Schedule encrypted backups according to approved RPO/RTO and perform periodic restore drills. Record actual restore duration. For rollback, stop new writes, preserve a backup of post-release records, deploy the prior compatible artifact and verify readiness/ownership checks. If schema rollback requires restoring a backup, reconcile post-backup incidents before reopening intake; never discard them silently. Keep an alternative emergency-contact channel available during maintenance.

## Required release evidence

| Gate | Required evidence |
| --- | --- |
| Complete MVP flow | Physical user registration/evidence → admin approval → login → explicit SOS → one responder → travel/nearby/report → admin resolution; user receives the result |
| Safety and access | No launch SOS; denied/stale GPS handled; duplicate/restarted retries produce one incident; concurrent claims yield one winner; unrelated accounts cannot read docs/incidents; responder cannot resolve; responder movement preserves user GPS |
| Delivery | Foreground, background and locked-phone push; socket reconnect after expired token; network loss/recovery; revoked sessions; queued jobs after worker restart |
| Hardware | Every ESP32 button, duplicate events, reboot, full queue, power interruption, disconnect/reconnect, phone process recreation, permissions and background limits; signed provisioning/pairing threat review |
| Performance | Representative staging data with 100 active emergencies: measure p95 active-list latency below 2 seconds and end-to-end live updates below 3 seconds, including actual Android/network/provider conditions |
| Operations | Tested backup migration and restore, credential rotation evidence, signing, HTTPS probes, monitoring alerts and rollback exercise |

Automated tests and local memory-database timing are development evidence only. They do not establish network latency, hardware reliability or production readiness. Release the integrated MVP for controlled acceptance first, then require all production gates before operational use.

