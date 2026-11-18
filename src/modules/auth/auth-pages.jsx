import { internalPageUrl, localizedPageUrl } from "../../../shared/modules/shell/page-urls.js";
import { Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import { TELEGRAM_WAITLIST_ENABLED, normalizeWaitlistTelegram } from "../../../shared/modules/identification/telegram-waitlist.js";
import { initializeTelegramWebApp } from "../identification/telegram.js";
import { APP_HOME } from "../shell/home-path.jsx";
import { useSession } from "./session.jsx";
import { LoadingScreen } from "../shell/page-feedback.jsx";
import { LogoMark } from "../shell/brand.jsx";
import { useId, useState, useLayoutEffect, useRef, useEffect } from "react";
import { CheckCircle2, LoaderCircle, Mail, Phone, Send } from "lucide-react";
import { api } from "../runtime/api.js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button as ShadcnButton, buttonVariants } from "@/components/ui/button";
import { Field, FieldError, FieldLabel, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PageActionButton } from "@/components/page-action-button";
import { safeNextPath, yandexAuthErrorDetails, yandexAuthStartPath } from "./auth.js";
import { RegistrationAccountFields } from "@/modules/auth/registration-account-fields.jsx";
import { useToast } from "../shell/toast.jsx";
import { usePhoneOtp, PhoneOtpFields } from "../identification/phone-otp.jsx";

const readPasswordResetToken = () => {
  if (typeof window === "undefined") return "";
  const fragment = internalPageUrl(`/reset-password${window.location.hash}`).slice("/reset-password#".length);
  return (new URLSearchParams(fragment).get("token") || "").trim();
};

function YandexIdButton({ href, disabled, label = "Войти с Яндекс ID" }) {
  const Component = href ? "a" : "button";
  const action = href ? { href } : { type: "submit", disabled };
  return (
    <Component className="yandex-id-button" {...action}>
      <svg className="yandex-id-button__mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="12" fill="#fc3f1d" />
        <path fill="#fff" d="M15.24 16.2h-1.68V8.04h-1.2c-1.637 0-2.52.818-2.52 2.045 0 1.39.597 2.047 1.843 2.87l1.017.676-2.903 4.57H7.92l2.676-3.913C9.08 13.18 8.16 12.11 8.16 10.016c0-2.24 1.554-3.696 4.306-3.696h2.774v9.88Z" />
      </svg>
      <span>{label}</span>
    </Component>
  );
}

export function RootRoute() {
  const { user, loading } = useSession();
  if (loading) return <LoadingScreen />;
  const telegramLaunch = initializeTelegramWebApp();
  if (telegramLaunch.initData) return <Navigate to={`/login?next=${encodeURIComponent(APP_HOME)}`} replace />;
  if (user || !TELEGRAM_WAITLIST_ENABLED) return <Navigate to={user ? APP_HOME : "/login"} replace />;
  return <TelegramWaitlistPage />;
}

function AuthRecoveryForm({ eyebrow, title, description, brand = false, busy = false, onSubmit, noValidate = false, children }) {
  return (
    <div className="auth-page rollapp-body">
      <div className="auth-panel">
        <form className="auth-form" aria-busy={busy || undefined} noValidate={noValidate} onSubmit={onSubmit}>
          {brand && <span className="logo self-start" role="img" aria-label="Rollapp"><LogoMark /></span>}
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {children}
        </form>
      </div>
    </div>
  );
}

function TelegramWaitlistPage() {
  const inputId = useId();
  const [telegram, setTelegram] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (loading || submitted) return;
    const username = normalizeWaitlistTelegram(telegram);
    if (!username) {
      setError("Введите @username или ссылку t.me/username.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await api.post("/waitlist", { telegram: username });
      if (result.ok !== true) throw new Error("Не удалось сохранить заявку. Попробуйте ещё раз.");
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthRecoveryForm
      brand
      eyebrow="Ранний доступ"
      title="Список ожидания"
      description={submitted ? "Сообщим в Telegram, когда сможем пригласить вас в Rollapp." : "Оставьте свой Telegram, чтобы получить приглашение в Rollapp."}
      busy={loading}
      onSubmit={submit}
    >
      {submitted ? (
        <Alert className="rounded-2xl border-primary/20 bg-primary/5 p-4" role="status">
          <CheckCircle2 className="text-primary" aria-hidden="true" />
          <AlertDescription>Вы в списке ожидания.</AlertDescription>
        </Alert>
      ) : (
        <>
          <Field>
            <FieldLabel htmlFor={inputId}>Ваш Telegram</FieldLabel>
            <Input
              id={inputId}
              required
              maxLength={80}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="@username"
              value={telegram}
              disabled={loading}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${inputId}-error` : undefined}
              onChange={(event) => { setTelegram(event.target.value); setError(""); }}
            />
            {error && <FieldError id={`${inputId}-error`} role="alert">{error}</FieldError>}
          </Field>
          <ShadcnButton type="submit" className="auth-submit rounded-full" disabled={loading}>
            {loading && <Spinner data-icon="inline-start" />}
            Записаться в список
          </ShadcnButton>
        </>
      )}
      <p className="auth-switch">Уже есть аккаунт? <Link to="/login">Войти</Link></p>
    </AuthRecoveryForm>
  );
}

function ForgotPasswordPage() {
  const fieldId = useId();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/password-reset/request", { email });
      setEmail("");
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError.message || "Не удалось отправить ссылку. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthRecoveryForm
      eyebrow="Восстановление"
      title="Восстановить пароль"
      description="Введите email, который использовали при регистрации."
      busy={loading}
      onSubmit={submit}
    >
      {submitted
        ? <Alert className="rounded-2xl border-primary/20 bg-primary/5 p-4" role="status">
          <CheckCircle2 className="text-primary" aria-hidden="true" />
          <AlertDescription>Если аккаунт с таким email существует, мы отправили ссылку для восстановления. Проверьте почту и папку «Спам».</AlertDescription>
        </Alert>
        : <>
          {error && <Alert variant="destructive" className="rounded-2xl p-4"><AlertDescription>{error}</AlertDescription></Alert>}
          <Field>
            <FieldLabel htmlFor={`${fieldId}-email`}>Email</FieldLabel>
            <Input
              id={`${fieldId}-email`}
              required
              type="email"
              maxLength={160}
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => { setEmail(event.target.value); if (error) setError(""); }}
            />
          </Field>
          <ShadcnButton type="submit" className="auth-submit" disabled={loading} aria-busy={loading || undefined}>
            {loading && <Spinner data-icon="inline-start" />}
            Отправить ссылку
          </ShadcnButton>
        </>}
      <p className="auth-switch"><Link to="/login">Вернуться ко входу</Link></p>
    </AuthRecoveryForm>
  );
}

function ResetPasswordPage() {
  const { setSession } = useSession();
  const fieldId = useId();
  const passwordRef = useRef(null);
  const confirmationRef = useRef(null);
  const [token, setToken] = useState(readPasswordResetToken);
  const [form, setForm] = useState({ password: "", confirmation: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useLayoutEffect(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => current[field] ? { ...current, [field]: "" } : current);
    if (formError) setFormError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (loading) return;
    const nextErrors = {};
    if (form.password.length < 8) nextErrors.password = "Пароль должен содержать минимум 8 символов.";
    else if (form.password.length > 128) nextErrors.password = "Пароль должен содержать не больше 128 символов.";
    if (!form.confirmation) nextErrors.confirmation = "Повторите новый пароль.";
    else if (form.confirmation !== form.password) nextErrors.confirmation = "Пароли не совпадают.";
    setErrors(nextErrors);
    setFormError("");
    if (Object.keys(nextErrors).length) {
      window.requestAnimationFrame(() => (nextErrors.password ? passwordRef : confirmationRef).current?.focus());
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/password-reset/confirm", { token, password: form.password });
      setSession({ user: null, loading: false, error: null });
      setForm({ password: "", confirmation: "" });
      setToken("");
      setSuccess(true);
    } catch (error) {
      setFormError(error.message || "Не удалось изменить пароль. Запросите новую ссылку и попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthRecoveryForm eyebrow="Готово" title="Пароль изменён" description="Теперь можно войти с новым паролем.">
        <Alert className="rounded-2xl border-primary/20 bg-primary/5 p-4" role="status">
          <CheckCircle2 className="text-primary" aria-hidden="true" />
          <AlertDescription>Новый пароль сохранён. Все прежние сеансы завершены.</AlertDescription>
        </Alert>
        <Link className={buttonVariants({ className: "auth-submit" })} to="/login">Перейти ко входу</Link>
      </AuthRecoveryForm>
    );
  }

  if (!token) {
    return (
      <AuthRecoveryForm eyebrow="Восстановление" title="Ссылка недействительна" description="Срок действия ссылки мог закончиться или она уже была использована.">
        <Alert variant="destructive" className="rounded-2xl p-4">
          <AlertDescription>Запросите новую ссылку для восстановления пароля.</AlertDescription>
        </Alert>
        <Link className={buttonVariants({ className: "auth-submit" })} to="/forgot-password">Запросить новую ссылку</Link>
        <p className="auth-switch"><Link to="/login">Вернуться ко входу</Link></p>
      </AuthRecoveryForm>
    );
  }

  return (
    <AuthRecoveryForm
      eyebrow="Новый пароль"
      title="Придумайте новый пароль"
      description="Используйте не меньше 8 символов."
      busy={loading}
      noValidate
      onSubmit={submit}
    >
      {formError && <Alert variant="destructive" className="rounded-2xl p-4"><AlertDescription>{formError}</AlertDescription></Alert>}
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor={`${fieldId}-password`}>Новый пароль</FieldLabel>
          <Input
            ref={passwordRef}
            id={`${fieldId}-password`}
            required
            minLength={8}
            maxLength={128}
            type="password"
            autoComplete="new-password"
            placeholder="Минимум 8 символов"
            value={form.password}
            aria-invalid={Boolean(errors.password) || undefined}
            aria-describedby={errors.password ? `${fieldId}-password-error` : undefined}
            onChange={(event) => updateField("password", event.target.value)}
          />
          {errors.password && <FieldError id={`${fieldId}-password-error`}>{errors.password}</FieldError>}
        </Field>
        <Field data-invalid={Boolean(errors.confirmation)}>
          <FieldLabel htmlFor={`${fieldId}-confirmation`}>Повторите пароль</FieldLabel>
          <Input
            ref={confirmationRef}
            id={`${fieldId}-confirmation`}
            required
            minLength={8}
            maxLength={128}
            type="password"
            autoComplete="new-password"
            placeholder="Ещё раз новый пароль"
            value={form.confirmation}
            aria-invalid={Boolean(errors.confirmation) || undefined}
            aria-describedby={errors.confirmation ? `${fieldId}-confirmation-error` : undefined}
            onChange={(event) => updateField("confirmation", event.target.value)}
          />
          {errors.confirmation && <FieldError id={`${fieldId}-confirmation-error`}>{errors.confirmation}</FieldError>}
        </Field>
      </FieldGroup>
      <ShadcnButton type="submit" className="auth-submit" disabled={loading} aria-busy={loading || undefined}>
        {loading && <Spinner data-icon="inline-start" />}
        Сохранить новый пароль
      </ShadcnButton>
      <p className="auth-switch">Ссылка не работает? <Link to="/forgot-password">Запросить новую</Link></p>
    </AuthRecoveryForm>
  );
}

function YandexBackupResult({ backup, retryHref, userId }) {
  const [status, setStatus] = useState(backup === "busy" ? "busy" : "pending");
  useEffect(() => {
    if (backup === "busy") return undefined;
    let active = true;
    let timer;
    const poll = async () => {
      try {
        const result = await api.get(`/me/yandex-backup/${encodeURIComponent(backup)}`);
        if (!active) return;
        setStatus(result.status);
        if (result.status === "pending") timer = setTimeout(poll, 2_500);
      } catch {
        if (active) setStatus("unknown");
      }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [backup, userId]);

  const message = {
    pending: "Готовим резервную копию. Можно вернуться в Rollapp: загрузка продолжится.",
    complete: "Резервная копия сохранена в папке ROLLAPP в корне Яндекс Диска.",
    permission: "Разрешите доступ к Яндекс Диску при повторной попытке.",
    space: "На Яндекс Диске не хватает места для резервной копии.",
    folder: "Папка ROLLAPP должна быть личной. Закройте общий доступ или переименуйте существующий объект.",
    busy: "Сейчас выполняются другие копии. Повторите попытку через несколько минут.",
    failed: "Не удалось сохранить резервную копию. Попробуйте ещё раз.",
    unknown: "Не удалось проверить статус. Посмотрите папку ROLLAPP на Яндекс Диске.",
  }[status];
  return (
    <div className="grid gap-2">
      <p role="status">{message}</p>
      {status === "complete" && <a className="underline" href="https://disk.yandex.ru/client/disk/ROLLAPP">Открыть папку ROLLAPP</a>}
      {status !== "pending" && status !== "complete" && (
        <a className="underline" href={retryHref}>Повторить копирование</a>
      )}
    </div>
  );
}

export function RegisterPage() {
  const { hash, search } = useLocation();
  const invite = new URLSearchParams(hash.slice(1)).get("invite") || "";
  const [check, setCheck] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const result = check?.invite === invite && check?.attempt === attempt ? check : null;
  const nextPath = safeNextPath(new URLSearchParams(search).get("next"));

  useEffect(() => {
    if (!invite) return;
    let active = true;
    api.post("/auth/invite/validate", { invite })
      .then((details) => { if (active) setCheck({ invite, attempt, valid: true, email: details.email }); })
      .catch((error) => { if (active) setCheck({ invite, attempt, error }); });
    return () => { active = false; };
  }, [invite, attempt]);

  if (result?.valid) return <RegistrationForm key={invite} invite={invite} email={result.email} />;
  const invalid = result?.error?.code === "INVITE_INVALID";
  const checking = Boolean(invite && !result);
  return (
    <div className="auth-page rollapp-body">
      <div className="auth-panel">
        <div className="auth-form">
          <div>
            <span className="eyebrow">Rollapp</span>
            <h1>{checking ? "Проверяем приглашение" : invalid ? "Приглашение недействительно" : "Регистрация по приглашению"}</h1>
            <p>
              {checking ? "Подождите немного." : invalid ? "Ссылка могла истечь или быть использована. Попросите отправителя создать новую." : invite ? result?.error?.message : "Попросите приглашение у владельца Rollapp."}
            </p>
          </div>
          {checking && <div className="auth-config-loading" role="status"><Spinner /><span>Проверяем ссылку…</span></div>}
          {result?.error && !invalid && <PageActionButton type="button" variant="outline" onClick={() => setAttempt((current) => current + 1)}>Проверить снова</PageActionButton>}
          <PageActionButton to={`/login?next=${encodeURIComponent(nextPath)}`}>Войти</PageActionButton>
        </div>
      </div>
    </div>
  );
}

export function RegistrationForm({ invite, email }) {
  const { user } = useSession();
  const { search } = useLocation();
  const id = useId();
  const [account, setAccount] = useState({ accountType: "personal", businessCategory: null, sellerSpace: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const params = new URLSearchParams(search);
  const nextPath = safeNextPath(params.get("next"));
  const authErrorCode = params.get("auth_error");
  const yandexError = yandexAuthErrorDetails(authErrorCode, { registering: true });

  const submit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const { authorizationUrl } = await api.post("/auth/yandex/start", { invite, next: nextPath, ...account });
      window.location.assign(authorizationUrl);
    } catch (cause) {
      setError(cause.message);
      setLoading(false);
    }
  };

  if (user) return <Navigate to={nextPath} replace />;
  return (
    <div className="auth-page rollapp-body">
      <div className="auth-panel">
        <form className="auth-form" onSubmit={submit} aria-busy={loading}>
          <div>
            <span className="eyebrow">Новый аккаунт</span>
            <h1>Создать свой Rollapp</h1>
            <p>Для регистрации выберите Яндекс ID с адресом <strong className="wrap-anywhere">{email}</strong>.</p>
          </div>
          <FieldGroup className="gap-4">
            <RegistrationAccountFields id={id} value={account} onChange={setAccount} disabled={loading} />
          </FieldGroup>
          {error ? (
            <Alert variant="destructive" role="alert" className="auth-provider-alert"><AlertDescription>{error}</AlertDescription></Alert>
          ) : yandexError && (
            <Alert variant={yandexError.variant} className="auth-provider-alert">
              <AlertTitle>{yandexError.title}</AlertTitle>
              <AlertDescription>{authErrorCode === "YANDEX_CANCELLED" ? "Попробуйте зарегистрироваться ещё раз." : yandexError.description}</AlertDescription>
            </Alert>
          )}
          <YandexIdButton disabled={loading} label="Создать с Яндекс ID" />
          <p className="auth-switch">Уже есть аккаунт? <Link to={`/login?next=${encodeURIComponent(nextPath)}`}>Войти</Link></p>
        </form>
      </div>
    </div>
  );
}

export function AuthPage({ recovery }) {
  const location = useLocation();
  const [config, setConfig] = useState(null);
  useEffect(() => {
    let active = true;
    api.get("/auth/yandex/config")
      .then((result) => { if (active) setConfig(result); })
      .catch(() => { if (active) setConfig({ enabled: false }); });
    return () => { active = false; };
  }, []);

  if (!config) return <LoadingScreen />;
  if (recovery) {
    if (config.legacySignInEnabled === true) return recovery === "reset" ? <ResetPasswordPage /> : <ForgotPasswordPage />;
    const nextPath = safeNextPath(new URLSearchParams(location.search).get("next"));
    return <Navigate to={`/login?next=${encodeURIComponent(nextPath)}`} replace />;
  }
  return <SignInPage yandexEnabled={config.enabled === true} legacySignInEnabled={config.legacySignInEnabled === true} />;
}

function SignInPage({ yandexEnabled, legacySignInEnabled }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: sessionLoading, refresh } = useSession();
  const toast = useToast();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [phoneEnabled, setPhoneEnabled] = useState(false);
  const [phoneConfigLoaded, setPhoneConfigLoaded] = useState(false);
  const [authMethod, setAuthMethod] = useState("email");
  const authQuery = new URLSearchParams(location.search);
  const addingAccount = authQuery.get("add_account") === "1";
  const addAccountQuery = addingAccount ? "?add_account=1" : "";
  const [telegramAuth, setTelegramAuth] = useState(() => {
    const launch = addingAccount || !legacySignInEnabled ? {} : initializeTelegramWebApp();
    return {
      initData: launch.initData,
      status: launch.initData ? "checking" : "absent",
      profile: null,
      error: "",
    };
  });
  const authId = useId();
  const methodTouchedRef = useRef(false);
  const nextPath = safeNextPath(authQuery.get("next"));
  const yandexError = yandexAuthErrorDetails(authQuery.get("auth_error"), { legacySignInEnabled });
  const yandexLinked = authQuery.get("auth_success") === "YANDEX_LINKED";
  const backup = authQuery.get("backup");
  const yandexBackup = yandexLinked && (backup === "busy" || /^[0-9a-f-]{36}$/.test(backup || "")) ? backup : "";
  const shouldLinkYandex = Boolean(yandexError?.linkRequired);
  const yandexStartHref = yandexAuthStartPath(nextPath, { addAccount: addingAccount });
  const yandexLinkHref = yandexAuthStartPath(nextPath, { link: true });

  const finishAuthentication = async (message) => {
    if (addingAccount) {
      window.location.replace(localizedPageUrl(APP_HOME));
      return;
    }
    let linkError = null;
    if (telegramAuth.initData && telegramAuth.status === "unlinked") {
      try {
        const linked = await api.post("/me/telegram/link", { initData: telegramAuth.initData });
        setTelegramAuth((current) => ({ ...current, status: "linked", profile: linked.telegram || current.profile, error: "" }));
      } catch (error) {
        linkError = error;
      }
    }
    await refresh();
    if (shouldLinkYandex) {
      window.location.assign(yandexLinkHref);
      return;
    }
    navigate(nextPath);
    if (linkError) toast("Вы вошли, но Telegram не привязался. Откройте Rollapp из бота ещё раз.", "error");
    else toast(message);
  };

  const phoneFlow = usePhoneOtp({
    requestPath: `/auth/phone/request${addAccountQuery}`,
    verifyPath: `/auth/phone/verify${addAccountQuery}`,
    onVerified: async () => finishAuthentication("С возвращением!"),
  });

  useEffect(() => {
    if (!telegramAuth.initData) return undefined;
    let active = true;
    setTelegramAuth((current) => ({ ...current, status: "checking", error: "" }));
    api.post("/auth/telegram", { initData: telegramAuth.initData })
      .then(async () => {
        if (!active) return;
        await refresh();
        if (!active) return;
        navigate(nextPath);
        toast("Вход через Telegram выполнен");
      })
      .catch((error) => {
        if (!active) return;
        if (error.code === "TELEGRAM_LINK_REQUIRED") {
          setTelegramAuth((current) => ({
            ...current,
            status: "unlinked",
            profile: error.payload?.telegram || null,
            error: "",
          }));
          return;
        }
        setTelegramAuth((current) => ({ ...current, status: "error", error: error.message }));
      });
    return () => { active = false; };
  }, [telegramAuth.initData, user, refresh, navigate, nextPath, toast]);

  useEffect(() => {
    if (!legacySignInEnabled) return undefined;
    methodTouchedRef.current = false;
    let active = true;
    setPhoneConfigLoaded(false);
    api.get("/auth/phone/config")
      .then((config) => {
        if (!active) return;
        const enabled = Boolean(config.enabled);
        setPhoneEnabled(enabled);
        if (enabled && !methodTouchedRef.current) setAuthMethod("phone");
      })
      .catch(() => {
        if (!active) return;
        setPhoneEnabled(false);
        setAuthMethod("email");
      })
      .finally(() => { if (active) setPhoneConfigLoaded(true); });
    return () => { active = false; };
  }, [legacySignInEnabled]);

  if (addingAccount && sessionLoading) return <LoadingScreen />;
  if (addingAccount && !user) return <Navigate to={`/login?next=${encodeURIComponent(nextPath)}`} replace />;

  if (user && !addingAccount && (!telegramAuth.initData || yandexLinked)) {
    if (!yandexError && !yandexLinked) return <Navigate to={nextPath} replace />;
    return (
      <div className="auth-page rollapp-body">
        <div className="auth-panel">
          <div className="auth-form">
            <div>
              <span className="eyebrow">Yandex ID</span>
              <h1>{yandexLinked ? "Yandex ID подключён" : "Не удалось подключить вход"}</h1>
              <p>{yandexLinked ? "Теперь можно входить в Rollapp без пароля." : "Ваш текущий аккаунт Rollapp остался активен."}</p>
            </div>
            {yandexError && (
              <Alert variant={yandexError.variant} className="auth-provider-alert">
                <AlertTitle>{yandexError.title}</AlertTitle>
                <AlertDescription>{yandexError.description}</AlertDescription>
              </Alert>
            )}
            {yandexBackup && <YandexBackupResult key={`${user.id}:${yandexBackup}`} backup={yandexBackup} retryHref={yandexLinkHref} userId={user.id} />}
            <Link className={buttonVariants({ variant: "outline", className: "h-12 w-full" })} to={nextPath}>Вернуться в Rollapp</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!legacySignInEnabled) {
    const alert = yandexError || (!yandexEnabled && yandexAuthErrorDetails("YANDEX_AUTH_UNAVAILABLE"));
    return (
      <div className="auth-page rollapp-body">
        <div className="auth-panel">
          <div className="auth-form">
            <div>
              <span className="eyebrow">{addingAccount ? "Профиль" : "С возвращением"}</span>
              <h1>{addingAccount ? "Добавить аккаунт" : "Войти в Rollapp"}</h1>
              <p>{addingAccount ? "Войдите в другой аккаунт. Текущий останется в списке для быстрого переключения." : "Войдите с Яндекс ID, подключённым к вашему аккаунту Rollapp."}</p>
            </div>
            {alert && (
              <Alert variant={alert.variant} className="auth-provider-alert">
                <AlertTitle>{alert.title}</AlertTitle>
                <AlertDescription>{alert.description}</AlertDescription>
              </Alert>
            )}
            {yandexEnabled && <YandexIdButton href={yandexStartHref} />}
            <p className="auth-switch">{addingAccount ? <Link to={nextPath} replace>Отмена</Link> : "Регистрация по приглашению."}</p>
          </div>
        </div>
      </div>
    );
  }

  const submitCredentials = async (event) => {
    event.preventDefault(); setLoading(true);
    try {
      await api.post(`/auth/login${addAccountQuery}`, form);
      await finishAuthentication("С возвращением!");
    } catch (error) { toast(error.message, "error"); } finally { setLoading(false); }
  };

  const switchAuthMethod = () => {
    methodTouchedRef.current = true;
    phoneFlow.reset();
    setAuthMethod((current) => current === "phone" ? "email" : "phone");
  };
  const confirmTelegramLink = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await api.post("/me/telegram/link", { initData: telegramAuth.initData });
      await refresh();
      navigate(nextPath);
      toast("Telegram привязан — следующие входы будут без пароля");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };
  const usingPhone = phoneEnabled && authMethod === "phone";
  const telegramChecking = telegramAuth.status === "checking";
  const connectingCurrentUser = Boolean(user && telegramAuth.initData);
  const showYandexButton = yandexEnabled
    && !telegramAuth.initData
    && !connectingCurrentUser
    && !shouldLinkYandex
    && !(usingPhone && phoneFlow.step === "otp");
  const subtitle = telegramChecking
    ? "Подтверждаем безопасный запуск из Telegram."
    : connectingCurrentUser
      ? `Подключите Telegram к профилю @${user.username}.`
    : usingPhone && phoneFlow.step === "otp"
    ? <>Введите код, который мы отправили на <strong>{phoneFlow.phoneMasked}</strong>.</>
    : addingAccount
      ? "Войдите в другой аккаунт. Текущий останется в списке для быстрого переключения."
      : "Продолжите собирать и исполнять желания.";

  return (
    <div className="auth-page rollapp-body">
      <div className="auth-panel">
        <form className="auth-form" aria-busy={telegramChecking || !phoneConfigLoaded || (usingPhone ? phoneFlow.loading : loading)} onSubmit={connectingCurrentUser ? confirmTelegramLink : usingPhone ? phoneFlow.submit : submitCredentials}>
          <div>
            <span className="eyebrow">{telegramChecking ? "Telegram" : connectingCurrentUser ? "Один шаг" : usingPhone && phoneFlow.step === "otp" ? "Подтверждение" : addingAccount ? "Профиль" : "С возвращением"}</span>
            <h1>{telegramChecking ? "Открываем Rollapp" : connectingCurrentUser ? "Подключить Telegram" : usingPhone && phoneFlow.step === "otp" ? "Введите код" : addingAccount ? "Добавить аккаунт" : "Войти в Rollapp"}</h1>
            <p>{subtitle}</p>
          </div>
          {telegramChecking
            ? <div className="auth-config-loading" role="status"><LoaderCircle className="spin" /><span>Проверяем аккаунт Telegram…</span></div>
            : <>
              {telegramAuth.status === "unlinked" && (
                <div className="telegram-auth-status" role="status">
                  <span className="telegram-auth-status__icon"><Send aria-hidden="true" /></span>
                  <span>
                    <strong>{telegramAuth.profile?.name || "Telegram подключён"}</strong>
                    <small>{connectingCurrentUser ? `Подтвердите привязку к @${user.username}.` : "Войдите один раз — дальше бот будет открывать профиль без пароля."}</small>
                  </span>
                </div>
              )}
              {telegramAuth.status === "error" && (
                <div className="telegram-auth-status telegram-auth-status--error" role="alert">
                  <span className="telegram-auth-status__icon"><Send aria-hidden="true" /></span>
                  <span><strong>Telegram не подтвердил запуск</strong><small>{telegramAuth.error}</small></span>
                </div>
              )}
              {yandexError && !connectingCurrentUser && (
                <Alert variant={yandexError.variant} className="auth-provider-alert">
                  <AlertTitle>{yandexError.title}</AlertTitle>
                  <AlertDescription>{yandexError.description}</AlertDescription>
                </Alert>
              )}
              {showYandexButton && <>
                <YandexIdButton href={yandexStartHref} />
                <div className="or" aria-hidden="true"><span>или</span></div>
              </>}
          {connectingCurrentUser
            ? telegramAuth.status === "unlinked"
              ? <>
                <ShadcnButton type="submit" className="auth-submit" disabled={loading}>{loading && <Spinner data-icon="inline-start" />}Привязать к @{user.username}</ShadcnButton>
                <ShadcnButton variant="link" className="auth-method-switch" type="button" disabled={loading} onClick={() => navigate(nextPath)}>Не сейчас</ShadcnButton>
              </>
              : <ShadcnButton variant="link" className="auth-method-switch" type="button" onClick={() => navigate(nextPath)}>Вернуться в Rollapp</ShadcnButton>
            : !phoneConfigLoaded
            ? <div className="auth-config-loading" role="status"><LoaderCircle className="spin" /><span>Проверяем способы входа…</span></div>
            : usingPhone
            ? <PhoneOtpFields flow={phoneFlow} verifyLabel={shouldLinkYandex ? "Подтвердить и привязать Yandex ID" : undefined} />
            : <>
              <FieldGroup className="gap-4">
                <Field><FieldLabel htmlFor={`${authId}-email`}>Email</FieldLabel><Input id={`${authId}-email`} required type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(event) => { methodTouchedRef.current = true; setForm({ ...form, email: event.target.value }); }} /></Field>
                <Field><FieldLabel htmlFor={`${authId}-password`}>Пароль</FieldLabel><Input id={`${authId}-password`} required minLength={8} type="password" autoComplete="current-password" placeholder="Минимум 8 символов" value={form.password} onChange={(event) => { methodTouchedRef.current = true; setForm({ ...form, password: event.target.value }); }} /></Field>
              </FieldGroup>
              {!addingAccount && <Link className="auth-password-link" to="/forgot-password">Забыли пароль?</Link>}
              <ShadcnButton type="submit" className="auth-submit" disabled={loading} aria-busy={loading || undefined}>{loading && <Spinner data-icon="inline-start" />}{shouldLinkYandex ? "Войти и привязать Yandex ID" : "Войти"}</ShadcnButton>
            </>}
          {!connectingCurrentUser && phoneConfigLoaded && phoneEnabled && (
            <ShadcnButton variant="link" className="auth-method-switch" type="button" disabled={phoneFlow.loading || loading} onClick={switchAuthMethod}>
              {usingPhone ? <Mail aria-hidden="true" /> : <Phone aria-hidden="true" />}
              <span>{usingPhone ? "Войти по email и паролю" : "Войти по номеру телефона"}</span>
            </ShadcnButton>
          )}
          {!connectingCurrentUser && <p className="auth-switch">{addingAccount
            ? <Link to={nextPath} replace aria-disabled={loading || phoneFlow.loading || undefined} onClick={(event) => { if (loading || phoneFlow.loading) event.preventDefault(); }}>Отмена</Link>
            : "Регистрация по приглашению."}</p>}
            </>}
        </form>
      </div>
    </div>
  );
}
