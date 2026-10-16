# Mobile overlay behavior

`src/overlays.css` is the product layout layer for portalled drawers and dialogs.
`useVisualViewport()` runs once in `App` and publishes the visible height, top
and bottom offset to the document. It handles overlay keyboards, resized layout
viewports, browser chrome and iOS viewport panning. Pinch zoom does not resize the
application layout.

- Base UI owns focus trapping, return focus, page scroll locking, touch gestures
  and drawer field reveal via `Drawer.VirtualKeyboardProvider`.
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

Run `npm run test:drawers`, `node --test src/hooks/use-visual-viewport.test.js`,
`npm run test:ui`, and `npm run build`.

The drawer smoke test starts a temporary Vite server on loopback port 5187 and a
headless Chrome process (`CHROME_PATH` can override the executable). It tests the
actual new-form components and the common scroll/full-screen compositions, with
production styles. API requests are rejected by the test: it supplies only fresh
unsaved component props and neither substitutes a database nor creates accounts,
sessions or domain records. Any live API verification must use the configured
production database.

Coverage includes 320/390/414px portrait, 896px landscape and 1440px desktop;
keyboard resize and panning; first/last field focus; footer reachability; height
restoration; touch body scrolling; swipe dismissal; nested drawer Escape; and
release of the document scroll lock. Real form variants run at 320/390/896px.
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
`height: --app-visual-height`, just like the overlay coordinate system. This
keeps iOS keyboard panning from moving its in-flow form off screen. The To Do
list owns scrolling, with scroll anchoring disabled; the composer stays outside
that scroller and the floating controls use `--app-visual-bottom`.

On phones below 768px, wish creation follows the native mobile form-page
contract described below. Desktop drawer sizing is unchanged.

Catalog item details now navigate on mobile to `/app/wishes/catalog/item/:itemId`.
This is an independent protected route with a read-only item endpoint, normal
page scrolling and browser history. No Drawer, backdrop, portal or scroll lock
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

All application form drawers use `form-surface.jsx`, which keeps the installed
shadcn Drawer on desktop and uses `MobileFormPages` below 768px. Mobile forms
have a `formScreen` URL/history entry and render into a normal document-flow
page host through the shared `ScreenPortal`. No Drawer, backdrop, fixed-height
sheet, focus trap or document scroll lock is created on mobile.

The source React tree is cached, hidden and inert while a form page is active;
its contexts and save callbacks remain intact. Native scrolling reveals fields
and footer actions. Short forms fill the viewport; longer forms grow with the
document. Their minimum height uses `--app-visual-height`, not `100dvh`: iOS can
overlay the keyboard without resizing the layout viewport. This prevents the
body from stretching an empty area between its fields and submit action. Native
document scrolling remains the only scroll owner. Smooth document scrolling is
disabled while a form page is active so keyboard focus and WebKit panning do
not trigger a second animated scroll. With the keyboard open, footer padding is
16px (the home-indicator safe area is below the keyboard). The footer owns a single
bottom inset of 16px or the larger system safe
area, with no additional page padding below it. Mobile form headers and action
footers have transparent backgrounds and no separator slab; controls retain
their own fills. A shared Back action and browser Back close the page through
the original busy/close guard. On phones the shared Back action is fixed at the
bottom left, with an opaque 56px surface. Form footer actions reserve the space
beside it, wrap long labels and retain the one bottom inset. Detail pages use
the same Back position and a scroll tail; no top navigation row is reserved.
The mobile task editor keeps Save and Delete in one row alongside Back. Save
takes the remaining width; Delete uses the short visible label «Удалить» with
the full task/series action in its accessible label and confirmation dialog.
Both actions remain at least 56px high, including at 320px width.
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
behavior. Confirmation dialogs and date-selection popovers keep their shared
modal primitives.

`node scripts/mobile-form-pages-smoke.mjs` tests all component form fixtures at
320/390/640/767px, key desktop breakpoints, native scrolling, viewport shrink, Back,
nested drafts, busy guards, StrictMode and a suspended group. The fixture rejects
all API requests. The live wish/list flow is also checked without saving data.
