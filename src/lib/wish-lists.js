export function filterWishesWithoutList(wishes = [], categoryLists = []) {
  const categoryListIds = new Set(categoryLists.map((list) => list?.id).filter(Boolean));

  return wishes.filter((wish) => !Array.isArray(wish?.listIds)
    || !wish.listIds.some((listId) => categoryListIds.has(listId)));
}

export function initialWishListIds(wish, initialListId = "") {
  const listIds = Array.isArray(wish?.listIds) ? [...wish.listIds] : [];
  if (!initialListId || listIds.includes(initialListId)) return listIds;
  return [...listIds, initialListId];
}
