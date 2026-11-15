export function createRateLimit({
  windowMs,
  max,
  key: resolveKey,
  message = "Слишком много попыток. Попробуйте немного позже",
  code = "",
  now: readNow = Date.now,
}) {
  const clients = new Map();
  let lastSweep = readNow();

  return (req, res, next) => {
    const now = readNow();
    if (clients.size > 10_000) {
      clients.clear();
      lastSweep = now;
    } else if (now - lastSweep >= windowMs) {
      for (const [key, value] of clients) {
        if (value.resetAt <= now) clients.delete(key);
      }
      lastSweep = now;
    }

    const fallbackKey = req.ip || req.socket?.remoteAddress || "unknown";
    const key = String(resolveKey?.(req) || fallbackKey);
    const current = clients.get(key);
    if (!current || current.resetAt <= now) {
      clients.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(Math.max(0, max - current.count)));
    res.set("RateLimit-Reset", String(Math.ceil(current.resetAt / 1000)));
    if (current.count >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.set("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        error: message,
        ...(code ? { code } : {}),
        retryAfterSeconds,
      });
    }

    current.count += 1;
    next();
  };
}
