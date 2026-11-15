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

export function yandexAuthStartPath(nextPath, { link = false, invite = "", addAccount = false } = {}) {
  const params = new URLSearchParams();
  if (link) params.set("link", "1");
  else if (addAccount) params.set("add_account", "1");
  if (invite) params.set("invite", invite);
  params.set("next", safeNextPath(nextPath));
  return `/api/auth/yandex/start?${params.toString()}`;
}

const yandexAuthErrors = {
  INVITE_REQUIRED: {
    title: "Регистрация по приглашению",
    description: "Попросите ссылку у человека, у которого уже есть аккаунт Rollapp.",
    variant: "default",
  },
  INVITE_INVALID: {
    title: "Приглашение недействительно",
    description: "Попросите отправителя создать новую ссылку.",
    variant: "destructive",
  },
  YANDEX_CANCELLED: {
    title: "Вход через Яндекс отменён",
    description: "Попробуйте войти с Яндекс ID ещё раз.",
    variant: "default",
  },
  YANDEX_STATE_INVALID: {
    title: "Попытка входа устарела",
    description: "Начните вход через Яндекс ID ещё раз.",
    variant: "destructive",
  },
  YANDEX_LINK_REQUIRED: {
    title: "Такой аккаунт Rollapp уже существует",
    description: "Откройте настройки профиля в браузере, где вы уже вошли в этот аккаунт Rollapp, и подключите Яндекс ID.",
    variant: "default",
    linkRequired: true,
  },
  YANDEX_INVITE_REQUIRED: {
    title: "Для нового аккаунта нужно приглашение",
    description: "Откройте действительную ссылку из письма и используйте в Yandex ID тот же email.",
    variant: "default",
  },
  YANDEX_LIMIT_REACHED: {
    title: "Все места заняты",
    description: "Лимит Rollapp — 30 000 аккаунтов.",
    variant: "default",
  },
  YANDEX_LINK_LOGIN_REQUIRED: {
    title: "Сначала войдите в Rollapp",
    description: "Откройте настройки профиля в активной сессии Rollapp и повторите действие.",
    variant: "default",
  },
  YANDEX_IDENTITY_CONFLICT: {
    title: "Этот Yandex ID уже используется",
    description: "Он привязан к другому аккаунту Rollapp.",
    variant: "destructive",
  },
  YANDEX_ADD_SESSION_CHANGED: {
    title: "Активный аккаунт изменился",
    description: "Откройте профиль и начните добавление аккаунта ещё раз.",
    variant: "destructive",
  },
  YANDEX_ADD_ACCOUNT_NOT_FOUND: {
    title: "Аккаунт Rollapp не найден",
    description: "Выберите Яндекс ID, который уже подключён к другому аккаунту Rollapp.",
    variant: "destructive",
  },
  YANDEX_ADD_USE_CREDENTIALS: {
    title: "Этот Яндекс ID ещё не подключён",
    description: "Выберите Яндекс ID, уже подключённый к нужному аккаунту Rollapp.",
    variant: "default",
  },
  YANDEX_EMAIL_REQUIRED: {
    title: "Яндекс не передал email",
    description: "Разрешите доступ к адресу электронной почты и повторите вход.",
    variant: "destructive",
  },
  YANDEX_AUTH_UNAVAILABLE: {
    title: "Вход через Яндекс пока недоступен",
    description: "Попробуйте войти позже.",
    variant: "destructive",
  },
  YANDEX_PROVIDER_ERROR: {
    title: "Яндекс не подтвердил вход",
    description: "Попробуйте ещё раз через несколько минут.",
    variant: "destructive",
  },
};

export function yandexAuthErrorDetails(code, { legacySignInEnabled = false } = {}) {
  if (!code) return null;
  const details = Object.hasOwn(yandexAuthErrors, code) ? yandexAuthErrors[code] : yandexAuthErrors.YANDEX_PROVIDER_ERROR;
  if (legacySignInEnabled && code === "YANDEX_LINK_REQUIRED") {
    return { ...details, description: "Войдите по email или номеру телефона, чтобы подключить Яндекс ID." };
  }
  if (legacySignInEnabled && code === "YANDEX_ADD_USE_CREDENTIALS") {
    return { ...details, description: "Войдите в нужный аккаунт по email или номеру телефона." };
  }
  return details;
}
