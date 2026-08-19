function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

export function configuredTrustedOrigins(value = "") {
  return new Set(
    value
      .split(",")
      .map((origin) => normalizeOrigin(origin.trim()))
      .filter(Boolean),
  );
}

export function isTrustedRequestOrigin({ origin, requestOrigin, configuredOrigins }) {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;
  if (normalizedOrigin === normalizeOrigin(requestOrigin)) return true;
  return configuredOrigins.has(normalizedOrigin);
}
