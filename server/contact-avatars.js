import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STATIC_CONTACT_AVATAR_IDS } from "./contact-avatar-data.js";
import { decodeHtmlEntities } from "./metadata.js";
import { fetchPublicHtml, fetchPublicImage, MetadataFetchError } from "./metadata-fetch.js";

const FACEBOOK_HOSTS = new Set(["facebook.com", "www.facebook.com", "web.facebook.com", "m.facebook.com"]);
const SOCIAL_PROFILE_HOSTS = new Set([
  ...FACEBOOK_HOSTS,
  "fb.com", "www.fb.com",
  "instagram.com", "www.instagram.com",
  "linkedin.com", "www.linkedin.com",
  "t.me", "telegram.me", "www.telegram.me", "telegram.org", "www.telegram.org",
  "twitter.com", "www.twitter.com", "x.com", "www.x.com",
  "vk.com", "www.vk.com", "vkontakte.ru", "www.vkontakte.ru",
]);

function avatarError(message = "Фото профиля недоступно", { cause } = {}) {
  return new MetadataFetchError(message, { status: 404, code: "contact_avatar_unavailable", cause });
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

export function socialProfileUrl(link) {
  try {
    const url = new URL(String(link?.url || "").trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) return "";
    if (!SOCIAL_PROFILE_HOSTS.has(url.hostname.toLocaleLowerCase("en"))) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

export function socialAvatarUrlFromHtml(html, pageUrl) {
  for (const match of String(html || "").matchAll(/<meta\b([^>]*)>/giu)) {
    const attributes = metaAttributes(match[1]);
    const property = String(attributes.property || attributes.name || "").toLocaleLowerCase("en");
    if (!["og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"].includes(property)) continue;
    try {
      const url = new URL(String(attributes.content || "").trim(), pageUrl);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) continue;
      return url.href;
    } catch {
      // Keep looking for another valid social preview.
    }
  }
  return "";
}

export function createContactSocialAvatarResolver({
  fetchHtml = fetchPublicHtml,
  fetchImage = fetchPublicImage,
} = {}) {
  return async function resolveContactSocialAvatar(links = []) {
    const candidates = links
      .map((link) => ({ link, profileUrl: socialProfileUrl(link) }))
      .filter(({ profileUrl }) => profileUrl);
    if (!candidates.length) throw avatarError("Добавьте ссылку на поддерживаемую соцсеть");

    let lastError;
    for (const { link, profileUrl } of candidates) {
      try {
        const { html, url } = await fetchHtml(profileUrl, { timeoutMs: 12_000, maxBytes: 1_000_000, maxRedirects: 3 });
        const facebookImage = FACEBOOK_HOSTS.has(new URL(profileUrl).hostname.toLocaleLowerCase("en"))
          ? facebookAvatarUrlFromHtml(html)
          : "";
        const avatarUrl = facebookImage || socialAvatarUrlFromHtml(html, url);
        if (!avatarUrl) throw avatarError();
        const image = await fetchImage(avatarUrl, { timeoutMs: 12_000, maxBytes: 8_000_000, maxRedirects: 3 });
        return {
          body: image.body,
          mimeType: image.mimeType,
          source: String(link.label || new URL(profileUrl).hostname).trim(),
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw avatarError("Не удалось получить публичное фото из добавленных соцсетей", { cause: lastError });
  };
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
  concurrency = 8,
  maxEntries = 2048,
  ttlMs = 24 * 60 * 60 * 1_000,
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

const loadRemoteContactAvatar = createContactAvatarLoader();
export const resolveContactSocialAvatar = createContactSocialAvatarResolver();
const staticAvatarCache = new Map();
const staticAvatarDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "contact-avatars-data");

async function loadStaticContactAvatar(contactId) {
  if (staticAvatarCache.has(contactId)) return staticAvatarCache.get(contactId);
  let body;
  try {
    body = await readFile(path.join(staticAvatarDir, `${contactId}.webp`));
  } catch (error) {
    throw avatarError("Сохранённое фото профиля недоступно", { cause: error });
  }
  const value = {
    body,
    mimeType: "image/webp",
    etag: `"${createHash("sha256").update(body).digest("base64url").slice(0, 32)}"`,
  };
  staticAvatarCache.set(contactId, value);
  return value;
}

export async function loadContactAvatar(contact) {
  if (STATIC_CONTACT_AVATAR_IDS.has(contact?.id)) return loadStaticContactAvatar(contact.id);
  return loadRemoteContactAvatar(contact);
}
