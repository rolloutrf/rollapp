import { setTimeout as delay } from "node:timers/promises";
import { getYandexAuthConfig } from "./yandex-auth.js";
import { userCredentialsConfigured } from "./user-credentials.js";

const SCOPE = "cloud_api:disk.app_folder";
const DISK_API = "https://cloud-api.yandex.net/v1/disk";
export const NOTE_MAX_BYTES = 180_000;

export class DiskNotesError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export const reconnectError = () => new DiskNotesError(
  "DISK_RECONNECT", "Подключите Яндекс Диск снова, чтобы открыть и сохранить заметки.", 409,
);
export const diskUnavailable = () => new DiskNotesError(
  "DISK_UNAVAILABLE", "Яндекс Диск сейчас недоступен. Попробуйте ещё раз.", 503,
);
const diskFull = () => new DiskNotesError("DISK_FULL", "На Яндекс Диске закончилось место.", 507);
export const missingNotes = () => new DiskNotesError(
  "DISK_NOTES_MISSING", "Файл заметок не найден. Восстановите его на Яндекс Диске и попробуйте снова.", 409,
);

export function getYandexDiskConfig(env = process.env) {
  const config = getYandexAuthConfig({
    NODE_ENV: env.NODE_ENV,
    YANDEX_OAUTH_CLIENT_ID: env.YANDEX_DISK_OAUTH_CLIENT_ID,
    YANDEX_OAUTH_CLIENT_SECRET: env.YANDEX_DISK_OAUTH_CLIENT_SECRET,
    YANDEX_OAUTH_REDIRECT_URI: env.YANDEX_DISK_OAUTH_REDIRECT_URI,
  });
  const redirect = config.redirectUri ? new URL(config.redirectUri) : null;
  return {
    ...config,
    enabled: config.enabled && userCredentialsConfigured(env) &&
      config.clientId !== env.YANDEX_OAUTH_CLIENT_ID?.trim() &&
      redirect?.pathname === "/api/private-notes/connection/callback" && !redirect.search,
    scope: SCOPE,
    optionalScope: "",
    forceConfirm: true,
  };
}

async function boundedText(response, limit) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const parts = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw diskUnavailable();
      parts.push(value);
    }
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(parts));
  } catch {
    void reader.cancel().catch(() => {});
    throw diskUnavailable();
  } finally {
    reader.releaseLock();
  }
}

async function boundedJson(response) {
  try { return JSON.parse(await boundedText(response, 32_768)); }
  catch { throw diskUnavailable(); }
}

export function createYandexDiskClient(config, { fetchImpl = fetch } = {}) {
  // Bound the whole provider interaction, including response bodies and retries.
  const signal = AbortSignal.timeout(15_000);
  async function request(url, options) {
    try { return await fetchImpl(url, { ...options, signal, redirect: "error" }); }
    catch { throw diskUnavailable(); }
  }

  async function tokens(form, previousRefreshToken) {
    const response = await request(config.tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(form),
    });
    if (response.status >= 500 || response.status === 429) throw diskUnavailable();
    const data = await boundedJson(response);
    if (!response.ok) {
      if (["invalid_grant", "invalid_token"].includes(data.error)) throw reconnectError();
      throw diskUnavailable();
    }
    const refreshToken = data.refresh_token || previousRefreshToken;
    const isToken = (value) => typeof value === "string" && /^[\x21-\x7e]{1,8192}$/.test(value);
    if (!isToken(data.access_token) || !isToken(refreshToken)
      || !Number.isSafeInteger(data.expires_in) || data.expires_in <= 0) throw diskUnavailable();
    return { accessToken: data.access_token, refreshToken, expiresAt: Date.now() + data.expires_in * 1000 };
  }

  async function resource(token, path, { suffix = "", method = "GET", ...params } = {}) {
    const url = new URL(`${DISK_API}/resources${suffix}`);
    url.search = new URLSearchParams({ path, ...params });
    const response = await request(url, { method, headers: { Authorization: `OAuth ${token}` } });
    if (response.status === 401 || response.status === 403) throw reconnectError();
    if (response.status === 507) throw diskFull();
    return response;
  }

  async function transferLink(response, method) {
    const link = await boundedJson(response);
    let url;
    try { url = new URL(link.href); } catch { throw diskUnavailable(); }
    if (link.method !== method || link.templated !== false || url.protocol !== "https:" ||
      url.port || url.username || url.password ||
      !/^(?:[a-z0-9-]+\.)*disk\.yandex\.(?:net|ru)$/.test(url.hostname)) throw diskUnavailable();
    return url;
  }

  async function read(token, path) {
    const link = await resource(token, path, { suffix: "/download" });
    if (link.status === 404) throw missingNotes();
    if (!link.ok) throw diskUnavailable();
    const file = await request(await transferLink(link, "GET"), { method: "GET" });
    if (!file.ok) throw diskUnavailable();
    return boundedText(file, NOTE_MAX_BYTES);
  }

  return {
    exchange: (code, verifier) => tokens({ grant_type: "authorization_code", code, code_verifier: verifier }),
    refresh: (refreshToken) => tokens({ grant_type: "refresh_token", refresh_token: refreshToken }, refreshToken),
    async createFolder(token, path) {
      const response = await resource(token, path, { method: "PUT" });
      if (response.status !== 201) throw diskUnavailable();
    },
    async checkFolder(token, path) {
      const response = await resource(token, path, { fields: "type" });
      if (response.status === 404 || (response.ok && (await boundedJson(response)).type !== "dir")) {
        throw new DiskNotesError("DISK_WRONG_ACCOUNT",
          "Папка заметок не найдена. Выберите исходный аккаунт Яндекса или восстановите папку на Диске.", 409);
      }
      if (!response.ok) throw diskUnavailable();
    },
    read,
    async write(token, path, markdown) {
      const link = await resource(token, path, { suffix: "/upload", overwrite: "false" });
      if (!link.ok) throw diskUnavailable();
      const file = await request(await transferLink(link, "PUT"), {
        method: "PUT",
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
        body: Buffer.from(markdown),
      });
      if (file.status === 507) throw diskFull();
      if (![201, 202].includes(file.status)) throw diskUnavailable();
      // A 202 and some just-written resources are not readable immediately.
      // Publish the revision only when the bytes can be read back from Disk.
      for (const wait of [0, 200, 500, 1000]) {
        try {
          if (wait) await delay(wait, undefined, { signal });
          if (await read(token, path) !== markdown) throw diskUnavailable();
          return;
        } catch (error) {
          if (error.code !== "DISK_NOTES_MISSING") throw diskUnavailable();
        }
      }
      throw diskUnavailable();
    },
  };
}
