import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// Move only the list row; selecting a list must not scroll the page vertically.
function revealList(viewport, item) {
  if (!viewport || !item) return;
  const bounds = viewport.getBoundingClientRect();
  const target = item.getBoundingClientRect();
  const style = getComputedStyle(viewport);
  const start = bounds.left + (Number.parseFloat(style.scrollPaddingLeft) || 0);
  const end = bounds.right - (Number.parseFloat(style.scrollPaddingRight) || 0);
  const delta = target.left < start ? target.left - start : target.right > end ? target.right - end : 0;
  if (Math.abs(delta) > 1) viewport.scrollBy({ left: delta, behavior: "instant" });
}

export function WishListNavigation({ value, className, children }) {
  const viewportRef = useRef(null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const revealSelected = () => revealList(viewport, viewport.querySelector('[data-slot="toggle-group-item"][aria-pressed="true"]'));
    revealSelected();
    const observer = new ResizeObserver(revealSelected);
    observer.observe(viewport);
    observer.observe(viewport.firstElementChild);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div
      ref={viewportRef}
      className={cn("list-tabs", className)}
      data-wishlist-list-navigation
      aria-label="Списки желаний"
      onFocusCapture={(event) => revealList(viewportRef.current, event.target.closest("button"))}
    >
      <div className="list-tabs__track">{children}</div>
    </div>
  );
}
