# Calendar event border verification — 2026-10-25

Tested base commit: `f55cce47e5718bc411f39cfc9436930deb152f23`, detached HEAD with existing dirty calendar/device-sync work. This request changes only the event border in `src/components/planning-calendar.css`; earlier workspace changes are preserved.

Removed the 3px primary-colour left accent. Event cards retain the same neutral 1px border on all four sides. No database, schedule, or interaction logic changed.

## Checks

- `npm run test:calendar`: passed, all 46 viewport/height combinations (14 event/form, 16 gesture, 16 device-sync UI). Event widths: 320, 390, 768, 820, 1024, 1440, 1920px; gesture/sync checks also include 767px. Every width was checked at heights 900 and 400px, without viewport filters. Log: `/tmp/rollapp-calendar-border-2026-10-25.log`.
- `npm run test:ui`: passed (37 primitives, 80 application JSX sources).
- `npm run build`: passed; existing large-chunk warning remains.
- `npm audit` and `npm audit --omit=dev`: both report zero vulnerabilities.
- `git diff --check`: passed.
- `npm run dev:keepalive:status`: API and frontend ready, persistent service left running with the configured production connection.
- Inspected calendar screenshots at 390×900 and 1440×900. White side accents are absent, titles and resize handles remain visible.
- Read actual computed styles in the 390×900 fixture: all four borders are `1px`, `oklch(1 0 0 / 0.1)`; the long event is 152.5×214px. Screenshots: `/tmp/rollapp-events-390-900.png`, `/tmp/rollapp-events-1440-900.png`.

CSS SHA-256: `14e9d6df8fa2608ff2ee39d86c2e7c5261fb21c96199fbb9a8068d19bbced1f4`.

## Scope and limits

This is targeted calendar/UI verification, not a new comprehensive application audit. Isolated UI fixtures reject API traffic and do not save production data. No production deployment, real-device touch check, or Apple Calendar permission/synchronization check was performed for this cosmetic change.
