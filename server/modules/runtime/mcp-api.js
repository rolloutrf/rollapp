import { homedir } from "node:os";
import path from "node:path";

const productionOrigin = "https://xn--80avakiab.xn--p1ai";
const loopbackHosts = new Set(["127.0.0.1", "[::1]"]);
export const sessionTokenPattern = /^[A-Za-z0-9_-]{43}$/;
export const mcpTokenPattern = /^rwmcp_(read|write)_[A-Za-z0-9_-]{43}$/;
export const mcpHopHeader = "X-Rollapp-Mcp-Hop";

export function mcpConfig(env = process.env) {
  const url = new URL(env.ROLLAPP_MCP_URL || productionOrigin);
  const secure = url.protocol === "https:" || (url.protocol === "http:" && loopbackHosts.has(url.hostname));
  if (!secure || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("ROLLAPP_MCP_URL должен содержать только HTTPS origin Rollapp или loopback HTTP.");
  }
  const sessionPath = env.ROLLAPP_MCP_SESSION_FILE || path.join(homedir(), ".config", "rollapp", "mcp-session.json");
  if (!path.isAbsolute(sessionPath)) throw new Error("ROLLAPP_MCP_SESSION_FILE должен быть абсолютным путём.");
  return { origin: url.origin, sessionPath };
}

export class RollappApiError extends Error {}

export function createRollappApi(origin, { session, bearer, hop } = {}) {
  async function request(endpoint, { method = "GET", query, body, signal, authenticated = true } = {}) {
    if (authenticated && !session && !bearer) throw new RollappApiError("Войдите через npm run mcp:auth -- login и перезапустите MCP.");

    const url = new URL(endpoint, origin);
    if (url.origin !== origin || !url.pathname.startsWith("/api/")) throw new Error("Invalid Rollapp API endpoint");
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }

    const headers = { Accept: "application/json" };
    if (authenticated && session) headers.Cookie = `rw_session=${session}`;
    if (authenticated && bearer) headers.Authorization = `Bearer ${bearer}`;
    if (authenticated && hop) headers[mcpHopHeader] = hop;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const timeout = AbortSignal.timeout(15_000);
    let response;
    try {
      response = await fetch(url, {
        method, headers, body: JSON.stringify(body), redirect: "manual",
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch {
      const message = timeout.aborted ? "Rollapp не ответил вовремя." : "Не удалось подключиться к API Rollapp.";
      throw new RollappApiError(message);
    }

    if (response.status === 401) {
      await response.body?.cancel();
      const message = bearer ? "Токен MCP истёк или отозван." : authenticated
        ? "Сессия Rollapp истекла. Выполните mcp:auth -- logout, войдите снова и перезапустите MCP."
        : "Неверные email или пароль Rollapp.";
      throw new RollappApiError(message);
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new RollappApiError("API Rollapp перенаправил запрос. Проверьте канонический адрес сервиса.");
    }
    if (response.status >= 500 || !response.headers.get("content-type")?.includes("application/json")) {
      await response.body?.cancel();
      throw new RollappApiError(`API Rollapp вернул ошибку HTTP ${response.status}.`);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new RollappApiError("Не удалось прочитать ответ API Rollapp.");
    }
    if (!response.ok) {
      const detail = typeof data?.error === "string" ? ` ${data.error.slice(0, 300)}` : "";
      throw new RollappApiError(`API Rollapp отклонил запрос (HTTP ${response.status}).${detail}`);
    }
    return { data, headers: response.headers };
  }

  return {
    async call(endpoint, options) {
      return (await request(endpoint, options)).data;
    },
    async login(email, password) {
      const { data, headers } = await request("/api/auth/login", {
        method: "POST", body: { email, password }, authenticated: false,
      });
      const cookie = headers.getSetCookie().find((value) => value.startsWith("rw_session="));
      const session = cookie?.split(";", 1)[0].slice("rw_session=".length);
      if (!sessionTokenPattern.test(session ?? "")) throw new RollappApiError("Rollapp не выдал сессию.");
      return { token: session, username: data.user.username };
    },
  };
}
