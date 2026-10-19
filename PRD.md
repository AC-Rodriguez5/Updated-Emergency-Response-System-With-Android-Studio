# TanzAlert Production Readiness PRD

| | |
|---|---|
| **Document** | prd.md, production readiness audit |
| **System** | TanzAlert: ESP32-C6 panic device (4G LTE + GNSS + fingerprint) + backend + mobile emergency notification app |
| **Version** | 1.0 |
| **Date** | 2026-10-19 |
| **Owner** | Developer (capstone team) |
| **Source** | "Demo vs production reality" checklist: Security, Shipping, Speed, Traffic, Survival |

## How to use this document

Work the checks one by one, top to bottom. Each check has a **Verify** procedure and a **Pass when** rule. Do not mark Pass without attaching evidence (screenshot, log excerpt, link, or commit hash) in the Evidence column. A check that cannot be tested yet is Blocked, not Pass.

Status values: `Not started` / `In progress` / `Pass` / `Fail` / `Blocked` / `N/A (justify)`

## Scorecard

| ID | Pillar | Check | Status | Owner | Evidence |
|---|---|---|---|---|---|
| 1.1 | Security | Auth & Permissions | Not started | | |
| 1.2 | Security | Security & RLS | Not started | | |
| 1.3 | Security | Rate Limiting | Not started | | |
| 2.1 | Shipping | Hosting & Deployment | Not started | | |
| 2.2 | Shipping | Cloud & Compute | Not started | | |
| 2.3 | Shipping | CI/CD & Version Control | Not started | | |
| 3.1 | Speed | Caching & CDN | Not started | | |
| 4.1 | Traffic | Load Balancing & Scaling | Not started | | |
| 5.1 | Survival | Error Tracking & Logs | Not started | | |
| 5.2 | Survival | Availability & Recovery | Not started | | |

---

## Pillar 1: Security

### 1.1 Auth & Permissions

The question: can anyone trigger, read, or silence an SOS who should not be able to?

- [ ] Every backend endpoint requires authentication; no anonymous route can create, read, or cancel an alert
- [ ] Each device has its own credential (per-device token or key), not one shared secret baked into all firmware
- [ ] App users authenticate (login/OTP) and sessions expire; refresh flow works
- [ ] Roles are separated: device, owner/user, emergency contact or responder, admin. Each role is limited to its own actions
- [ ] A user can only see and manage their own device(s) and alerts
- [ ] On-device auth works as designed: fingerprint required before the button arms; BLE pairing only opens for 2 minutes after an authorized scan
- [ ] Device credential can be revoked server-side if a unit is lost or stolen

**Verify**
1. Call every API route with no token, an expired token, and another user's token (curl or Postman). Expect 401/403 on all.
2. Create two test accounts; confirm account B cannot fetch account A's device, alerts, or location history by changing IDs in requests.
3. Attempt SOS on the device without an enrolled fingerprint scan; attempt BLE pairing outside the 2-minute window. Both must refuse.

**Pass when** all unauthorized attempts fail with a proper error, nothing leaks in the response body, and revoking a device credential blocks that device within one sync.

### 1.2 Security & RLS

The question: is data protected at the database, in transit, and in the repo?

- [ ] Row Level Security (or equivalent query scoping) is ON for every table holding user, device, alert, or location data; policies tested per role
- [ ] Database is not reachable from the public internet except through the API/service layer
- [ ] All transport is encrypted: HTTPS on API and app, TLS on MQTT/sockets if used; the device's HTTP calls use TLS with cert validation
- [ ] No secrets in the repo, firmware strings, or client bundle: scan for keys, SIM APN passwords, service keys. Secrets live in env config
- [ ] Location data retention is defined (how long alert pings are kept, who can export, how deletion works)
- [ ] OTA or flashing path cannot be hijacked: firmware source is private, release binaries checksummed

**Verify**
1. With RLS on, run raw queries as an authenticated low-privilege user attempting to select another user's rows. Expect zero rows.
2. `strings firmware.bin | grep -iE "key|secret|token|pass"` and repo scan (gitleaks or trufflehog). Expect no live secrets.
3. Capture device traffic (proxy or Wireshark on a test AP) and confirm nothing readable in plaintext.

