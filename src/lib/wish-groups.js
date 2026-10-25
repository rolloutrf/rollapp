export function filterWishGroups({ groups = [], listId, selectedSpace, scopeBySpace = false, visibleWishIds = [] }) {
  if (!listId) return [];
  const visibleIds = visibleWishIds instanceof Set ? visibleWishIds : new Set(visibleWishIds);
  return groups.filter((group) => (
    group.listId === listId
    && (!scopeBySpace || !group.space || group.space === selectedSpace)
    && (group.wishIds || []).some((wishId) => visibleIds.has(wishId))
  ));
}

export function buildWishGroupGridItems({ wishes = [], groups = [] }) {
  const groupsByWishId = new Map();
  const emittedGroupIds = new Set();
  const groupWishes = new Map(groups.map((group) => [group.id, []]));
  for (const group of groups) {
    for (const wishId of group.wishIds || []) groupsByWishId.set(wishId, group);
  }
  for (const wish of wishes) {
    const group = groupsByWishId.get(wish.id);
    if (group) groupWishes.get(group.id)?.push(wish);
  }
  return wishes.flatMap((wish) => {
    const group = groupsByWishId.get(wish.id);
    if (!group) return [{ type: "wish", id: wish.id, wish }];
    if (emittedGroupIds.has(group.id)) return [];
    emittedGroupIds.add(group.id);
    return [{ type: "group", id: group.id, group, wishes: groupWishes.get(group.id) || [] }];
  });
}

export function moveWishGroupToTarget(wishIds, sourceWishIds = [], targetWishIds = []) {
  const sourceIds = new Set(sourceWishIds);
  const targetIds = new Set(targetWishIds);
  if (!sourceIds.size || !targetIds.size) return wishIds;
  if ([...targetIds].some((wishId) => sourceIds.has(wishId))) return wishIds;

  const sourceBlock = wishIds.filter((wishId) => sourceIds.has(wishId));
  if (!sourceBlock.length) return wishIds;

  const targetBlock = wishIds.filter((wishId) => targetIds.has(wishId));
  if (!targetBlock.length) return wishIds;

  // A group occupies its first member's visible slot even when its stored
  // members are interleaved. Move rendered units, then flatten their members;
  // inserting after the last stored member skips unrelated visible cards.
  let sourceEmitted = false;
  let targetEmitted = false;
  const blocks = wishIds.flatMap((wishId) => {
    if (sourceIds.has(wishId)) {
      if (sourceEmitted) return [];
      sourceEmitted = true;
      return [sourceBlock];
    }
    if (targetIds.has(wishId)) {
      if (targetEmitted) return [];
      targetEmitted = true;
      return [targetBlock];
    }
    return [[wishId]];
  });
  const sourceIndex = blocks.indexOf(sourceBlock);
  const targetIndex = blocks.indexOf(targetBlock);
  blocks.splice(sourceIndex, 1);
  blocks.splice(targetIndex, 0, sourceBlock);
  const next = blocks.flat();
  if (next.length === wishIds.length && next.every((wishId, index) => wishId === wishIds[index])) return wishIds;
  return next;
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
