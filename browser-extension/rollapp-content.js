const ROLLAPP_PAGE_SOURCE = "rollapp-page";
const ROLLAPP_HELPER_SOURCE = "rollapp-retailer-helper";
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
