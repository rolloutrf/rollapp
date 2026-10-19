import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";

// VisualViewport uses layout-viewport coordinates. Ignore pinch zoom: zooming
// should magnify the sheet, not make its layout chase the magnified viewport.
export function measureVisualViewport(windowObject) {
  const layoutHeight = Math.max(0, Number(windowObject?.innerHeight) || 0);
  const viewport = windowObject?.visualViewport;
  const zoomed = viewport?.scale != null && Math.abs(viewport.scale - 1) > 0.01;
  const height = zoomed ? layoutHeight : Math.min(layoutHeight, Math.max(0, Number(viewport?.height) || layoutHeight));
  const offsetTop = zoomed ? 0 : Math.min(layoutHeight - height, Math.max(0, Number(viewport?.offsetTop) || 0));
  return {
    height: Math.round(height),
    offsetTop: Math.round(offsetTop),
    bottomInset: Math.round(Math.max(0, layoutHeight - height - offsetTop)),
    keyboard: !zoomed && layoutHeight - height > 60,
  };
}

const viewportChange = "rollapp:visual-viewport-change";
const emptyBoundary = { x: 0, y: 0, width: 0, height: 0 };
let currentBoundary = emptyBoundary;
function viewportBoundarySnapshot() {
  if (typeof window === "undefined") return emptyBoundary;
  const { height, offsetTop } = measureVisualViewport(window);
  if (currentBoundary.width !== window.innerWidth || currentBoundary.y !== offsetTop || currentBoundary.height !== height) currentBoundary = { x: 0, y: offsetTop, width: window.innerWidth, height };
  return currentBoundary;
}

// Only open anchored surfaces subscribe to the app's existing viewport source.
// Base UI needs a new Rect value when panning, not getters in a cached Rect.
export function useVisualViewportBoundary(enabled) {
  const subscribe = useCallback(listener => {
    if (!enabled) return () => {};
    window.addEventListener(viewportChange, listener);
    return () => window.removeEventListener(viewportChange, listener);
  }, [enabled]);
  return useSyncExternalStore(subscribe, viewportBoundarySnapshot, () => emptyBoundary);
}

// Recheck every overlay after viewport layout settles, including drawers:
// WebKit can undo the initial focus reveal while its keyboard is animating.
// Only move a field that is clipped; leave Base UI's centering intact otherwise.
function revealOverlayField(metrics, settled = false) {
  if (Math.abs((window.visualViewport?.scale ?? 1) - 1) > 0.01) return;
  const field = document.activeElement;
  if (!field?.matches('input, textarea, [contenteditable="true"]')) return;
  const popup = field.closest('[data-slot="dialog-content"], [data-slot="alert-dialog-content"], [data-slot="drawer-popup"]');
  if (!popup) return;
  // Let the drawer finish its initial smooth reveal before correcting native
  // scroll anchoring. An immediate scrollTop write would cancel that animation.
  if (metrics.keyboard && popup.matches('[data-slot="drawer-popup"]') && !settled) return;
  for (let parent = field.parentElement; parent && popup.contains(parent); parent = parent.parentElement) {
    if (!/auto|scroll/.test(getComputedStyle(parent).overflowY)) continue;
    const area = parent.getBoundingClientRect();
    const target = field.getBoundingClientRect();
    const top = Math.max(area.top, metrics.offsetTop) + 16;
    const bottom = Math.min(area.bottom, metrics.offsetTop + metrics.height) - 16;
    if (bottom <= top) continue;
    if (target.top < top || target.height > bottom - top) parent.scrollTop += target.top - top;
    else if (target.bottom > bottom) parent.scrollTop += target.bottom - bottom;
  }
}

// One subscription for the app, including every portalled overlay. Updating
// CSS avoids re-rendering all open forms during the keyboard animation.
export function useVisualViewport() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let frame = 0;
    let revealFrame = 0;
    let settleTimer = 0;
    const update = () => {
      const metrics = measureVisualViewport(window);
      root.style.setProperty("--app-visual-height", `${metrics.height}px`);
      root.style.setProperty("--app-visual-top", `${metrics.offsetTop}px`);
      root.style.setProperty("--app-visual-bottom", `${metrics.bottomInset}px`);
      root.toggleAttribute("data-overlay-keyboard", metrics.keyboard);
      root.toggleAttribute("data-overlay-compact", metrics.height < 420);
      window.dispatchEvent(new Event(viewportChange));
      cancelAnimationFrame(revealFrame);
      clearTimeout(settleTimer);
      // Native viewport resizing can reconcile scroll anchoring after resize
      // listeners run. Reveal again after layout and its native settle pass.
      revealFrame = requestAnimationFrame(() => revealOverlayField(measureVisualViewport(window)));
      settleTimer = setTimeout(() => revealOverlayField(measureVisualViewport(window), true), 350);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    document.addEventListener("focusin", schedule);
    // Commit geometry before Base UI's queued focus alignment reads it.
    // Deferring this until rAF can leave stale keyboard padding on the body.
    window.addEventListener("resize", update);
    // WebKit may dispatch document scrolling before VisualViewport.scroll
    // (or defer the latter until the touch gesture ends).
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("orientationchange", update);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(revealFrame);
      clearTimeout(settleTimer);
      document.removeEventListener("focusin", schedule);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      for (const name of ["--app-visual-height", "--app-visual-top", "--app-visual-bottom"]) root.style.removeProperty(name);
      root.removeAttribute("data-overlay-keyboard");
      root.removeAttribute("data-overlay-compact");
    };
  }, []);
}
