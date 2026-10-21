# Image viewer iteration — 2026-10-21

Base production release cbc2d6d11eab8db6306b99a16c1f9d013d1cf27f was confirmed
by full CI39602727045, exact production health and read-only authenticated UI.
New work remains isolated in codex/notion-image-viewer-20261021.

## Owner foundation checkpoint (not a finished viewer)

The actual public age/strategy rich reader uses EditableTextBlock and therefore
InlineRichTextEditor with readOnly, not the lightweight InlineMarkdown renderer.
The same component serves editable documents and the Four Questions adapter.
Existing authoring chrome lives in InlineImageResize; canonical image attrs and
figure/caption history must remain untouched. FullscreenDialog already composes
the shared Base UI primitive and VisualViewport CSS. Use that composition, not
a new overlay/focus trap, for the pending viewer interface.

Added pure capture/ownership helpers in src/lib/inline-image-viewer.js. They
require the same editor, initialized/connected native image, model image node,
exact safe source, document, selection and editability; IME, detached/replaced
DOM and owner/source/access changes fail closed. Public read-only readers are
valid owners, but a later access-mode change retires the request. Helpers do
not focus, dispatch, save or mutate attrs/history.

`npm test` on dirty cbc-based working copy: terminal0/session63107,815 total,
814PASS,1SKIP,0FAIL. Full unit log /tmp/rollapp-viewer-unit-20261021.log.
`git diff --check` passed. Persistent905f service reported ready and remained
running. No production data or server configuration changed.

## Pending

Full comprehensive on clean b8bf6ca failed, terminal1/session59980 at
2026-10-21T18:30:24.947Z, during caption tests after viewer8PASS. New read-only
affordance had incorrectly replaced native img role/alt accessible name with
button/launch text. Existing caption test at line60 correctly rejected it.
Full failure artifacts preserved as
`/tmp/rollapp-viewer-comprehensive-failed-b8bf6ca-20261021.{json,log}`;
all frozen hashes matched after failure. No full PASS or deployment of b8.
Correction preserves native img role and authored alt; only tabindex,
aria-keyshortcuts and aria-description are transient keyboard affordances.
Added explicit native image-role/name assertion to the viewer browser suite;
existing caption assertions remain unchanged. Caption recovery passed all8
cases, terminal0/session9560,
`/tmp/rollapp-viewer-caption-recovery-20261021.log`. Viewer8 and public-reader8
recovery also passed, terminal0/session32500,
`/tmp/rollapp-viewer-accessible-reader-recovery-20261021.log`, including explicit
native img/alt assertion. These targeted recoveries do not replace a new full
comprehensive run on the clean corrective commit, which is the next gate.

UI implementation now exists in InlineImageViewer, connected to the shared
editor (including its read-only rich readers). FullscreenDialog/ControlBar and
the established theme/Geist roles are reused, following frontend-design's
restrained composition rather than introducing fonts or a second overlay system.
Double-click/Alt+Enter opens editable media; readers support click/Tab/Enter/Space.
Fit/natural-size zoom and Escape/Close never dispatch document transactions.

First UI diagnostic failed because its role-based source locator excluded the
correctly aria-hidden document behind the modal. Fixed that test locator without
weakening modality. Second diagnostic terminal0/session87796: viewer8 and public
reader8 PASS; third added ownership cases and passed terminal0/session22208.
Evidence /tmp/rollapp-viewer-browser-retry1-20261021.log and retry2 log.
Screenshot390×400 visually inspected: image contained, two48px circular actions.
Later access-decoration/source-cancellation additions passed terminal0 in
session48342, /tmp/rollapp-viewer-browser-retry3-20261021.log:8 viewer cases
plus8 existing public reader cases. This remains targeted evidence only.
UI contract check passed37primitives/84application sources before final additions.

Required before release: complete text-edit/comprehensive on a clean frozen
candidate. Viewer fixture checks captioned images, editable/read-only modes,
keyboard/Escape/focus, selection/access/source cancellation, untouched sibling
document, no saves/API and all eight sizes including a short window. Additional
complex nested/four-answer compositions, native image-load error/retry, actual
multiple-editor focus handoff and physical mobile interaction need further
coverage; pure owner guards do not prove those interfaces.

Fresh full unit run after UI integration: terminal0/session37155,815total/
814PASS/1SKIP. Fresh audits: production0, all7existing high dev-tool-chain
findings; no dependency changes or forced downgrade. Logs under
`/tmp/rollapp-viewer-{unit-ui,audit-all,audit-production}-20261021`.
No release/readiness/full Notion or actual-device IME claim at this checkpoint.
