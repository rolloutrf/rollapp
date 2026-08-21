export function safeNextPath(value, fallback = "/app/wishes") {
  if (typeof value !== "string" || value.length > 2_000) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    return fallback;
  }
  try {
    const parsed = new URL(value, "https://rollapp.invalid");
    if (parsed.origin !== "https://rollapp.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function yandexAuthStartPath(nextPath, { link = false } = {}) {
  const params = new URLSearchParams();
  if (link) params.set("link", "1");
  params.set("next", safeNextPath(nextPath));
  return `/api/auth/yandex/start?${params.toString()}`;
}

const yandexAuthErrors = {
  YANDEX_CANCELLED: {
    title: "Вход через Яндекс отменён",
    description: "Можно попробовать ещё раз или выбрать другой способ входа.",
    variant: "default",
  },
  YANDEX_STATE_INVALID: {
    title: "Попытка входа устарела",
    description: "Начните вход через Яндекс ID ещё раз.",
    variant: "destructive",
  },
  YANDEX_LINK_REQUIRED: {
    title: "Такой аккаунт Rollapp уже существует",
    description: "Войдите по email или номеру телефона — после этого мы безопасно привяжем Yandex ID.",
    variant: "default",
    linkRequired: true,
  },
  YANDEX_LINK_LOGIN_REQUIRED: {
    title: "Сначала войдите в Rollapp",
    description: "После обычного входа снова подключите Yandex ID.",
    variant: "default",
  },
  YANDEX_IDENTITY_CONFLICT: {
    title: "Этот Yandex ID уже используется",
    description: "Он привязан к другому аккаунту Rollapp.",
    variant: "destructive",
  },
  YANDEX_EMAIL_REQUIRED: {
    title: "Яндекс не передал email",
    description: "Разрешите доступ к адресу электронной почты и повторите вход.",
    variant: "destructive",
  },
  YANDEX_AUTH_UNAVAILABLE: {
    title: "Вход через Яндекс пока недоступен",
    description: "Выберите другой способ входа или попробуйте позже.",
    variant: "destructive",
  },
  YANDEX_PROVIDER_ERROR: {
    title: "Яндекс не подтвердил вход",
    description: "Попробуйте ещё раз через несколько минут.",
    variant: "destructive",
  },
};

export function yandexAuthErrorDetails(code) {
  if (!code) return null;
  return yandexAuthErrors[code] || yandexAuthErrors.YANDEX_PROVIDER_ERROR;
}
