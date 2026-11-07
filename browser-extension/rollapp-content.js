const ROLLAPP_PAGE_SOURCE = "rollapp-page";
const ROLLAPP_HELPER_SOURCE = "rollapp-retailer-helper";
const wishlistImports = new Map();
function isTrustedRollappOrigin(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))
      || url.origin === "https://xn--80avakiab.xn--p1ai";
  } catch {
    return false;
  }
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin || !isTrustedRollappOrigin(event.origin)) return;
  const message = event.data;
  if (!message || message.source !== ROLLAPP_PAGE_SOURCE || typeof message.requestId !== "string") return;

  if (message.type === "ROLLAPP_RETAILER_PING") {
    window.postMessage({
      source: ROLLAPP_HELPER_SOURCE,
      type: "ROLLAPP_RETAILER_PONG",
      requestId: message.requestId,
    }, window.location.origin);
    return;
  }

  if (["ROLLAPP_WISHLIST_PING", "ROLLAPP_WISHLIST_IMPORT", "ROLLAPP_WISHLIST_CANCEL"].includes(message.type)) {
    if (event.origin !== "https://xn--80avakiab.xn--p1ai") return;
    const id = message.requestId;
    if (message.type === "ROLLAPP_WISHLIST_CANCEL") {
      const port = wishlistImports.get(id);
      wishlistImports.delete(id);
      port?.disconnect();
      return;
    }

    const ping = message.type === "ROLLAPP_WISHLIST_PING";
    const send = (result) => window.postMessage({
      source: ROLLAPP_HELPER_SOURCE,
      type: ping ? "ROLLAPP_WISHLIST_PONG" : "ROLLAPP_WISHLIST_RESULT",
      requestId: id,
      result,
    }, window.location.origin);
    if (ping) {
      send({ ok: true });
      return;
    }
    if (wishlistImports.has(id)) return;

    try {
      const port = chrome.runtime.connect({ name: "rollapp-wishlist-import" });
      wishlistImports.set(id, port);
      port.onDisconnect.addListener(() => {
        if (wishlistImports.get(id) !== port) return;
        wishlistImports.delete(id);
        send({ ok: false, error: "Расширение отключилось. Обновите страницу и повторите импорт." });
      });
      port.onMessage.addListener((result) => {
        if (wishlistImports.get(id) !== port) return;
        wishlistImports.delete(id);
        port.disconnect();
        send(result);
      });
      port.postMessage({ provider: message.provider });
    } catch {
      wishlistImports.get(id)?.disconnect();
      wishlistImports.delete(id);
      send({ ok: false, error: "Обновите расширение и страницу Rollapp." });
    }
    return;
  }

  if (message.type !== "ROLLAPP_RETAILER_IMPORT") return;
  chrome.runtime.sendMessage({ type: "ROLLAPP_IMPORT_RETAILER", retailerId: message.retailerId, url: message.url })
    .then((result) => {
      window.postMessage({
        source: ROLLAPP_HELPER_SOURCE,
        type: "ROLLAPP_RETAILER_RESULT",
        requestId: message.requestId,
        result,
      }, window.location.origin);
    })
    .catch((error) => {
      window.postMessage({
        source: ROLLAPP_HELPER_SOURCE,
        type: "ROLLAPP_RETAILER_RESULT",
        requestId: message.requestId,
        result: { ok: false, error: error?.message || "Помощник Rollapp не ответил" },
      }, window.location.origin);
    });
});
