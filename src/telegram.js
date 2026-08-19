const TELEGRAM_BACKGROUND = "#0a0a0a";
const TELEGRAM_SDK_URL = "https://telegram.org/js/telegram-web-app.js";

export function shouldLoadTelegramWebAppSdk(pathname) {
  return !/^\/reset-password\/?$/.test(String(pathname || ""));
}

export async function loadTelegramWebAppSdk({ documentRef = document, windowRef = window } = {}) {
  if (windowRef.Telegram?.WebApp || !shouldLoadTelegramWebAppSdk(windowRef.location?.pathname)) return;
  await new Promise((resolve) => {
    const script = documentRef.createElement("script");
    script.src = TELEGRAM_SDK_URL;
    script.async = true;
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", resolve, { once: true });
    documentRef.head.appendChild(script);
  });
}

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
