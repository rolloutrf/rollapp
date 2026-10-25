import { useLayoutEffect, useRef, useState } from "react";
import { calendarMoveBy, calendarRange, calendarResizeBy, taskTimeLabel } from "../../shared/planning-calendar.js";
import { createCardDragPreview } from "@/lib/card-drag-preview";

const PIXELS_PER_MINUTE = 1.6;
const minuteAt = (y, column) => (y - column.getBoundingClientRect().top) / PIXELS_PER_MINUTE;
const edgeSpeed = (point, start, end) => {
  const edge = Math.min(48, (end - start) / 4);
  if (point < start || point > end) return 0;
  if (point < start + edge) return -720 * (1 - (point - start) / edge);
  if (point > end - edge) return 720 * (1 - (end - point) / edge);
  return 0;
};

// The original event/handle remains mounted and owns capture throughout the
// gesture. A projected destination never participates in pointer hit-testing.
export function useCalendarGesture({ scroll, sourceTasks, scopeKey, busy, onCreate, saveSchedule, cancelInteractionRef }) {
  const session = useRef(null);
  const skipClick = useRef(false);
  const runtime = useRef(null);
  const [preview, setPreview] = useState(null);
  runtime.current = { sourceTasks, busy, onCreate, saveSchedule };

  const finish = () => {
    const active = session.current;
    session.current = null;
    if (!active) return;
    cancelAnimationFrame(active.frame);
    active.ghost?.remove();
    active.owner.removeAttribute("data-calendar-dragging");
    if (active.moved) skipClick.current = true;
    if (active.owner.hasPointerCapture(active.pointerId)) active.owner.releasePointerCapture(active.pointerId);
    active.cleanup();
    setPreview(null);
  };

  useLayoutEffect(() => {
    cancelInteractionRef.current = finish;
    finish();
    return () => {
      finish();
      if (cancelInteractionRef.current === finish) cancelInteractionRef.current = null;
    };
  }, [sourceTasks, scopeKey, busy, cancelInteractionRef]);

  const begin = (event, kind, task, date) => {
    if (event.button !== 0 || event.isPrimary === false || runtime.current.busy || session.current) return;
    // The event body retains native touch scrolling. Resize has its own handle.
    if (kind !== "resize" && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    if (task && (task.recurrence || !runtime.current.sourceTasks.some(item => item.id === task.id))) return;
    skipClick.current = false;
    const owner = event.currentTarget;
    const column = owner.closest(".schedule-time-column");
    const viewport = scroll.current?.querySelector('[data-slot="scroll-area-viewport"]');
    if (!column || !viewport) return;
    if (kind === "resize") { event.preventDefault(); event.stopPropagation(); }
    const source = owner.closest("[data-calendar-event]");
    const rect = source?.getBoundingClientRect();
    const active = {
      owner, column, viewport, kind, task, date, pointerId: event.pointerId,
      sourceTasks: runtime.current.sourceTasks,
      x: event.clientX, y: event.clientY, firstX: event.clientX, firstY: event.clientY,
      firstMinute: minuteAt(event.clientY, column), moved: false, valid: false,
      offsetX: rect ? event.clientX - rect.left : 0, offsetY: rect ? event.clientY - rect.top : 0,
    };
    const bounds = () => {
      const box = viewport.getBoundingClientRect();
      const head = viewport.querySelector(".schedule-timegrid__head");
      return { left: box.left + 76, right: box.right, top: box.top + (head?.offsetHeight || 0), bottom: box.bottom };
    };
    const update = () => {
      if (session.current !== active) return;
      if (runtime.current.busy || runtime.current.sourceTasks !== active.sourceTasks || !owner.isConnected || !owner.hasPointerCapture(active.pointerId)) { finish(); return; }
      const box = bounds();
      active.valid = active.x >= box.left && active.x <= box.right && active.y >= box.top && active.y <= box.bottom;
      const target = [...viewport.querySelectorAll(".schedule-time-column")].find(node => {
        const rect = node.getBoundingClientRect();
        return active.x >= rect.left && active.x < rect.right;
      });
      active.valid &&= Boolean(target) && (kind === "move" || target === column);
      if (target) {
        const rect = target.getBoundingClientRect();
        active.valid &&= active.y >= rect.top && active.y <= rect.bottom;
      }
      const delta = minuteAt(active.y, column) - active.firstMinute;
      active.patch = kind === "move" ? calendarMoveBy(task, target?.dataset.date || task.dueOn, delta)
        : kind === "resize" ? calendarResizeBy(task, delta)
        : calendarRange(active.firstMinute, minuteAt(active.y, column));
      if (active.ghost) {
        active.ghost.style.left = `${active.x - active.offsetX}px`;
        active.ghost.style.top = `${active.y - active.offsetY}px`;
        active.ghost.style.opacity = active.valid ? "0.85" : "0.4";
      }
      const key = active.valid ? JSON.stringify(active.patch) : "invalid";
      if (active.previewKey !== key) {
        active.previewKey = key;
        const start = active.ghost?.querySelector(".schedule-event__start");
        const time = active.ghost?.querySelector(".schedule-event__content > .schedule-caption");
        if (start) start.textContent = active.patch.startTime;
        else if (time) time.textContent = taskTimeLabel({ ...task, ...active.patch });
        setPreview(active.valid ? { kind, task, date: active.patch.dueOn || date || task?.dueOn, ...active.patch } : null);
      }
    };
    const tick = time => {
      if (session.current !== active) return;
      const elapsed = Math.min(32, time - (active.lastFrame || time)) / 1000;
      active.lastFrame = time;
      if (active.moved) {
        const box = bounds();
        if (active.x >= box.left && active.x <= box.right && active.y >= box.top && active.y <= box.bottom) {
          viewport.scrollBy({
            left: kind === "move" ? edgeSpeed(active.x, box.left, box.right) * elapsed : 0,
            top: edgeSpeed(active.y, box.top, box.bottom) * elapsed,
            behavior: "instant",
          });
        }
        update();
      }
      if (session.current === active) active.frame = requestAnimationFrame(tick);
    };
    const move = event => {
      if (event.pointerId !== active.pointerId) return;
      active.x = event.clientX; active.y = event.clientY;
      if (!active.moved && Math.hypot(active.x - active.firstX, active.y - active.firstY) < 6) return;
      event.preventDefault();
      if (!active.moved) {
        active.moved = true;
        skipClick.current = true;
        if (kind === "move") {
          active.ghost = createCardDragPreview(source, "schedule-drag-preview");
          const content = source.querySelector(".schedule-event__content");
          const copy = active.ghost.querySelector(".schedule-event__content");
          if (content && copy && getComputedStyle(content).position === "sticky") {
            // A body portal has a different scrollport. Freeze the currently
            // painted sticky offset so the title follows its original grab.
            const trigger = source.querySelector(".schedule-event");
            const style = getComputedStyle(trigger);
            const offset = content.getBoundingClientRect().top - trigger.getBoundingClientRect().top
              - parseFloat(style.borderTopWidth) - parseFloat(style.paddingTop);
            Object.assign(copy.style, { position: "relative", top: `${offset}px`, insetBlockStart: `${offset}px` });
          }
          document.body.appendChild(active.ghost);
        }
        owner.setAttribute("data-calendar-dragging", "");
      }
      update();
    };
    const up = event => {
      if (event.pointerId !== active.pointerId) return;
      active.x = event.clientX; active.y = event.clientY;
      if (active.moved) update();
      const commit = session.current === active && active.moved && active.valid;
      const patch = active.patch;
      finish();
      if (!commit) return;
      if (kind === "range") runtime.current.onCreate({ dueOn: date, ...patch });
      else if (Object.entries(patch).some(([key, value]) => value !== task[key])) runtime.current.saveSchedule(task, patch);
    };
    const cancel = event => { if (event.pointerId === active.pointerId) finish(); };
    const key = event => { if (event.key === "Escape") { event.preventDefault(); finish(); } };
    const hidden = () => { if (document.hidden) finish(); };
    active.cleanup = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);
      owner.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", finish);
      window.removeEventListener("popstate", finish);
      window.removeEventListener("resize", finish);
      document.removeEventListener("visibilitychange", hidden);
    };
    session.current = active;
    owner.setPointerCapture(event.pointerId);
    window.addEventListener("pointermove", move, { capture: true, passive: false });
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancel, true);
    owner.addEventListener("lostpointercapture", cancel);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", finish);
    window.addEventListener("popstate", finish);
    window.addEventListener("resize", finish);
    document.addEventListener("visibilitychange", hidden);
    active.frame = requestAnimationFrame(tick);
  };

  return {
    preview,
    resetClick: () => { if (!session.current) skipClick.current = false; },
    beginMove: (event, task) => begin(event, "move", task),
    beginRange: (event, date) => begin(event, "range", null, date),
    beginResize: (event, task, delta) => {
      if (delta) {
        if (!runtime.current.busy) {
          const patch = calendarResizeBy(task, delta);
          if (patch.durationMinutes !== task.durationMinutes) runtime.current.saveSchedule(task, patch);
        }
      } else begin(event, "resize", task);
    },
    guardClick: event => {
      if (skipClick.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); }
    },
  };
}
