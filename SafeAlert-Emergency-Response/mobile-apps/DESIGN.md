---
version: alpha
colors:
  primary: '#0A84FF'
  danger: '#E52834'
  success: '#34C759'
  warning: '#FFB81C'
  background: '#F5F5F5'
  surface: '#FFFFFF'
  text: '#1C1C1E'
typography:
  body:
    fontFamily: 'Roboto, system-ui, sans-serif'
    fontSize: '17px'
  display:
    fontFamily: 'Roboto, system-ui, sans-serif'
    fontSize: '28px'
spacing:
  small: '8px'
  medium: '16px'
  large: '24px'
rounded:
  card: '12px'
  input: '8px'
---
# SafeAlert mobile design

## Overview
An emergency control panel for residents and field responders in the Philippines. Product register, English locale, device-local date/time displayed explicitly. Large labelled emergency actions and a persistent incident status strip are the signature. Use the production PRD 14 system identity, not marketing decoration.

## Colors
The PRD palette is adapted by `shared/lib/src/ui.dart` in `SafeAlertTheme`. Red means emergency or destructive action, blue navigation and responder actions, green completion, amber waiting. Status always has text and an icon. Use dark text on bright blue/amber surfaces to maintain contrast.

## Typography
Android system type with 17px body, bold 28px section titles, 14px supporting information. Text scales with accessibility settings. No remote fonts or text in images.

## Layout
Single drawer navigation and scrolling body, 16px padding, 600px maximum content width. Forms and confirmation sheets scroll above the keyboard. Minimum interactive height is 48px. The map is a bounded panel, never the only way to inspect incidents.

## Elevation & Depth
Quiet white cards on light gray. Maps and emergency actions carry emphasis; avoid decorative gradients and animated status illusions.

## Shapes
12px cards and 8px fields, matching the PRD. Material modal controls own focus and dismissal behavior.

## Components
`ui.dart` owns theme, fields, feedback, status badges and confirmation. Both role apps consume the same package. Runtime theme is the canonical token adapter; update this document and theme together.

## Do's and Don'ts
Show server-confirmed delivery separately from queued attempts. Keep cancellation separate from dispatch. Never imply responders were notified before the server acknowledges. Preserve data and retry identity after an interruption.
