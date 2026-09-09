import { useEffect, useRef, useState } from "react";
import { moveWishWithinSubset } from "../lib/wish-order.js";

// Collection pages keep the full owner order, including wishes outside the
// current list. A drop only exchanges positions within the visible collection.
export function useWishReorder({ wishes, visibleWishes, enabled, onSave, onError }) {
  const [order, setOrder] = useState(() => wishes.map((wish) => wish.id));
  const [draggedId, setDraggedId] = useState(null);
  const [targetId, setTargetId] = useState(null);
  const [saving, setSaving] = useState(false);
  const gridRef = useRef(null);
  const sessionRef = useRef(null);
  const savingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const cleanupRef = useRef(null);
  const mountedRef = useRef(true);
  const wishIds = wishes.map((wish) => wish.id).join("\0");

  useEffect(() => {
    if (!sessionRef.current && !savingRef.current) setOrder(wishes.map((wish) => wish.id));
  }, [wishIds, saving, draggedId]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; cleanupRef.current?.(); };
  }, []);

  const canDrag = enabled && !saving;
  const scope = new Set(visibleWishes.map((wish) => wish.id));
  const targetAt = (x, y) => {
    const card = document.elementFromPoint(x, y)?.closest("[data-group-wish-id]");
    return card && gridRef.current?.contains(card) && scope.has(card.dataset.groupWishId)
      ? card.dataset.groupWishId : null;
  };
  const finish = async (dropId = null) => {
    const session = sessionRef.current;
    sessionRef.current = null;
    cleanupRef.current?.();
    cleanupRef.current = null;
    setDraggedId(null);
    setTargetId(null);
    if (!session?.active) return;
    // The browser may dispatch a click immediately after a pointer drop.
    setTimeout(() => { suppressClickRef.current = false; }, 0);
    const next = moveWishWithinSubset(order, scope, session.id, dropId);
    if (next === order) return;
    savingRef.current = true;
    setSaving(true);
    setOrder(next);
    try {
      await onSave(next);
    } catch (error) {
      if (mountedRef.current) { setOrder(order); onError(error); }
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  };
  const activate = (session) => {
    session.active = true;
    suppressClickRef.current = true;
    setDraggedId(session.id);
  };
  const startNative = (event, id) => {
    if (!canDrag || savingRef.current || sessionRef.current || !event.target.closest(".wish-card__open, [data-wish-drag-handle]")) {
      event.preventDefault();
      return;
    }
    const session = { id, active: false };
    sessionRef.current = session;
    activate(session);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    event.dataTransfer.setDragImage(card, event.clientX - rect.left, event.clientY - rect.top);
  };
  const startPointer = (event, id) => {
    if (!canDrag || savingRef.current || event.pointerType === "mouse" || !event.isPrimary || event.button !== 0 || sessionRef.current) return;
    const handle = event.target.closest("[data-wish-drag-handle]");
    if (!handle && !event.target.closest(".wish-card__open")) return;
    const source = event.currentTarget;
    const capture = gridRef.current;
    const session = { id, active: false, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    sessionRef.current = session;
    let ghost = null;
    let frame = null;
    let timer = null;
    let lastTime = null;
    const rect = source.getBoundingClientRect();
    const update = () => {
      ghost?.style.setProperty("--drag-x", `${session.x - rect.width / 2}px`);
      ghost?.style.setProperty("--drag-y", `${session.y - rect.height / 2}px`);
      setTargetId(targetAt(session.x, session.y));
    };
    const scroll = (time) => {
      const elapsed = Math.min(32, time - (lastTime ?? time - 16));
      lastTime = time;
      const edge = 72;
      const direction = session.y < edge ? -1 : session.y > innerHeight - edge ? 1 : 0;
      if (direction) { window.scrollBy(0, direction * elapsed * 0.6); update(); }
      frame = requestAnimationFrame(scroll);
    };
    const begin = () => {
      if (sessionRef.current !== session) return;
      activate(session);
      try { capture.setPointerCapture(session.pointerId); } catch {}
      ghost = source.cloneNode(true);
      ghost.setAttribute("aria-hidden", "true");
      ghost.inert = true;
      ghost.classList.add("wish-card--drag-preview");
      ghost.style.setProperty("--drag-width", `${rect.width}px`);
      document.body.appendChild(ghost);
      update();
      frame = requestAnimationFrame(scroll);
    };
    const move = (nextEvent) => {
      if (nextEvent.pointerId !== session.pointerId) return;
      if (!session.active) {
        if (Math.hypot(nextEvent.clientX - session.x, nextEvent.clientY - session.y) > 9) void finish();
        return;
      }
      nextEvent.preventDefault();
      session.x = nextEvent.clientX;
      session.y = nextEvent.clientY;
      update();
    };
    const end = (nextEvent) => {
      if (nextEvent.pointerId !== session.pointerId) return;
      if (session.active) nextEvent.preventDefault();
      void finish(session.active ? targetAt(nextEvent.clientX, nextEvent.clientY) : null);
    };
    const cancel = () => { void finish(); };
    const key = (nextEvent) => { if (nextEvent.key === "Escape") cancel(); };
    const visibility = () => { if (document.hidden) cancel(); };
    window.addEventListener("pointermove", move, { capture: true, passive: false });
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key);
    capture.addEventListener("lostpointercapture", cancel);
    document.addEventListener("visibilitychange", visibility);
    cleanupRef.current = () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      ghost?.remove();
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key);
      capture.removeEventListener("lostpointercapture", cancel);
      document.removeEventListener("visibilitychange", visibility);
      try { if (capture.hasPointerCapture(session.pointerId)) capture.releasePointerCapture(session.pointerId); } catch {}
    };
    if (handle) { event.preventDefault(); begin(); }
    else timer = setTimeout(begin, 260);
  };

  const cardProps = (id) => ({
    draggable: canDrag,
    isDragging: draggedId === id,
    isDropTarget: targetId === id && draggedId !== id,
    onDragStart: (event) => startNative(event, id),
    onDragOver: (event) => {
      if (!sessionRef.current?.active) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setTargetId(id);
    },
    onDragLeave: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setTargetId(null);
    },
    onDrop: (event) => { if (sessionRef.current?.active) { event.preventDefault(); void finish(id); } },
    onDragEnd: () => { void finish(); },
    onPointerDown: (event) => startPointer(event, id),
  });
  const positions = new Map(order.map((id, index) => [id, index]));
  return {
    gridRef,
    saving,
    cardProps,
    suppressClickRef,
    orderedWishes: [...visibleWishes].sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity)),
  };
}
