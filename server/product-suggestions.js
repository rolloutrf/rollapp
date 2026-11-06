import { createRateLimit } from "./rate-limit.js";

const API_URL = "https://www.wikidata.org/w/api.php";
const CACHE_MS = 5 * 60_000;
// Conservative budget shared by all users of this server process (two reads/search).
const SEARCHES_PER_MINUTE = 20;
const MODEL_TYPES = new Set(["Q19723451", "Q55990535", "Q33612712"]); // smartphone/computer model, running shoe
const EXCLUDED_TYPES = new Set(["Q5", "Q43229", "Q4830453", "Q4167410", "Q4167836"]);

export class ProductSuggestionsError extends Error {
  constructor(status = 503, retryAfterSeconds = 0) {
    super(status === 429 ? "Подсказки заняты. Можно продолжить ввод вручную." : "Wikidata временно недоступна. Можно ввести название вручную.");
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function normalizeProductQuery(value) {
  if (typeof value !== "string" || value.length > 160 || /[\u0000-\u001f\u007f]/u.test(value)) return null;
  const query = value.trim().replace(/\s+/gu, " ");
  return query.length >= 3 ? query : null;
}

function claimIds(entity, property) {
  return (entity?.claims?.[property] || []).filter((claim) => claim.rank !== "deprecated")
    .map((claim) => claim.mainsnak?.datavalue?.value?.id).filter((id) => /^Q\d+$/.test(id || ""));
}

export function productSuggestionsFrom(search, entities) {
  const seen = new Set();
  return search.flatMap((item) => {
    if (!/^Q\d+$/.test(item.id || "") || typeof item.label !== "string") return [];
    const entity = entities[item.id];
    if (!entity || "missing" in entity) return [];
    const types = claimIds(entity, "P31");
    // Wikidata is encyclopedic: require product evidence, not a name/description match alone.
    if (types.some((id) => EXCLUDED_TYPES.has(id))) return [];
    if (!claimIds(entity, "P176").length && !types.some((id) => MODEL_TYPES.has(id))) return [];
    const title = item.label.trim();
    const key = title.toLocaleLowerCase("ru");
    if (!title || title.length > 160 || seen.has(key)) return [];
    seen.add(key);
    return [{ id: item.id, title, description: typeof item.description === "string" ? item.description.slice(0, 240) : "", source: "Wikidata" }];
  }).slice(0, 8);
}

export function createProductSuggestions({ fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map();
  let pending = null;
  let windowStart = 0;
  let count = 0;
  let cooldownUntil = 0;

  async function read(parameters, signal) {
    const url = new URL(API_URL);
    url.search = new URLSearchParams({ format: "json", ...parameters }).toString();
    const response = await fetchImpl(url, {
      signal, redirect: "error",
      headers: { Accept: "application/json", "User-Agent": "Rollapp/1.0 (https://github.com/rolloutrf/rollapp; interactive product suggestions)" },
    });
    if (response.status === 429 || response.status === 503) {
      const retry = response.headers.get("Retry-After");
      const seconds = /^\d+$/.test(retry || "") ? Number(retry) : Math.ceil((Date.parse(retry) - now()) / 1000);
      const delay = Math.min(3600, Math.max(60, Number.isFinite(seconds) ? seconds : 60));
      cooldownUntil = now() + delay * 1000;
      throw new ProductSuggestionsError(response.status, delay);
    }
    if (!response.ok || !response.body) throw new ProductSuggestionsError();
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 2_000_000) throw new ProductSuggestionsError();
      chunks.push(chunk);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (data.error) throw new ProductSuggestionsError();
    return data;
  }

  async function search(value) {
    const query = normalizeProductQuery(value);
    if (!query) return [];
    const key = query.toLocaleLowerCase("ru");
    const cached = cache.get(key);
    if (cached?.expires > now()) return cached.items;
    cache.delete(key);
    if (pending?.key === key) return pending.promise;
    if (cooldownUntil > now()) throw new ProductSuggestionsError(429, Math.ceil((cooldownUntil - now()) / 1000));
    // Do not queue old keystrokes behind another user's slow request.
    if (pending) throw new ProductSuggestionsError(429, 2);
    if (now() - windowStart >= 60_000) { windowStart = now(); count = 0; }
    if (count >= SEARCHES_PER_MINUTE) throw new ProductSuggestionsError(429, Math.max(1, Math.ceil((windowStart + 60_000 - now()) / 1000)));
    count += 1;
    const promise = (async () => {
      const signal = AbortSignal.timeout(8_000);
      try {
        const data = await read({ action: "wbsearchentities", search: query, language: "ru", uselang: "ru", type: "item", limit: "12" }, signal);
        if (!Array.isArray(data.search)) throw new ProductSuggestionsError();
        const candidates = data.search.filter((item) => /^Q\d+$/.test(item?.id || "")).slice(0, 12);
        let items = [];
        if (candidates.length) {
          const details = await read({ action: "wbgetentities", ids: candidates.map((item) => item.id).join("|"), props: "claims" }, signal);
          if (!details.entities || typeof details.entities !== "object") throw new ProductSuggestionsError();
          items = productSuggestionsFrom(candidates, details.entities);
        }
        for (const [entry, value] of cache) if (value.expires <= now()) cache.delete(entry);
        if (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(key, { items, expires: now() + CACHE_MS });
        return items;
      } catch (error) {
        throw error instanceof ProductSuggestionsError ? error : new ProductSuggestionsError();
      }
    })();
    pending = { key, promise };
    try { return await promise; } finally { pending = null; }
  }
  return { search };
}

export function registerProductSuggestionRoutes(app, { requireAuth, service = createProductSuggestions() }) {
  const rateLimit = createRateLimit({ windowMs: 60_000, max: 30, key: (req) => req.user?.id,
    message: "Подсказки заняты. Можно продолжить ввод вручную.", code: "PRODUCT_SUGGESTIONS_LIMIT" });
  // POST keeps drafts out of URL/access logs. This handler never writes to the database.
  app.post("/api/catalog/product-suggestions", requireAuth, rateLimit, async (req, res) => {
    res.set("Cache-Control", "no-store");
    const query = normalizeProductQuery(req.body?.query);
    if (!query) return res.status(400).json({ error: "Введите от 3 до 160 символов." });
    try { return res.json({ items: await service.search(query), source: "Wikidata" }); }
    catch (error) {
      const failure = error instanceof ProductSuggestionsError ? error : new ProductSuggestionsError();
      if (failure.retryAfterSeconds) res.set("Retry-After", String(failure.retryAfterSeconds));
      return res.status(failure.status).json({ error: failure.message, retryAfterSeconds: failure.retryAfterSeconds });
    }
  });
}
