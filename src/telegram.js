const TELEGRAM_BACKGROUND = "#0a0a0a";

export function initializeTelegramWebApp() {
  if (typeof window === "undefined") return { webApp: null, initData: "" };
  const webApp = window.Telegram?.WebApp || null;
  const initData = typeof webApp?.initData === "string" ? webApp.initData : "";
  if (!webApp || !initData) return { webApp, initData: "" };

  try { webApp.ready(); } catch { /* Older clients may expose a partial API. */ }
  try { webApp.expand(); } catch { /* Expansion is an enhancement, not an auth requirement. */ }
  try { webApp.setHeaderColor(TELEGRAM_BACKGROUND); } catch { /* Unsupported before Bot API 6.1. */ }
  try { webApp.setBackgroundColor(TELEGRAM_BACKGROUND); } catch { /* Unsupported before Bot API 6.1. */ }
  try { webApp.setBottomBarColor?.(TELEGRAM_BACKGROUND); } catch { /* Unsupported in older clients. */ }

  document.documentElement.classList.add("telegram-mini-app");
  return { webApp, initData };
}
