// Keep this allowlist in sync with public/tonconnect-wallets.json.
export const TON_CONNECT_BRIDGE_ORIGINS = [
  "https://bridge.tonapi.io",
  "https://tonconnectbridge.mytonwallet.org",
  "https://walletbot.me",
];

export function tonConnectConfig(env = process.env) {
  const candidates = env.TON_CONNECT_PUBLIC_URL
    ? [env.TON_CONNECT_PUBLIC_URL]
    : [env.PUBLIC_APP_URL, env.TELEGRAM_WEB_APP_URL, ...String(env.APP_ORIGIN || "").split(",")];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (url.protocol !== "https:" || url.username || url.password
        || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) continue;
      return {
        manifestUrl: `${url.origin}/tonconnect-manifest.json`,
        manifest: { url: url.origin, name: "РОЛЛАПП", iconUrl: `${url.origin}/favicon.png` },
      };
    } catch { /* Try the next explicitly configured public origin. */ }
  }
  return null;
}

export function createTonReadinessCheck({ fetchImpl = fetch, timeoutMs = 6_000, now = Date.now } = {}) {
  let cached;
  let inFlight;
  return async (config) => {
    if (cached?.url === config.manifestUrl && cached.expires > now()) return cached.result;
    if (inFlight?.url === config.manifestUrl) return inFlight.promise;
    const promise = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(config.manifestUrl, {
          signal: controller.signal, redirect: "error",
          headers: { Accept: "application/json", Origin: "https://app.tonkeeper.com" },
        });
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")
          || response.headers.get("access-control-allow-origin") !== "*") {
          await response.body?.cancel();
          return { code: "TON_MANIFEST_NOT_READY", error: "Подключение TON ещё не готово: данные приложения недоступны для кошелька. Попробуйте позже." };
        }
        const manifest = await response.json();
        if (manifest.url !== config.manifest.url || manifest.iconUrl !== config.manifest.iconUrl || !manifest.name) {
          return { code: "TON_MANIFEST_NOT_READY", error: "Подключение TON ещё не готово: данные приложения недоступны для кошелька. Попробуйте позже." };
        }
        const icon = await fetchImpl(config.manifest.iconUrl, { signal: controller.signal, redirect: "error" });
        const validIcon = icon.ok && /^image\/(png|x-icon|vnd\.microsoft\.icon)(;|$)/i.test(icon.headers.get("content-type") || "");
        await icon.body?.cancel();
        if (!validIcon) return { code: "TON_MANIFEST_NOT_READY", error: "Подключение TON ещё не готово: иконка приложения недоступна для кошелька. Попробуйте позже." };
        return null;
      } catch {
        return { code: "TON_PUBLIC_UNAVAILABLE", error: "Подключение TON временно недоступно: публичный адрес РОЛЛАПП не отвечает. Попробуйте позже." };
      } finally { clearTimeout(timeout); }
    })();
    inFlight = { url: config.manifestUrl, promise };
    try {
      const result = await promise;
      cached = { url: config.manifestUrl, result, expires: now() + (result ? 5_000 : 30_000) };
      return result;
    } finally { if (inFlight?.promise === promise) inFlight = null; }
  };
}

export function registerTonConnectRoutes(app, { env = process.env, checkReadiness = createTonReadinessCheck() } = {}) {
  app.get("/api/ton-connect/config", async (_req, res) => {
    const config = tonConnectConfig(env);
    res.set("Cache-Control", "no-store");
    if (!config) return res.status(503).json({ error: "Подключение TON пока не настроено: нужен публичный HTTPS-адрес РОЛЛАПП." });
    const unavailable = await checkReadiness(config);
    if (unavailable) return res.status(503).json(unavailable);
    res.json({ manifestUrl: config.manifestUrl });
  });
  app.get("/tonconnect-manifest.json", (_req, res) => {
    res.set({ "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" });
    const config = tonConnectConfig(env);
    if (!config) return res.status(503).json({ error: "TON Connect public URL is not configured" });
    res.json(config.manifest);
  });
}
