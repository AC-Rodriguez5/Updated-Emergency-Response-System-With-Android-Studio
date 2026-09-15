# UX Contract

## Product context
SafeAlert administrators in the Philippines review registrations and emergency reports. Locale en-PH; timezone Asia/Manila; Gregorian dates. Target WCAG 2.2 AA and current Chromium/Firefox browsers, desktop and narrow viewport. PRD behavior takes precedence over historical UI implementation.

## Business-context sources
| Domain / scope | Authoritative source | Source type | Reviewed date |
|---|---|---|---|
| Permissions, approval, resolution | SafeAlert_PRD_Split/07_AdminWeb_Dashboard_PRD.md | PRD | 2026-09-10 |
| Lifecycle, auth, API, realtime | SafeAlert_PRD_Split/08_Emergency_Lifecycle_API_Realtime_and_Notifications_PRD.md | API/domain PRD | 2026-09-10 |
| Visual language, screens | SafeAlert_PRD_Split/14_UI_UX_Design_System_and_Screen_Specs_PRD.md | Design PRD | 2026-09-10 |
| Retention | Server policy; no client deletion of accounts or records | Domain boundary | 2026-09-10 |
| Billing, legal claims | Not part of these admin workflows | Not applicable | 2026-09-10 |

## Visual contract
DESIGN.md mirrors canonical admin-web/src/index.css variables, consumed by shared components. Light theme maintained; forced-colors and reduced-motion system preferences respected. No component-specific equivalent token system.

## Canonical UI Map
| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | admin-web/src/components/UI.tsx Select | UX contract | native OS popup | Browser keyboard |
| Date | admin-web/src/utils/format.ts dateTime | UX contract | read-only Manila display | Unit tests |
| Form | UI.tsx Field and ActionDialog; Login.tsx login form | UX contract | sign-in, reason confirmation | Browser validation |
| Scrollbar | admin-web/src/index.css global baseline | DESIGN.md | standard scrollbar geometry | Browser computed style |
| Toast | react-hot-toast provider in main.tsx | UX contract | success, error | Live region |
| CRUD | api/index.ts, useResource, ActionDialog | PRD08, UX contract | review, lifecycle action | API/unit/browser tests |
| Search | UI.tsx Search | UX contract | transient sensitive query | Browser no-results |
| Pagination | UI.tsx Pagination + useTableState | UX contract | server records, bounded live list | Browser navigation |
| Modal | UI.tsx Modal + Headless UI Dialog | UX contract | details, confirmation, evidence | Keyboard/focus |

## Dataset navigation
Server pagination is 20 records by default, filters and page stored in URL. Names, phone numbers and other potentially sensitive search terms remain in component memory rather than URL/history. Search is IME-safe, debounced 300ms, clears immediately and cancels stale requests. Filter changes reset page 1; total changes clamp out-of-range pages. No bulk selection/deletion exists.

## Flow ledger
| Operation | Trigger | Pending | Success destination | Feedback | Failure recovery | Focus | Source |
|---|---|---|---|---|---|---|---|
| Sign in | Sign in | Disable submit | Original protected route | Authenticated shell | Inline error; preserve email | First invalid field | PRD08 auth |
| Approve/reject | Review dialog | Disable confirmation | Owning queue with filters | Shared toast + refreshed row | Keep dialog and reason; conflict refresh | Review trigger | PRD07 approval |
| Resolve/cancel/false alarm | Emergency detail | Disable confirmation | Refreshed detail; active list updates | Shared toast + status | Preserve reason and show error | Action trigger | PRD08 lifecycle |
| Search | Type, Enter, clear | Stable table refresh | Same list, page 1 | Count/empty text | Inline retry | Search input | UX default |
| Evidence read | View evidence | Stable loading region | Private modal | Preview | Inline error/retry | Evidence trigger | PRD07 review |

## Navigation and responsive behavior
Protected routes wait for server session verification. Signed-out access returns to sign-in and preserves a local route destination. Each page sets its document title. Unknown routes have a navigable app-owned 404. Sidebar becomes an accessible modal menu at narrow widths; tables scroll horizontally without trapping document scrolling.

## Overlays and feedback
Headless UI Dialog handles focus trap, Escape, scroll lock, inert background and restoration. Confirm permission changes and final emergency actions with object name and consequence. Cancel gets initial focus. Dirty reason drafts require discard confirmation; pending requests cannot be dismissed. Toasts occupy top right, deduplicate by action/record, and never replace inline errors. Dialog layer is above map and navigation; nested evidence/confirm dialogs remain operable.

## Async and resilience
Mutations are pessimistic. Ten-second request timeout; no blind retry of state-changing actions. 401 may rotate refresh token once before repeating an unprocessed request. Refresh uses a single shared in-flight operation. Reads are cancelled on superseding queries/unmount. Real-time events invalidate server queries, coalesced within 200ms; 15-second polling runs only while socket is disconnected. Reconnect immediately fetches server truth. Offline/stale banners make recovery visible. 409 preserves the user's reason and requests a fresh record before further action.

## Validation and sensitive values
noValidate forms own textual validation and first-error focus; secret fields are masked with a reveal control and password manager support. Action reasons are required for rejection, cancellation, false alarm and resolution overrides. Prevent duplicate submissions. Access tokens live only in memory; rotating refresh token in sessionStorage permits reload restoration until the tab/browser session closes. This is an explicit temporary browser security design: XSS can access sessionStorage, so production must enforce CSP, HTTPS and trusted code. Do not persist credentials or evidence in localStorage. Previous localStorage token keys are removed on startup. Search containing PII is not URL-persisted.

## Permission and clipboard
Only approved admin sessions render the shell. Server authorization remains authoritative. Private evidence requires bearer-authorized binary fetch; only image and PDF previews allowed; blob URLs are revoked on close. No external evidence URL is followed and no clipboard of secrets exists. Admin actions are shown only on active emergencies, with report/override requirements visible.

## Migration status
The broken legacy AdminWeb pages are replaced together so old /alerts APIs and localStorage authentication cannot be mixed with current routes. Expo/older web code remain outside this admin ownership. Preserve server records; release only after backend contract tests and end-to-end checks pass.

## Verification
Required: npm --prefix admin-web run typecheck; npm --prefix admin-web test; npm --prefix admin-web run build; npm --prefix admin-web run test:e2e. Static audit: premium skill audit_project.py against project root. Browser matrix covers login, approved navigation, invalid form, pending evidence review, lifecycle conflict, records search/empty, session expiry, offline, keyboard dialog and narrow sidebar. Tests use explicit API fixtures only; production runtime never seeds fake records. Compare approval and emergency confirmation siblings for consistent label, focus and recovery.
