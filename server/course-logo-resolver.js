import { createHash } from "node:crypto";
import { decodeHtmlEntities } from "./metadata.js";
import { fetchPublicHtml, fetchPublicImage, MetadataFetchError } from "./metadata-fetch.js";

const COURSE_PAGE_FETCH_OPTIONS = Object.freeze({
  timeoutMs: 10_000,
  maxBytes: 512_000,
  maxRedirects: 3,
});
const COURSE_LOGO_FETCH_OPTIONS = Object.freeze({
  timeoutMs: 10_000,
  maxBytes: 2_000_000,
  maxRedirects: 3,
});
const COURSE_LOGO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_MAX_CANDIDATES = 8;
const COURSE_LOGO_CACHE_CONTROL = "private, max-age=21600, stale-while-revalidate=86400";

function parseAttributes(source = "") {
  const attributes = Object.create(null);
  const pattern = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  for (const match of String(source).matchAll(pattern)) {
    attributes[match[1].toLocaleLowerCase("en")] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function markupWithoutInactiveContent(html) {
  return String(html || "")
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, "");
}

function isDefaultPort(url) {
  return !url.port
    || (url.protocol === "http:" && url.port === "80")
    || (url.protocol === "https:" && url.port === "443");
}

function publicImageCandidateUrl(value, baseUrl) {
  const candidate = decodeHtmlEntities(String(value || "")).trim();
  if (!candidate || candidate.startsWith("#")) return "";
  try {
    const url = new URL(candidate, baseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !isDefaultPort(url)) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function iconSize(value) {
  let largest = 0;
  for (const match of String(value || "").matchAll(/\b(\d{1,4})x(\d{1,4})\b/giu)) {
    largest = Math.max(largest, Number(match[1]) * Number(match[2]));
  }
  return largest;
}

function firstDocumentBaseUrl(markup, pageUrl) {
  for (const match of markup.matchAll(/<base\b((?:"[^"]*"|'[^']*'|[^'">])*)>/giu)) {
    const resolved = publicImageCandidateUrl(parseAttributes(match[1]).href, pageUrl);
    if (resolved) return resolved;
  }
  return pageUrl;
}

/**
 * Finds fetchable logo candidates in document order, with high-resolution touch
 * icons first, regular favicons second, and Open Graph artwork as a fallback.
 */
export function courseLogoCandidatesFromHtml(html, pageUrl) {
  const markup = markupWithoutInactiveContent(html);
  const documentUrl = publicImageCandidateUrl(pageUrl, pageUrl);
  if (!documentUrl) return [];
  const baseUrl = firstDocumentBaseUrl(markup, documentUrl);
  const candidates = [];
  let order = 0;
  const openingTag = /<(link|meta)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/giu;

  for (const match of markup.matchAll(openingTag)) {
    const tag = match[1].toLocaleLowerCase("en");
    const attributes = parseAttributes(match[2]);
    if (tag === "link") {
      const rel = new Set(String(attributes.rel || "").toLocaleLowerCase("en").split(/\s+/u).filter(Boolean));
      const isTouchIcon = rel.has("apple-touch-icon") || rel.has("apple-touch-icon-precomposed");
      if (!isTouchIcon && !rel.has("icon")) continue;
      const url = publicImageCandidateUrl(attributes.href, baseUrl);
      if (!url) continue;
      candidates.push({
        url,
        priority: isTouchIcon ? 0 : 1,
        size: iconSize(attributes.sizes),
        order: order += 1,
      });
      continue;
    }

    const property = String(attributes.property || attributes.name || "").toLocaleLowerCase("en").trim();
    if (!["og:image", "og:image:url", "og:image:secure_url"].includes(property)) continue;
    const url = publicImageCandidateUrl(attributes.content, baseUrl);
    if (!url) continue;
    candidates.push({
      url,
      priority: property === "og:image:secure_url" ? 2 : 3,
      size: 0,
      order: order += 1,
    });
  }

  candidates.sort((left, right) => (
    left.priority - right.priority
    || right.size - left.size
    || left.order - right.order
  ));

  const unique = new Set();
  return candidates.flatMap(({ url }) => {
    if (unique.has(url)) return [];
    unique.add(url);
    return [url];
  });
}

function unavailableLogoError(message, cause) {
  return new MetadataFetchError(message, {
    status: 404,
    code: "course_logo_unavailable",
    cause,
  });
}

function validatedLogo(image) {
  if (!Buffer.isBuffer(image?.body) || !image.body.length || !COURSE_LOGO_MIME_TYPES.has(image.mimeType)) {
    throw new MetadataFetchError("Страница курса вернула неподдерживаемый логотип", {
      code: "course_logo_invalid",
    });
  }
  return { body: image.body, mimeType: image.mimeType };
}

export function createCourseLogoResolver({
  fetchHtml = fetchPublicHtml,
  fetchImage = fetchPublicImage,
  maxCandidates = DEFAULT_MAX_CANDIDATES,
} = {}) {
  const candidateLimit = Number.isSafeInteger(maxCandidates)
    ? Math.min(Math.max(maxCandidates, 1), 24)
    : DEFAULT_MAX_CANDIDATES;

  return async function resolveCourseLogo(resourceUrl) {
    const page = await fetchHtml(resourceUrl, { ...COURSE_PAGE_FETCH_OPTIONS });
    const candidates = courseLogoCandidatesFromHtml(page?.html, page?.url || resourceUrl).slice(0, candidateLimit);
    if (!candidates.length) {
      throw unavailableLogoError("На странице курса не найден логотип");
    }

    let lastError;
    for (const candidate of candidates) {
      try {
        return validatedLogo(await fetchImage(candidate, { ...COURSE_LOGO_FETCH_OPTIONS }));
      } catch (error) {
        if (!(error instanceof MetadataFetchError)) throw error;
        lastError = error;
      }
    }
    throw unavailableLogoError("Не удалось загрузить логотип со страницы курса", lastError);
  };
}

export const resolveCourseLogo = createCourseLogoResolver();

function courseLogoCacheKey(resourceUrl) {
  const value = String(resourceUrl || "").trim();
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return value;
  }
}

