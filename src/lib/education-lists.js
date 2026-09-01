export const UNLISTED_EDUCATION_LIST_ID = "unlisted";

export function educationListSelection(selectedListId, lists = [], items = []) {
  const showUnlisted = items.some((item) => !item.listId) || lists.length === 0;
  const visibleIds = [
    ...(showUnlisted ? [UNLISTED_EDUCATION_LIST_ID] : []),
    ...lists.map((list) => list.id),
  ];
  return visibleIds.includes(selectedListId)
    ? selectedListId
    : (visibleIds[0] || UNLISTED_EDUCATION_LIST_ID);
}

export function educationItemsInList(items = [], listId = UNLISTED_EDUCATION_LIST_ID) {
  return listId === UNLISTED_EDUCATION_LIST_ID
    ? items.filter((item) => !item.listId)
    : items.filter((item) => item.listId === listId);
}

export function educationListItemCount(items = [], listId = UNLISTED_EDUCATION_LIST_ID) {
  return educationItemsInList(items, listId).length;
}

export function mergeEducationListOrder(
  items = [],
  orderedItems = [],
  listId = UNLISTED_EDUCATION_LIST_ID,
) {
  const orderedById = new Map(orderedItems.map((item) => [item.id, item]));
  let index = 0;
  return items.map((item) => {
    const belongsToList = listId === UNLISTED_EDUCATION_LIST_ID
      ? !item.listId
      : item.listId === listId;
    if (!belongsToList) return item;
    const orderedItem = orderedItems[index];
    index += 1;
    return orderedById.has(item.id) && orderedItem ? orderedItem : item;
  });
}

export function educationApiListId(listId) {
  return listId === UNLISTED_EDUCATION_LIST_ID ? "" : listId;
}
