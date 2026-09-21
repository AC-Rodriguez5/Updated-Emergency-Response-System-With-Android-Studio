# TanzAlert UX Contract

- Existing routes, API contracts, authentication, hardware events, and emergency lifecycle rules remain stable.
- Every async surface exposes loading, empty, error, offline, success, and populated states when applicable.
- Emergency creation and responder actions remain usable before entrance animations finish.
- Keyboard focus is visible. Icon-only actions have accessible names. Touch targets are at least 44px on web and 48px on mobile.
- Text supports browser zoom and Flutter text scaling without clipped controls or horizontal page overflow.
- Tables become scrollable or card-based at narrow widths; critical fields remain visible.
- Realtime updates announce state visually without reordering the focused control.
- User app navigation: Home, Activity, Facilities, Device. Responder navigation: Duty, Live Map, Ambulance, Settings.
- Details, emergency confirmation, active emergencies, reports, and route guidance remain full-screen flows and retain their URLs.
- TanzAlert is the visible brand. Internal identifiers such as `SA-ESP32-*` remain unchanged.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Table Selection | Maintained feature table | `web/src/features` | single row / page | keyboard and feature tests |
| Select/Listbox | Native HTML select | `web/src/features` | compact / full width | label, focus, and keyboard review |
| Date | Native HTML date input | `web/src/features/audit` and `web/src/features/reports` | filter range | en-PH locale and keyboard review |
| Form | React feature form | `web/src/features` | login / filter / settings | owned validation and feature tests |
| Scrollbar | Global application CSS | `web/src/index.css` | standard / stable gutter | standards and WebKit computed styles |
| Toast | Notification toast viewport | `web/src/features/notifications/NotificationToasts.tsx` | info / success / warning / emergency | live region and reduced motion review |
| CRUD | Feature service and page state | `web/src/features` | modal / detail panel | typecheck, feature tests, and API error paths |
