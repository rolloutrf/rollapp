export function filterWishGroups({ groups = [], listId, selectedSpace, scopeBySpace = false, visibleWishIds = [] }) {
  if (!listId) return [];
  const visibleIds = visibleWishIds instanceof Set ? visibleWishIds : new Set(visibleWishIds);
  return groups.filter((group) => (
    group.listId === listId
    && (!scopeBySpace || !group.space || group.space === selectedSpace)
    && (group.wishIds || []).some((wishId) => visibleIds.has(wishId))
  ));
}

export function disbandWishGroupFromDashboard(dashboard, groupId) {
  if (!dashboard || !Array.isArray(dashboard.groups)) return dashboard;
  const groups = dashboard.groups.filter((group) => group.id !== groupId);
  return groups.length === dashboard.groups.length ? dashboard : { ...dashboard, groups };
}

export function moveWishGroupInDashboard(dashboard, {
  group,
  sourceListId,
  targetListId,
  removedFromSourceWishIds = [],
}) {
  if (!dashboard || !group || !sourceListId || !targetListId) return dashboard;
  const groupWishIds = new Set(group.wishIds || []);
  const removedIds = new Set(removedFromSourceWishIds);
  const countDeltas = new Map();
  const wishes = (dashboard.wishes || []).map((wish) => {
    if (!groupWishIds.has(wish.id)) return wish;
    const previousListIds = Array.isArray(wish.listIds) ? wish.listIds : [];
    const nextListIds = previousListIds.filter((listId) => listId !== sourceListId || !removedIds.has(wish.id));
    if (!nextListIds.includes(targetListId)) nextListIds.push(targetListId);
    const wasInSource = previousListIds.includes(sourceListId);
    const isInSource = nextListIds.includes(sourceListId);
    const wasInTarget = previousListIds.includes(targetListId);
    const isInTarget = nextListIds.includes(targetListId);
    if (wish.status === "active" && wasInSource !== isInSource) {
      countDeltas.set(sourceListId, (countDeltas.get(sourceListId) || 0) + (isInSource ? 1 : -1));
    }
    if (wish.status === "active" && wasInTarget !== isInTarget) {
      countDeltas.set(targetListId, (countDeltas.get(targetListId) || 0) + (isInTarget ? 1 : -1));
    }
    return nextListIds.length === previousListIds.length
      && nextListIds.every((listId, index) => listId === previousListIds[index])
      ? wish
      : { ...wish, listIds: nextListIds };
  });
  const groups = (dashboard.groups || []).map((currentGroup) => currentGroup.id === group.id ? group : currentGroup);
  const lists = (dashboard.lists || []).map((list) => countDeltas.has(list.id)
    ? { ...list, wishCount: Math.max(0, Number(list.wishCount || 0) + countDeltas.get(list.id)) }
    : list);
  return { ...dashboard, groups, wishes, lists };
}
