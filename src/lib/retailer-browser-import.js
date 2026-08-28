const PAGE_SOURCE = "rollapp-page";
const HELPER_SOURCE = "rollapp-retailer-helper";

const RETAILERS = Object.freeze({
  samokat: Object.freeze({
    label: "Самокат",
    image: (url) => /^https:\/\/damcdn\.samokat\.ru\/dam-storage-ext-env-prod\//i.test(url),
  }),
  lavka: Object.freeze({
    label: "Яндекс Лавка",
    image: (url) => /^https:\/\/(?:yastatic\.net\/avatars|avatars\.mds\.yandex\.net)\/(?:get-grocery-goods|get-eda)\//i.test(url),
  }),
  lenta: Object.freeze({
    label: "Лента",
    image: (url) => /^https:\/\/cdn\.api\.lenta\.com\/resample\/[^/]+\/[^/]+\/photo\/\d+\/catalog-image\/[^/]+/i.test(url),
  }),
});

export class RetailerBrowserImportError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "RetailerBrowserImportError";
    this.code = code;
  }
}

function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `retailer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function exchange(target, requestType, responseType, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const id = requestId();
    let timer;
    const finish = (callback, value) => {
      target.removeEventListener("message", onMessage);
      clearTimeout(timer);
      callback(value);
    };
    const onMessage = (event) => {
      if (event.source !== target || event.origin !== target.location.origin) return;
      const message = event.data;
      if (message?.source !== HELPER_SOURCE || message.type !== responseType || message.requestId !== id) return;
      finish(resolve, message);
    };
    target.addEventListener("message", onMessage);
    timer = setTimeout(() => finish(
      reject,
      new RetailerBrowserImportError(
        requestType === "ROLLAPP_RETAILER_PING" ? "Помощник браузера не подключён" : "Магазин не успел загрузить товар",
        requestType === "ROLLAPP_RETAILER_PING" ? "helper_unavailable" : "helper_timeout",
      ),
    ), timeoutMs);
    target.postMessage({ source: PAGE_SOURCE, type: requestType, requestId: id, ...payload }, target.location.origin);
  });
}

export function normalizeRetailerBrowserMetadata(retailerId, value) {
  const retailer = RETAILERS[retailerId];
  if (!retailer) throw new TypeError(`Unknown retailer: ${retailerId}`);
  const imageUrl = typeof value?.imageUrl === "string" ? value.imageUrl.trim() : "";
  if (!retailer.image(imageUrl)) {
    throw new RetailerBrowserImportError(`${retailer.label} не отдал фото товара`, "image_missing");
  }
  const price = value?.price == null || value.price === "" ? null : Number(value.price);
  return {
    title: typeof value?.title === "string" ? value.title.trim().slice(0, 300) : "",
    description: typeof value?.description === "string" ? value.description.trim().slice(0, 5_000) : "",
    imageUrl,
    price: Number.isFinite(price) && price >= 0 ? price : null,
    currency: typeof value?.currency === "string" && /^[A-Z]{3}$/.test(value.currency.toUpperCase())
      ? value.currency.toUpperCase()
      : "RUB",
    previewFallback: false,
  };
}

export async function requestRetailerBrowserMetadata(retailerId, url, {
  target = typeof window === "undefined" ? null : window,
  pingTimeoutMs = 700,
  importTimeoutMs = 32_000,
} = {}) {
  const retailer = RETAILERS[retailerId];
  if (!retailer) throw new TypeError(`Unknown retailer: ${retailerId}`);
  if (!target?.location?.origin) {
    throw new RetailerBrowserImportError("Помощник браузера недоступен", "helper_unavailable");
  }
  await exchange(target, "ROLLAPP_RETAILER_PING", "ROLLAPP_RETAILER_PONG", {}, pingTimeoutMs);
  const response = await exchange(
    target,
    "ROLLAPP_RETAILER_IMPORT",
    "ROLLAPP_RETAILER_RESULT",
    { retailerId, url },
    importTimeoutMs,
  );
  if (!response.result?.ok) {
    throw new RetailerBrowserImportError(
      response.result?.error || `Не удалось прочитать товар магазина «${retailer.label}»`,
      "helper_failed",
    );
  }
  return normalizeRetailerBrowserMetadata(retailerId, response.result.metadata);
}
