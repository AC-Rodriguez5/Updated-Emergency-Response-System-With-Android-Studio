---
version: alpha
name: SafeAlert AdminWeb
description: An emergency operations console for timely, accountable response.
colors:
  primary: '#0A84FF'
  danger: '#E52834'
  success: '#247C3D'
  warning: '#805600'
  background: '#F5F5F5'
  surface: '#FFFFFF'
  text: '#17212B'
  muted: '#5C6570'
  border: '#D7DEE6'
  focus: '#075DB5'
  navy: '#142D48'
typography:
  sans:
    fontFamily: 'Segoe UI, system-ui, sans-serif'
  display:
    fontFamily: 'Bahnschrift, Segoe UI, sans-serif'
  mono:
    fontFamily: 'Consolas, ui-monospace, monospace'
rounded:
  DEFAULT: '0.5rem'
  sm: '0.25rem'
  md: '0.5rem'
  lg: '0.75rem'
spacing:
  xs: '0.25rem'
  sm: '0.5rem'
  md: '1rem'
  lg: '1.5rem'
  xl: '2rem'
---
# SafeAlert design system

## North Star
- Subject and audience: Philippine emergency administrators approving accounts, monitoring incidents, and resolving reports.
- Register: product/admin, grounded in PRD 07, 08 and 14. English (en-PH), Asia/Manila time, Gregorian calendar. Japan-market rules are not applicable.
- Usage: frequently used desktop console, with tablet/mobile access during urgent operations.
- Signature: a restrained incident status rail pairs each incident with its stage and age, like an operations log. Emergency red has operational meaning.
- Restraint: keep the PRD sidebar, white/gray surfaces and semantic blue/red identity. No decorative gradients, fake counters, invented activity, or flashing alarms.
- Token ownership/runtime mapping: admin-web/src/index.css :root is the canonical runtime token source; this document mirrors its named colors, type and radius. Shared UI components consume variables, not copied page palettes. Update both on durable design changes.

## Colors
PRD blue is the navigation accent; PRD red identifies emergency emphasis. Navy supports the operational navigation shell. Accessible dark green and amber text adapt the PRD status colors for white backgrounds. Status always has a written label. Only light mode is currently maintained; forced colors remain system-controlled.

## Typography
Bahnschrift gives headings a compact instrument-panel character; Segoe UI provides familiar readable forms. Consolas is reserved for incident IDs and coordinates. All fonts are local fallback stacks to prevent font-loading shifts. Body is 15px/1.5; headings use 28px/1.3; table values remain at least 14px.

## Layout
The PRD 250px sidebar collapses below 1024px. Main content uses 24px padding and natural document scrolling. Tables own horizontal overflow. Lists use 20 rows per server page. Map frames reserve 380px height, 300px on mobile. Controls target 44px height. A four/eight-pixel spacing rhythm follows PRD14.

## Elevation & Depth
White panels use quiet borders. Modals alone receive a stronger shadow, with an inert dimmed background. No glass effects or card hover lifting.

## Shapes
Eight-pixel controls, twelve-pixel panels, and twenty-pixel modal corners match the PRD. Buttons use stable inline geometry while busy.

## Components
### Foundational visual states
Shared UI components provide loading, refresh, empty, no-results, error/retry, stale, success and conflict states. Focus rings remain visible. Disabled controls reduce contrast without losing their label. Loading uses an owned spinner with stable space.
### Buttons and actions
Solid blue commits routine actions; outline/ghost supports navigation; final irreversible confirmations use danger emphasis. Permission changes and resolution require explicit confirmation. Labels are verbs and remain consistent with success feedback.
### Navigation and data display
Sidebar and section navigation use links. Tables use semantic HTML, total/range text and server pagination. Status badges include text. Incident/responder markers remain separate, with a persistent legend and equivalent table access.
### Forms and overlays
Native selects are canonical; platform-owned popup appearance is accepted. Forms own validation with noValidate. Headless UI Dialog owns focus trap, Escape, inert background and restoration. Private evidence is fetched with authentication, previewed only during review, and revoked on close.
### Iconography
Use one compact shield mark and text-led controls. Meaning is never carried by an icon alone.
### Motion
Only short state feedback and the loading spinner animate. Reduced-motion preferences disable animation. Operational updates never flash or jump controls.
### Content and data visualization
Plain English, sentence case, explicit action names, en-PH numbers and Manila times. Charts always have an accessible data table; missing values say Not available.

## Do's and Don'ts
- Do keep user GPS and responder GPS visually distinct and mark stale locations.
- Do require server confirmation before changing lifecycle presentation.
- Don't reveal credentials or evidence URLs in navigation, logs or durable storage.
- Don't replace absent live data with sample values.
