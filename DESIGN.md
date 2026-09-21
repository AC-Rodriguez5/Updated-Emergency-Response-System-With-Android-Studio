# TanzAlert Design System

TanzAlert is a municipal emergency platform. Its interface should feel calm, precise, and ready under pressure. Operational content stays light and highly legible; navigation and live command surfaces use deep navy. Red is reserved for danger, destructive actions, and active emergency signals.

## Foundations

- **Primary type:** Manrope. Use 600–750 weight for interface hierarchy.
- **Technical type:** JetBrains Mono for identifiers, coordinates, timestamps, device state, and telemetry.
- **Navy:** `#071526`; **navy raised:** `#0B1B31`; **signal cyan:** `#22D3EE`; **operational blue:** `#2563EB`.
- **Emergency:** `#E5484D`; **success:** `#22C55E`; **warning:** `#F59E0B`.
- **Canvas:** `#F3F7FB`; **surface:** `#FFFFFF`; **border:** `#D9E2EC`; **ink:** `#0B172A`; **muted:** `#62748A`.
- Spacing follows a 4px base. Primary radii are 12px for controls, 16px for panels, and 20px for feature surfaces.
- Shadows are low-opacity navy and communicate hierarchy. Do not use shadow as the only boundary.

## Composition

- Keep dense operational lists scannable and use panels only for meaningful groups.
- Use a dark command rail and header accents, then place working content on the cool canvas.
- Use cyan for live connectivity, selection, and telemetry. Use blue for ordinary primary actions.
- Use red sparingly so an emergency signal is immediately recognizable.
- Maps are working surfaces: controls float above the map, while details live in anchored sheets or side panels.

## Motion

- Fast feedback: 160ms. Standard transitions: 200ms. Page or sheet transitions: 240ms.
- Default easing: `cubic-bezier(0.22, 1, 0.36, 1)`.
- Animate opacity and small 8–12px translations. Avoid large travel, parallax, and decorative looping.
- Emergency pulses are permitted only for active, unacknowledged conditions.
- Honor the operating system reduced-motion setting. Motion may clarify state but must never delay data or an emergency action.

