export function filterWishesWithoutList(wishes = [], categoryLists = []) {
  const categoryListIds = new Set(categoryLists.map((list) => list?.id).filter(Boolean));

  return wishes.filter((wish) => !Array.isArray(wish?.listIds)
    || !wish.listIds.some((listId) => categoryListIds.has(listId)));
}
