import { createHash } from "node:crypto";
import { decodeHtmlEntities } from "./metadata.js";
import { fetchPublicHtml, fetchPublicImage, MetadataFetchError } from "./metadata-fetch.js";

const FACEBOOK_HOSTS = new Set(["facebook.com", "www.facebook.com", "web.facebook.com", "m.facebook.com"]);

function avatarError(message = "Фото профиля недоступно") {
  return new MetadataFetchError(message, { status: 404, code: "contact_avatar_unavailable" });
}

function metaAttributes(source) {
  const attributes = Object.create(null);
  const pattern = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  for (const match of source.matchAll(pattern)) {
    attributes[match[1].toLocaleLowerCase("en")] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function isFacebookCdnImage(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLocaleLowerCase("en");
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.port
      && (hostname === "fbcdn.net" || hostname.endsWith(".fbcdn.net"));
  } catch {
    return false;
  }
}

export function facebookProfileUrl(contact) {
  const link = contact?.links?.find((item) => item.label === "Facebook")?.url || "";
  try {
    const url = new URL(link);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !FACEBOOK_HOSTS.has(url.hostname.toLocaleLowerCase("en"))) return "";
    return url.href;
  } catch {
    return "";
  }
}

export function facebookAvatarUrlFromHtml(html) {
  for (const match of String(html || "").matchAll(/<meta\b([^>]*)>/giu)) {
    const attributes = metaAttributes(match[1]);
    const property = String(attributes.property || attributes.name || "").toLocaleLowerCase("en");
    const content = String(attributes.content || "").trim();
    if (["og:image", "og:image:secure_url"].includes(property) && isFacebookCdnImage(content)) return content;
  }
  return "";
}

function createLimiter(limit) {
  let active = 0;
  const queue = [];
  const drain = () => {
    while (active < limit && queue.length) {
      const { task, resolve, reject } = queue.shift();
      active += 1;
      void Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  };
  return (task) => new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    drain();
  });
}

export function createContactAvatarLoader({
  fetchHtml = fetchPublicHtml,
  fetchImage = fetchPublicImage,
  concurrency = 4,
  maxEntries = 256,
  ttlMs = 6 * 60 * 60 * 1_000,
  now = () => Date.now(),
} = {}) {
  const cache = new Map();
  const inFlight = new Map();
  const schedule = createLimiter(Math.max(1, concurrency));

  const cacheValue = (cacheKey, value) => {
    if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, { value, expiresAt: now() + ttlMs });
  };

  return async function loadContactAvatar(contact) {
    const profileUrl = facebookProfileUrl(contact);
    if (!profileUrl) throw avatarError();
    const cacheKey = `${contact.id}:${profileUrl}`;

    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now()) {
      cache.delete(cacheKey);
      cache.set(cacheKey, cached);
      return cached.value;
    }
    if (cached) cache.delete(cacheKey);
    if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

    const request = schedule(async () => {
      const { html } = await fetchHtml(profileUrl, { timeoutMs: 12_000, maxBytes: 1_000_000, maxRedirects: 3 });
      const avatarUrl = facebookAvatarUrlFromHtml(html);
      if (!avatarUrl) throw avatarError();
      const image = await fetchImage(avatarUrl, { timeoutMs: 12_000, maxBytes: 3_000_000, maxRedirects: 2 });
      const value = {
        body: image.body,
        mimeType: image.mimeType,
        etag: `"${createHash("sha256").update(image.body).digest("base64url").slice(0, 32)}"`,
      };
      cacheValue(cacheKey, value);
      return value;
    });
    inFlight.set(cacheKey, request);
    try {
      return await request;
    } finally {
      if (inFlight.get(cacheKey) === request) inFlight.delete(cacheKey);
    }
  };
}

export const loadContactAvatar = createContactAvatarLoader();
