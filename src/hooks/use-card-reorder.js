import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  cardRectOverlapRatio,
  GROUP_INTENT_DELAY_MS,
  reorderCards,
  reorderCardToTarget,
  resolveCardHoverMode,
} from "@/lib/card-order";

const TOUCH_HOLD_DELAY_MS = 260;
const POINTER_DRAG_THRESHOLD_PX = 9;

export function useCardReorder({
  items,
  onItemsChange,
  persistOrder,
  getItemLabel,
  collectionLabel,
  movedVerb = "перемещён",
  groupingEnabled = false,
  onAddToGroup,
  onCreateGroup,
}) {
  const descriptionId = useId();
  const listRef = useRef(null);
  const itemsRef = useRef(items);
  const onItemsChangeRef = useRef(onItemsChange);
  const persistOrderRef = useRef(persistOrder);
  const getItemLabelRef = useRef(getItemLabel);
  const onAddToGroupRef = useRef(onAddToGroup);
  const onCreateGroupRef = useRef(onCreateGroup);
  const pointerDragRef = useRef(null);
  const pointerTimerRef = useRef(null);
  const pointerCleanupRef = useRef(null);
  const autoScrollFrameRef = useRef(null);
  const autoScrollTimeRef = useRef(null);
  const groupTimerRef = useRef(null);
  const groupIntentTargetRef = useRef("");
  const armedGroupTargetRef = useRef("");
  const ghostRef = useRef(null);
  const ghostSizeRef = useRef({ width: 0, height: 0 });
  const flipPositionsRef = useRef(new Map());
  const suppressClickRef = useRef(false);
  const [draggedId, setDraggedId] = useState("");
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [groupTarget, setGroupTarget] = useState("");

  itemsRef.current = items;
  onItemsChangeRef.current = onItemsChange;
  persistOrderRef.current = persistOrder;
  getItemLabelRef.current = getItemLabel;
  onAddToGroupRef.current = onAddToGroup;
  onCreateGroupRef.current = onCreateGroup;

  const orderKey = items.map((item) => item.id).join("\0");

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !flipPositionsRef.current.size) return;
    list.querySelectorAll("[data-sortable-card-id]").forEach((card) => {
      const previous = flipPositionsRef.current.get(card.dataset.sortableCardId);
      if (!previous || card.dataset.sortableCardId === draggedId) return;
      const next = card.getBoundingClientRect();
      const deltaX = previous.left - next.left;
      const deltaY = previous.top - next.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
      card.animate(
        [{ transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` }, { transform: "translate3d(0, 0, 0)" }],
        { duration: 330, easing: "cubic-bezier(.2,.82,.2,1)" },
      );
    });
    flipPositionsRef.current = new Map();
  }, [orderKey, draggedId]);

  const capturePositions = () => {
    const positions = new Map();
    listRef.current?.querySelectorAll("[data-sortable-card-id]").forEach((card) => {
      positions.set(card.dataset.sortableCardId, card.getBoundingClientRect());
    });
    flipPositionsRef.current = positions;
  };

  const removeGhost = () => {
    document.querySelectorAll(".education-card--drag-preview").forEach((ghost) => ghost.remove());
    ghostRef.current = null;
    ghostSizeRef.current = { width: 0, height: 0 };
  };

  const createGhost = (source, clientX, clientY) => {
    removeGhost();
    const rect = source.getBoundingClientRect();
    const ghost = source.cloneNode(true);
    ghost.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    ghost.setAttribute("aria-hidden", "true");
    ghost.classList.add("education-card--drag-preview");
    ghost.style.setProperty("--drag-width", `${rect.width}px`);
    ghost.style.setProperty("--drag-x", `${clientX - rect.width / 2}px`);
    ghost.style.setProperty("--drag-y", `${clientY - rect.height / 2}px`);
    document.body.appendChild(ghost);
    ghostRef.current = ghost;
    ghostSizeRef.current = { width: rect.width, height: rect.height };
  };

  const moveGhost = (clientX, clientY) => {
    if (!ghostRef.current) return;
    const { width, height } = ghostSizeRef.current;
    ghostRef.current.style.setProperty("--drag-x", `${clientX - width / 2}px`);
    ghostRef.current.style.setProperty("--drag-y", `${clientY - height / 2}px`);
  };

  const stopAutoScroll = () => {
    if (autoScrollFrameRef.current !== null) cancelAnimationFrame(autoScrollFrameRef.current);
    autoScrollFrameRef.current = null;
    autoScrollTimeRef.current = null;
  };

  const clearPointerListeners = () => {
    stopAutoScroll();
    pointerCleanupRef.current?.();
    pointerCleanupRef.current = null;
  };

  const clearGroupIntent = (drag = null) => {
    clearTimeout(groupTimerRef.current);
    groupTimerRef.current = null;
    groupIntentTargetRef.current = "";
    armedGroupTargetRef.current = "";
    if (drag) drag.groupTarget = "";
    setGroupTarget("");
  };

  const armGroupIntent = (drag, target) => {
    if (!target || groupIntentTargetRef.current === target) return;
    clearTimeout(groupTimerRef.current);
    groupIntentTargetRef.current = target;
    armedGroupTargetRef.current = "";
    drag.groupTarget = "";
    setGroupTarget("");
    groupTimerRef.current = window.setTimeout(() => {
      groupTimerRef.current = null;
      if (pointerDragRef.current !== drag || !drag.active || groupIntentTargetRef.current !== target) return;
      armedGroupTargetRef.current = target;
      drag.groupTarget = target;
      setGroupTarget(target);
      navigator.vibrate?.(12);
    }, GROUP_INTENT_DELAY_MS);
  };

  const resolvePointerTarget = (drag, clientX, clientY) => {
    const list = listRef.current;
    const element = document.elementFromPoint(clientX, clientY);
    const pointerGroup = groupingEnabled ? element?.closest?.("[data-sortable-group-id]") : null;
    const group = pointerGroup && list?.contains(pointerGroup) ? pointerGroup : null;
    const pointerCard = element?.closest?.("[data-sortable-card-id]");
    let card = pointerCard && list?.contains(pointerCard) ? pointerCard : null;
    let overlapGroupTarget = false;

    if (groupingEnabled && !group && (!card || card.dataset.sortableCardId === drag.cardId)) {
      const draggedRect = ghostRef.current?.getBoundingClientRect();
      let bestOverlap = 0.36;
      list?.querySelectorAll("[data-sortable-card-id]").forEach((candidate) => {
        if (candidate.dataset.sortableCardId === drag.cardId) return;
        const overlap = cardRectOverlapRatio(draggedRect, candidate.getBoundingClientRect());
        if (overlap < bestOverlap) return;
        bestOverlap = overlap;
        card = candidate;
        overlapGroupTarget = true;
      });
    }

    return { card, group, overlapGroupTarget };
  };

  const releasePointerCapture = (drag) => {
    if (!drag) return;
    try {
      if (drag.captureTarget.hasPointerCapture?.(drag.pointerId)) drag.captureTarget.releasePointerCapture(drag.pointerId);
    } catch {}
  };

  const updateDragPosition = (drag, clientX, clientY) => {
    moveGhost(clientX, clientY);
    const { card, group, overlapGroupTarget } = resolvePointerTarget(drag, clientX, clientY);
    const groupId = group?.dataset.sortableGroupId || "";
    if (groupId) {
      drag.lastTargetId = "";
      armGroupIntent(drag, `group:${groupId}`);
      return;
    }
    const targetId = card?.dataset.sortableCardId || "";
    if (!targetId || targetId === drag.cardId) {
      drag.lastTargetId = "";
      clearGroupIntent(drag);
      return;
    }
    const hoverMode = overlapGroupTarget
      ? "group"
      : resolveCardHoverMode({
        groupingEnabled,
        rect: card.getBoundingClientRect(),
        clientX,
        clientY,
      });
    if (hoverMode === "group") {
      drag.lastTargetId = "";
      armGroupIntent(drag, `card:${targetId}`);
      return;
    }
    clearGroupIntent(drag);
    if (drag.lastTargetId === targetId) return;
    const nextItems = reorderCardToTarget(itemsRef.current, drag.cardId, targetId);
    if (nextItems === itemsRef.current) return;
    drag.lastTargetId = targetId;
    drag.dirty = true;
    itemsRef.current = nextItems;
    capturePositions();
    onItemsChangeRef.current(nextItems);
  };

  const startAutoScroll = (drag) => {
    if (autoScrollFrameRef.current !== null) return;
    const tick = (timestamp) => {
      autoScrollFrameRef.current = null;
      if (pointerDragRef.current !== drag || !drag.active) return;
      const scrollContainer = document.scrollingElement;
      if (!scrollContainer || drag.clientX < 0 || drag.clientX > window.innerWidth) return;
      const edgeSize = Math.min(88, Math.max(40, window.innerHeight / 4));
      const topPenetration = edgeSize - drag.clientY;
      const bottomPenetration = drag.clientY - (window.innerHeight - edgeSize);
      let direction = 0;
      let penetration = 0;
      if (topPenetration > 0) {
        direction = -1;
        penetration = Math.min(1, topPenetration / edgeSize);
      } else if (bottomPenetration > 0) {
        direction = 1;
        penetration = Math.min(1, bottomPenetration / edgeSize);
      }
      if (!direction) {
        autoScrollTimeRef.current = null;
        return;
      }
      const elapsed = autoScrollTimeRef.current === null
        ? 16
        : Math.min(32, Math.max(0, timestamp - autoScrollTimeRef.current));
      autoScrollTimeRef.current = timestamp;
      const delta = direction * (120 + 780 * penetration * penetration) * (elapsed / 1000);
      const previousTop = scrollContainer.scrollTop;
      const nextTop = Math.max(0, Math.min(
        scrollContainer.scrollHeight - scrollContainer.clientHeight,
        previousTop + delta,
      ));
      scrollContainer.scrollTo({ top: nextTop, behavior: "instant" });
      if (scrollContainer.scrollTop === previousTop) {
        autoScrollTimeRef.current = null;
        return;
      }
      updateDragPosition(drag, drag.clientX, drag.clientY);
      autoScrollFrameRef.current = requestAnimationFrame(tick);
    };
    autoScrollFrameRef.current = requestAnimationFrame(tick);
  };

  const saveOrder = async (nextItems, previousItems) => {
    setOrderBusy(true);
    setOrderError("");
    try {
      await persistOrderRef.current(nextItems.map((item) => item.id));
    } catch (error) {
      itemsRef.current = previousItems;
      capturePositions();
      onItemsChangeRef.current(previousItems);
      setOrderError(error.message);
      setAnnouncement(`Не удалось изменить порядок ${collectionLabel}. Предыдущий порядок восстановлен.`);
    } finally {
      setOrderBusy(false);
    }
  };

  const finishDrag = (drag, { persist = true } = {}) => {
    const nextItems = itemsRef.current;
    const shouldPersist = persist && drag.dirty;
    if (drag.source.contains(document.activeElement)) document.activeElement?.blur?.();
    if (!persist && drag.dirty) {
      itemsRef.current = drag.initialItems;
      capturePositions();
      onItemsChangeRef.current(drag.initialItems);
    }
    stopAutoScroll();
    clearGroupIntent();
    removeGhost();
    setDraggedId("");
    if (shouldPersist) {
      const movedItem = nextItems.find((item) => item.id === drag.cardId);
      const position = nextItems.findIndex((item) => item.id === drag.cardId) + 1;
      setAnnouncement(`${getItemLabelRef.current(movedItem)} ${movedVerb} на позицию ${position}`);
      void saveOrder(nextItems, drag.initialItems);
    }
  };

  const activatePointerDrag = (drag) => {
    if (!drag || pointerDragRef.current !== drag || drag.active || orderBusy) return;
    try { drag.captureTarget.setPointerCapture?.(drag.pointerId); } catch {}
    drag.active = true;
    suppressClickRef.current = true;
    setDraggedId(drag.cardId);
    createGhost(drag.source, drag.startX, drag.startY);
    startAutoScroll(drag);
    navigator.vibrate?.(18);
  };

  const movePointerDrag = (event) => {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > POINTER_DRAG_THRESHOLD_PX) {
      if (drag.pointerType === "mouse") activatePointerDrag(drag);
      else {
        clearTimeout(pointerTimerRef.current);
        pointerDragRef.current = null;
        releasePointerCapture(drag);
        clearPointerListeners();
        return;
      }
    }
    if (!drag.active) return;
    event.preventDefault();
    drag.clientX = event.clientX;
    drag.clientY = event.clientY;
    updateDragPosition(drag, event.clientX, event.clientY);
    startAutoScroll(drag);
  };

  const endPointerDrag = (event) => {
    const drag = pointerDragRef.current;
    if (!drag || (event.pointerId != null && event.pointerId !== drag.pointerId)) return;
    clearTimeout(pointerTimerRef.current);
    clearPointerListeners();
    pointerDragRef.current = null;
    releasePointerCapture(drag);
    if (!drag.active) return;
    event.preventDefault();
    const { card, group, overlapGroupTarget } = resolvePointerTarget(drag, event.clientX, event.clientY);
    const currentGroupTarget = group
      ? `group:${group.dataset.sortableGroupId}`
      : card && (overlapGroupTarget
        || resolveCardHoverMode({ groupingEnabled, rect: card.getBoundingClientRect(), clientX: event.clientX, clientY: event.clientY }) === "group")
        ? `card:${card.dataset.sortableCardId}`
        : "";
    const armedGroupTarget = armedGroupTargetRef.current;
    if (groupingEnabled && armedGroupTarget && armedGroupTarget === currentGroupTarget) {
      const [targetType, targetId] = armedGroupTarget.split(":");
      finishDrag(drag, { persist: false });
      if (targetType === "group") void onAddToGroupRef.current?.(drag.cardId, targetId);
      if (targetType === "card" && targetId !== drag.cardId) void onCreateGroupRef.current?.(drag.cardId, targetId);
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
      return;
    }
    const droppedInsideList = Boolean(card);
    finishDrag(drag, { persist: droppedInsideList });
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
  };

  const cancelPointerDrag = (event) => {
    const drag = pointerDragRef.current;
    if (!drag || (event?.pointerId != null && event.pointerId !== drag.pointerId)) return;
    clearTimeout(pointerTimerRef.current);
    clearPointerListeners();
    pointerDragRef.current = null;
    releasePointerCapture(drag);
    if (drag.active) {
      event?.preventDefault?.();
      finishDrag(drag, { persist: false });
    }
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
  };

  const listenForPointerDrag = (drag) => {
    const visibility = () => { if (document.hidden) cancelPointerDrag(); };
    const lostCapture = (event) => { if (pointerDragRef.current === drag) cancelPointerDrag(event); };
    window.addEventListener("pointermove", movePointerDrag, { capture: true, passive: false });
    window.addEventListener("pointerup", endPointerDrag, true);
    window.addEventListener("pointercancel", cancelPointerDrag, true);
    window.addEventListener("blur", cancelPointerDrag);
    document.addEventListener("visibilitychange", visibility);
    drag.captureTarget.addEventListener("lostpointercapture", lostCapture);
    pointerCleanupRef.current = () => {
      window.removeEventListener("pointermove", movePointerDrag, true);
      window.removeEventListener("pointerup", endPointerDrag, true);
      window.removeEventListener("pointercancel", cancelPointerDrag, true);
      window.removeEventListener("blur", cancelPointerDrag);
      document.removeEventListener("visibilitychange", visibility);
      drag.captureTarget.removeEventListener("lostpointercapture", lostCapture);
    };
  };

  const beginPointerDrag = (event, cardId) => {
    if (orderBusy || !event.isPrimary || event.button !== 0) return;
    if (!event.target.closest?.("[data-card-drag-trigger]")) return;
    if (pointerDragRef.current) return;
    const pointerType = event.pointerType || "mouse";
    const drag = {
      cardId,
      pointerId: event.pointerId,
      pointerType,
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      active: false,
      dirty: false,
      groupTarget: "",
      lastTargetId: "",
      initialItems: [...itemsRef.current],
      source: event.currentTarget,
      captureTarget: listRef.current || event.currentTarget,
    };
    pointerDragRef.current = drag;
    clearTimeout(pointerTimerRef.current);
    clearPointerListeners();
    listenForPointerDrag(drag);
    if (pointerType === "mouse") return;
    pointerTimerRef.current = window.setTimeout(() => activatePointerDrag(drag), TOUCH_HOLD_DELAY_MS);
  };

  const moveByOffset = (cardId, offset) => {
    if (orderBusy) return;
    const previousItems = itemsRef.current;
    const sourceIndex = previousItems.findIndex((item) => item.id === cardId);
    const targetIndex = sourceIndex + offset;
    const nextItems = reorderCards(previousItems, cardId, targetIndex);
    if (nextItems === previousItems) return;
    const movedItem = nextItems.find((item) => item.id === cardId);
    capturePositions();
    itemsRef.current = nextItems;
    onItemsChangeRef.current(nextItems);
    setAnnouncement(`${getItemLabelRef.current(movedItem)} ${movedVerb} на позицию ${targetIndex + 1}`);
    void saveOrder(nextItems, previousItems);
  };

  useEffect(() => {
    removeGhost();
    return () => {
      clearTimeout(pointerTimerRef.current);
      clearTimeout(groupTimerRef.current);
      clearPointerListeners();
      removeGhost();
    };
  }, []);

  return {
    announcement,
    beginPointerDrag,
    descriptionId,
    draggedId,
    groupTarget,
    listRef,
    moveByOffset,
    orderBusy,
    orderError,
    shouldSuppressClick: () => suppressClickRef.current,
  };
}
