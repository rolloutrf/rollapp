import { setTimeout as wait } from "node:timers/promises";

const nextRequest = new Map();

// Share the anonymous TON Center budget between balance reads and payment
// verification. Bound queueing and honour the caller's deadline while waiting.
export async function tonFetch(url, options) {
  const host = new URL(url).host;
  const headers = new Headers(options?.headers);
  if (!headers.has("X-API-Key")) {
    const now = Date.now();
    const slot = Math.max(now, nextRequest.get(host) || 0);
    if (slot - now > 4_000) throw new Error("TON provider busy");
    nextRequest.set(host, slot + 1_100);
    if (slot > now) await wait(slot - now, undefined, { signal: options?.signal });
  }
  return fetch(url, options);
}
