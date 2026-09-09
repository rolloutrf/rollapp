export const MARKETPLACE_OFFERS_CLIENT_TIMEOUT_MS = 100_000;

function streamMessage(block) {
  let event = "message";
  const data = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (!data.length) return null;
  try {
    return { event, data: JSON.parse(data.join("\n")) };
  } catch {
    return null;
  }
}

export async function readMarketplaceOfferStream(response, onMessage) {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.error || "Не удалось запустить поиск предложений");
    error.code = payload.code || "";
    error.status = response.status;
    error.retryAfterSeconds = Number(payload.retryAfterSeconds || response.headers.get("Retry-After")) || 0;
    throw error;
  }
  if (!response.body) throw new Error("Браузер не поддерживает потоковое обновление");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      const message = streamMessage(block);
      if (message) onMessage(message);
    }
    if (done) break;
  }
  if (buffer.trim()) {
    const message = streamMessage(buffer);
    if (message) onMessage(message);
  }
}

function timeoutError() {
  const error = new Error("Поиск занял слишком много времени. Попробуйте ещё раз");
  error.code = "marketplace_offers_timeout";
  return error;
}

export async function refreshMarketplaceOffers(wishId, {
  fetchImpl = globalThis.fetch,
  signal,
  onMessage = () => {},
  timeoutMs = MARKETPLACE_OFFERS_CLIENT_TIMEOUT_MS,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
} = {}) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(signal.reason);
  if (signal?.aborted) abortFromParent();
  else signal?.addEventListener("abort", abortFromParent, { once: true });

  const deadlineError = timeoutError();
  let timeoutId;
  const deadline = new Promise((_, reject) => {
    timeoutId = setTimeoutImpl(() => {
      controller.abort(deadlineError);
      reject(deadlineError);
    }, timeoutMs);
  });
  const request = (async () => {
    const response = await fetchImpl(`/api/wishes/${encodeURIComponent(wishId)}/marketplace-offers/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: controller.signal,
    });
    let completed = false;
    await readMarketplaceOfferStream(response, (message) => {
      if (message.event === "done") completed = true;
      onMessage(message);
    });
    if (!completed) throw new Error("Поиск завершился без списка предложений");
  })();

  try {
    await Promise.race([request, deadline]);
  } catch (error) {
    if (controller.signal.reason === deadlineError) throw deadlineError;
    throw error;
  } finally {
    clearTimeoutImpl(timeoutId);
    signal?.removeEventListener("abort", abortFromParent);
  }
}
