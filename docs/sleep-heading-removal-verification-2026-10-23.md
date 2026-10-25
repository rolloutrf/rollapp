# Sleep heading removal — 2026-10-23

- Tested base commit: `237386530fd11e359f6f997735537b85e6ccb419`.
- Initial working tree was clean. Verification uses the uncommitted change in `src/components/health-tracker.jsx`.
- Removed the visible «Сон» heading and «Ваш сон — день за днём.» introduction. Retained the screen-reader heading and named tracker article.
- `npm ci`: PASS; lockfile unchanged.
- `npm run test:health`: PASS, complete nine-viewport matrix (320, 390, 768, 820, 1024, 1440, 1920px; short mobile/desktop), both trackers and midnight rollover. No API requests. Visually inspected 320px and 1440px sleep screenshots in `/tmp/rollapp-health-trackers`.
- `npm audit` and `npm audit --omit=dev`: PASS, zero vulnerabilities.
- `git diff --check`: PASS.
- `npm run check:comprehensive` started without filters and remains in progress at handoff. Unit and UI contract checks passed; control checks are running. This is not a comprehensive PASS or release verification. Log: `/tmp/rollapp-remove-sleep-heading-check.log`; machine report: `/var/folders/56/y9x0qcp95zs6ctldh56fs6qh0000gq/T/rollapp-check-1792780422997.json`.
- Live production-backed review unavailable: keepalive startup reports no configured `DATABASE_URL` or `PGHOST`. No replacement database, migration, or application-data writes were performed.

## Follow-up: maximum container width

- Sleep now uses the existing `--layout-form-width` (576px), matching the daily To Do content rail, instead of the 1024px collection rail. It stays centered and fluid below its maximum. Nutrition retains its existing rail.
- Updated `docs/container-system.md` with this use of the existing role.
- `npm run test:health` repeated after the width change: complete nine-viewport matrix passed; screenshots inspected at 1440px (centered narrow rail) and mobile retained its available width. Log: `/tmp/rollapp-sleep-width-health.log`.
- `npm run test:ui` and `git diff --check`: PASS.
- The comprehensive run began before the width follow-up; do not treat its result as verification of a single unchanged snapshot. Live review remains unavailable for the connection reason above.

## Follow-up: remove card actions

- Removed the visible sleep-card Edit/Delete row and its unused icons/callback. Whole-card editing remains. Updated the health tracker contract to describe this surface, including the first-period target for legacy multi-period days.
- Updated the existing smoke checks to assert no inline actions and exercise card reopen, creation/retry and cancellation. Initial harness attempts retained an obsolete history expectation, omitted the freshly mounted fixture's intentional failure/retry, then raced mobile Back against navigation; corrected these expectations and waited for form closure.
- Final `npm run test:health`: PASS, exit 0, all nine viewport pairs and midnight checks. Log: `/tmp/rollapp-sleep-no-buttons-health.log`. Mobile 320px and desktop 1440px screenshots reviewed.
- `npm run test:ui`, `npm run build`, `git diff --check`: PASS. Build retains the existing chunk-size advisory.
- Earlier comprehensive run is still in progress across changing dirty snapshots and is not release evidence for this final version. Production live review remains unavailable as recorded above.
