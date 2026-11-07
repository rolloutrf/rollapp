const WISHLIST_SOURCES = new Map([
  ["yandex-market", {
    start: "https://market.yandex.ru/my/wishlist",
    pages: ["favorites", "lists"],
    lists: "https://market.yandex.ru/my/wishlist/lists",
    allowedList: /^\/wishlist\/[\da-f-]{36}\/?$/i,
  }],
  ["ozon", {
    start: "https://www.ozon.ru/my/favorites",
    pages: ["collections", "favorites", "lists"],
    lists: "https://www.ozon.ru/selections/list",
    allowedList: /^\/(?:selections\/(?!list(?:\/|$))[^/]+|my\/favorites\/[^/]+)\/?$/,
  }],
  ["wb", {
    start: "https://www.wildberries.ru/lk/favorites",
    pages: ["favorites"],
    allowedList: /^\/lk\/favorites\/(?:list|folder)\/[^/]+\/?$/,
  }],
]);

let runningWishlistImport = null;

async function readWishlistPage(provider, url, kind, deadline, signal) {
  signal.throwIfAborted();
  const tab = await chrome.tabs.create({ url, active: false });
  if (tab.id == null) throw new Error("Не удалось открыть избранное магазина.");
  let closing;
  const closeTab = () => closing ??= chrome.tabs.remove(tab.id).catch(() => {});
  signal.addEventListener("abort", closeTab, { once: true });
  try {
    signal.throwIfAborted();
    const readyUntil = Math.min(deadline, Date.now() + 15_000);
    while (Date.now() < readyUntil) {
      signal.throwIfAborted();
      let result;
      try {
        result = await chrome.tabs.sendMessage(tab.id, {
          type: "ROLLAPP_COLLECT_WISHLIST", provider, kind,
          timeoutMs: Math.min(45_000, deadline - Date.now()),
        });
      } catch {
        signal.throwIfAborted();
        // The content script is injected after the shop document has loaded.
        await delay(300);
        continue;
      }
      signal.throwIfAborted();
      if (!result?.ok) throw new Error(result?.error || "Магазин не отдал список.");
      return result;
    }
    throw new Error("Откройте избранное в магазине, войдите в аккаунт и повторите импорт.");
  } finally {
    signal.removeEventListener("abort", closeTab);
    await closeTab();
  }
}

async function collectMarketplaceWishlist(provider, signal) {
  const source = WISHLIST_SOURCES.get(provider);
  if (!source) throw new Error("Неизвестный магазин.");
  if (runningWishlistImport && !runningWishlistImport.aborted) throw new Error("Импорт магазина уже выполняется.");
  runningWishlistImport = signal;
  const deadline = Date.now() + 170_000;
  const origin = new URL(source.start).origin;
  const items = new Map();
  const queue = source.pages.map((kind) => ({ url: kind === "lists" && source.lists ? source.lists : source.start, kind }));
  const visitedLists = new Set();
  try {
    for (const { url, kind } of queue) {
      if (Date.now() >= deadline) throw new Error("Не удалось загрузить все списки вовремя. Повторите импорт.");
      const result = await readWishlistPage(provider, url, kind, deadline, signal);
      for (const item of result.items) items.set(item.url, item);
      if (items.size > 1000) throw new Error("Найдено больше 1000 позиций. Импорт остановлен.");
      for (const value of result.links) {
        const list = URL.parse(value);
        if (!list || list.origin !== origin || !source.allowedList.test(list.pathname)) continue;
        const canonical = list.origin + list.pathname.replace(/\/$/, "");
        if (visitedLists.has(canonical)) continue;
        visitedLists.add(canonical);
        if (visitedLists.size > 100) throw new Error("Найдено больше 100 списков. Импорт остановлен.");
        queue.push({ url: canonical, kind: "list" });
      }
    }
    return { items: [...items.values()], listCount: visitedLists.size };
  } finally {
    if (runningWishlistImport === signal) runningWishlistImport = null;
  }
}
