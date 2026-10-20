# Mobile overlay behavior

`src/overlays.css` is the product layout layer for portalled drawers and dialogs.
`useVisualViewport()` runs once in `App` and publishes the visible height, top
and bottom offset to the document. It handles overlay keyboards, resized layout
viewports, browser chrome and iOS viewport panning. Pinch zoom does not resize the
application layout.

Inline document popovers use `useVisualViewportBoundary(open)` from the same
viewport module. It subscribes only while open to the app's geometry event and
passes a current Rect to Base UI's `collisionBoundary`. `PopoverContent` forwards
the official `collisionBoundary` and `sticky` positioning props to its Positioner.
Inline type/color/block menus enable sticky shifting, so panning an anchor above
the keyboard viewport cannot limit the menu to that offscreen anchor. This is
popup positioning; page action buttons keep their existing ControlBar geometry.

- For actual modal drawers/dialogs, Base UI owns focus trapping, return focus,
  page scroll locking, touch gestures and field reveal via
  `Drawer.VirtualKeyboardProvider`. Native mobile form pages have no modal trap
  or scroll lock; their separate contract is described below.
- Viewport CSS must update synchronously before Base UI's queued focus alignment.
  Otherwise it can retain padding calculated from the pre-keyboard rectangle.
- Non-snap drawers use intrinsic height, capped by the available viewport.
  A measured fixed height would retain the keyboard's smaller height after close.
- Use one `app-drawer-body` with `min-h-0 flex-1 overflow-y-auto`, or the shared
  `ScrollArea`, between the header and footer. Preserve `min-h-0` throughout the
  flex chain. Fields must not shrink to fit instead of scrolling.
- Header, close action and footer remain outside the body scroller. Footer padding
  respects the safe area; while the keyboard is open, its own 16px padding
  replaces the home-indicator inset below the keyboard. Under 420px of visible
  height, footer actions share a row and header descriptions become visually
  hidden (still accessible).
- The wish editor body disables native scroll anchoring, and its empty image
  placeholder can shrink on phones so focused fields remain reachable. Defer
  drawer field-reveal correction until the sheet's initial reveal has settled;
  an immediate scroll write can cancel that motion.
- `canAutofocusForm()` permits initial field autofocus only on wide screens with
  a fine pointer and hover. Opening a mobile form, including in landscape, does
  not summon the keyboard. Explicit inline rename actions may focus their input.
- The full-screen editor uses the same viewport coordinates and scrolls its own
  body to reveal focused fields. The create-wish drawer must not inherit the
  full-screen editor's outer padding or minimum viewport height.
- If a sibling modal is opened from the wish editor, suspend the parent trap and
  dismissal until it closes, preserving the editor's form and return-focus target.

## Verification

Product `DrawerFooter` composes the installed primitive with `ControlBar` and
`app-form-actions`. Custom contact and wish footers use the same composition
through `MobileFormFooter` on desktop. All use 48px pill buttons, 48px circular
icon actions, 20px glyphs, 18px/28px text and an 8px gap. The primary action
grows first; secondary actions follow it, with wrapping when needed. Desktop
footers use the same 16px inset, separator and popover surface, outside the body
scroller. Disabled actions remain opaque; destructive colors survive hover and
disabled states. Icon-only close actions also compose `ControlBar`. None of
these rules change the upstream Drawer/Button primitives.

Run `npm run test:drawers`, `npm test`,
`npm run test:ui`, and `npm run build`.

`npm run test:text-edit` covers inline popovers; the style matrix also simulates
a 220px VisualViewport panned down by 96px and requires the color menu to remain
inside it with 16px gutters. Real iOS keyboard review is still separate evidence.

The drawer smoke test starts a temporary Vite server on loopback port 5187 and a
headless Chrome process (`CHROME_PATH` can override the executable). It tests the
actual new-form components and the common scroll/full-screen compositions, with
production styles. API requests are rejected by the test: it supplies only fresh
unsaved component props and neither substitutes a database nor creates accounts,
sessions or domain records. Any live API verification must use the configured
production database.

