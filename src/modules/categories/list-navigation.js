export const UNSORTED_LIST_TITLE = "Не отсортированные";

export function isGeneralList(list) {
  return list?.title === "Мои желания" && list?.description === "Всё, чему я буду рад";
}

export function listDisplayTitle(list) {
  return isGeneralList(list) ? UNSORTED_LIST_TITLE : (list?.title || "");
}

function normalizeListTitle(title) {
  return String(title ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru").replaceAll("ё", "е");
}

export function findAssistantWishLists(lists, requestedTitle) {
  const requested = normalizeListTitle(requestedTitle);
  if (!requested) return [];

  const matches = title => lists.filter(list => normalizeListTitle(listDisplayTitle(list)) === title);
  const exact = matches(requested);
  if (exact.length) return exact;

  // A spoken request may use the accusative, as in «в Кухню» for «Кухня».
  const nominative = requested.replace(/[ую]$/u, ending => ending === "у" ? "а" : "я");
  return nominative === requested ? [] : matches(nominative);
}

export function orderWishListsForNavigation(lists) {
  const lifestyle = lists.findIndex((list) => list.title?.trim().toLocaleLowerCase("ru-RU") === "лайфстайл");
  if (lifestyle <= 0) return lists;
  return [lists[lifestyle], ...lists.slice(0, lifestyle), ...lists.slice(lifestyle + 1)];
}

export function shouldShowListNavigation({ shared = false, listCount = 0, unlistedCount = 0 } = {}) {
  return shared || listCount > 0 || unlistedCount > 0;
}

export function shouldShowUnsortedList(wishCount = 0) {
  return wishCount > 0;
}

export function resolveVisibleListSelection(selectedValue = "all", lists = [], showUnsorted = true) {
  const visibleValues = [
    ...(showUnsorted ? ["all"] : []),
    ...lists.map((list) => list.id),
  ];
  return visibleValues.includes(selectedValue) ? selectedValue : (visibleValues[0] || "all");
}

export function wishCountNoun(count) {
  const absolute = Math.abs(Number(count) || 0);
  const lastTwo = absolute % 100;
  const last = absolute % 10;
  if (last === 1 && lastTwo !== 11) return "желание";
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return "желания";
  return "желаний";
}
