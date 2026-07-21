import http from "node:http";
import https from "node:https";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

const DEFAULT_TIMEOUT_MS = 7_000;
const DEFAULT_MAX_BYTES = 400_000;
const DEFAULT_MAX_REDIRECTS = 3;

export class MetadataFetchError extends Error {
  constructor(message, { status = 422, code = "metadata_fetch_failed", cause } = {}) {
    super(message, { cause });
    this.name = "MetadataFetchError";
    this.status = status;
    this.code = code;
  }
}

function parseIpv4(address) {
  if (isIP(address) !== 4) return null;
  return address.split(".").map(Number);
}

function parseIpv6(address) {
  const normalized = address.toLowerCase().split("%")[0];
  if (isIP(normalized) !== 6) return null;

  const halves = normalized.split("::");
  if (halves.length > 2) return null;

  const expandHalf = (half) => {
    if (!half) return [];
    const groups = half.split(":");
    const expanded = [];
    for (const group of groups) {
      if (group.includes(".")) {
        const ipv4 = parseIpv4(group);
        if (!ipv4) return null;
        expanded.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
      } else {
        expanded.push(Number.parseInt(group, 16));
      }
    }
    return expanded;
  };

  const left = expandHalf(halves[0]);
  const right = expandHalf(halves[1] || "");
  if (!left || !right) return null;
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  return [...left, ...Array(missing).fill(0), ...right];
}

/**
 * Returns true only for addresses that are safe to contact as a public web
 * resource. Keeping this as an allow-list also rejects loopback, link-local,
 * multicast, carrier-grade NAT, documentation, and other special ranges.
 */
export function isPublicIpAddress(address) {
  const ipv4 = parseIpv4(address);
  if (ipv4) {
    const [a, b, c] = ipv4;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 192 && b === 0 && c === 2) return false;
    if (a === 192 && b === 88 && c === 99) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    if (a >= 224) return false;
    return true;
  }

  const ipv6 = parseIpv6(address);
  if (!ipv6) return false;

  // IPv4-mapped IPv6 addresses inherit the IPv4 classification.
  const isMappedIpv4 = ipv6.slice(0, 5).every((group) => group === 0) && ipv6[5] === 0xffff;
  if (isMappedIpv4) {
    const mapped = [ipv6[6] >> 8, ipv6[6] & 0xff, ipv6[7] >> 8, ipv6[7] & 0xff].join(".");
    return isPublicIpAddress(mapped);
  }

  // Public global-unicast IPv6 space is 2000::/3. Exclude the documentation
  // prefix as well so it fails immediately instead of consuming the timeout.
  const isGlobalUnicast = (ipv6[0] & 0xe000) === 0x2000;
  const isDocumentation = ipv6[0] === 0x2001 && ipv6[1] === 0x0db8;
  return isGlobalUnicast && !isDocumentation;
}

function normalizedHostname(url) {
  return url.hostname.replace(/^\[|\]$/g, "");
}

export function parsePublicHttpUrl(input) {
  let url;
  try {
    url = input instanceof URL ? new URL(input.href) : new URL(input);
  } catch (error) {
    throw new MetadataFetchError("Нужна корректная ссылка", {
      status: 400,
      code: "invalid_url",
      cause: error,
    });
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new MetadataFetchError("Поддерживаются только http и https ссылки", {
      status: 400,
      code: "unsupported_protocol",
    });
  }
  if (url.username || url.password) {
    throw new MetadataFetchError("Ссылки с логином и паролем не поддерживаются", {
      status: 400,
      code: "url_credentials",
    });
  }
  if (url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))) {
    throw new MetadataFetchError("Ссылки на нестандартные порты не поддерживаются", {
      status: 400,
      code: "unsupported_port",
    });
  }
  return url;
}

export async function resolvePublicHost(url, lookup = dnsLookup) {
  const hostname = normalizedHostname(url);
  let addresses;
  try {
    const family = isIP(hostname);
    addresses = family
      ? [{ address: hostname, family }]
      : await lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    throw new MetadataFetchError("Не удалось найти сайт по этой ссылке", {
      code: "dns_failed",
      cause: error,
    });
  }

  if (!addresses.length) {
    throw new MetadataFetchError("Не удалось найти сайт по этой ссылке", { code: "dns_empty" });
  }
  if (addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new MetadataFetchError("Локальные и служебные адреса не поддерживаются", {
      status: 400,
      code: "unsafe_address",
    });
  }
  return addresses;
}