Coverage includes 320/390/414px portrait, 768/820px transitions, 896px landscape,
1024/1440/1920px desktop and a 390×400 short window;
keyboard resize and panning; first/last field focus; footer reachability; height
restoration; touch body scrolling; swipe dismissal; nested drawer Escape; and
release of the document scroll lock. Real form variants run at every size and
assert all four corner radii, exact control and glyph sizes, text metrics,
opacity, background alpha, label fit and 8px action gaps.
To isolate failures, use `DRAWER_WIDTHS`, `DRAWER_MODES`, or `DRAWER_CASES`.

The keyboard geometry is simulated using VisualViewport events. This is not a
substitute for a final on-device iOS Safari/Telegram WebView keyboard check.

On phones, the global sphere and section switchers share a bottom row with the
planning launcher. Their popups prefer the top side and respect the available
visual height. The row uses the shared safe-area/VisualViewport position; with
the keyboard open, it keeps a 16px inset above the keyboard instead of adding
the home-indicator inset below it. Native form pages hide the source navigation
with the rest of the source screen. `node scripts/mobile-navigation-smoke.mjs`
checks placement, menus, safe area, keyboard geometry, source hiding and desktop
header preservation using presentation props only; all API calls are rejected.

Planning uses a fixed viewport shell with `top: --app-visual-top` and
`height: --app-visual-height`. The To Do surface owns its vertical scroll with
scroll anchoring disabled. On mobile its top date/Add row scrolls with the list;
Add opens a separate native task page, with no inline composer. Desktop retains
its date ribbon and composer composition. Floating controls use the shared
VisualViewport/safe-area navigation inset.

On phones below 768px, wish creation follows the native mobile form-page
contract described below. Desktop drawer sizing is unchanged.

Catalog item details now navigate on mobile to `/app/wishes/catalog/item/:itemId`.
This is an independent protected route with a read-only item endpoint, normal
page scrolling and browser history. No Drawer, backdrop or scroll lock
is mounted on that route. Reloading the URL reloads the same item; unavailable
and private items return an error instead of falling back to another record.
The catalog uses its right-hand Drawer on desktop.

Wish details use their existing public `/username/wishes/:wishId` route or the
shared `/s/:token/wishes/:wishId` route as an independent mobile page. The
profile, wishlist grid and group dialog are not rendered while that page is
open. The title and description are normal HTML rather than Drawer semantics;
the global header and planning launcher are absent on mobile detail routes.
Opening a wish from the private dashboard navigates to its public-profile route
(the existing authenticated profile endpoint still determines access).

## Mobile form pages

Text documents now use `InlineDocument` / `EditableTextBlock`: tapping the prose
places a caret in the document. They do not open a drawer or native form page,
lock scrolling, or add a fixed Save/Back row. The document remains the vertical
scroll owner. Autosave and draft recovery follow [inline-editing.md](inline-editing.md).
Read-only/loading/error states never enable writing. `test:text-edit` covers the
mobile and desktop matrices, including a short viewport.

All application form drawers use `form-surface.jsx`, which keeps the installed
shadcn Drawer on desktop and uses `MobileFormPages` below 768px. Mobile forms
have a `formScreen` URL/history entry and render into a normal document-flow
page host through the shared `ScreenPortal`. No Drawer, backdrop, fixed-height
sheet, focus trap or document scroll lock is created on mobile.

The source React tree is cached, hidden and inert while a form page is active;
its contexts and save callbacks remain intact. Short forms fill the visible viewport;
longer forms grow with the document. Their minimum height uses
`--app-visual-height`, not `100dvh`, because iOS can overlay the keyboard without
resizing the layout viewport. The document is the only scroll owner. Smooth
scrolling is disabled while a form page is active so keyboard focus and WebKit
panning do not trigger a competing animation.
Entry and source-scroll restoration use explicit `behavior: "instant"` as well:
once the form unmounts, the source's global smooth-scroll CSS is active again.
Restoring its saved position must not animate from the top. `test:form-pages`
checks both page and browser Back from a deep source position, frame by frame.

`MobileFormFooter` keeps Back, submit and optional delete in one fixed
`ControlBar`, with 48px controls and 8px gaps. Its bottom uses
`--layout-navigation-bottom`: visual viewport offset plus 16px or the larger
safe area; keyboard mode omits the home-indicator inset.

