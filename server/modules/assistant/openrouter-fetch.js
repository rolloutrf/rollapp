import { fetch as undiciFetch, ProxyAgent } from "undici";

let cachedProxyUrl;
let cachedProxyAgent;

function openRouterProxyAgent(proxyUrl) {
  if (cachedProxyAgent && cachedProxyUrl === proxyUrl) return cachedProxyAgent;
  let parsed;
  try { parsed = new URL(proxyUrl); }
  catch { throw new Error("OPENROUTER_PROXY_URL must be a valid HTTP proxy URL"); }
  if (parsed.protocol !== "http:" || !parsed.hostname || !parsed.port || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("OPENROUTER_PROXY_URL must be an HTTP proxy URL with a host and port");
  }
  const agent = new ProxyAgent(parsed.href);
  cachedProxyAgent?.close().catch(() => {});
  cachedProxyUrl = proxyUrl;
  cachedProxyAgent = agent;
  return agent;
}

export function openRouterFetch(url, options = {}) {
  const proxyUrl = process.env.OPENROUTER_PROXY_URL;
  if (!proxyUrl) return fetch(url, options);
  if (new URL(url).origin !== "https://openrouter.ai") {
    throw new Error("The OpenRouter proxy can only be used for openrouter.ai");
  }
  return undiciFetch(url, { ...options, dispatcher: openRouterProxyAgent(proxyUrl) });
}
