import { createRateLimit } from "./rate-limit.js";
import { TON_MAINNET, TON_TESTNET } from "../shared/ton.js";
import { tonFetch } from "./ton-network.js";

const ENDPOINTS = {
  [TON_MAINNET]: "https://toncenter.com/api/v2/getAddressBalance",
  [TON_TESTNET]: "https://testnet.toncenter.com/api/v2/getAddressBalance",
};

export class TonBalanceError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

export function createTonBalanceReader({ fetchImpl = tonFetch, env = process.env, now = Date.now, timeoutMs = 6_000 } = {}) {
  const cache = new Map();
  const pending = new Map();
  const nextRequest = new Map();
  return async (address, chain) => {
    if (typeof address !== "string" || !/^(0|-1):[0-9a-f]{64}$/i.test(address) || typeof chain !== "string" || !Object.hasOwn(ENDPOINTS, chain)) {
      throw new TonBalanceError("Некорректный адрес или сеть TON.", 400);
    }
    address = address.toLowerCase();
    const key = `${chain}:${address}`;
    const saved = cache.get(key);
    if (saved && now() - saved.time < 20_000) return saved.value;
    if (pending.has(key)) return pending.get(key);
    const apiKey = chain === TON_TESTNET ? env.TONCENTER_TESTNET_API_KEY : env.TONCENTER_API_KEY;
    // The public TON Center tier allows one request per second per network.
    if ((!apiKey && (nextRequest.get(chain) || 0) > now()) || pending.size >= 8) {
      throw new TonBalanceError("Проверка баланса занята. Повторите через несколько секунд.", 503);
    }
    nextRequest.set(chain, now() + 1_100);
    const request = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const url = new URL(ENDPOINTS[chain]);
        url.searchParams.set("address", address);
        const response = await fetchImpl(url, {
          signal: controller.signal, redirect: "error",
          headers: { Accept: "application/json", ...(apiKey ? { "X-API-Key": apiKey } : {}) },
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error("TON Center unavailable");
        }
        const body = await response.json();
        if (body.ok !== true || typeof body.result !== "string" || !/^\d{1,40}$/.test(body.result)) throw new Error("Invalid balance response");
        const time = now();
        const value = { address, chain, nanotons: BigInt(body.result).toString(), fetchedAt: new Date(time).toISOString() };
        cache.delete(key);
        cache.set(key, { time, value });
        if (cache.size > 256) cache.delete(cache.keys().next().value);
        return value;
      } catch {
        throw new TonBalanceError("Не удалось получить баланс из сети TON. Попробуйте позже.");
      } finally { clearTimeout(timer); }
    })();
    pending.set(key, request);
    try { return await request; }
    finally { pending.delete(key); }
  };
}

export function registerTonBalanceRoutes(app, { requireAuth, readBalance = createTonBalanceReader() }) {
  const limit = createRateLimit({ windowMs: 60_000, max: 20, key: (req) => req.user.id });
  app.get("/api/ton-connect/balance", requireAuth, limit, async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try { res.json(await readBalance(req.query.address, req.query.chain)); }
    catch (error) {
      if (!(error instanceof TonBalanceError)) return next(error);
      res.status(error.status).json({ error: error.message });
    }
  });
}