**Pass when** cross-tenant queries return nothing, scans are clean, and all observed traffic is encrypted.

### 1.3 Rate Limiting

The question: can a stuck button, a malicious script, or a prank flood the system?

- [ ] API rate limits per IP and per token on auth, SOS creation, and read endpoints
- [ ] SOS dedup/cooldown: one General SOS queued per hold event (firmware already queues exactly one); server rejects duplicate alerts from the same device within the cooldown window
- [ ] Notification fan-out is capped: a single alert cannot trigger unbounded SMS/push retries; retries use backoff
- [ ] Login brute force protection: lockout or exponential delay after repeated failures
- [ ] Fingerprint retry limit on-device before a forced wait

**Verify**
1. Script 100 rapid SOS posts with one device token. Expect the first accepted, the rest rejected or coalesced, and one notification set sent.
2. Hammer login with wrong passwords; confirm lockout/delay kicks in.
3. Hold or jitter the physical button repeatedly; confirm exactly one alert reaches contacts.

**Pass when** flood tests produce exactly one delivered alert and no bill-shock SMS burst, and brute force is throttled.

---

## Pillar 2: Shipping

### 2.1 Hosting & Deployment

- [ ] Backend runs on a named host (not a laptop): provider, region, and plan documented here
- [ ] Separate dev and production environments with separate databases and keys
- [ ] Production URL on a proper domain with valid SSL, auto-renewing
- [ ] Deploy procedure is written down and repeatable by any team member (one page, exact commands)
- [ ] App distributed through a real channel (Play Store internal track, TestFlight, or signed APK with install doc)

**Verify**
1. Fresh teammate follows the deploy doc start to finish on a clean machine. Time it, note every snag.
2. Check SSL with `curl -vI https://<prod-domain>` and an SSL checker; note expiry automation.

**Pass when** a non-author can deploy in under 30 minutes using only the doc, and prod/dev are fully isolated.

### 2.2 Cloud & Compute

- [ ] Instance/plan sizing documented: CPU, RAM, DB tier, and why it is enough for the pilot (Tanza deployment size)
- [ ] Region chosen for PH latency; measured round-trip from a Tanza SIM to the API recorded here
- [ ] Free-tier and quota limits listed (requests/day, DB rows, SMS credits, push quota) with current usage vs limit
- [ ] Monthly cost estimate at pilot scale and at 10x pilot scale
- [ ] Billing alerts set so a bug cannot silently burn credit

**Verify**
1. From the device over LTE, log 20 SOS round-trip times at different hours; record p50 and p95.
2. Fill a table: each service, its quota, your measured daily usage, headroom.

**Pass when** p95 device-to-notification latency meets your target (set one, e.g. under 15 s end to end) and every quota has at least 5x headroom at pilot scale.

### 2.3 CI/CD & Version Control

- [ ] Everything in git: firmware, backend, app, infra config, this PRD
- [ ] Protected main branch; changes land by PR with at least one review (or solo-dev rule: no direct push, PR + self-review checklist)
- [ ] CI runs on every PR: build + tests for backend and app; firmware at least compiles in CI
- [ ] Releases are tagged; the exact firmware version on each physical device is traceable (version string printed on boot and reported to backend)
- [ ] Rollback procedure exists for backend and app; firmware reflash procedure documented
- [ ] `.env.example` kept current; no one needs to ask what variables exist

**Verify**
1. Break a test on a branch; confirm CI blocks merge.
2. Ask the backend: which firmware version is device #1 running? The answer must come from data, not memory.
3. Perform one rollback drill on the backend and record the time.

**Pass when** CI gates merges, every deployed artifact maps to a tag, and rollback was actually rehearsed once.

---

## Pillar 3: Speed

### 3.1 Caching & CDN

- [ ] Static app assets and web dashboard served via CDN or platform edge
- [ ] Map tiles and reverse-geocode results cached client-side where the license allows
- [ ] Read-heavy, slow-changing API responses (contact lists, device profile) carry cache headers or client cache
- [ ] The alert path is explicitly NOT cached anywhere: SOS posts and alert status reads bypass every cache
- [ ] DB indexes exist on the hot queries (alerts by device_id + created_at, users by phone)

