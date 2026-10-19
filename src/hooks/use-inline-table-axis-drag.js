import { useEffect, useRef } from "react";
import { TableMap } from "@tiptap/pm/tables";
import { moveTableAxis, selectTableAxis, tableAxisBand } from "@/lib/inline-table-axis";

export function useInlineTableAxisDrag(editor, onGuide, onFinish, onActiveChange) {
  const active = useRef(null), dragged = useRef(false), callbacks = useRef({ onGuide, onFinish, onActiveChange });
  callbacks.current = { onGuide, onFinish, onActiveChange };
  const finish = () => {
    const drag = active.current; active.current = null;
    if (!drag) return null;
    cancelAnimationFrame(drag.frame);
    if (drag.button.hasPointerCapture(drag.pointerId)) drag.button.releasePointerCapture(drag.pointerId);
    callbacks.current.onActiveChange?.(false);
    callbacks.current.onGuide(null);
    return drag;
  };
  useEffect(() => {
    const valid = () => active.current && !editor.isDestroyed && editor.isEditable && !editor.view.composing && editor.state.doc === active.current.doc;
    const candidate = () => {
      const drag = active.current;
      if (!valid() || !drag.moved) return null;
      const { view, state } = editor, root = view.nodeDOM(drag.position);
      const table = root?.matches?.("table") ? root : root?.querySelector?.("table");
      const wrapper = table?.closest(".tableWrapper");
      if (!wrapper) return null;
      const box = table.getBoundingClientRect(), clip = wrapper.getBoundingClientRect();
      const viewport = window.visualViewport, top = viewport?.offsetTop || 0, bottom = top + (viewport?.height || innerHeight);
      const left = Math.max(box.left, clip.left), right = Math.min(box.right, clip.right);
      const visibleTop = Math.max(box.top, top), visibleBottom = Math.min(box.bottom, bottom);
      if (right <= left || visibleBottom <= visibleTop || drag.x < left - 64 || drag.x > right + 64) return null;
      const x = drag.axis === "row" ? Math.max(left + 2, Math.min(right - 2, drag.x)) : drag.x;
      const y = drag.axis === "column" ? Math.max(visibleTop + 2, Math.min(visibleBottom - 2, drag.y)) : drag.y;
      const cell = document.elementFromPoint(x, y)?.closest("td,th");
      if (!cell || cell.closest("table") !== table) return null;
      const cellPos = view.posAtDOM(cell, 0) - 1, map = TableMap.get(state.doc.nodeAt(drag.position));
      const rect = map.findCell(cellPos - drag.position - 1), cellBox = cell.getBoundingClientRect();
      const after = drag.axis === "row" ? y >= (cellBox.top + cellBox.bottom) / 2 : x >= (cellBox.left + cellBox.right) / 2;
      const boundary = drag.axis === "row" ? after ? rect.bottom : rect.top : after ? rect.right : rect.left;
      const to = boundary > drag.index ? boundary - 1 : boundary;
      if (!moveTableAxis(editor, drag.position, drag.axis, drag.index, to, true)) return null;
      return { to, guide: drag.axis === "row" ? { left, top: after ? cellBox.bottom : cellBox.top, width: right - left, height: 2 }
        : { left: after ? cellBox.right : cellBox.left, top: visibleTop, width: 2, height: visibleBottom - visibleTop } };
    };
    const scroll = () => {
      const drag = active.current;
      if (!drag) return;
      if (!valid()) { finish(); return; }
      if (drag.moved) {
        const viewport = window.visualViewport, top = viewport?.offsetTop || 0, bottom = top + (viewport?.height || innerHeight);
        const delta = drag.y < top + 48 ? -Math.min(16, (top + 48 - drag.y) / 3) : drag.y > bottom - 48 ? Math.min(16, (drag.y - bottom + 48) / 3) : 0;
        if (delta) window.scrollBy({ top: delta, behavior: "instant" });
        if (drag.axis === "column") {
          const root = editor.view.nodeDOM(drag.position), wrapper = root?.matches?.(".tableWrapper") ? root : root?.closest?.(".tableWrapper") || root?.querySelector?.(".tableWrapper");
          if (wrapper) { const b = wrapper.getBoundingClientRect(); if (drag.x < b.left + 32) wrapper.scrollLeft -= 12; else if (drag.x > b.right - 32) wrapper.scrollLeft += 12; }
        }
        callbacks.current.onGuide(candidate()?.guide || null);
      }
      drag.frame = requestAnimationFrame(scroll);
    };
    const move = event => {
      const drag = active.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (!valid()) { finish(); return; }
      drag.x = event.clientX; drag.y = event.clientY;
      if (!drag.moved && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 5) {
        drag.moved = true; dragged.current = true;
        selectTableAxis(editor, drag.position, drag.axis, drag.index);
        drag.frame = requestAnimationFrame(scroll);
      }
      if (drag.moved) { event.preventDefault(); callbacks.current.onGuide(candidate()?.guide || null); }
    };
    const up = event => {
      const drag = active.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const target = valid() && drag.moved ? candidate() : null;
      finish();
      if (target && moveTableAxis(editor, drag.position, drag.axis, drag.index, target.to)) { editor.view.focus(); callbacks.current.onFinish("Перемещение выполнено"); }
      else if (drag.moved) callbacks.current.onFinish("Перемещение отменено");
    };
    const cancel = () => { if (active.current) { finish(); callbacks.current.onFinish("Перемещение отменено"); } };
    const visibility = () => { if (document.hidden) cancel(); };
    const key = event => { if (active.current && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); } };
    const transaction = () => { if (active.current && !valid()) cancel(); };
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", up); document.addEventListener("pointercancel", cancel); document.addEventListener("lostpointercapture", cancel); document.addEventListener("visibilitychange", visibility); window.addEventListener("blur", cancel); document.addEventListener("keydown", key, true);
    editor.on("transaction", transaction);
    return () => { finish(); document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", cancel); document.removeEventListener("lostpointercapture", cancel); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("blur", cancel); document.removeEventListener("keydown", key, true); editor.off("transaction", transaction); };
  }, [editor]);
  return {
    start(event, descriptor) {
      if (!editor.isEditable || editor.view.composing || event.button !== 0 || event.isPrimary === false) return;
      if (descriptor.doc !== editor.state.doc || !Number.isInteger(descriptor.position) || descriptor.position < 0 || descriptor.position >= editor.state.doc.content.size || !tableAxisBand(editor.state.doc.nodeAt(descriptor.position), descriptor.axis, descriptor.index)) return;
      event.preventDefault(); event.stopPropagation(); finish(); dragged.current = false;
      const button = event.currentTarget; button.setPointerCapture(event.pointerId);
      active.current = { ...descriptor, button, pointerId: event.pointerId, doc: editor.state.doc, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false, frame: 0 };
      callbacks.current.onActiveChange?.(true);
    },
    consumeClick() { const result = dragged.current; dragged.current = false; return result; },
    isActive() { return Boolean(active.current); },
  };
}
