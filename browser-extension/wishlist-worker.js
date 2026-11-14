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
    collections: "https://www.ozon.ru/selections/list",
    lists: "https://www.ozon.ru/my/favorites/lists",
    allowedList: /^\/(?:selections\/(?!list(?:\/|$))[^/]+|my\/favorites\/(?:lists\/[^/]+|(?!lists(?:\/|$))[^/]+))\/?$/,
  }],
  ["wb", {
    start: "https://www.wildberries.ru/lk/favorites",
    pages: ["favorites"],
    allowedList: /^\/lk\/favorites\/(?:list|folder)\/[^/]+\/?$/,
  }],
]);

let runningWishlistImport = null;

const linkedWishlistPages = new Map([
  ["ozon", {
    hosts: ["ozon.ru", "www.ozon.ru"],
    list: /^\/(?:selections\/(?:view\/)?(?!list\/?$)|my\/favorites\/(?:lists\/)?(?!lists\/?$)|wishlists?\/)[^/]+\/?$/,
    short: /^\/t\/[\w-]+\/?$/,
  }],
  ["wb", {
    hosts: ["wildberries.ru", "www.wildberries.ru", "wb.ru", "www.wb.ru"],
    list: /^\/(?:wishlist|lk\/favorites\/(?:list|folder))\/[^/]+\/?$/,
  }],
]);

function linkedWishlistUrl(provider, value, allowShort = false) {
  const source = linkedWishlistPages.get(provider);
  const url = typeof value === "string" && value.length <= 2048 ? URL.parse(value) : null;
  return url?.protocol === "https:" && !url.port && !url.username && !url.password && source?.hosts.includes(url.hostname)
    && (source.list.test(url.pathname) || allowShort && source.short?.test(url.pathname)) ? url.href : null;
}

class MarketplaceAccessError extends Error {
  code = "marketplace_access_required";
}

async function checkMarketplaceRedirect(tabId, provider) {
  if (provider !== "wb" && provider !== "yandex-market") return;
  const { url, pendingUrl } = await chrome.tabs.get(tabId).catch(() => ({}));
  if ([url, pendingUrl].some((value) => {
    const target = URL.parse(value);
    if (provider === "wb") return target?.origin === "https://id.wb.ru" && target.pathname.startsWith("/login/");
    return target?.origin === "https://market.yandex.ru" && target.pathname === "/showcaptcha";
  })) {
    throw new MarketplaceAccessError(provider === "wb"
      ? "Войдите с WB ID в этом браузере и повторите импорт."
      : "Завершите проверку на Яндекс Маркете в этом браузере и повторите импорт.");
  }
}

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
      let linkedPage;
      if (kind === "linked-list") {
        const tabState = await chrome.tabs.get(tab.id);
        linkedPage = linkedWishlistUrl(provider, tabState.url);
        if (!linkedPage) {
          await checkMarketplaceRedirect(tab.id, provider);
          if (tabState.status === "complete" && !tabState.pendingUrl && tabState.url && !linkedWishlistUrl(provider, tabState.url, true)) {
            throw new Error("Ссылка не открывает поддерживаемый список магазина.");
          }
          await delay(300);
          continue;
        }
      }
      let result;
      try {
        result = await chrome.tabs.sendMessage(tab.id, {
          type: "ROLLAPP_COLLECT_WISHLIST", provider, kind,
          ...(linkedPage && { linkedPage }),
          timeoutMs: Math.min(45_000, deadline - Date.now()),
        });
      } catch {
        signal.throwIfAborted();
        await checkMarketplaceRedirect(tab.id, provider);
        // The content script is injected after the shop document has loaded.
        await delay(300);
        continue;
      }
      signal.throwIfAborted();
      if (result?.code === "marketplace_access_required") throw new MarketplaceAccessError(result.error);
      if (!result?.ok) throw new Error(result?.error || "Магазин не отдал список.");
      return result;
    }
    throw new Error("Откройте избранное в магазине, войдите в аккаунт и повторите импорт.");
  } finally {
    signal.removeEventListener("abort", closeTab);
    await closeTab();
  }
}

async function collectMarketplaceWishlist(provider, signal, savedUrl) {
  const source = WISHLIST_SOURCES.get(provider);
  if (!source) throw new Error("Неизвестный магазин.");
  const linked = savedUrl === undefined ? null : linkedWishlistUrl(provider, savedUrl, true);
  if (savedUrl !== undefined && !linked) throw new Error("Сохраните ссылку на конкретный список, которой можно поделиться.");
  if (runningWishlistImport && !runningWishlistImport.aborted) throw new Error("Импорт магазина уже выполняется.");
  runningWishlistImport = signal;
  const deadline = Date.now() + 170_000;
  const origin = new URL(source.start).origin;
  const items = new Map();
  const queue = linked ? [{ url: linked, kind: "linked-list" }]
    : source.pages.map((kind) => ({ url: source[kind] || source.start, kind }));
  const visitedLists = new Set();
  try {
    for (const { url, kind } of queue) {
      if (Date.now() >= deadline) throw new Error("Не удалось загрузить все списки вовремя. Повторите импорт.");
      const result = await readWishlistPage(provider, url, kind, deadline, signal);
      for (const item of result.items) items.set(item.url, item);
      if (items.size > 1000) throw new Error("Найдено больше 1000 позиций. Импорт остановлен.");
      if (linked) continue;
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
