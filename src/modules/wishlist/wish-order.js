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

export function reorderScopeWishIds(visibleWishes = [], groupWishIds = null) {
  const visibleWishIds = new Set(visibleWishes.map((wish) => wish?.id).filter(Boolean));
  if (!Array.isArray(groupWishIds)) return visibleWishIds;
  return new Set(groupWishIds.filter((wishId) => visibleWishIds.has(wishId)));
}

export function wishGroupingDistance(rect, clientX, clientY) {
  if (!rect || rect.width <= 0 || rect.height <= 0 || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return Infinity;
  const horizontalInset = rect.width * 0.2;
  const verticalInset = rect.height * 0.2;
  return Math.max(0, rect.left + horizontalInset - clientX, clientX - rect.right + horizontalInset,
    rect.top + verticalInset - clientY, clientY - rect.bottom + verticalInset);
}

export function resolveWishHoverMode({ groupingEnabled = false, rect, clientX, clientY }) {
  return groupingEnabled && wishGroupingDistance(rect, clientX, clientY) === 0 ? "group" : "reorder";
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
