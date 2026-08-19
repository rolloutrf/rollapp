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
