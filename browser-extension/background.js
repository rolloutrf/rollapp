const RETAILERS = Object.freeze({
  samokat: Object.freeze({
    label: "Самокат",
    hosts: new Set(["samokat.ru", "www.samokat.ru"]),
    canonicalHost: "samokat.ru",
    path: /^\/product\/([^/]{1,240})\/?$/u,
    pathPrefix: "/product/",
    tabPatterns: ["https://samokat.ru/product/*", "https://www.samokat.ru/product/*"],
  }),
  lavka: Object.freeze({
    label: "Яндекс Лавка",
    hosts: new Set(["lavka.yandex.ru"]),
    canonicalHost: "lavka.yandex.ru",
    path: /^\/good\/([^/]{1,240})\/?$/u,
    pathPrefix: "/good/",
    tabPatterns: ["https://lavka.yandex.ru/good/*"],
  }),
  lenta: Object.freeze({
    label: "Лента",
    hosts: new Set(["lenta.com", "www.lenta.com"]),
    canonicalHost: "lenta.com",
    path: /^\/(?:product|item)\/([^/]{1,300})\/?$/u,
    pathPrefix: "/product/",
    tabPatterns: [
      "https://lenta.com/product/*",
      "https://www.lenta.com/product/*",
      "https://lenta.com/item/*",
      "https://www.lenta.com/item/*",
    ],
  }),
});

const IMPORT_TIMEOUT_MS = 28_000;
const POLL_INTERVAL_MS = 350;

function lentaSku(slug) {
  return /-(\d{3,18})$/u.exec(slug)?.[1] || "";
}

function canonicalProductUrl(retailerId, value) {
  const retailer = RETAILERS[retailerId];
  if (!retailer) throw new Error("Неизвестный магазин");
  let source;
  try {
    source = new URL(String(value));
  } catch {
    throw new Error(`Нужна корректная ссылка магазина «${retailer.label}»`);
  }
  const hostname = source.hostname.toLowerCase();
  const standardPort = !source.port || source.port === "443";
  const match = retailer.path.exec(source.pathname);
  if (source.protocol !== "https:" || !standardPort || source.username || source.password || !retailer.hosts.has(hostname) || !match) {
    throw new Error(`Нужна точная ссылка на товар магазина «${retailer.label}»`);
  }
  const slug = match[1];
  if (retailerId === "lenta" && !lentaSku(slug)) throw new Error("В ссылке Ленты не найден артикул товара");

  const canonical = new URL(`https://${retailer.canonicalHost}${retailer.pathPrefix}${slug}`);
  if (retailerId === "lavka" && slug.toLowerCase().endsWith(":st-rt")) {
    const retailSlug = source.searchParams.get("retail_slug") || "";
    if (!/^[a-z0-9_-]{1,100}$/iu.test(retailSlug)) throw new Error("Для этой карточки Лавки нужен корректный retail_slug");
    canonical.searchParams.set("retail_slug", retailSlug);
  }
  return canonical;
}

function sameProduct(retailerId, left, right) {
  try {
    const leftUrl = canonicalProductUrl(retailerId, left);
    const rightUrl = canonicalProductUrl(retailerId, right);
    if (retailerId === "lenta") {
      return lentaSku(leftUrl.pathname.split("/").filter(Boolean).at(-1) || "")
        === lentaSku(rightUrl.pathname.split("/").filter(Boolean).at(-1) || "");
    }
    return leftUrl.href === rightUrl.href;
  } catch {
    return false;
  }
}

const delay = (timeoutMs) => new Promise((resolve) => setTimeout(resolve, timeoutMs));

async function findExistingProductTab(retailerId, productUrl) {
  const tabs = await chrome.tabs.query({ url: RETAILERS[retailerId].tabPatterns });
  return tabs.find((tab) => tab.id && sameProduct(retailerId, tab.url, productUrl)) || null;
}

async function readOnce(tabId, retailerId) {
  return chrome.tabs.sendMessage(tabId, { type: "ROLLAPP_READ_RETAILER_PRODUCT", retailerId });
}

async function readProductFromTab(tabId, retailerId) {
  const retailer = RETAILERS[retailerId];
  const deadline = Date.now() + IMPORT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const result = await readOnce(tabId, retailerId);
      if (result?.ok && result.metadata?.imageUrl) return result.metadata;
      if (result?.blocked) throw new Error(`${retailer.label} запросил проверку в обычном браузере`);
    } catch (error) {
      if (String(error?.message || error).includes("запросил проверку")) throw error;
      // The content script is not ready while the background tab is loading.
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(`${retailer.label} не успел загрузить карточку товара`);
}

async function importRetailerProduct(retailerId, value) {
  const productUrl = canonicalProductUrl(retailerId, value);
  const existingTab = await findExistingProductTab(retailerId, productUrl);
  if (existingTab?.id) {
    try {
      const existingResult = await readOnce(existingTab.id, retailerId);
      if (existingResult?.ok && existingResult.metadata?.imageUrl) return existingResult.metadata;
      if (existingResult?.blocked) throw new Error(`${RETAILERS[retailerId].label} запросил проверку в обычном браузере`);
    } catch (error) {
      if (String(error?.message || error).includes("запросил проверку")) throw error;
      // An already-open tab from before installation has no current content script.
    }
  }

  const tab = await chrome.tabs.create({ url: productUrl.href, active: false });
  try {
    return await readProductFromTab(tab.id, retailerId);
  } finally {
    if (tab.id) await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

function trustedRollappSender(sender) {
  if (!sender.tab?.url) return false;
  try {
    const url = new URL(sender.tab.url);
    return (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))
      || url.origin === "https://xn--80avakiab.xn--p1ai";
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "ROLLAPP_IMPORT_RETAILER") return false;
  if (!trustedRollappSender(sender)) {
    sendResponse({ ok: false, error: "Недоверенная страница Rollapp" });
    return false;
  }

  importRetailerProduct(message.retailerId, message.url)
    .then((metadata) => sendResponse({ ok: true, metadata }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || "Не удалось прочитать товар магазина" }));
  return true;
});
