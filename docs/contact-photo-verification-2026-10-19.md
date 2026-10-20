# Contact photo verification — 2026-10-19

Base commit: `76a9f46d354178814f4a4b13ab3ef4b40bb57f81`. The worktree was clean before this task. Checks run against uncommitted changes; this is not a deployed release.

## Change

Removed the separate upload and social-import buttons from `ContactEditForm`. The avatar/placeholder uses the shared shadcn button to open the authenticated file picker, including keyboard activation. Complete supported social URLs trigger a 650 ms debounced lookup without blur when the contact has no photo. Existing/manual photos are preserved. Changed URLs, upload, save and unmount invalidate pending lookups; newly allocated late-result uploads are released. Public-photo failures remain visible. The existing destructive photo removal and form/scroll/footer ownership are retained.

Updated the contact editor contract in `docs/mobile-overlays.md`. Updated the development-only shadcn CLI from 4.22.0 to compatible 4.22.1 with its lockfile.

## Completed checks

- `node scripts/contact-photo-smoke.mjs`: PASS, exit 0, all eight viewports: 320×800, 390×844, 768×900, 820×900, 1024×900, 1440×1000, 1920×1080, 390×400. Explicit fixture transport verifies automatic social detection without blur, no lookup for ordinary websites, stale-result rejection, retry of the same cancelled URL, manual upload preservation, actual mouse and keyboard native file chooser, and absence of the removed buttons. All unrelated API calls are rejected. Final log: `/tmp/rollapp-contact-photo-final.log`.
- `FORM_ACTION_PORT=5297 FORM_ACTION_CASES=contact npm run test:form-actions`: PASS, exit 0, the complete contact viewport/short-screen matrix plus shared StrictMode/submit checks. This is a contact-specific diagnostic, not the full application matrix. Real contact drawer, close toolbar, photo controls, desktop ScrollArea/footer separation, mobile document scrolling and keyboard panning are covered. Log: `/tmp/rollapp-contact-form-actions.log`.
- `npm run test:ui`: PASS after replacing the initial raw avatar button with the shared shadcn primitive; no exception added to the checker.
- `npm run build`: PASS. Existing large-chunk warning remains.
- `npm audit` and `npm audit --omit=dev`: completed after the compatible shadcn update. Production: 0 vulnerabilities. Full dependency tree: 7 high advisories in development shadcn/glob tooling. The dry run still reports those advisories; its proposed forced shadcn 1.0.0 downgrade was not applied.
- Production configuration restored in this worktree through ignored `.env`/`.env.local` references to the primary checkout. Runtime database password loaded through the existing Lockbox helper without printing it. Direct TLS PostgreSQL `BEGIN READ ONLY` → `SELECT 1` → `ROLLBACK`: PASS. No schema initialization, contact save or production photo upload/delete performed.
- Primary checkout `npm run dev:keepalive:status`: enabled, API and frontend ready. Existing service left running; `/api/healthz` returns `ok: true`.
- Desktop/mobile screenshots inspected; final contact-photo screenshots: `/tmp/rollapp-contact-photo-<width>-<height>.png`.

## Broad verification

`npm run check:comprehensive` was started with the full matrix and no viewport filters. The initial attempt stopped at the raw-button audit; that implementation was corrected before the new run. The full release run passed unit tests (715 passed, 1 skipped), shadcn audit,
control geometry, detail actions, date picker and the complete form-actions matrix.
It then stopped before editor tests because TCP 5199 was occupied by a separate
`node scripts/text-edit-smoke.mjs` process (PID 51274); that process was not stopped.
No later comprehensive stages ran. Durable JSON: `docs/contact-photo-comprehensive-2026-10-19.json`.
An optional unfiltered editor retry used `TEXT_EDIT_PORT=5300`. It was stopped
with its own child processes after the initial image-resize cases, because the
editor is unchanged by this task and this is not a complete application audit.
This retry is **incomplete**, and its PASS records are not counted as a full
`test:text-edit` result. Log: `/tmp/rollapp-contact-text-edit.log`.

`FORM_CASES=contact npm run test:form-pages` passed the contact cases at all ten
configured widths and the shared nested-form/StrictMode checks, then failed the
shared source-document Back restoration assertion: scroll offsets animated from
1930 to 388. This is a failed diagnostic, not a full form-page PASS. Log:
`/tmp/rollapp-contact-form-pages.log`. The same contact-filtered command on the unchanged primary checkout passed,
including source restoration (`/tmp/rollapp-contact-form-pages-baseline.log`).
The sequential final worktree retry passed (exit 0), including every contact width,
StrictMode/nested forms and source-document page/browser Back restoration
(`/tmp/rollapp-contact-form-pages-final.log`); the first failure is retained
as intermittent evidence rather than being called a pre-existing deterministic defect.

Final `git diff --check`: PASS. Final diff reviewed; changes are limited to contact
photo behavior/styles, its fixture/check/documentation, and the compatible shadcn
CLI patch. No editor implementation, schema or stored contact data was changed.

## Limits

Fixture photo responses verify the UI and request lifecycle, not live extraction from every supported social network. Public/private profile availability and external provider restrictions still determine whether an image can be obtained. No authenticated production contact was modified, and no deployment was performed. Native chooser/keyboard checks use desktop Chrome; actual-device mobile photo permissions and OS pickers are not verified.
