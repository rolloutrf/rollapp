# Mobile form keyboard footer — 2026-10-17

Tested HEAD: `710457583a873ce56b93d4eb26849731164f5b2d`, dirty workspace with pre-existing and concurrently changing files. This is not a clean release verification.

## Change

The supplied iPhone recording shows the New Principle footer moving vertically and overlapping the field during keyboard-open document scrolling. Native form actions retain one fixed ControlBar, their original form owner, 48px controls, and the document as the single scroller. While the keyboard is open, the row anchors to the visual top plus visual height, minus the existing gap and control height, instead of applying a keyboard inset to the fixed bottom edge. Document scroll events also refresh viewport metrics.

Regression coverage in `scripts/form-actions-smoke.mjs` exercises both pan directions and changing `innerHeight` independently of the fixed containing block. `FORM_ACTION_PORT=0` allows an ephemeral port when other checks run concurrently. The fixture rejects API requests and does not write production data.

## Verification

- `npm run dev:keepalive:status`, repeated outside sandbox: API and frontend ready; persistent production development service left running.
- `npm run build`: passed, with the existing large-chunk warning.
- `git diff --check`: passed.
- `npm run check:comprehensive`: first attempt stopped at an occupied control-test port 5192. Second attempt completed 500 unit tests (1 skipped, 0 failed), then stopped in `test:ui` at concurrently modified `editable-text-block.jsx` (custom dialog semantics). Neither attempt is a full matrix pass.
- First isolated form matrix confirmed 320px cases, including Principle, then was interrupted while another task added `inline-editor.css`.
- `FORM_ACTION_PORT=0 npm run test:form-actions`: passed, exit 0. Full default matrix: 320/390/640/767/768/820/1024/1440/1920px, plus 390×400 short viewport; all nine form cases, keyboard panning in both directions, changing innerHeight, Back, submission/form ownership, and the nested form-flow scenario. Principle screenshot at 390px inspected; controls remain on one row.
- `npm audit --omit=dev --json`: 0 vulnerabilities. Full `npm audit --json`: 7 high findings in the existing development tooling chain shadcn/ts-morph → fast-glob/micromatch/braces. No dependency changes made for this fix; npm's proposed shadcn 1.0.0 downgrade was not applied.

## Limits

Chrome simulates keyboard and viewport panning; this does not reproduce WebKit's native compositor. Real iPhone Safari / Telegram WebView confirmation of the supplied interaction remains necessary. No deployment, real form saves, or production data mutations were performed. Broader verification is affected by concurrent workspace edits and is not claimed complete.

WebKit background: https://bugs.webkit.org/show_bug.cgi?id=218465 (deferred VisualViewport scroll events). API coordinate model: https://developer.chrome.com/blog/visual-viewport-api.
