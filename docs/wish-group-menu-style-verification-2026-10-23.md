# Wishlist group menu style — 2026-10-23

Tested base commit: `237386530fd11e359f6f997735537b85e6ccb419`.
Dirty implementation: one change in `src/App.jsx`; the worktree was initially clean.

The open Wishlist group's menu trigger used `ghost`, while its adjacent close
button used `outline` and `bg-card`. The trigger now uses the same variant,
background and circular composition, with `data-control-icon` for ControlBar.
Shared primitives, sizing tokens and menu behavior are unchanged.

Verification:

- `npm run test:ui`: PASS.
- `npm run test:wish-groups`: PASS, all 16 owner/read-only cases.
- `npm run test:controls`: PASS, complete default matrix including screenshot
  pixel checks and mobile DPR3.
- `npm run build`: PASS; existing large-chunk warning.
- `npm audit` and `npm audit --omit=dev`: PASS, zero vulnerabilities.
- Temporary browser diagnostic rendered the real `WishGroupDialog` at
  320×844, 390×844, 768×844, 820×450, 1024×844, 1440×844, 1920×1080 and
  390×400. All eight passed exact equality of menu/close backgrounds, borders,
  text color and radius, 48×48 controls, 20×20 glyphs, opening the actual menu,
  no page errors and no API requests. Screenshots:
  `/tmp/rollapp-group-style-{width}-{height}.png`; mobile and desktop inspected.
  Initial keyboard focus retains its normal visible focus ring. The temporary
  diagnostic fixture was removed.

Final `git diff --check`: PASS. Reviewed final change: one button composition
and this report; no unrelated workspace edits.

Live review unavailable: `npm run dev:keepalive:status` initially found missing
local dependencies; after `npm ci`, `npm run dev:keepalive` reported missing
`DATABASE_URL`/`PGHOST`. No alternate database was configured. No database
writes, schema changes or deployment were performed. This is a local style
verification, not a comprehensive application/release audit. Full editor and
comprehensive suites were not run for this isolated menu-button style change.