**Verify**
1. Check response headers on static assets (expect cache-control with long max-age + hashing) and on alert endpoints (expect no-store).
2. Run EXPLAIN on the alert feed query; confirm index use, no full table scan.
3. Cold vs warm app open time measured on a mid-range Android phone.

**Pass when** assets are edge-cached, hot queries are indexed, and a cached layer can never serve a stale alert status.

---

## Pillar 4: Traffic

### 4.1 Load Balancing & Scaling

- [ ] Expected load written down: pilot devices, alerts/day, peak concurrent app users; then the stress case (barangay-wide incident, many devices triggering within minutes)
- [ ] The platform's scaling story is known: managed autoscale, or documented manual scale-up steps with who does it
- [ ] Notification sending is queued (jobs), not done inline in the request, so a burst cannot time out SOS ingestion
- [ ] DB connection pooling configured; connection limit vs worker count checked
- [ ] Load test executed: ingest at 10x expected peak for 5 minutes with zero dropped alerts

**Verify**
1. k6 or a simple script: fire N concurrent SOS posts (use a test flag so no real SMS goes out), ramp to 10x peak. Record error rate and latency.
2. Kill one worker mid-test if you have more than one; confirm the balancer or platform recovers.

**Pass when** 10x peak sustains with 0% alert loss, p95 ingest under 2 s, and the burst drains the queue without manual help.

---

## Pillar 5: Survival

### 5.1 Error Tracking & Logs

- [ ] Backend exceptions go to a tracker (Sentry or similar) with alerting to the team, not just a log file
- [ ] Structured logs for the alert lifecycle: received, validated, queued, each notification attempt, delivered/failed, acknowledged. One alert ID traces the whole chain
- [ ] App crashes reported (Crashlytics/Sentry) 
- [ ] Device self-reporting: firmware logs faults (modem restarts, GNSS timeouts, low battery, failed sends) and uploads them on next connection; LED codes documented for field debugging
- [ ] SMS/push delivery receipts stored, so "did the contact actually get it" is answerable per alert
- [ ] Log retention set and PII in logs minimized (no raw coordinates in third-party trackers)

**Verify**
1. Force an exception in a test route; confirm it reaches the tracker and someone is notified within minutes.
2. Trigger a test SOS and reconstruct its full timeline from logs alone, timestamps included.
3. Unplug the antenna, trigger modem failures, then reconnect; confirm the fault log arrives server-side.

**Pass when** any team member can answer "what happened to alert X" from the tools in under 5 minutes, and a silent failure class has no place to hide.

### 5.2 Availability & Recovery

- [ ] Uptime target declared (e.g. 99.5% for pilot) and an external uptime monitor pings the health endpoint
- [ ] `/health` endpoint checks DB and queue, not just process-up
- [ ] Automated DB backups daily; a restore has been rehearsed once into a scratch environment and timed
- [ ] Device store-and-forward: with no signal, the device retains the SOS and GNSS fix and sends when coverage returns; tested in a real dead zone
- [ ] Degraded modes defined: backend down (device retries with backoff + SMS fallback if designed), push fails (SMS fallback), GNSS timeout (send last known fix flagged as stale, 2 slow blinks per device spec)
- [ ] Battery survival: low-battery alert to the owner at a set threshold; measured runtime from full charge logged here
- [ ] Single point of failure list written: SIM credit expiry, SMS provider outage, domain expiry, the one person with the only prod password. Each has a mitigation

**Verify**
1. Pull the backend down for 5 minutes during a test SOS; confirm the device retries and the alert lands after recovery with the original timestamp.
2. Restore last night's backup to a scratch DB and open the app against it.
3. Walk a real dead-zone route in Tanza with the device; confirm queued delivery on re-entry.

**Pass when** a staged outage loses zero alerts, the backup restore drill succeeded, and every SPOF has a named mitigation.

---

## Appendix A: Evidence log

| Date | ID | Tester | What was run | Result | Link/file |
|---|---|---|---|---|---|
| | | | | | |

## Appendix B: Declared targets (fill once, test against forever)

| Metric | Target | Measured |
|---|---|---|
| End-to-end SOS to first notification (p95) | | |
| SOS ingest latency under 10x load (p95) | | |
| Uptime (pilot) | | |
| Device battery runtime | | |
| Backup restore time | | |
| Zero-alert-loss outage drill | required | |
