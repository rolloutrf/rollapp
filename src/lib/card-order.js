export const GROUP_INTENT_DELAY_MS = 250;

export function savedOrder(item) {
  const value = Number(item?.sortOrder);
  return Number.isFinite(value) ? value : 0;
}

export function reorderCards(cards, cardId, targetIndex) {
  const sourceIndex = cards.findIndex((card) => card.id === cardId);
  if (sourceIndex === -1 || targetIndex < 0 || targetIndex >= cards.length || sourceIndex === targetIndex) return cards;

  const nextCards = [...cards];
  const [card] = nextCards.splice(sourceIndex, 1);
  nextCards.splice(targetIndex, 0, card);
  return nextCards.map((current, sortOrder) => ({ ...current, sortOrder }));
}

export function reorderCardToTarget(cards, cardId, targetId) {
  const targetIndex = cards.findIndex((card) => card.id === targetId);
  return reorderCards(cards, cardId, targetIndex);
}

export function resolveCardHoverMode({ groupingEnabled = false, rect, clientX, clientY }) {
  if (!groupingEnabled || !rect || rect.width <= 0 || rect.height <= 0) return "reorder";
  const horizontalInset = rect.width * 0.2;
  const verticalInset = rect.height * 0.2;
  const insideGroupingArea = clientX >= rect.left + horizontalInset
    && clientX <= rect.right - horizontalInset
    && clientY >= rect.top + verticalInset
    && clientY <= rect.bottom - verticalInset;
  return insideGroupingArea ? "group" : "reorder";
}

export function cardRectOverlapRatio(firstRect, secondRect) {
  if (!firstRect || !secondRect) return 0;
  const overlapWidth = Math.max(0, Math.min(firstRect.right, secondRect.right) - Math.max(firstRect.left, secondRect.left));
  const overlapHeight = Math.max(0, Math.min(firstRect.bottom, secondRect.bottom) - Math.max(firstRect.top, secondRect.top));
  const firstArea = Math.max(0, firstRect.right - firstRect.left) * Math.max(0, firstRect.bottom - firstRect.top);
  const secondArea = Math.max(0, secondRect.right - secondRect.left) * Math.max(0, secondRect.bottom - secondRect.top);
  const smallerArea = Math.min(firstArea, secondArea);
  return smallerArea > 0 ? (overlapWidth * overlapHeight) / smallerArea : 0;
}

export function resolveConfirmedGroupDrop({ groupingEnabled = false, armedTarget = "", dragTarget = "" }) {
  if (!groupingEnabled || !armedTarget || dragTarget !== armedTarget) return "";
  return armedTarget;
}
