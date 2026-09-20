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
  respects the safe area. Under 420px of visible height, footer actions share a
  row and header descriptions become visually hidden (still accessible).
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
