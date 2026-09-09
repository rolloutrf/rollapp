import { createHash } from "node:crypto";
import { fetchPublicImage, MetadataFetchError } from "./metadata-fetch.js";

const PROVIDER_LOGO_SOURCES = new Map([
  ["gopractice", "https://www.google.com/s2/favicons?domain_url=https%3A%2F%2Fgopractice.ru&sz=128"],
  ["productstar", "https://www.google.com/s2/favicons?domain_url=https%3A%2F%2Fproductstar.ru&sz=128"],
]);

const PROVIDER_LOGO_CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";
const PROVIDER_LOGO_FETCH_OPTIONS = Object.freeze({
  timeoutMs: 7_000,
  maxBytes: 256_000,
  maxRedirects: 2,
});
const PROVIDER_LOGO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function normalizedProviderKey(value) {
  return String(value || "").trim().toLocaleLowerCase("en");
}

export function providerLogoSourceUrl(providerKey) {
  return PROVIDER_LOGO_SOURCES.get(normalizedProviderKey(providerKey)) || "";
}

export function createProviderLogoLoader({
  fetchImage = fetchPublicImage,
  ttlMs = 6 * 60 * 60 * 1_000,
  failureTtlMs = 60_000,
  now = () => Date.now(),
} = {}) {
  const cache = new Map();
  const failures = new Map();
  const inFlight = new Map();

  return async function loadProviderLogo(providerKey) {
    const key = normalizedProviderKey(providerKey);
    const sourceUrl = providerLogoSourceUrl(key);
    if (!sourceUrl) return null;

    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return cached.value;
    if (cached) cache.delete(key);
    const failed = failures.get(key);
    if (failed && failed.expiresAt > now()) throw failed.error;
    if (failed) failures.delete(key);
    if (inFlight.has(key)) return inFlight.get(key);

    const request = Promise.resolve()
      .then(() => fetchImage(sourceUrl, PROVIDER_LOGO_FETCH_OPTIONS))
      .then((image) => {
        if (!Buffer.isBuffer(image?.body) || !image.body.length || !PROVIDER_LOGO_MIME_TYPES.has(image.mimeType)) {
          throw new MetadataFetchError("Сервис логотипов вернул неподдерживаемое изображение", {
            code: "provider_logo_invalid",
          });
        }
        const value = {
          body: image.body,
          mimeType: image.mimeType,
          etag: `"${createHash("sha256").update(image.body).digest("base64url").slice(0, 32)}"`,
        };
        failures.delete(key);
        cache.set(key, { value, expiresAt: now() + Math.max(1_000, ttlMs) });
        return value;
      })
      .catch((error) => {
        failures.set(key, { error, expiresAt: now() + Math.max(1_000, failureTtlMs) });
        throw error;
      });
    inFlight.set(key, request);
    try {
      return await request;
    } finally {
      if (inFlight.get(key) === request) inFlight.delete(key);
    }
  };
}

export const loadProviderLogo = createProviderLogoLoader();

export function createProviderLogoHandler({ loader = loadProviderLogo } = {}) {
  return async function providerLogoHandler(req, res) {
    let image;
    try {
      image = await loader(req.params.providerKey);
    } catch (error) {
      if (error instanceof MetadataFetchError) {
        res.set("Cache-Control", "no-store");
        return res.status(502).end();
      }
      throw error;
    }

    if (!image) {
      res.set("Cache-Control", "public, max-age=300");
      return res.status(404).end();
    }

    res.set({
      "Cache-Control": PROVIDER_LOGO_CACHE_CONTROL,
      ETag: image.etag,
      "X-Content-Type-Options": "nosniff",
    });
    if (req.get("if-none-match") === image.etag) return res.status(304).end();

    res.set("Content-Length", String(image.body.length));
    return res.type(image.mimeType).send(image.body);
  };
}

export const providerLogoHandler = createProviderLogoHandler();