function logoWithEtag(logo) {
  const validated = validatedLogo(logo);
  return {
    ...validated,
    etag: `"${createHash("sha256").update(validated.body).digest("base64url").slice(0, 32)}"`,
  };
}

export function createCourseLogoLoader({
  resolver = resolveCourseLogo,
  ttlMs = 6 * 60 * 60 * 1_000,
  failureTtlMs = 60_000,
  maxEntries = 256,
  now = () => Date.now(),
} = {}) {
  const successes = new Map();
  const failures = new Map();
  const inFlight = new Map();
  const capacity = Number.isSafeInteger(maxEntries) ? Math.min(Math.max(maxEntries, 1), 2_048) : 256;
  const successLifetime = Math.max(1_000, Number(ttlMs) || 0);
  const failureLifetime = Math.max(1_000, Number(failureTtlMs) || 0);

  const remember = (cache, key, value, expiresAt) => {
    cache.delete(key);
    while (cache.size >= capacity) cache.delete(cache.keys().next().value);
    cache.set(key, { value, expiresAt });
  };

  const freshValue = (cache, key) => {
    const cached = cache.get(key);
    if (!cached) return undefined;
    if (cached.expiresAt <= now()) {
      cache.delete(key);
      return undefined;
    }
    cache.delete(key);
    cache.set(key, cached);
    return cached.value;
  };

  return async function loadCourseLogo(resourceUrl) {
    const key = courseLogoCacheKey(resourceUrl);
    const successful = freshValue(successes, key);
    if (successful) return successful;
    const failed = freshValue(failures, key);
    if (failed) throw failed;
    if (inFlight.has(key)) return inFlight.get(key);

    const request = Promise.resolve()
      .then(() => resolver(resourceUrl))
      .then((logo) => {
        const value = logoWithEtag(logo);
        failures.delete(key);
        remember(successes, key, value, now() + successLifetime);
        return value;
      })
      .catch((error) => {
        if (error instanceof MetadataFetchError) {
          remember(failures, key, error, now() + failureLifetime);
        }
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

export const loadCourseLogo = createCourseLogoLoader();

function requestEtagMatches(requestEtag, responseEtag) {
  const comparable = (value) => String(value || "").trim().replace(/^W\//u, "");
  return String(requestEtag || "").split(",").some((candidate) => (
    candidate.trim() === "*" || comparable(candidate) === comparable(responseEtag)
  ));
}

export function createCourseLogoHandler({ loader = loadCourseLogo } = {}) {
  return async function courseLogoHandler(req, res) {
    const resourceUrl = typeof req.query?.url === "string" ? req.query.url.trim() : "";
    if (!resourceUrl || resourceUrl.length > 2_000) {
      res.set("Cache-Control", "private, no-store");
      return res.status(400).json({
        error: "Передайте ссылку на страницу курса",
        code: "course_logo_url_required",
      });
    }

    let logo;
    try {
      logo = await loader(resourceUrl);
    } catch (error) {
      if (!(error instanceof MetadataFetchError)) throw error;
      const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599
        ? error.status
        : 422;
      res.set("Cache-Control", "private, no-store");
      return res.status(status).json({
        error: error.message || "Не удалось получить логотип курса",
        code: error.code || "course_logo_unavailable",
      });
    }

    res.set({
      "Cache-Control": COURSE_LOGO_CACHE_CONTROL,
      ETag: logo.etag,
      "X-Content-Type-Options": "nosniff",
    });
    const requestEtag = typeof req.get === "function" ? req.get("if-none-match") : "";
    if (requestEtagMatches(requestEtag, logo.etag)) return res.status(304).end();

    res.set("Content-Length", String(logo.body.length));
    return res.type(logo.mimeType).send(logo.body);
  };
}

export const courseLogoHandler = createCourseLogoHandler();
