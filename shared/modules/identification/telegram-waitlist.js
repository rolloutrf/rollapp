export const TELEGRAM_WAITLIST_ENABLED = true;

export function normalizeWaitlistTelegram(value) {
  if (typeof value !== "string" || value.length > 80) return null;
  const match = value.trim().match(/^(?:@|(?:https?:\/\/)?t\.me\/)?([a-z0-9_]{4,32})\/?$/i);
  return match ? match[1].toLowerCase() : null;
}