While the keyboard is open, the fixed row instead uses a top anchor calculated
from `--app-visual-top + --app-visual-height`, minus the gap and control height,
with `bottom: auto`. This avoids subtracting a keyboard inset from WebKit's
moving fixed bottom edge during document panning. Document `scroll` also updates
the viewport metrics, since WebKit can defer `VisualViewport.scroll` until the
gesture ends. The row retains its form owner and the document remains the only
scroll owner.
The row has no background slab, border or extra padding; individual controls are opaque.
Disabled controls use the product's solid muted surface/text at full opacity;
they must conceal scrolled fields just like enabled controls. A document tail of
one control height plus two 16px gaps and the safe area lets the final field
scroll above it. Never position Back independently when a form footer exists.
Forms without a footer (such as date selection) retain the shared fixed Back.

Submit stays inside its original HTML form: validation, Enter submission, busy
and close guards are preserved. A form footer registers with its page context so
nested screens show exactly one Back, alongside their own actions. Desktop
Drawer footers remain outside the body scroller. At narrow widths delete may
use an icon with its complete accessible name; the shared Back replaces Cancel.
Principle and thesis editors place a round 48px trash icon beside Save in the
same footer on mobile and desktop. Mobile uses «Сохранить» with the complete
accessible name «Сохранить изменения». The trash opens the existing confirmation
dialog; it has no separate body row or divider. Other `EditorDeleteAction` callers
retain their existing layout unless they opt into its `compact` composition.
`npm run test:form-actions` is required before release and checks scroll positions,
48px row alignment, hit targets, form ownership, Enter, busy Back, keyboard resize
and viewport panning at 320–1920px, including short viewports.

Detail pages use
`ContentPageActions` to move the original controls through `ScreenPortal` into
the same fixed row as Back: 48px Back, flexible accent action, 48px overflow,
with 8px gaps. Catalog details without overflow use Back and the accent action.
Owner product details put marketplace search in the primary slot; fulfillment
remains available in overflow. Other details keep their primary action there,
with compact visible labels and complete accessible names. The document tail
lets the final content scroll above the row; no top navigation row is reserved.
The action row preserves its position with visual-viewport/keyboard changes,
has no background slab, and retains opaque individual surfaces. Desktop actions
stay in their original content position. `npm run test:details` checks these
states at 320/390px, short viewports and desktop transition/wide breakpoints,
including overflow focus return, scroll reachability and Back.
The task editor keeps Save and Delete in one row, alongside Back on mobile. Save
takes the remaining width; Delete uses a circular trash icon with the full
task/series action in its accessible label, title and confirmation dialog.
The wish editor uses the same save-first order and circular delete action.
Both actions remain at least 48px high, including at 320px width.
Nested forms have their own history entries and
return to the parent's unchanged draft. A form is marked as entered when its
browser history entry is written, so a fast Back cannot skip reconciliation
before React observes the intermediate URL. Reconciliation also listens directly
to browser `popstate`: Router updates may coalesce a fast push/back cycle without
rendering its intermediate location. Disposal checks the committed browser URL
before navigating back, preventing an additional Back from a stale React location.
Existing fullscreen group dialogs are
suspended and their portals hidden while a native form page is open.

Form URLs represent transient editing sessions, not persisted drafts. Reloading
such a URL returns to its owning section and never replays an operation. File
uploads, validation, cancellation and explicit saves retain their existing
behavior. Confirmation dialogs keep their shared modal primitives.

`PlanningDatePicker` uses an independent `MobileFormScreen` below 768px, with
the heading and calendar on the page and the shared 48px Back at the bottom.
There is no dialog, backdrop, rounded sheet or document scroll lock. The calendar
fills its form rail; one document scroller reveals the last week and optional
clear action above Back even in a short viewport. Month and year selectors
remain the installed shadcn Select. Desktop keeps its anchored Popover.

Selecting or clearing closes the date page and then applies the local date key.
`MobileFormScreen.onAfterClose` waits for the owner's Router history to restore
before running this callback, so a URL-based date change cannot retain or revive
the dismissed `formScreen` entry. Back cancels. A picker opened from a task form
has its own history entry and returns to the same unsaved draft. The parent form's
Save is still the only operation that persists the task. `npm run test:dates`
covers this in StrictMode, including leap days, clearing, URL/list preservation,
both Back actions, short mobile viewports and desktop popovers; all API requests
are rejected. It is required by `check:release`.

