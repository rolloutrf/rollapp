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
