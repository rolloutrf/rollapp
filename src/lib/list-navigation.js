export const UNSORTED_LIST_TITLE = "Не отсортированные";

export function isGeneralList(list) {
  return list?.title === "Мои желания" && list?.description === "Всё, чему я буду рад";
}

export function listDisplayTitle(list) {
  return isGeneralList(list) ? UNSORTED_LIST_TITLE : (list?.title || "");
}

export function shouldShowListNavigation({ shared = false, canCreateList = false, listCount = 0 } = {}) {
  return shared || canCreateList || listCount > 0;
}

export function shouldShowUnsortedList(wishCount = 0) {
  return wishCount > 0;
}