`node scripts/mobile-form-pages-smoke.mjs` tests all component form fixtures at
320/390/640/767px, key desktop breakpoints, native scrolling, viewport shrink, Back,
nested drafts, busy guards, StrictMode and a suspended group. The fixture rejects
all API requests. The live wish/list flow is also checked without saving data.

### Contact editor

`ContactEditForm` owns a flex column: one `ScrollArea` for `.contact-detail__edit-body`
and a sibling `MobileFormFooter` composed through `ControlBar`. Desktop Save and
icon-only Delete stay in a single 48px row outside the scroll viewport. On mobile,
the same footer includes Back and follows the native page/VisualViewport contract;
the document remains the only vertical scroll owner. Do not wrap the entire editor
in another `ScrollArea` or restore a sticky footer inside its fields.

The profile header places avatar, name and favorite in separate grid columns.
Photo actions wrap in a named group below it; removal is labelled “Удалить фото”.
The body owns section spacing with `--layout-page-gap`. The full editor fixture
includes its actual right-hand Drawer, close toolbar and photo state.
`test:form-actions` checks header collisions, distinct delete labels, desktop
scroll/footer separation, and mobile scroll/keyboard action geometry.

Inline prose menus establish computed fixed positioning before their first
Floating UI measurement. The Tiptap React initial inline absolute style must not
make a relative body add document scroll to viewport coordinates. The local
inline-menu CSS owns this initialization; the document/body layout is unchanged.
The first-offscreen-selection regression includes the first link panel, short
viewports and a live read-only check with an exact 8px selection-to-toolbar gap.


Table row/column menus share the fixed body-host/VisualViewport boundary used by
the inline editor. On short desktop the menu has one scrolling body; text actions
remain reachable at its tail. Hover controls use ControlBar48px/20px and disappear
while typing; they do not reserve a permanent toolbar row. A pointer capture is
cancelled on Escape, document/access change, blur, visibility loss or capture loss.
Closing the axis popup synchronously focuses the editor before the next shortcut.
The current viewport proof includes390×400 keyboard-menu interaction and1440×400
pointer/menu interaction. Real touch/IME and the live app-header/table composition
remain separate unverified items in the Notion matrix.


Table-axis hover placement reserves the actual app header's bottom edge before
choosing above-table or gutter slots. On short screens with a tall first cell,
row and column controls use separate vertical slots. The existing8px gutter boundary remains unchanged. The fixture nests the reading
container inside the page shell, matching the real application.
The real-header fixture checks both control hit-testing and text Range overlap;
a successful standalone editor layout does not prove this composition.

Для focus inline prose native scroll-padding учитывает нижнюю mobile navigation и общие visual-viewport/safe-area tokens. После keyboard/input reveal читает реальные bounds и VisualViewport, не меняя document/selection/history. Pinch zoom, IME composition и read-only исключают коррекцию. Manual scrolling не запускает обратный переход к caret. Проверки браузера не заменяют real iOS/Telegram keyboard validation.

Тот же native caret contract действует на plaintext InlineTextField, включая пустые строки; wheel/touch intent отменяет отложенное раскрытие. Табличные hover growth controls доступны от1024px, всегда48px/20px с общими ControlBar shapes и реальными chrome bounds. На мобильных действия остаются в существующем меню; новый постоянный toolbar или независимый vertical scroller не добавляется.

Column resize separators используют отдельный body portal и видимые viewport/chrome bounds. До768px они не выводятся: колонки читаются последовательно. Preview не меняет данные; source/access/composition/pointer interruption отменяют его. Нативные клавиатуры iOS/Telegram этим desktop pointer/Chrome smoke не проверены.

Desktop product drawers consistently enter from the right without an extra
swipe-handle rail. This keeps header, fields and footer on the same 16px inset
regardless of the caller's historical `showSwipeHandle`/direction props. The
product wrapper owns this choice; mobile forms retain their native-page contract
and upstream drawers keep gesture support.