function createPinnedLookup(addresses) {
  return (_hostname, options, callback) => {
    const settings = typeof options === "number" ? { family: options } : (options || {});
    const candidates = settings.family
      ? addresses.filter(({ family }) => family === settings.family)
      : addresses;
    if (!candidates.length) {
      const error = new Error("No validated address for the requested family");
      error.code = "ENOTFOUND";
      callback(error);
      return;
    }
    if (settings.all) {
      callback(null, candidates.map(({ address, family }) => ({ address, family })));
      return;
    }
    callback(null, candidates[0].address, candidates[0].family);
  };
}

function requestOnce(url, { addresses, signal, maxBytes }) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    let settled = false;

    const finishWithError = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const request = client.request(url, {
      method: "GET",
      signal,
      lookup: createPinnedLookup(addresses),
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "Accept-Encoding": "identity",
        "Accept-Language": "ru,en;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; RollappMetadata/1.0; +https://github.com/rolloutrf/rollapp)",
      },
    }, (response) => {
      const statusCode = response.statusCode || 0;
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
        response.resume();
        settled = true;
        resolve({ statusCode, headers: response.headers, body: Buffer.alloc(0) });
        return;
      }

      const chunks = [];
      let received = 0;
      response.on("data", (chunk) => {
        const remaining = maxBytes - received;
        if (chunk.length > remaining) {
          if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
          received = maxBytes;
          settled = true;
          response.destroy();
          resolve({ statusCode, headers: response.headers, body: Buffer.concat(chunks), truncated: true });
          return;
        }
        received += chunk.length;
        chunks.push(chunk);
      });
      response.on("end", () => {
        if (settled) return;
        settled = true;
        resolve({ statusCode, headers: response.headers, body: Buffer.concat(chunks), truncated: false });
      });
      response.on("error", finishWithError);
    });

    request.on("error", finishWithError);
    request.end();
  });
}

function waitWithSignal(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function asRequestError(error, signal) {
  if (error instanceof MetadataFetchError) return error;
  if (signal.aborted || error?.name === "AbortError" || error?.name === "TimeoutError") {
    return new MetadataFetchError("Магазин не ответил вовремя", {
      status: 504,
      code: "request_timeout",
      cause: error,
    });
  }
  return new MetadataFetchError("Не удалось загрузить страницу товара", {
    code: "request_failed",
    cause: error,
  });
}

function decodeHtmlBody(body, contentType) {
  const headerCharset = contentType.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1];
  const head = body.subarray(0, 8_192).toString("latin1");
  const documentCharset = head.match(/<meta\b[^>]*charset\s*=\s*["']?([^\s"'/>;]+)/i)?.[1]
    || head.match(/<meta\b[^>]*content\s*=\s*["'][^"']*charset\s*=\s*([^\s"';]+)/i)?.[1];
  const charset = headerCharset || documentCharset || "utf-8";
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return body.toString("utf8");
  }
}

export async function fetchPublicHtml(input, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  maxRedirects = DEFAULT_MAX_REDIRECTS,
  lookup = dnsLookup,
  request = requestOnce,
} = {}) {
  let url = parsePublicHttpUrl(input);
  const timeoutSignal = AbortSignal.timeout(timeoutMs);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    let addresses;
    let response;
    try {
      addresses = await waitWithSignal(resolvePublicHost(url, lookup), timeoutSignal);
      response = await waitWithSignal(
        request(url, { addresses, signal: timeoutSignal, maxBytes }),
        timeoutSignal,
      );
    } catch (error) {
      throw asRequestError(error, timeoutSignal);
    }

    const location = response.headers.location;
    if ([301, 302, 303, 307, 308].includes(response.statusCode) && location) {
      if (redirectCount === maxRedirects) {
        throw new MetadataFetchError("Слишком много перенаправлений", {
          code: "too_many_redirects",
        });
      }
      try {
        url = parsePublicHttpUrl(new URL(location, url));
      } catch (error) {
        if (error instanceof MetadataFetchError) throw error;
        throw new MetadataFetchError("Магазин вернул некорректное перенаправление", {
          code: "invalid_redirect",
          cause: error,
        });
      }
      continue;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new MetadataFetchError("Магазин не отдал данные, заполните карточку вручную", {
        code: "upstream_status",
      });
    }

    const contentType = String(response.headers["content-type"] || "").toLowerCase();
    const looksLikeHtml = /^\s*(?:<!doctype\s+html|<html|<head|<meta|<script)/i.test(response.body.subarray(0, 4_096).toString("latin1"));
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml") && !(contentType === "" && looksLikeHtml)) {
      throw new MetadataFetchError("По ссылке нет страницы товара", {
        code: "not_html",
      });
    }

    return { html: decodeHtmlBody(response.body, contentType), url, truncated: Boolean(response.truncated) };
  }

  throw new MetadataFetchError("Слишком много перенаправлений", { code: "too_many_redirects" });
}
