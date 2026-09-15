# SafeAlert Authentication, Registration and Approval PRD

**Purpose:** Defines account authentication, approval gating, registration fields, approval workflows and related acceptance criteria.

**Included sections:** Sections 9.1 to 9.2

> Source: SafeAlert Emergency Response System Production PRD, Version 2.0, dated May 4, 2026.
> This file was split from the original master PRD for cleaner implementation ownership.

---

## 9.1 Authentication and session management

### Requirements

AUTH-001: The system shall support three account roles: `user`, `responder` and `admin`.

AUTH-002: Registration shall create accounts in `pending` status. Pending users and responders cannot log in.

AUTH-003: Admin approval changes status from `pending` to `approved`.

AUTH-004: Admin rejection changes status from `pending` to `rejected` and records reason.

AUTH-005: User and responder login shall use email and password.

AUTH-006: Admin login shall use username and password or email and password. Any predefined admin account must be seeded from environment variables and hashed before storage. The password must not be committed in code or documentation intended for production.

AUTH-007: The backend shall issue a short-lived access token and a refresh token.

AUTH-008: Access token lifetime shall be 15 minutes by default.

AUTH-009: Refresh token lifetime shall be 30 days when Remember this device is enabled and 24 hours when disabled.

AUTH-010: Refresh tokens shall be stored hashed in the database.

AUTH-011: Logout shall revoke the active refresh token.

AUTH-012: All role-specific endpoints shall verify JWT and role.

AUTH-013: Failed login attempts shall be rate-limited by IP and account identifier.

AUTH-014: Password reset is optional for MVP but must be designed as a future module.

### Acceptance criteria

- Pending account login returns HTTP 403 with message `Account pending admin approval.`
- Rejected account login returns HTTP 403 with message `Account registration was rejected. Contact support for details.`
- Invalid credentials return a generic message and do not reveal whether email exists.
- Accessing protected endpoints without token returns HTTP 401.
- Accessing a route with the wrong role returns HTTP 403.
- Refresh token reuse after logout fails.
- Brute force test with repeated failed logins triggers rate limit.

---

---

## 9.2 Registration and admin approval

### User registration requirements

REG-U-001: User registration form shall collect:

- Full name
- Date of birth
- Computed age
- Proof-of-residency ID image or document
- Live face capture through camera only
- Contact number
- Email
- Password
- Confirm password
- Address or municipality coverage field
- Consent checkbox for emergency location processing

REG-U-002: Age must be computed from date of birth on client and verified on backend.

REG-U-003: Live face capture shall not allow gallery import.

REG-U-004: Proof-of-residency upload shall allow camera or file upload, subject to file validation.

REG-U-005: Backend shall scan metadata and validate file size, allowed MIME type and magic bytes.

REG-U-006: Registration shall create a pending account and a registration review record.

REG-U-007: Login shall be blocked until approval.

### Responder registration requirements

REG-R-001: Responder registration shall collect all user fields plus:

- Agency type: police, fire, medical, rescue or other
- Station or department name
- Position or role
- Professional credential document
- Credential number where applicable
- Coverage area or assigned municipality

REG-R-002: Responder cannot access emergency data until approved.

REG-R-003: Admin must be able to view credential document and approve or reject.

### Admin approval requirements

REG-A-001: AdminWeb shall show pending registrations in separate tabs for users and responders.

REG-A-002: Each review item shall show personal details, uploaded document, face capture, submitted timestamp and review status.

REG-A-003: Admin shall approve or reject with optional reason.

REG-A-004: Approval and rejection shall create audit log entries.

REG-A-005: Approved account shall receive push notification if push token exists and email notification if email module exists.

### Acceptance criteria

- User cannot submit registration with missing required fields.
- Face capture opens camera and rejects gallery-only source.
- Backend rejects oversized files.
- Backend rejects unsupported file types.
- Admin sees pending registrations within 3 seconds after submission.
- Admin approval allows login immediately.
- Admin rejection blocks login and records rejection reason.
- Audit log records admin ID, action, target account ID, timestamp and reason.

---
