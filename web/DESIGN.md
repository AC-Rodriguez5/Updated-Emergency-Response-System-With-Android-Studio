# TanzAlert Admin Web Design Adapter

The repository-level [`../DESIGN.md`](../DESIGN.md) is the visual source of truth. This maintained web adapter maps those tokens to `src/index.css` and `tailwind.config.js`; reusable behavior lives under `src/components` and motion variants live in `src/styles/motion.ts`.

- Canvas: `#F3F7FB`; surface: `#FFFFFF`; command: `#071526`.
- Signal: `#22D3EE`; operational action: `#2563EB`; emergency: `#E5484D`; success: `#22C55E`.
- Manrope owns interface text. JetBrains Mono owns incident IDs, timestamps, device IDs, and telemetry.
- The web runtime mirrors the repository tokens. Any token change must update the root design file, CSS variables, Tailwind adapter, and shared Flutter package in the same change.
- The supported mode is adaptive: light operational surfaces with dark command navigation. The operating system reduced-motion preference controls Motion through `MotionConfig`.
