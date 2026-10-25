# Character trait composer — 2026-10-23

Tested base commit: `237386530fd11e359f6f997735537b85e6ccb419`, dirty working tree.
The working tree was clean before this task. Changes are local and not deployed.

Replaced the custom-trait heading/two-input card with a muted rounded InputGroup,
a multiline name field, an outlined circular plus and an arrow submit button.
The plus reveals the optional description and focuses it. Name-only additions
are supported by the existing canonical character document shape (including the
server identityCharacterSchema). Re-adding an existing custom trait without a
description preserves its authored description. Existing
selection/save/reset and access/loading guards remain in place.

## Verification

- `npm ci`: passed, lockfile unchanged.
- `npm test`: final source passed 822 tests, 1 skipped, 0 failures.
- `npm run test:ui`: final source passed (37 primitives, 84 JSX sources).
- `npm run build`: final source passed (existing large-chunk warning).
- `npm audit`: zero vulnerabilities.
- `npm audit --omit=dev`: zero vulnerabilities after retrying a TLS failure.
- Temporary browser presentation harness: eight viewport cases passed at
  320, 390, 768, 820, 1024, 1440 and 1920 × 844, plus 1440 × 400.
  Native filling/click/Enter verified empty-submit guard, description reveal,
  addition with and without description, selected custom records and save payload.
  Final eight-case rerun also verified a repeated name does not erase an existing
  description, duplicate the record, or dirty an unchanged saved selection. An
  extended harness attempt initially timed out expecting a Save button after an
  unchanged re-add; the assertion was corrected to require disabled Saved state,
  then the whole eight-case harness passed using a separate Vite cache.
  DOM checks verified 48×48 controls, 24px radii, 18px field text and no root overflow.
  Harness rejected every API request and supplied state at the content hook;
  it did not substitute a database or write production data. Temporary sources
  moved to `/tmp/rollapp-character-traits-preview.{mjs,jsx}` after verification.
  Screenshots: `/tmp/rollapp-traits-{width}x{height}.png`.
- Visual inspection caught the InputGroup disabled-submit opacity affecting the
  whole empty composer. Local `opacity: 1`, matching the existing To Do composer,
  corrected it. The name field was also changed to rows=1 so the shared 6rem
  textarea minimum produces the same initial height as the To Do composer.
  The complete eight-case presentation harness passed again after these changes.
- `npm run dev:keepalive`: enabled on dedicated API 8187/frontend 5287 using the
  repository's production TLS configuration and verify initialization. Service
  remains running. Initial startup lacked dependencies and environment files;
  npm ci and private copies of the existing repository configuration resolved
  this without a database fallback. Initial live navigation failed with PostgreSQL `53300`,
  pool user limit 20; a later reload succeeded. Real authenticated Character
  page loaded selected traits, showed the new composer and opened/focused its
  optional description. No authoring values or production writes were made.
- `npm run check:comprehensive`: PASSED all 10 stages, without viewport filters.
  This includes full check:release (and full test:text-edit), navigation, action
  rails, identity reports, To Do, form pages, catalog pages, wish groups, drawers
  and contacts. Durable JSON: `character-trait-composer-verification-2026-10-23.json`.
  Full command log: `/tmp/rollapp-character-comprehensive.log`.
- `git diff --check`: passed.

The comprehensive run began before the final local name-field height and
repeat-name description guard adjustments. Final unit/UI/build and the complete
eight-viewport composer harness were repeated afterwards. Shared editor,
primitives and typography sources were not changed during this task.

The full comprehensive command succeeded. This is a dirty local audit, not a
clean-commit production deployment. Actual-device keyboard/IME was not tested. No shared typography, primitives, editor or database schema changed.

## Width follow-up

The requested reference is the daily To Do content rail: `--layout-form-width`,
576px usable content. CharacterTraits now uses this role for the whole section,
including the composer, instead of the 1024px collection role. Card grids retain
one column on phones and at most two columns on larger viewports. The usage is
recorded in docs/container-system.md; shared width tokens are unchanged.

- `npm run test:ui` and `npm run build`: passed after the width change.
- Complete eight-viewport composer harness: passed with exact capped 576px width,
  equal centering gutters, one/two card columns, no overflowing card labels,
  48px buttons and existing add/description/save behavior. A diagnostic assertion
  initially counted checkbox-indicator grids; scoping it to the card grids fixed
  that harness error. Final log: `/tmp/rollapp-traits-width-final.log`.
- Real authenticated page: section and composer both measured 576px, with no root
  overflow. Production content was read without saving or changing it.
- `git diff --check`: passed.

The successful comprehensive JSON above predates this width-only follow-up;
comprehensive was not repeated for this local layout adjustment. The final width
has targeted browser/UI/build evidence, not a new full-release audit.
