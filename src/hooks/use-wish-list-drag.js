import { useEffectEvent, useLayoutEffect, useRef } from "react";
import { createCardDragPreview, guardDragClick } from "@/lib/card-drag-preview";

const HOLD_MS = 350;
const HOLD_SLOP = 8;
const DRAG_SLOP = 4;
const EDGE_SIZE = 40;
const EASE = "cubic-bezier(.2,.78,.25,1)";
const tileSelector = "[data-wish-list-tile]";
const tileFrame = (tile) => tile.closest(".list-tabs__editable-tile") ?? tile;

export function useWishListDrag(viewportRef, { enabled, orderKey, scope, value, onMove, revealTile }) {
  const suppressClick = useRef(false);
  const clickGuard = useRef(null);
  const landing = useRef(null);
  const landingAnimations = useRef(new WeakMap());
  const moveTile = useEffectEvent(onMove);

  useLayoutEffect(() => () => clickGuard.current?.(), []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const drop = landing.current;
    landing.current = null;
    if (!drop || drop.scope !== scope) return;
    for (const tile of drop.positions.keys()) landingAnimations.current.get(tile)?.cancel();
    if (drop.keyboard) revealTile(viewport, drop.focused);
    for (const [tile, from] of drop.positions) {
      const to = tile.getBoundingClientRect();
      if (Math.abs(from.left - to.left) < 0.5 && Math.abs(from.top - to.top) < 0.5 && !from.lifted) continue;
      const start = `translate(${from.left - to.left}px, ${from.top - to.top}px)${from.lifted ? " scale(1.06) rotate(-2deg)" : ""}`;
      const animation = tileFrame(tile).animate([{ transform: start, transformOrigin: from.origin }, { transform: "none", transformOrigin: from.origin }], { duration: 230, easing: EASE });
      landingAnimations.current.set(tile, animation);
    }
    if (drop.focused && document.activeElement === document.body && viewport.contains(drop.focused)) {
      drop.focused.focus({ preventScroll: true });
    }
  }, [viewportRef, orderKey, scope, revealTile]);

  useLayoutEffect(() => {
    if (!enabled) return;
    const viewport = viewportRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const listeners = new AbortController();
    const listen = (target, name, callback, options) =>
      target.addEventListener(name, callback, { ...options, signal: listeners.signal });
    let gesture;

    function finish(commit = false) {
      const drag = gesture;
      if (!drag) return;
      gesture = null;
      clearTimeout(drag.timer);
      if (!drag.preview) return;

      cancelAnimationFrame(drag.frame);
      const moved = commit && drag.from !== drag.to;
      if (moved) {
        const positions = new Map();
        if (!reducedMotion.matches) {
          for (const tile of drag.tiles) positions.set(tile, tile.getBoundingClientRect());
          positions.set(drag.source, { left: drag.x - drag.grabX, top: drag.y - drag.grabY, lifted: true, origin: drag.origin });
        }
        landing.current = { scope, positions, focused: document.activeElement === drag.source ? drag.source : null };
        if (!moveTile(drag.from, drag.to)) landing.current = null;
      }
      delete viewport.dataset.listDragActive;
      delete drag.source.dataset.listDragSource;
      drag.tiles.forEach(tile => tileFrame(tile).style.removeProperty("--list-tile-shift"));
      drag.preview.remove();
      if (viewport.hasPointerCapture(drag.pointerId)) viewport.releasePointerCapture(drag.pointerId);
    }

    function inside(drag, bounds) {
      return drag.x >= bounds.left && drag.x < bounds.right && drag.y >= bounds.top && drag.y < bounds.bottom;
    }

    function position(drag, bounds) {
      drag.preview.style.left = `${drag.x - drag.grabX}px`;
      drag.preview.style.top = `${drag.y - drag.grabY}px`;
      if (!drag.moved || !inside(drag, bounds)) return;
      const left = drag.x - drag.grabX - bounds.left + viewport.scrollLeft;
      let to = drag.from;
      while (to < drag.slots.length - 1 && left >= (drag.slots[to] + drag.slots[to + 1]) / 2) to++;
      while (to > 0 && left < (drag.slots[to] + drag.slots[to - 1]) / 2) to--;
      if (drag.to === to) return;
      drag.to = to;
      drag.tiles.forEach((tile, index) => {
        let next = index;
        if (index > drag.from && index <= to) next--;
        if (index < drag.from && index >= to) next++;
        tileFrame(tile).style.setProperty("--list-tile-shift", `${drag.slots[next] - drag.slots[index]}px`);
      });
    }

    function scrollAtEdge(drag, now) {
      if (gesture !== drag) return;
      const bounds = viewport.getBoundingClientRect();
      const elapsed = Math.min(now - drag.lastFrame, 32);
      drag.lastFrame = now;
      if (drag.moved && inside(drag, bounds)) {
        const left = Math.max(0, EDGE_SIZE - (drag.x - bounds.left));
        const right = Math.max(0, EDGE_SIZE - (bounds.right - drag.x));
        const delta = (right - left) * elapsed * 0.022;
        if (Math.abs(delta) >= 0.5) {
          viewport.scrollBy({ left: delta, behavior: "instant" });
          position(drag, bounds);
        }
      }
      drag.frame = requestAnimationFrame(time => scrollAtEdge(drag, time));
    }

    function lift(drag) {
      try {
        viewport.setPointerCapture(drag.pointerId);
      } catch {
        finish();
        return;
      }
      const bounds = viewport.getBoundingClientRect();
      const rect = drag.source.getBoundingClientRect();
      drag.grabX = drag.x - rect.left;
      drag.grabY = drag.y - rect.top;
      drag.origin = `${drag.grabX}px ${drag.grabY}px`;
      drag.slots = drag.tiles.map(tile => tile.getBoundingClientRect().left - bounds.left + viewport.scrollLeft);
      drag.preview = createCardDragPreview(drag.source, "wish-list-tile--preview");
      drag.preview.style.transformOrigin = drag.origin;
      drag.preview.style.boxShadow = "0 14px 35px rgb(0 0 0 / 0.28)";
      if (!reducedMotion.matches) {
        drag.preview.style.transform = "scale(1.06) rotate(-2deg)";
        drag.preview.animate([{ transform: "none" }, { transform: drag.preview.style.transform }], { duration: 190, easing: EASE });
      }
      position(drag, bounds);
      document.body.appendChild(drag.preview);
      viewport.dataset.listDragActive = "";
      drag.source.dataset.listDragSource = "";
      clickGuard.current = guardDragClick(suppressClick, drag.pointerId);
      drag.lastFrame = performance.now();
      drag.frame = requestAnimationFrame(time => scrollAtEdge(drag, time));
    }

    function follow(drag, event, bounds) {
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (Math.hypot(drag.x - drag.pressX, drag.y - drag.pressY) >= DRAG_SLOP) drag.moved = true;
      position(drag, bounds);
    }

    listen(viewport, "pointerdown", event => {
      if (gesture) {
        if (gesture.pointerId !== event.pointerId) finish();
        return;
      }
      if (!event.isPrimary || event.button !== 0) return;
      clickGuard.current?.();
      suppressClick.current = false;
      const source = event.target.closest(tileSelector);
      if (!source) return;
      const tiles = [...viewport.querySelectorAll(tileSelector)];
      const from = tiles.indexOf(source);
      const drag = {
        source, tiles, from, to: from, pointerId: event.pointerId,
        x: event.clientX, y: event.clientY, pressX: event.clientX, pressY: event.clientY,
        scrollLeft: viewport.scrollLeft,
      };
      gesture = drag;
      drag.timer = setTimeout(() => lift(drag), HOLD_MS);
    });
    listen(window, "pointermove", event => {
      const drag = gesture;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.preview) {
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > HOLD_SLOP) finish();
        return;
      }
      follow(drag, event, viewport.getBoundingClientRect());
    }, { capture: true });
    // Allow native swipes while waiting. Once lifted, a touch move belongs to the tile.
    listen(viewport, "touchmove", event => {
      if (gesture?.preview && event.cancelable) event.preventDefault();
    }, { passive: false });
    listen(viewport, "scroll", () => {
      if (!gesture) return;
      if (gesture.preview) position(gesture, viewport.getBoundingClientRect());
      else if (viewport.scrollLeft !== gesture.scrollLeft) finish();
    });
    listen(window, "pointerup", event => {
      if (gesture?.pointerId !== event.pointerId) return;
      const bounds = viewport.getBoundingClientRect();
      const drag = gesture;
      if (drag.preview) follow(drag, event, bounds);
      finish(drag.preview && inside(drag, bounds));
    }, { capture: true });
    listen(window, "pointercancel", event => {
      if (gesture?.pointerId === event.pointerId) finish();
    }, { capture: true });
    listen(viewport, "lostpointercapture", event => {
      if (event.target === viewport && gesture?.pointerId === event.pointerId) finish();
    });
    listen(viewport, "contextmenu", event => {
      if (gesture || (event.pointerType === "touch" && event.target.closest(tileSelector))) event.preventDefault();
    });
    listen(window, "blur", () => finish());
    listen(window, "resize", () => finish());
    listen(document, "visibilitychange", () => { if (document.hidden) finish(); });
    listen(window, "keydown", event => {
      if (event.key === "Escape" && gesture) {
        if (gesture.preview) {
          event.preventDefault();
          event.stopPropagation();
        }
        finish();
      }
    }, { capture: true });
    listen(viewport, "keydown", event => {
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const tiles = [...viewport.querySelectorAll(tileSelector)];
      const source = event.target.closest(tileSelector);
      const from = tiles.indexOf(source);
      if (from < 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (gesture) return;
      const to = from + (event.key === "ArrowLeft" ? -1 : 1);
      if (to < 0 || to >= tiles.length) return;
      const positions = reducedMotion.matches ? new Map() : new Map(tiles.map(tile => [tile, tile.getBoundingClientRect()]));
      landing.current = { scope, positions, focused: source, keyboard: true };
      if (!moveTile(from, to)) landing.current = null;
    }, { capture: true });

    return () => {
      finish();
      listeners.abort();
    };
  }, [enabled, viewportRef, orderKey, scope, value]);

  return event => {
    if (suppressClick.current && event.detail !== 0) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
}
