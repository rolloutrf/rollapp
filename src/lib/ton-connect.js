export class TonConfigurationError extends Error {}

export async function loadTonConfig({ fetchImpl = fetch, signal = AbortSignal.timeout(8_000) } = {}) {
  let response;
  try {
    response = await fetchImpl("/api/ton-connect/config", { credentials: "include", signal });
  } catch {
    throw new TonConfigurationError("Не удалось проверить подключение TON. Сервер не отвечает — попробуйте снова.");
  }
  const config = await response.json().catch(() => null);
  if (!response.ok) throw new TonConfigurationError(config?.error || "Подключение TON временно недоступно. Попробуйте позже.");
  if (!config?.manifestUrl) throw new TonConfigurationError("Подключение TON пока не настроено.");
  return config;
}

export function createTonStorage(userId, storage) {
  if (!userId) throw new Error("Для подключения кошелька нужно войти в РОЛЛАПП.");
  const prefix = `rollapp:ton:${encodeURIComponent(userId)}:`;
  let pendingWrites = null;
  return {
    async getItem(key) { return storage.getItem(prefix + key); },
    async setItem(key, value) {
      const scopedKey = prefix + key;
      if (pendingWrites) {
        const original = pendingWrites.has(scopedKey) ? pendingWrites.get(scopedKey).original : storage.getItem(scopedKey);
        pendingWrites.set(scopedKey, { original, value });
      }
      storage.setItem(scopedKey, value);
    },
    async removeItem(key) { storage.removeItem(prefix + key); },
    beginConnection() { pendingWrites = new Map(); },
    commitConnection() { pendingWrites = null; },
    cancelConnection() {
      const writes = pendingWrites;
      pendingWrites = null;
      for (const [key, { original, value }] of writes || []) {
        // Preserve a session that another tab has subsequently changed.
        if (storage.getItem(key) !== value) continue;
        if (original === null) storage.removeItem(key);
        else storage.setItem(key, original);
      }
    },
  };
}

export function tonConnectionError(error) {
  if (error instanceof TonConfigurationError) return error.message;
  if (error?.name === "UserRejectsError") return "Подключение отклонено в кошельке. Можно попробовать снова.";
  if (/manifest/i.test(error?.name || "")) return "Кошелёк не смог загрузить данные РОЛЛАПП. Проверьте доступность публичного адреса приложения.";
  return "Не удалось подключить кошелёк. Проверьте интернет и попробуйте снова.";
}

export function walletConnectionSource(wallet) {
  if (wallet.injected || wallet.embedded) return { jsBridgeKey: wallet.jsBridgeKey };
  if (wallet.bridgeUrl && wallet.universalLink) return { bridgeUrl: wallet.bridgeUrl, universalLink: wallet.universalLink };
  throw new Error("У этого кошелька нет доступного способа подключения.");
}
