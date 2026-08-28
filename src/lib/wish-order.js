export function moveWishToTargetPosition(wishIds, sourceId, targetId) {
  const sourceIndex = wishIds.indexOf(sourceId);
  const targetIndex = wishIds.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return wishIds;

  const next = [...wishIds];
  const [sourceWishId] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, sourceWishId);
  return next;
}

export function moveWishWithinSubset(wishIds, movableWishIds = [], sourceId, targetId) {
  const movableIds = movableWishIds instanceof Set ? movableWishIds : new Set(movableWishIds);
  if (!movableIds.has(sourceId) || !movableIds.has(targetId)) return wishIds;

  const movableOrder = wishIds.filter((wishId) => movableIds.has(wishId));
  const nextMovableOrder = moveWishToTargetPosition(movableOrder, sourceId, targetId);
  if (nextMovableOrder === movableOrder) return wishIds;

  let movableIndex = 0;
  return wishIds.map((wishId) => (
    movableIds.has(wishId) ? nextMovableOrder[movableIndex++] : wishId
  ));
}

export function resolveWishHoverMode({ groupingEnabled = false, rect, clientX, clientY }) {
  if (!groupingEnabled || !rect || rect.width <= 0 || rect.height <= 0) return "reorder";

  const horizontalInset = rect.width * 0.2;
  const verticalInset = rect.height * 0.2;
  const insideGroupingArea = clientX >= rect.left + horizontalInset
    && clientX <= rect.right - horizontalInset
    && clientY >= rect.top + verticalInset
    && clientY <= rect.bottom - verticalInset;

  return insideGroupingArea ? "group" : "reorder";
}

export function wishRectOverlapRatio(firstRect, secondRect) {
  if (!firstRect || !secondRect) return 0;
  const overlapWidth = Math.max(0, Math.min(firstRect.right, secondRect.right) - Math.max(firstRect.left, secondRect.left));
  const overlapHeight = Math.max(0, Math.min(firstRect.bottom, secondRect.bottom) - Math.max(firstRect.top, secondRect.top));
  const firstArea = Math.max(0, firstRect.right - firstRect.left) * Math.max(0, firstRect.bottom - firstRect.top);
  const secondArea = Math.max(0, secondRect.right - secondRect.left) * Math.max(0, secondRect.bottom - secondRect.top);
  const smallerArea = Math.min(firstArea, secondArea);
  return smallerArea > 0 ? (overlapWidth * overlapHeight) / smallerArea : 0;
}
