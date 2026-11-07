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

let runningWishlistImport = false;

async function readWishlistPage(provider, url, kind, deadline) {
  const tab = await chrome.tabs.create({ url, active: false });
  if (tab.id == null) throw new Error("Не удалось открыть избранное магазина.");
  try {
    const readyUntil = Math.min(deadline, Date.now() + 15_000);
    while (Date.now() < readyUntil) {
      let result;
      try {
        result = await chrome.tabs.sendMessage(tab.id, {
          type: "ROLLAPP_COLLECT_WISHLIST", provider, kind,
          timeoutMs: Math.min(45_000, deadline - Date.now()),
        });
      } catch {
        // The content script is injected after the shop document has loaded.
        await delay(300);
        continue;
      }
      if (!result?.ok) throw new Error(result?.error || "Магазин не отдал список.");
      return result;
    }
    throw new Error("Откройте избранное в магазине, войдите в аккаунт и повторите импорт.");
  } finally {
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function collectMarketplaceWishlist(provider) {
  const source = WISHLIST_SOURCES.get(provider);
  if (!source) throw new Error("Неизвестный магазин.");
  if (runningWishlistImport) throw new Error("Импорт магазина уже выполняется.");
  runningWishlistImport = true;
  const deadline = Date.now() + 170_000;
  const origin = new URL(source.start).origin;
  const items = new Map();
  const queue = source.pages.map((kind) => ({ url: kind === "lists" && source.lists ? source.lists : source.start, kind }));
  const visitedLists = new Set();
  try {
    for (const { url, kind } of queue) {
      if (Date.now() >= deadline) throw new Error("Не удалось загрузить все списки вовремя. Повторите импорт.");
      const result = await readWishlistPage(provider, url, kind, deadline);
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
    runningWishlistImport = false;
  }
}
