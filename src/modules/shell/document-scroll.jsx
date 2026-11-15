

const ACTIVE_SCROLL_LOCK_SURFACE_SELECTOR = [
  '[aria-modal="true"]:not([data-closed])',
  '[data-slot="dropdown-menu-content"][data-open]',
  '[data-slot="dropdown-menu-sub-content"][data-open]',
  '[data-slot="select-content"][data-open]',
  '.modal-backdrop',
].join(",");

const clearStaleDocumentScrollLock = () => {
  if (typeof document === "undefined" || document.querySelector(ACTIVE_SCROLL_LOCK_SURFACE_SELECTOR)) return;
  const root = document.documentElement;
  const body = document.body;
  // Base UI has no lock marker on macOS overlay scrollbars, so repair only
  // its known inline styles after every visible locking surface is gone.
  const hasStaleBaseUiInsetLock = root.hasAttribute("data-base-ui-scroll-locked") || (
    body.style.position === "relative"
    && body.style.height.includes("100dvh")
    && body.style.width.includes("100vw")
  );
  [root, body].forEach((element) => {
    ["overflow", "overflow-x", "overflow-y"].forEach((property) => {
      if (/^(hidden|clip)$/.test(element.style.getPropertyValue(property))) {
        element.style.removeProperty(property);
      }
    });
  });
  if (hasStaleBaseUiInsetLock) {
    root.removeAttribute("data-base-ui-scroll-locked");
    ["scrollbar-gutter", "scroll-behavior", "overflow", "overflow-x", "overflow-y"].forEach((property) => root.style.removeProperty(property));
    ["position", "height", "width", "box-sizing", "scroll-behavior", "overflow", "overflow-x", "overflow-y"].forEach((property) => body.style.removeProperty(property));
  }
};

export const scheduleDocumentScrollUnlock = () => {
  if (typeof window === "undefined") return undefined;
  let settleFrame = 0;
  const releaseFrame = window.requestAnimationFrame(() => {
    settleFrame = window.requestAnimationFrame(clearStaleDocumentScrollLock);
  });
  return () => {
    window.cancelAnimationFrame(releaseFrame);
    window.cancelAnimationFrame(settleFrame);
  };
};
