import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Archive, Check, CheckCircle2, ChevronDown,
  CircleUserRound, ExternalLink, Eye, EyeOff, Gift, Hand, Heart, Image, Link2, ListPlus,
  LoaderCircle, LockKeyhole, LogOut, Mail, MoreHorizontal, PackageCheck, Pencil, Phone, Plus,
  RotateCcw, Search, Share2, Sparkles, Star, Trash2, Upload, UserPlus,
  Users, X,
} from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { api } from "./api.js";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar as ShadcnAvatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button as ShadcnButton, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const SessionContext = createContext(null);
const ToastContext = createContext(null);
const ProfileEditorContext = createContext(null);
const APP_HOME = "/app/wishes";

const formatMoney = (value, currency = "RUB") => value == null ? "Цена не указана" : new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
const initials = (name = "?") => name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const isRussianMobilePhone = (value = "") => {
  let digits = String(value).replace(/\D/g, "");
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  return /^79\d{9}$/.test(digits);
};
const formatCountdown = (seconds) => {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
};
const WISH_CURRENCIES = ["RUB", "USD", "EUR", "KZT", "BYN"];
const WISH_CURRENCY_SYMBOLS = { RUB: "₽", USD: "$", EUR: "€", KZT: "₸", BYN: "Br" };
const isProductUrl = (value) => { try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } };
const uploadedImageIdFromUrl = (value = "") => /^\/api\/media\/([0-9a-f-]{36})$/i.exec(value)?.[1] || "";
const wishFormFrom = (wish) => ({
  title: wish?.title || "",
  description: wish?.description || "",
  url: wish?.url || "",
  imageUrl: wish?.imageUrl || "",
  price: wish?.price == null ? "" : String(wish.price),
  currency: WISH_CURRENCIES.includes(wish?.currency) ? wish.currency : "RUB",
  priority: wish?.priority || 2,
  privacy: wish?.privacy || "inherit",
  allowMultiple: Boolean(wish?.allowMultiple),
  listIds: Array.isArray(wish?.listIds) ? [...wish.listIds] : [],
});
const safeNextPath = (value) => typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : APP_HOME;
const isGeneralList = (list) => list?.title === "Мои желания" && list?.description === "Всё, чему я буду рад";
const isWishSecret = (wish, lists = []) => wish?.privacy === "private" || lists.some((list) => (
  list.privacy === "private" && wish?.listIds?.includes(list.id)
));
const publicProfilePath = (username = "") => `/${encodeURIComponent(username)}`;
const publicListPath = (username, listId) => `${publicProfilePath(username)}/lists/${encodeURIComponent(listId)}`;
const publicWishPath = (username, wishId) => `${publicProfilePath(username)}/wishes/${encodeURIComponent(wishId)}`;
const wishSharePath = ({ wish, profile, lists = [], shareToken = "" }) => {
  if (shareToken) return `/s/${encodeURIComponent(shareToken)}/wishes/${encodeURIComponent(wish.id)}`;
  const linkedLists = lists.filter((list) => wish.listIds?.includes(list.id));
  const linkList = linkedLists.find((list) => list.privacy === "link" && list.shareToken);
  const publiclyReachable = linkedLists.some((list) => ["public", "followers"].includes(list.privacy));
  if (!publiclyReachable && linkList) return `/s/${encodeURIComponent(linkList.shareToken)}/wishes/${encodeURIComponent(wish.id)}`;
  return publicWishPath(profile?.username, wish.id);
};

function useAsync(load, dependencies = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const requestIdRef = useRef(0);
  const reload = useCallback(async ({ background = false } = {}) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((current) => ({ ...current, loading: background ? current.data == null : true, error: null }));
    try {
      const data = await load();
      if (requestId === requestIdRef.current) setState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setState((current) => background && current.data != null
          ? { ...current, loading: false, error }
          : { data: null, loading: false, error });
      }
      throw error;
    }
  }, dependencies); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    reload().catch(() => {});
    return () => { requestIdRef.current += 1; };
  }, [reload]);
  return { ...state, reload };
}

function ToastProvider({ children }) {
  const show = useCallback((message, tone = "default") => {
    if (tone === "error") return sonnerToast.error(message);
    if (tone === "success") return sonnerToast.success(message);
    return sonnerToast(message);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <Toaster
        theme="dark"
        position="bottom-left"
        offset={16}
        mobileOffset={{ bottom: "calc(96px + env(safe-area-inset-bottom))", left: 12, right: 12 }}
        richColors
        closeButton
      />
    </ToastContext.Provider>
  );
}

function SessionProvider({ children }) {
  const [session, setSession] = useState({ user: null, loading: true });
  const refresh = useCallback(async () => {
    try {
      const result = await api.get("/me");
      setSession({ ...result, loading: false });
      return result;
    } catch {
      setSession({ user: null, loading: false });
      return null;
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return <SessionContext.Provider value={{ ...session, refresh, setSession }}>{children}</SessionContext.Provider>;
}

function useSession() { return useContext(SessionContext); }
function useToast() { return useContext(ToastContext); }
function useProfileEditor() { return useContext(ProfileEditorContext); }

function useLogout() {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  return useCallback(async () => {
    try {
      await api.post("/auth/logout", {});
      await refresh();
      navigate("/");
      toast("Вы вышли из аккаунта");
      return true;
    } catch (error) {
      toast(error?.message || "Не удалось выйти из аккаунта");
      return false;
    }
  }, [navigate, refresh, toast]);
}

function ProfileEditorProvider({ children }) {
  const { user, refresh } = useSession();
  const [open, setOpen] = useState(false);
  const returnFocusRef = useRef(null);
  const openProfileEditor = useCallback((event) => {
    const trigger = event?.currentTarget;
    returnFocusRef.current = trigger instanceof HTMLElement ? trigger : null;
    setOpen(true);
  }, []);
  const closeProfileEditor = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ openProfileEditor }), [openProfileEditor]);
  return (
    <ProfileEditorContext.Provider value={value}>
      {children}
      {open && user && <ProfileSettingsModal
        user={user}
        finalFocus={returnFocusRef}
        onClose={closeProfileEditor}
        onSaved={async () => {
          await refresh();
          closeProfileEditor();
        }}
      />}
    </ProfileEditorContext.Provider>
  );
}

function Logo({ className = "" }) {
  return (
    <Link to={APP_HOME} className={`logo ${className}`} aria-label="Rollapp — в приложение">
      <svg
        className="logo__mark"
        viewBox="0 0 364 364"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M1 8h109v114H1z" fill="currentColor" />
        <path
          d="M321.907 17.031A222.647 79.661 -47.859 1 1 23.133 347.216 222.647 79.661 -47.859 1 1 321.907 17.031ZM118 124h109v115H118Z"
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
        />
        <circle cx="302" cy="294" r="61" fill="currentColor" />
      </svg>
    </Link>
  );
}

function Avatar({ user, size = "md", className = "" }) {
  const avatarUrl = user?.avatarUrl || user?.avatar_url || "";
  const shadcnSize = size === "sm" ? "sm" : size === "lg" ? "lg" : size === "xl" ? "xl" : "default";
  return (
    <ShadcnAvatar size={shadcnSize} className={`avatar avatar--${size} ${className}`}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
      <AvatarFallback className="avatar--fallback">{initials(user?.name)}</AvatarFallback>
    </ShadcnAvatar>
  );
}

function Button({ children, className = "", variant = "primary", icon: Icon, loading, ...props }) {
  const shadcnVariant = { primary: "default", soft: "secondary", reserved: "secondary" }[variant] || variant;
  return <ShadcnButton variant={shadcnVariant} className={`button button--${variant} ${className}`} {...props} disabled={loading || props.disabled} aria-busy={loading || props["aria-busy"] || undefined}>{loading ? <Spinner /> : Icon ? <Icon size={20} /> : null}<span>{children}</span></ShadcnButton>;
}

function EmptyState({ icon: Icon = Sparkles, title, text, action }) {
  return <Empty className="empty-state"><EmptyHeader><EmptyMedia className="empty-state__icon" variant="icon"><Icon size={28} /></EmptyMedia><EmptyTitle><h3>{title}</h3></EmptyTitle><EmptyDescription><p>{text}</p></EmptyDescription></EmptyHeader>{action && <EmptyContent>{action}</EmptyContent>}</Empty>;
}

function LoadingScreen({ compact = false }) {
  return <div className={compact ? "inline-loader" : "page-loader"}><Spinner className="gift-loader" /><span>Собираем желания…</span></div>;
}

function RootRoute() {
  const { user, loading } = useSession();
  if (loading) return <LoadingScreen />;
  return <Navigate to={user ? APP_HOME : "/login"} replace />;
}

function usePhoneOtp({ requestPath, verifyPath, onVerified }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("phone");
  const [challengeId, setChallengeId] = useState("");
  const [phoneMasked, setPhoneMasked] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const phoneInputRef = useRef(null);
  const codeInputRef = useRef(null);

  const retrySeconds = Math.max(0, Math.ceil((retryAt - now) / 1000));

  useEffect(() => {
    if (step !== "otp" || retrySeconds <= 0) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [step, retrySeconds]);

  const focusInput = (ref) => window.requestAnimationFrame(() => ref.current?.focus());

  const requestCode = async () => {
    if (!isRussianMobilePhone(phone)) {
      setError("Введите российский мобильный номер, например +7 999 123-45-67.");
      focusInput(phoneInputRef);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await api.post(requestPath, { phone });
      setChallengeId(result.challengeId);
      setPhoneMasked(result.phoneMasked || phone);
      setCode("");
      setStep("otp");
      const resendAfterSeconds = Number(result.resendAfterSeconds) || 60;
      const nextRetryAt = Date.now() + resendAfterSeconds * 1000;
      setRetryAt(nextRetryAt);
      setNow(Date.now());
      focusInput(codeInputRef);
    } catch (requestError) {
      if (requestError.status === 429) {
        const retryAfterSeconds = requestError.retryAfterSeconds || 60;
        setRetryAt(Date.now() + retryAfterSeconds * 1_000);
        setNow(Date.now());
        setError("Слишком много попыток. Попробуйте немного позже.");
      } else if (requestError.status === 400 || requestError.status === 503) {
        setError(requestError.message);
      } else {
        setError("Не удалось отправить код. Проверьте номер и попробуйте ещё раз.");
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    if (!challengeId || code.length !== 6) {
      setError("Введите шестизначный код из SMS.");
      focusInput(codeInputRef);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await api.post(verifyPath, { challengeId, code });
      await onVerified(result);
    } catch (verifyError) {
      if (verifyError.status === 409 || verifyError.status === 503) {
        setError(verifyError.message);
      } else {
        setError("Код не подошёл или устарел. Запросите новый код.");
        if (verifyError.status === 400 || verifyError.status === 401) setCode("");
      }
      focusInput(codeInputRef);
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (step === "phone") await requestCode();
    else await verifyCode();
  };

  const changePhone = () => {
    setStep("phone");
    setChallengeId("");
    setPhoneMasked("");
    setCode("");
    setError("");
    setRetryAt(0);
    focusInput(phoneInputRef);
  };

  const reset = () => {
    setPhone("");
    setCode("");
    setStep("phone");
    setChallengeId("");
    setPhoneMasked("");
    setRetryAt(0);
    setError("");
  };

  return {
    phone,
    setPhone,
    code,
    setCode,
    step,
    phoneMasked,
    retrySeconds,
    loading,
    error,
    clearError: () => setError(""),
    phoneInputRef,
    codeInputRef,
    submit,
    requestCode,
    changePhone,
    reset,
  };
}

function PhoneOtpFields({ flow, initialFocus = false, requestLabel = "Получить код", verifyLabel = "Подтвердить и войти" }) {
  const fieldId = useId();
  const phoneErrorId = `${fieldId}-phone-error`;
  const codeHintId = `${fieldId}-code-hint`;
  const readyToResend = flow.step === "otp" && flow.retrySeconds === 0;
  if (flow.step === "phone") {
    return <>
      <label htmlFor={`${fieldId}-phone`}>
        <span>Номер телефона</span>
        <Input
          ref={flow.phoneInputRef}
          id={`${fieldId}-phone`}
          data-modal-initial-focus={initialFocus ? "" : undefined}
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          minLength={10}
          maxLength={24}
          placeholder="+7 999 123-45-67"
          value={flow.phone}
          aria-invalid={Boolean(flow.error)}
          aria-describedby={flow.error ? phoneErrorId : undefined}
          onChange={(event) => {
            flow.setPhone(event.target.value);
            if (flow.error) flow.clearError();
          }}
        />
      </label>
      {flow.error && <p id={phoneErrorId} className="phone-otp__error" role="alert">{flow.error}</p>}
      <Button type="submit" loading={flow.loading} className="auth-submit">{requestLabel}</Button>
    </>;
  }
  return <>
    <div className="phone-otp__summary" id={codeHintId}>
      <span><Phone aria-hidden="true" /><span>Код отправлен на <strong>{flow.phoneMasked}</strong></span></span>
      <ShadcnButton variant="ghost" type="button" disabled={flow.loading} onClick={flow.changePhone}>Изменить</ShadcnButton>
    </div>
    <label htmlFor={`${fieldId}-code`}>
      <span>Код из SMS</span>
      <Input
        ref={flow.codeInputRef}
        id={`${fieldId}-code`}
        className="phone-otp__code"
        required
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="••••••"
        value={flow.code}
        aria-invalid={Boolean(flow.error)}
        aria-describedby={flow.error ? phoneErrorId : codeHintId}
        onChange={(event) => {
          flow.setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
          if (flow.error) flow.clearError();
        }}
      />
    </label>
    {flow.error && <p id={phoneErrorId} className="phone-otp__error" role="alert">{flow.error}</p>}
    <Button type="submit" loading={flow.loading} className="auth-submit">{verifyLabel}</Button>
    <ShadcnButton variant="link" className="phone-otp__resend" type="button" disabled={flow.loading || !readyToResend} onClick={flow.requestCode}>
      {readyToResend ? "Отправить код снова" : `Отправить снова через ${formatCountdown(flow.retrySeconds)}`}
    </ShadcnButton>
    <span className="visually-hidden" aria-live="polite">{readyToResend ? "Код можно отправить снова" : ""}</span>
  </>;
}

function AuthPage({ mode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refresh } = useSession();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [phoneEnabled, setPhoneEnabled] = useState(false);
  const [phoneConfigLoaded, setPhoneConfigLoaded] = useState(mode !== "login");
  const [authMethod, setAuthMethod] = useState("email");
  const methodTouchedRef = useRef(false);
  const nextPath = safeNextPath(new URLSearchParams(location.search).get("next"));
  const phoneFlow = usePhoneOtp({
    requestPath: "/auth/phone/request",
    verifyPath: "/auth/phone/verify",
    onVerified: async () => {
      await refresh();
      navigate(nextPath);
      toast("С возвращением!");
    },
  });

  useEffect(() => {
    methodTouchedRef.current = false;
    if (mode !== "login") {
      setPhoneEnabled(false);
      setPhoneConfigLoaded(true);
      setAuthMethod("email");
      return undefined;
    }
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
  }, [mode]);

  if (user) return <Navigate to={nextPath} replace />;

  const submitCredentials = async (event) => {
    event.preventDefault(); setLoading(true);
    try {
      await api.post(mode === "register" ? "/auth/register" : "/auth/login", form);
      await refresh(); navigate(nextPath); toast(mode === "register" ? "Вишлист готов — добавьте первую мечту" : "С возвращением!");
    } catch (error) { toast(error.message, "error"); } finally { setLoading(false); }
  };

  const switchAuthMethod = () => {
    methodTouchedRef.current = true;
    phoneFlow.reset();
    setAuthMethod((current) => current === "phone" ? "email" : "phone");
  };
  const usingPhone = mode === "login" && phoneEnabled && authMethod === "phone";
  const subtitle = usingPhone && phoneFlow.step === "otp"
    ? <>Введите код, который мы отправили на <strong>{phoneFlow.phoneMasked}</strong>.</>
    : mode === "register"
      ? "Это бесплатно и займёт меньше минуты."
      : "Продолжите собирать и исполнять желания.";

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <form className="auth-form" aria-busy={!phoneConfigLoaded || (usingPhone ? phoneFlow.loading : loading)} onSubmit={usingPhone ? phoneFlow.submit : submitCredentials}>
          <div>
            <span className="eyebrow">{usingPhone && phoneFlow.step === "otp" ? "Подтверждение" : mode === "register" ? "Новый аккаунт" : "С возвращением"}</span>
            <h2>{mode === "register" ? "Создать свой Rollapp" : usingPhone && phoneFlow.step === "otp" ? "Введите код" : "Войти в Rollapp"}</h2>
            <p>{subtitle}</p>
          </div>
          {mode === "login" && !phoneConfigLoaded
            ? <div className="auth-config-loading" role="status"><LoaderCircle className="spin" /><span>Проверяем способы входа…</span></div>
            : usingPhone
            ? <PhoneOtpFields flow={phoneFlow} />
            : <>
              {mode === "register" && <label><span>Как вас зовут</span><Input required minLength={2} autoComplete="name" placeholder="Алиса Морозова" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>}
              <label><span>Email</span><Input required type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(event) => { if (mode === "login") methodTouchedRef.current = true; setForm({ ...form, email: event.target.value }); }} /></label>
              <label><span>Пароль</span><Input required minLength={8} type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder="Минимум 8 символов" value={form.password} onChange={(event) => { if (mode === "login") methodTouchedRef.current = true; setForm({ ...form, password: event.target.value }); }} /></label>
              <Button type="submit" loading={loading} className="auth-submit">{mode === "register" ? "Создать вишлист" : "Войти"}</Button>
            </>}
          {mode === "login" && phoneConfigLoaded && phoneEnabled && (
            <ShadcnButton variant="link" className="auth-method-switch" type="button" disabled={phoneFlow.loading || loading} onClick={switchAuthMethod}>
              {usingPhone ? <Mail aria-hidden="true" /> : <Phone aria-hidden="true" />}
              <span>{usingPhone ? "Войти по email и паролю" : "Войти по номеру телефона"}</span>
            </ShadcnButton>
          )}
          <p className="auth-switch">{mode === "register" ? <>Уже есть аккаунт? <Link to={`/login?next=${encodeURIComponent(nextPath)}`}>Войти</Link></> : <>Впервые здесь? <Link to={`/register?next=${encodeURIComponent(nextPath)}`}>Создать аккаунт</Link></>}</p>
        </form>
      </div>
    </div>
  );
}

const shellNav = [
  { to: "/app/wishes", icon: Heart, label: "Мои желания" },
  { to: "/app/friends/subscriptions", icon: Users, label: "Друзья" },
];

function AppFriendsLink({ active = false }) {
  return (
    <ShadcnButton
      nativeButton={false}
      render={<Link to="/app/friends/subscriptions" aria-current={active ? "page" : undefined} />}
      variant={active ? "secondary" : "ghost"}
      className="app-friends-link app-main__friends h-12 gap-2 rounded-xl px-4 active:translate-y-0"
      aria-label="Открыть раздел Друзья"
    >
      <Users aria-hidden="true" />
      <span>Друзья</span>
    </ShadcnButton>
  );
}

function AppProfileButton({ user, compact = false }) {
  const { openProfileEditor } = useProfileEditor();
  return (
    <ShadcnButton
      type="button"
      variant="ghost"
      className={compact
        ? "app-user-profile app-user-profile--compact size-12 rounded-full p-2 active:translate-y-0"
        : "app-user-profile h-12 max-w-[240px] min-w-0 justify-start gap-2 rounded-xl px-3 text-left active:translate-y-0"}
      aria-label={`Редактировать профиль ${user.name}`}
      title="Редактировать профиль"
      onClick={openProfileEditor}
    >
      <Avatar user={user} size="sm" className="!size-8" />
      {!compact && <span className="app-user-profile__copy flex min-w-0 flex-col items-start"><strong className="max-w-full truncate text-sm leading-4">{user.name}</strong><span className="max-w-full truncate text-xs leading-4 text-muted-foreground">@{user.username}</span></span>}
    </ShadcnButton>
  );
}

function FriendsTopbar({ user }) {
  return (
    <header className="friends-topbar">
      <nav className="friends-topbar__account" aria-label="Быстрые переходы">
        <AppFriendsLink active />
        <AppProfileButton user={user} compact />
        <Logo className="app-shell-logo" />
      </nav>
    </header>
  );
}

function AppShell({ children, friendsContext = false, collectionChrome = false }) {
  const { user } = useSession();
  const location = useLocation();
  const friendsRoute = friendsContext || location.pathname.startsWith("/app/friends");
  const wishesRoute = location.pathname.startsWith("/app/wishes");
  const isShellNavActive = (to) => to.startsWith("/app/friends")
    ? friendsRoute
    : (!friendsRoute && collectionChrome) || location.pathname === to || location.pathname.startsWith(`${to}/`);
  return (
    <div className={`app-layout app-layout--dark ${friendsRoute ? "app-layout--friends" : ""}`}>
      <main className={`app-main ${!friendsRoute || collectionChrome ? "app-main--with-profile" : ""} ${wishesRoute || collectionChrome ? "app-main--wishes" : ""}`}>
        {!wishesRoute && !collectionChrome && <header className="mobile-app-head">
          <AppProfileButton user={user} compact />
          <Logo className="app-shell-logo" />
        </header>}
        {friendsRoute && !collectionChrome && <FriendsTopbar user={user} />}
        {!friendsRoute && !wishesRoute && !collectionChrome && <nav className="app-main__profile" aria-label="Основные разделы"><AppFriendsLink /><AppProfileButton user={user} /><Logo className="app-shell-logo" /></nav>}
        {children}
        <nav className="mobile-bottom-nav" aria-label="Основные разделы">{shellNav.map(({ to, icon: Icon, label }) => <Link key={to} to={to} aria-current={isShellNavActive(to) ? "page" : undefined} className={`${isShellNavActive(to) ? "active " : ""}${to.startsWith("/app/friends") ? "app-friends-link" : ""}`}><Icon /><span>{label === "Мои желания" ? "Желания" : label}</span></Link>)}</nav>
      </main>
    </div>
  );
}

function WishesProfileHero({ user, selectedList, onEditList, onAdd }) {
  const { openProfileEditor } = useProfileEditor();
  return (
    <section className="wishes-page__hero" data-wishes-profile aria-labelledby="wishes-profile-name">
      <button
        type="button"
        className="wishes-page__identity"
        aria-label={`Редактировать профиль ${user.name}`}
        title="Редактировать профиль"
        onClick={openProfileEditor}
      >
        <Avatar user={user} size="xl" className="wishes-page__hero-avatar" />
        <span className="wishes-page__hero-copy">
          <h1 id="wishes-profile-name">{user.name}<span className="visually-hidden"> — мои желания</span></h1>
        </span>
      </button>
      <nav className="wishes-page__friend-links" aria-label="Связи профиля">
        <Link
          to="/app/friends/subscriptions"
          className="wishes-page__friend-link"
        >
          Подписки
        </Link>
        <Link
          to="/app/friends/followers"
          className="wishes-page__friend-link"
        >
          Подписчики
        </Link>
      </nav>
      <div className="page-actions wishes-page__hero-actions" role="group" aria-label="Действия со списком желаний">
        {selectedList && <Button className="h-12 rounded-full px-5 text-base max-[560px]:flex-1" variant="outline" icon={Pencil} onClick={() => onEditList(selectedList)}>Настройки списка</Button>}
        <Button className="wishes-page__hero-add h-12 min-w-[180px] rounded-full px-6 text-base max-[560px]:min-w-0" icon={Plus} onClick={onAdd}>Добавить</Button>
      </div>
    </section>
  );
}

function ProtectedApp() {
  const { user, loading } = useSession(); const [wishModal, setWishModal] = useState(false); const [version, setVersion] = useState(0);
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell><Routes><Route index element={<Navigate to={APP_HOME} replace />} /><Route path="wishes" element={<WishesPage onAdd={() => setWishModal(true)} version={version} />} /><Route path="ideas" element={<Navigate to={APP_HOME} replace />} /><Route path="friends" element={<Navigate to="/app/friends/subscriptions" replace />} /><Route path="friends/:section" element={<FriendsPage />} /><Route path="gifts" element={<Navigate to={APP_HOME} replace />} /><Route path="notifications" element={<Navigate to={APP_HOME} replace />} /><Route path="settings" element={<Navigate to={APP_HOME} replace />} /><Route path="*" element={<Navigate to={APP_HOME} replace />} /></Routes>{wishModal && <WishModal onClose={() => setWishModal(false)} onSaved={() => { setWishModal(false); setVersion((v) => v + 1); }} />}</AppShell>;
}

function useWishActions({ wish, profile, lists = [], shareToken = "", onChanged, onDeleted }) {
  const toast = useToast();
  const { user } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const refreshAfterMutation = async () => {
    try {
      await onChanged?.();
    } catch {
      toast("Изменение сохранено. Обновите страницу, чтобы увидеть актуальные данные.", "error");
    }
  };
  const requireLogin = () => {
    if (user) return false;
    const next = `${location.pathname}${location.search}`;
    navigate(`/login?next=${encodeURIComponent(next)}`);
    return true;
  };
  const reserve = async () => {
    if (requireLogin()) return false;
    setBusy(true);
    try {
      const result = await api.post(`/wishes/${wish.id}/reserve`, { shareToken: shareToken || wish.shareToken || "" });
      toast(result.reserved ? "Подарок забронирован — владелец не узнает кем" : "Бронь снята");
      await refreshAfterMutation();
      return true;
    } catch (error) {
      toast(error.message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`/wishes/${wish.id}`);
      toast("Желание удалено");
      await refreshAfterMutation();
      onDeleted?.();
      return true;
    } catch (error) {
      toast(error.message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const fulfilled = async () => {
    const targetFulfilled = wish.status !== "fulfilled";
    setBusy(true);
    try {
      await api.post(`/wishes/${wish.id}/fulfilled`, { fulfilled: targetFulfilled });
      toast(targetFulfilled ? "Отмечено исполненным ✦" : "Желание снова активно");
      await refreshAfterMutation();
      return true;
    } catch (error) {
      toast(error.message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const share = async () => {
    if (isWishSecret(wish, lists)) {
      toast("Секретное желание видно только вам", "error");
      return false;
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${wishSharePath({ wish, profile, lists, shareToken })}`);
      toast("Ссылка скопирована");
      return true;
    } catch {
      toast("Не удалось скопировать ссылку", "error");
      return false;
    }
  };
  const save = async () => {
    if (requireLogin()) return false;
    setBusy(true);
    try {
      await api.post(`/wishes/${wish.id}/copy`, { shareToken: shareToken || wish.shareToken || "" });
      toast("Желание сохранено в ваш список");
      return true;
    } catch (error) {
      toast(error.message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const update = async (payload, successMessage) => {
    setBusy(true);
    try {
      const result = await api.patch(`/wishes/${wish.id}`, payload);
      if (successMessage) toast(successMessage);
      await refreshAfterMutation();
      return result.wish;
    } catch (error) {
      toast(error.message, "error");
      return null;
    } finally {
      setBusy(false);
    }
  };
  const repeat = async () => {
    setBusy(true);
    try {
      await api.post("/wishes", {
        title: wish.title,
        description: wish.description || "",
        url: wish.url || "",
        imageUrl: wish.imageUrl || "",
        price: wish.price,
        currency: wish.currency,
        priority: wish.priority,
        privacy: wish.privacy,
        allowMultiple: wish.allowMultiple,
        listIds: [...(wish.listIds || [])],
      });
      toast("Желание снова добавлено в активные ✦");
      await refreshAfterMutation();
      return true;
    } catch (error) {
      toast(error.message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, reserve, remove, fulfilled, share, save, update, repeat };
}

function WishCard({ wish, owner = false, onChanged, onOpen, onEdit, onCreateList, profile, lists = [], shareToken = "", variant = "" }) {
  const [menu, setMenu] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedListIds, setSelectedListIds] = useState(() => [...(wish.listIds || [])]);
  const { busy, reserve, remove, fulfilled, share, save, update, repeat } = useWishActions({ wish, profile, lists, shareToken, onChanged });
  const categoryLists = lists.filter((list) => !isGeneralList(list));
  const listSelectionChanged = selectedListIds.length !== (wish.listIds || []).length
    || selectedListIds.some((id) => !(wish.listIds || []).includes(id));
  const reservationUnavailable = wish.reservationCount > 0 && !wish.allowMultiple && !wish.reservedByMe;
  const secretListMembership = lists.some((list) => list.privacy === "private" && wish.listIds?.includes(list.id));
  const secret = isWishSecret(wish, lists);

  useEffect(() => {
    if (!menu) setSelectedListIds([...(wish.listIds || [])]);
  }, [wish.id, wish.listIds, menu]);

  const closeMenu = () => {
    setMenu(false);
    setSelectedListIds([...(wish.listIds || [])]);
  };

  const toggleList = (list, selected) => {
    if (busy) return;
    setSelectedListIds((current) => selected
      ? [...new Set([...current, list.id])]
      : current.filter((id) => id !== list.id));
  };

  const saveLists = async () => {
    if (!listSelectionChanged || busy) return;
    const updatedWish = await update({ listIds: selectedListIds }, "Списки желания обновлены");
    if (updatedWish) closeMenu();
  };

  return (
    <>
    <Card className={`wish-card gap-0 overflow-visible rounded-none border-0 bg-transparent py-0 shadow-none ring-0 ${variant ? `wish-card--${variant}` : ""} ${wish.status === "fulfilled" ? "is-fulfilled" : ""}`}>
      {onOpen && <ShadcnButton type="button" variant="ghost" className="wish-card__open absolute inset-0 z-[2] h-full w-full rounded-[inherit] border-0 bg-transparent p-0 hover:bg-transparent dark:hover:bg-transparent active:translate-y-0" data-wish-id={wish.id} aria-label={`Открыть желание «${wish.title}»`} aria-haspopup="dialog" onClick={(event) => { closeMenu(); onOpen(event.currentTarget); }} />}
      <div className="wish-card__image">{wish.imageUrl ? <img src={wish.imageUrl} alt="" /> : <span><Gift size={36} /></span>}{wish.status === "fulfilled" && <Badge className="fulfilled-badge"><Check /> Исполнено</Badge>}</div>
      <div className="wish-card__body">
        <div className="wish-card__top">
          <span>{formatMoney(wish.price, wish.currency)}</span>
          <DropdownMenu open={menu} onOpenChange={(open) => {
            setMenu(open);
            if (!open) setSelectedListIds([...(wish.listIds || [])]);
          }}>
            <DropdownMenuTrigger className="wish-card__menu-trigger" aria-label={`Опции желания «${wish.title}»`} aria-controls={`wish-menu-${wish.id}`}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              id={`wish-menu-${wish.id}`}
              align="end"
              sideOffset={8}
              className="wish-card-actions-menu w-70 rounded-2xl p-2 [&_[data-slot=dropdown-menu-item]]:min-h-12 [&_[data-slot=dropdown-menu-sub-trigger]]:min-h-12"
              aria-label={`Действия с желанием «${wish.title}»`}
            >
              {!owner && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={reserve}><Gift /> {wish.reservedByMe ? "Снять бронь" : "Забронировать"}</DropdownMenuItem>}
              {!owner && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={save}><Archive /> Сохранить к себе</DropdownMenuItem>}
              {owner && wish.status === "fulfilled" ? <>
                <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={fulfilled}><RotateCcw /> Не исполнено</DropdownMenuItem>
                <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={repeat}><Plus /> Загадать ещё раз</DropdownMenuItem>
                {onEdit && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} aria-haspopup="dialog" onClick={onEdit}><Pencil /> Редактировать</DropdownMenuItem>}
              </> : owner && <>
                <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={fulfilled}><Check /> Исполнено</DropdownMenuItem>
                {onEdit && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} aria-haspopup="dialog" onClick={onEdit}><Pencil /> Редактировать</DropdownMenuItem>}
                {secretListMembership
                  ? <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled><LockKeyhole /> Секретное в списке</DropdownMenuItem>
                  : <DropdownMenuItem
                    className="min-h-12 gap-2 px-3 py-2 text-base"
                    disabled={busy}
                    onClick={() => {
                      const nextPrivacy = wish.privacy === "private" ? "inherit" : "private";
                      update(
                        { privacy: nextPrivacy },
                        nextPrivacy === "private" ? "Желание стало секретным" : "Желание снова видно друзьям",
                      );
                    }}
                  >
                    {wish.privacy === "private" ? <Eye /> : <EyeOff />}
                    {wish.privacy === "private" ? "Сделать видимым" : "Сделать секретным"}
                  </DropdownMenuItem>}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="card-menu__submenu-trigger min-h-12 gap-2 px-3 py-2 text-base" disabled={busy}>
                    <ListPlus /> <span>Добавить в список</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    id={`wish-lists-${wish.id}`}
                    className="wish-card-lists-menu w-70 rounded-2xl p-2 [&_[data-slot=dropdown-menu-item]]:min-h-12 [&_[data-slot=dropdown-menu-sub-trigger]]:min-h-12"
                    aria-label={`Списки желания «${wish.title}»`}
                  >
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="px-2 py-2 text-sm">Списки</DropdownMenuLabel>
                      {onCreateList && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={onCreateList}><ListPlus /> Новый список</DropdownMenuItem>}
                    </DropdownMenuGroup>
                    {(onCreateList || categoryLists.length > 0) && <DropdownMenuSeparator />}
                    <div className="max-h-[22.75rem] overflow-y-auto overscroll-contain">
                      {categoryLists.length ? categoryLists.map((list) => {
                        const selected = selectedListIds.includes(list.id);
                        return <DropdownMenuCheckboxItem
                          key={list.id}
                          className={`wish-card-list-item min-h-14 gap-2.5 px-2 py-1.5 pr-8 text-base ${selected ? "is-selected" : ""}`}
                          checked={selected}
                          disabled={busy}
                          closeOnClick={false}
                          onCheckedChange={(checked) => toggleList(list, checked)}
                        >
                          <span className="wish-card-list-icon grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground" aria-hidden="true"><ListPlus /></span>
                          <span className="min-w-0 flex-1 truncate">
                            {list.title}
                            {list.privacy !== "public" && <small className="ml-1 inline-flex align-middle text-muted-foreground" aria-hidden="true">
                              {list.privacy === "private" ? <LockKeyhole /> : list.privacy === "link" ? <Link2 /> : <Users />}
                            </small>}
                          </span>
                        </DropdownMenuCheckboxItem>;
                      }) : <p className="px-2 py-6 text-center text-xs text-muted-foreground">Создайте первый тематический список.</p>}
                    </div>
                    {listSelectionChanged && <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} closeOnClick={false} onClick={() => setSelectedListIds([...(wish.listIds || [])])}><RotateCcw /> Отменить изменения</DropdownMenuItem>
                      <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base font-medium" disabled={busy} closeOnClick={false} onClick={saveLists}>{busy ? <LoaderCircle className="spin" /> : <Check />} Сохранить списки</DropdownMenuItem>
                    </>}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>}
              {(!owner || wish.status !== "fulfilled") && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={share}><Share2 /> Поделиться</DropdownMenuItem>}
              {!owner && wish.url && <DropdownMenuItem nativeButton={false} className="min-h-12 gap-2 px-3 py-2 text-base" render={<a href={wish.url} target="_blank" rel="noreferrer" />}><ExternalLink /> Открыть магазин</DropdownMenuItem>}
              {owner && <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" className="danger min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} aria-haspopup="dialog" onClick={() => setDeleteOpen(true)}><Trash2 /> Удалить</DropdownMenuItem>
              </>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <h3>{wish.title}</h3>
        <p>{wish.description || "Без дополнительного описания"}</p>
        {owner ? <div className="wish-card__owner-meta">{secret ? <span><LockKeyhole /> Только вам</span> : <span><Eye /> Виден друзьям</span>}{wish.reservationCount > 0 && <span><Gift /> Кто-то готовит подарок</span>}</div> : <Button variant={wish.reservedByMe ? "reserved" : "outline"} loading={busy} icon={wish.reservedByMe ? Check : Gift} onClick={reserve} disabled={wish.status !== "active" || reservationUnavailable}>{wish.reservedByMe ? "Забронировано вами" : reservationUnavailable ? "Уже забронировано" : "Забронировать"}</Button>}
      </div>
    </Card>
    {deleteOpen && <Modal
      onClose={() => { if (!busy) setDeleteOpen(false); }}
      className="modal--wish-delete"
      ariaLabel={`Удаление желания «${wish.title}»`}
    >
      <div className="wish-delete-confirm">
        <span className="eyebrow">Удаление желания</span>
        <h2>Удалить «{wish.title}»?</h2>
        <p>Желание исчезнет из всех списков. Отменить это действие не получится.</p>
        <div className="modal-actions">
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setDeleteOpen(false)}>Отмена</Button>
          <Button type="button" variant="ghost" className="button--danger" icon={Trash2} loading={busy} onClick={async () => { if (await remove()) setDeleteOpen(false); }}>Удалить</Button>
        </div>
      </div>
    </Modal>}
    </>
  );
}

function WishesPage({ onAdd, version }) {
  const { user } = useSession();
  const toast = useToast();
  const { data, loading, reload } = useAsync(() => api.get("/dashboard"), [version]);
  const [selected, setSelected] = useState("all");
  const [selectedWishId, setSelectedWishId] = useState(null);
  const [editingWishId, setEditingWishId] = useState(null);
  const [listModal, setListModal] = useState(null);
  if (loading) return <LoadingScreen compact />;
  const activeWishes = data.wishes.filter((wish) => wish.status === "active");
  const categoryLists = data.lists.filter((list) => !isGeneralList(list));
  const wishes = selected === "all" ? activeWishes : activeWishes.filter((wish) => wish.listIds.includes(selected));
  const selectedList = categoryLists.find((list) => list.id === selected) || null;
  const selectedWish = selectedWishId ? data.wishes.find((wish) => wish.id === selectedWishId) : null;
  const editingWish = editingWishId ? data.wishes.find((wish) => wish.id === editingWishId) : null;
  const share = async () => {
    if (selected === "secret" || selectedList?.privacy === "private") {
      toast("Приватный список виден только вам", "error");
      return;
    }
    const url = selected === "all"
      ? `${window.location.origin}${publicProfilePath(user.username)}`
      : selectedList?.privacy === "link"
        ? `${window.location.origin}/s/${selectedList.shareToken}`
        : `${window.location.origin}${publicListPath(user.username, selectedList?.id)}`;
    await navigator.clipboard.writeText(url);
    toast("Ссылка на список скопирована");
  };
  const editWish = (id) => { setSelectedWishId(null); setEditingWishId(id); };
  const saveList = async (saved) => {
    const attachWishId = listModal?.attachWishId;
    let attached = true;
    setListModal(null);
    if (saved?.id && attachWishId) {
      try {
        await api.post(`/wishes/${encodeURIComponent(attachWishId)}/lists/${encodeURIComponent(saved.id)}`, {});
        toast(`Желание добавлено в новый список «${saved.title}»`);
      } catch (error) {
        attached = false;
        toast(error.message, "error");
      }
    }
    await reload();
    if (saved?.id && attached) setSelected(saved.id);
  };
  return <div className="app-page wishes-page"><header className="wishes-page__topbar"><Logo className="app-shell-logo" /><Button className="wishes-page__topbar-share h-12 px-5 text-base" variant="outline" icon={Share2} onClick={share}>Поделиться</Button></header><WishesProfileHero user={user} selectedList={selectedList} onEditList={setListModal} onAdd={onAdd} /><div className="list-tabs"><ToggleGroup className="contents" value={[selected]} onValueChange={(values) => { if (values[0]) setSelected(values[0]); }} aria-label="Списки желаний"><ToggleGroupItem value="all">Мои желания <span>{activeWishes.length}</span></ToggleGroupItem>{categoryLists.map((list) => <ToggleGroupItem value={list.id} key={list.id}>{list.privacy === "private" && <LockKeyhole size={14} />}{list.title} <span>{list.wishCount}</span></ToggleGroupItem>)}</ToggleGroup><ShadcnButton variant="ghost" size="icon" className="list-tabs__add" aria-label="Новый список" title="Новый список" onClick={() => setListModal({})}><Plus size={16} /><span className="visually-hidden">Новый список</span></ShadcnButton></div>{wishes.length ? <div className="wish-grid">{wishes.map((wish) => <WishCard key={wish.id} wish={wish} owner profile={user} lists={data.lists} onChanged={() => reload({ background: true })} onOpen={() => setSelectedWishId(wish.id)} onEdit={() => editWish(wish.id)} onCreateList={() => setListModal({ attachWishId: wish.id })} />)}</div> : <EmptyState icon={Heart} title="В этом списке пока пусто" text="Добавьте то, что действительно порадует." action={<Button icon={Plus} onClick={onAdd}>Добавить желание</Button>} />}{selectedWish && <WishDetailsModal wish={selectedWish} owner profile={user} lists={data.lists} wishes={data.wishes} onChanged={() => reload({ background: true })} onEdit={() => editWish(selectedWish.id)} onCreateList={() => { setSelectedWishId(null); setListModal({ attachWishId: selectedWish.id }); }} onClose={() => setSelectedWishId(null)} />}{editingWish && <WishModal wish={editingWish} onClose={() => setEditingWishId(null)} onSaved={async () => { setEditingWishId(null); await reload(); }} onDeleted={async () => { setEditingWishId(null); await reload(); }} />}{listModal && <ListModal list={listModal.id ? listModal : null} listsCount={data.lists.length} onClose={() => setListModal(null)} onSaved={saveList} onDeleted={async () => { setListModal(null); setSelected("all"); await reload(); }} />}</div>;
}

function Modal({ children, onClose, onEscape, finalFocus, className = "", ariaLabel = "Диалог Rollapp", backdropClassName = "" }) {
  const contentRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const onEscapeRef = useRef(onEscape);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { onEscapeRef.current = onEscape; }, [onEscape]);
  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => {
      window.requestAnimationFrame(() => {
        if (!document.querySelector('[data-slot="dialog-content"].modal')) document.body.classList.remove("modal-open");
      });
    };
  }, []);
  const handleOpenChange = (open, details) => {
    if (open) return;
    if (details.reason === "escape-key" && onEscapeRef.current?.(details.event)) {
      details.cancel();
      return;
    }
    onCloseRef.current();
  };
  return <Dialog open onOpenChange={handleOpenChange}>
    <DialogContent
      ref={contentRef}
      initialFocus={() => contentRef.current?.querySelector("[autofocus], [data-modal-initial-focus]") || true}
      showCloseButton={false}
      viewportClassName={`modal-backdrop ${backdropClassName}`}
      className={`modal ${className}`}
      aria-label={ariaLabel}
      finalFocus={finalFocus}
    >
      <DialogTitle className="visually-hidden">{ariaLabel}</DialogTitle>
      {children}
      <DialogClose type="button" className="modal__close" data-modal-initial-focus aria-label="Закрыть диалог"><X /></DialogClose>
    </DialogContent>
  </Dialog>;
}

function WishDetailsModal({ wish, owner = false, profile, shareToken = "", lists = [], onChanged, onEdit, onCreateList, onClose }) {
  const categoryLists = useMemo(() => lists.filter((list) => !isGeneralList(list)), [lists]);
  const normalizeListIds = useCallback((ids = []) => categoryLists.filter((list) => ids.includes(list.id)).map((list) => list.id), [categoryLists]);
  const [listsOpen, setListsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedListIds, setSelectedListIds] = useState(() => normalizeListIds(wish.listIds));
  const listMutationRef = useRef(false);
  const { busy, reserve, remove, fulfilled, share, save, update, repeat } = useWishActions({
    wish,
    profile,
    lists,
    shareToken,
    onChanged,
    onDeleted: onClose,
  });
  const reservationUnavailable = wish.reservationCount > 0 && !wish.allowMultiple && !wish.reservedByMe;
  const secretListMembership = lists.some((list) => list.privacy === "private" && wish.listIds?.includes(list.id));
  const linkedLists = categoryLists.filter((list) => selectedListIds.includes(list.id));
  const linkedListNames = linkedLists.map((list) => list.title);
  const listLabel = linkedListNames.length > 1 ? `${linkedListNames[0]} +${linkedListNames.length - 1}` : linkedListNames[0] || "Без списка";
  const listTitleText = linkedListNames.join(", ") || "Без списка";

  useEffect(() => {
    if (!listMutationRef.current) setSelectedListIds(normalizeListIds(wish.listIds));
  }, [wish.id, wish.listIds, normalizeListIds]);

  useEffect(() => {
    if (!listsOpen && !menuOpen) return undefined;
    const closeTransientMenus = () => {
      setListsOpen(false);
      setMenuOpen(false);
    };
    window.addEventListener("resize", closeTransientMenus);
    return () => window.removeEventListener("resize", closeTransientMenus);
  }, [listsOpen, menuOpen]);

  const toggleList = async (list) => {
    if (busy || listMutationRef.current) return;
    const previousIds = [...selectedListIds];
    const selected = previousIds.includes(list.id);
    const nextIds = selected
      ? previousIds.filter((id) => id !== list.id)
      : [...previousIds, list.id];
    listMutationRef.current = true;
    setSelectedListIds(nextIds);
    const updatedWish = await update(
      { listIds: nextIds },
      selected ? `Желание убрано из списка «${list.title}»` : `Желание добавлено в список «${list.title}»`,
    );
    setSelectedListIds(updatedWish ? normalizeListIds(updatedWish.listIds) : previousIds);
    listMutationRef.current = false;
  };

  const renderListPickerBody = () => <>
    <div className="card-menu__lists-head">
      <strong>Списки</strong>
      {onCreateList && <DropdownMenuItem className="card-menu__create-list" disabled={busy} onClick={onCreateList}><ListPlus /> Новый список</DropdownMenuItem>}
    </div>
    <div className="card-menu__list-scroll">
      {categoryLists.length ? categoryLists.map((list) => {
        const selected = selectedListIds.includes(list.id);
        return <DropdownMenuCheckboxItem
          key={list.id}
          className={`card-menu__list-row min-h-12 gap-2.5 px-2 py-1.5 [&_[data-slot=dropdown-menu-checkbox-item-indicator]]:hidden ${selected ? "is-selected" : ""}`}
          checked={selected}
          disabled={busy}
          closeOnClick={false}
          onCheckedChange={() => toggleList(list)}
        >
          <span className="card-menu__list-title">
            {list.title}
            {list.privacy !== "public" && <small className="card-menu__list-privacy" aria-hidden="true">
              {list.privacy === "private" ? <LockKeyhole /> : list.privacy === "link" ? <Link2 /> : <Users />}
            </small>}
          </span>
          <span className="card-menu__list-state">{selected ? <Check /> : <Plus />}</span>
        </DropdownMenuCheckboxItem>;
      }) : <p className="card-menu__lists-empty">Создайте первый тематический список.</p>}
    </div>
  </>;

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent>
          <Card data-slot="wish-media" className="relative overflow-hidden p-0">
            {wish.imageUrl
              ? <img className="block h-auto w-full" src={wish.imageUrl} alt={`Фото желания «${wish.title}»`} />
              : <span className="grid aspect-[4/3] w-full place-items-center text-muted-foreground"><Gift /></span>}
            {wish.status === "fulfilled" && <Badge variant="secondary" className="absolute right-2 bottom-2"><Check /> Исполнено</Badge>}
          </Card>

          <DialogHeader>
            <DialogTitle><span className="sr-only">Желание: </span>{wish.title}</DialogTitle>
            <div data-slot="wish-price-row" className="w-full">
              <strong data-slot="wish-price" className="text-lg font-semibold">{formatMoney(wish.price, wish.currency)}</strong>
            </div>
            <DialogDescription>{wish.description || "Автор пока не добавил описание — иногда желание говорит само за себя."}</DialogDescription>
          </DialogHeader>

          <div data-slot="wish-toolbar" className="flex min-w-0 items-center gap-2">
            {owner
              ? <DropdownMenu open={listsOpen} onOpenChange={(open) => {
                  setListsOpen(open);
                  if (open) setMenuOpen(false);
                }}>
                  <DropdownMenuTrigger
                    render={<ShadcnButton variant="outline" className="h-12 min-w-0 flex-1 justify-between" />}
                    aria-label={`Изменить списки желания. Сейчас: ${listTitleText}`}
                  >
                    <span className="truncate">{listLabel}</span>{listsOpen ? <X /> : <ChevronDown />}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    id={`wish-detail-lists-${wish.id}`}
                    className="max-h-[calc(100dvh-12px)] w-64 max-w-[calc(100vw-12px)] [&_[data-slot=dropdown-menu-item]]:min-h-12"
                    align="start"
                    sideOffset={4}
                    aria-label={`Списки желания «${wish.title}»`}
                  >
                    {renderListPickerBody()}
                  </DropdownMenuContent>
                </DropdownMenu>
              : <Badge variant="secondary" className="max-w-full truncate">{listLabel}</Badge>}

          </div>

          {wish.url && <ShadcnButton nativeButton={false} render={<a href={wish.url} target="_blank" rel="noreferrer" />} className="wish-buy-action h-12 w-full">Где купить <ExternalLink /></ShadcnButton>}

          {!owner && <Alert><Hand /><AlertDescription>Если вы решили исполнить это желание, обязательно забронируйте его, чтобы никто другой не подарил то же самое.</AlertDescription></Alert>}

          <DialogFooter className="flex-row items-center justify-end">
            {!owner && <ShadcnButton className="h-12 min-w-0 flex-1" disabled={busy || wish.status !== "active" || reservationUnavailable} aria-busy={busy || undefined} onClick={reserve}>{busy ? <Spinner /> : <Gift />}{wish.reservedByMe ? "Забронировано вами" : reservationUnavailable ? "Уже забронировано" : "Забронировать"}</ShadcnButton>}
            {owner && <ShadcnButton className="h-12 min-w-0 flex-1" variant="outline" disabled={busy} aria-busy={busy || undefined} onClick={fulfilled}>{busy ? <Spinner /> : <PackageCheck />}{wish.status === "fulfilled" ? "Вернуть в активные" : "Отметить исполненным"}</ShadcnButton>}
            <DropdownMenu open={menuOpen} onOpenChange={(open) => {
              setMenuOpen(open);
              if (open) setListsOpen(false);
            }}>
              <DropdownMenuTrigger
                render={<ShadcnButton variant="outline" size="icon" className="size-12" />}
                aria-label={`Опции желания «${wish.title}»`}
                title="Опции желания"
              ><MoreHorizontal /></DropdownMenuTrigger>
              <DropdownMenuContent
                id={`wish-detail-menu-${wish.id}`}
                className="max-h-[calc(100dvh-12px)] w-64 max-w-[calc(100vw-12px)] [&_[data-slot=dropdown-menu-item]]:min-h-12 [&_[data-slot=dropdown-menu-sub-trigger]]:min-h-12"
                align="end"
                sideOffset={4}
                aria-label={`Действия с желанием «${wish.title}»`}
              >
                <DropdownMenuGroup>
                  {!owner && <DropdownMenuItem disabled={busy || wish.status !== "active" || reservationUnavailable} onClick={reserve}><Gift /> {wish.reservedByMe ? "Снять бронь" : "Забронировать"}</DropdownMenuItem>}
                  {!owner && <DropdownMenuItem disabled={busy} onClick={save}><Archive /> Сохранить к себе</DropdownMenuItem>}
                  {owner && wish.status === "fulfilled" ? <>
                    <DropdownMenuItem disabled={busy} onClick={fulfilled}><RotateCcw /> Не исполнено</DropdownMenuItem>
                    <DropdownMenuItem disabled={busy} onClick={repeat}><Plus /> Загадать ещё раз</DropdownMenuItem>
                    {onEdit && <DropdownMenuItem disabled={busy} aria-haspopup="dialog" onClick={onEdit}><Pencil /> Редактировать</DropdownMenuItem>}
                  </> : owner && <>
                    <DropdownMenuItem disabled={busy} onClick={fulfilled}><Check /> Исполнено</DropdownMenuItem>
                    {onEdit && <DropdownMenuItem disabled={busy} aria-haspopup="dialog" onClick={onEdit}><Pencil /> Редактировать</DropdownMenuItem>}
                    {secretListMembership
                      ? <DropdownMenuItem disabled><LockKeyhole /> Секретное в списке</DropdownMenuItem>
                      : <DropdownMenuItem
                        disabled={busy}
                        onClick={() => {
                          const nextPrivacy = wish.privacy === "private" ? "inherit" : "private";
                          update(
                            { privacy: nextPrivacy },
                            nextPrivacy === "private" ? "Желание стало секретным" : "Желание снова видно друзьям",
                          );
                        }}
                      >
                        {wish.privacy === "private" ? <Eye /> : <EyeOff />}
                        {wish.privacy === "private" ? "Сделать видимым" : "Сделать секретным"}
                      </DropdownMenuItem>}
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger disabled={busy}><ListPlus /> <span>Добавить в список</span></DropdownMenuSubTrigger>
                      <DropdownMenuSubContent
                        id={`wish-detail-action-lists-${wish.id}`}
                        className="max-h-[calc(100dvh-12px)] w-64 max-w-[calc(100vw-12px)] [&_[data-slot=dropdown-menu-item]]:min-h-12"
                        sideOffset={4}
                        aria-label={`Списки желания «${wish.title}»`}
                      >
                        {renderListPickerBody()}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>}
                  {(!owner || wish.status !== "fulfilled") && <DropdownMenuItem disabled={busy} onClick={share}><Share2 /> Поделиться</DropdownMenuItem>}
                  {!owner && wish.url && <DropdownMenuItem nativeButton={false} render={<a href={wish.url} target="_blank" rel="noreferrer" />}><ExternalLink /> Открыть магазин</DropdownMenuItem>}
                  {owner && <DropdownMenuItem variant="destructive" disabled={busy} aria-haspopup="dialog" onClick={() => setDeleteOpen(true)}><Trash2 /> Удалить</DropdownMenuItem>}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {deleteOpen && <Modal
        onClose={() => {
          if (busy) return;
          setDeleteOpen(false);
        }}
        className="modal--wish-delete"
        backdropClassName="modal-backdrop--detail-delete"
        ariaLabel={`Удаление желания «${wish.title}»`}
      >
        <div className="wish-delete-confirm">
          <span className="eyebrow">Удаление желания</span>
          <h2>Удалить «{wish.title}»?</h2>
          <p>Желание исчезнет из всех списков. Отменить это действие не получится.</p>
          <div className="modal-actions">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setDeleteOpen(false)}>Отмена</Button>
            <Button type="button" variant="ghost" className="button--danger" icon={Trash2} loading={busy} onClick={async () => { if (await remove()) setDeleteOpen(false); }}>Удалить</Button>
          </div>
        </div>
      </Modal>}
    </>
  );
}

function ListModal({ list = null, listsCount = 0, onClose, onSaved, onDeleted, returnFocusRef }) {
  const editing = Boolean(list?.id);
  const toast = useToast();
  const secretListId = useId();
  const secretListDescriptionId = useId();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState(() => ({
    title: list?.title || "",
    description: list?.description || "",
    privacy: list?.privacy || "public",
  }));
  useEffect(() => () => {
    const target = returnFocusRef?.current;
    if (!target) return;
    window.requestAnimationFrame(() => {
      if (target.isConnected) target.focus();
    });
  }, [returnFocusRef]);
  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const result = editing ? await api.patch(`/lists/${list.id}`, form) : await api.post("/lists", form);
      toast(editing ? "Настройки списка сохранены" : "Новый список создан");
      await onSaved?.(result.list);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };
  const remove = async () => {
    if (!editing || deleting) return;
    setDeleting(true);
    try {
      const result = await api.delete(`/lists/${list.id}`);
      toast(result.reassignedCount ? `Список удалён, ${result.reassignedCount} желаний сохранено` : "Список удалён");
      setDeleteOpen(false);
      await onDeleted?.(result);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setDeleting(false);
    }
  };
  return <><Modal onClose={onClose} className="modal--list" ariaLabel={editing ? `Настройки списка: ${list.title}` : "Создание списка"}><form className="modal-form" onSubmit={submit}><div className="modal-heading"><div>{editing && <span className="eyebrow">Настройки списка</span>}<h2>{editing ? "Изменить список" : "Создать список"}</h2></div></div><label><span>Название</span><Input className="h-12 px-4 text-base md:text-base" autoFocus required placeholder="Например, Новоселье" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label><span>Описание</span><Textarea className="min-h-24 px-4 py-3 text-base md:text-base" rows={3} placeholder="Расскажите друзьям о списке" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><Field orientation="horizontal" className="min-h-14 items-center gap-4 px-1"><div className="min-w-0 flex-1"><FieldLabel className="cursor-pointer text-base font-semibold" htmlFor={secretListId}>Секретный список</FieldLabel><FieldDescription className="mt-1" id={secretListDescriptionId}>Все желания в этом списке будут видны только вам.</FieldDescription></div><Switch id={secretListId} type="button" aria-describedby={secretListDescriptionId} checked={form.privacy === "private"} disabled={loading} onCheckedChange={(checked) => setForm((current) => ({ ...current, privacy: checked ? "private" : "public" }))} /></Field>{editing && <div className="list-danger"><div><strong>Удалить список</strong><span>Желания не пропадут и будут перенесены в оставшийся список.</span></div><Button type="button" variant="ghost" className="button--danger" icon={Trash2} loading={deleting} disabled={listsCount <= 1} onClick={() => setDeleteOpen(true)}>Удалить</Button></div>}<div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Отмена</Button><Button type="submit" loading={loading}>{editing ? "Сохранить изменения" : "Создать список"}</Button></div></form></Modal>{deleteOpen && <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить «{list.title}»?</AlertDialogTitle><AlertDialogDescription>Желания из этого списка останутся в вашем общем списке. Отменить удаление списка не получится.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel><AlertDialogAction className="bg-destructive/10 text-destructive hover:bg-destructive/20" disabled={deleting} onClick={remove}>{deleting ? <Spinner /> : <Trash2 />} Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}</>;
}

function WishModal({ onClose, onSaved, onDeleted, wish = null }) {
  const editing = Boolean(wish?.id);
  const toast = useToast();
  const { data, loading: listsLoading, reload: reloadDashboard } = useAsync(() => api.get("/dashboard"), []);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageDropActive, setImageDropActive] = useState(false);
  const [imageError, setImageError] = useState("");
  const [listCreatorOpen, setListCreatorOpen] = useState(false);
  const [metadata, setMetadata] = useState({ status: "idle", message: "" });
  const [form, setForm] = useState(() => wishFormFrom(wish));
  const autoTimerRef = useRef(null);
  const metadataRequestRef = useRef(0);
  const editedMetadataFieldsRef = useRef(new Set());
  const imageFileRef = useRef(null);
  const uploadedImageIdsRef = useRef(new Set());
  const mutationRef = useRef(null);
  const deleteTriggerRef = useRef(null);
  const listCreatorTriggerRef = useRef(null);
  const deleteConfirmRef = useRef(null);
  const restoreDeleteFocusRef = useRef(false);
  const selectableLists = data?.lists?.filter((list) => !isGeneralList(list)) || [];
  useEffect(() => {
    if (!data?.lists) return;
    const generalIds = new Set(data.lists.filter(isGeneralList).map((list) => list.id));
    setForm((current) => {
      const nextListIds = current.listIds.filter((id) => !generalIds.has(id));
      return nextListIds.length === current.listIds.length ? current : { ...current, listIds: nextListIds };
    });
  }, [data]);
  const recognize = async (sourceUrl = form.url) => {
    const url = sourceUrl.trim();
    window.clearTimeout(autoTimerRef.current);
    if (!url) { setMetadata({ status: "idle", message: "" }); return false; }
    if (!isProductUrl(url)) { setMetadata({ status: "error", message: "Нужна полная ссылка, начинающаяся с http:// или https://" }); return false; }
    const requestId = ++metadataRequestRef.current;
    setMetadata({ status: "loading", message: "Ищем название, фотографию и цену на странице магазина…" });
    try {
      const meta = await api.post("/metadata", { url });
      if (requestId !== metadataRequestRef.current) return false;
      const values = {
        title: typeof meta.title === "string" ? meta.title.trim() : "",
        description: typeof meta.description === "string" ? meta.description.trim() : "",
        imageUrl: typeof meta.imageUrl === "string" ? meta.imageUrl.trim() : "",
        price: meta.price == null || meta.price === "" ? "" : String(meta.price),
        currency: typeof meta.currency === "string" && WISH_CURRENCIES.includes(meta.currency.toUpperCase()) ? meta.currency.toUpperCase() : "",
      };
      const foundFields = ["title", "description", "imageUrl", "price"].filter((field) => values[field] !== "");
      if (foundFields.length === 0) {
        setMetadata({ status: "error", message: "Магазин не отдал данные товара. Можно повторить попытку или заполнить карточку вручную." });
        return false;
      }
      const appliedFields = Object.keys(values).filter((field) => values[field] !== "" && !editedMetadataFieldsRef.current.has(field));
      setForm((current) => {
        if (current.url.trim() !== url) return current;
        const next = { ...current };
        appliedFields.forEach((field) => { next[field] = values[field]; });
        return next;
      });
      const complete = ["title", "imageUrl", "price"].every((field) => values[field] !== "");
      setMetadata({ status: "success", message: appliedFields.length === 0 ? "Данные страницы найдены, а ваши ручные правки оставлены без изменений." : complete ? "Название, фото и цена уже в карточке — осталось всё проверить." : "Подставили всё, что удалось найти на странице. Проверьте карточку." });
      return true;
    } catch (error) {
      if (requestId !== metadataRequestRef.current) return false;
      setMetadata({ status: "error", message: error.message || "Не удалось прочитать страницу магазина." });
      return false;
    }
  };
  useEffect(() => {
    if (editing) return undefined;
    window.clearTimeout(autoTimerRef.current);
    metadataRequestRef.current += 1;
    const url = form.url.trim();
    if (!url || !isProductUrl(url)) { setMetadata({ status: "idle", message: "" }); return undefined; }
    setMetadata({ status: "waiting", message: "Ссылка принята — через мгновение заполним карточку." });
    autoTimerRef.current = window.setTimeout(() => { recognize(url); }, 600);
    return () => window.clearTimeout(autoTimerRef.current);
  }, [form.url, editing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { window.clearTimeout(autoTimerRef.current); metadataRequestRef.current += 1; }, []);
  const updateMetadataField = (field, value) => { editedMetadataFieldsRef.current.add(field); setForm((current) => ({ ...current, [field]: value })); };
  const cleanupUploadedImages = async (keepUrl = "") => {
    const keepId = uploadedImageIdFromUrl(keepUrl);
    const ids = [...uploadedImageIdsRef.current].filter((id) => id !== keepId);
    ids.forEach((id) => uploadedImageIdsRef.current.delete(id));
    await Promise.allSettled(ids.map((id) => api.delete(`/uploads/images/${encodeURIComponent(id)}`)));
  };
  useEffect(() => () => {
    const ids = [...uploadedImageIdsRef.current];
    uploadedImageIdsRef.current.clear();
    ids.forEach((id) => {
      fetch(`/api/uploads/images/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
        keepalive: true,
      }).catch(() => {});
    });
  }, []);
  const uploadImage = async (file) => {
    if (!file || imageUploading) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setImageError("Подойдёт изображение JPG, PNG или WEBP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setImageError("Изображение должно быть не больше 8 МБ.");
      return;
    }
    setImageUploading(true);
    setImageError("");
    try {
      const result = await api.uploadImage(file);
      uploadedImageIdsRef.current.add(result.id);
      updateMetadataField("imageUrl", result.imageUrl);
    } catch (error) {
      setImageError(error.message || "Не удалось загрузить изображение.");
    } finally {
      setImageUploading(false);
      setImageDropActive(false);
      if (imageFileRef.current) imageFileRef.current.value = "";
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (mutationRef.current || deleting) return;
    mutationRef.current = "save";
    setLoading(true);
    try {
      const payload = { ...form, price: form.price === "" ? null : Number(form.price) };
      const result = editing ? await api.patch(`/wishes/${wish.id}`, payload) : await api.post("/wishes", payload);
      const savedUploadId = uploadedImageIdFromUrl(result.wish?.imageUrl);
      if (savedUploadId) uploadedImageIdsRef.current.delete(savedUploadId);
      await cleanupUploadedImages(result.wish?.imageUrl || "");
      toast(editing ? "Изменения сохранены" : "Желание добавлено ✦");
      await onSaved?.(result.wish);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      mutationRef.current = null;
      setLoading(false);
    }
  };
  const remove = async () => {
    if (mutationRef.current || loading || deleting) return;
    mutationRef.current = "delete";
    setDeleting(true);
    try {
      await api.delete(`/wishes/${wish.id}`);
      toast("Желание удалено");
      if (onDeleted) await onDeleted();
      else onClose();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      mutationRef.current = null;
      setDeleting(false);
    }
  };
  const setListSelected = (id, selected) => setForm((current) => ({
    ...current,
    listIds: selected
      ? (current.listIds.includes(id) ? current.listIds : [...current.listIds, id])
      : current.listIds.filter((item) => item !== id),
  }));
  const metadataNotice = metadata.status !== "idle" && <div className={`metadata-status metadata-status--${metadata.status}`} role="status" aria-live="polite"><span className="metadata-status__icon">{["waiting", "loading"].includes(metadata.status) ? <LoaderCircle className="spin" /> : metadata.status === "success" ? <CheckCircle2 /> : <X />}</span><div><strong>{metadata.status === "waiting" ? "Готовим автозаполнение" : metadata.status === "loading" ? "Читаем карточку товара" : metadata.status === "success" ? "Готово" : "Не получилось автоматически"}</strong><span>{metadata.message}</span></div>{metadata.status === "error" && form.url && <ShadcnButton variant="ghost" type="button" onClick={() => recognize(form.url)}>Повторить</ShadcnButton>}</div>;
  const requestClose = () => {
    if (loading || deleting || imageUploading) return;
    cleanupUploadedImages();
    onClose();
  };
  const cancelDelete = () => {
    if (deleting) return;
    restoreDeleteFocusRef.current = true;
    setDeleteConfirm(false);
  };
  useEffect(() => {
    if (!editing) return undefined;
    let settleFrame;
    const focusFrame = window.requestAnimationFrame(() => {
      settleFrame = window.requestAnimationFrame(() => {
        if (deleteConfirm) {
          deleteConfirmRef.current?.querySelector("button:not(:disabled)")?.focus();
          return;
        }
        if (restoreDeleteFocusRef.current) {
          restoreDeleteFocusRef.current = false;
          deleteTriggerRef.current?.focus();
        }
      });
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.cancelAnimationFrame(settleFrame);
    };
  }, [deleteConfirm, editing]);

  if (editing && deleteConfirm) {
    return <Modal
      onClose={cancelDelete}
      className="modal--wish-delete"
      ariaLabel={`Удаление желания «${wish.title}»`}
    >
      <div className="wish-delete-confirm" ref={deleteConfirmRef}>
        <span className="eyebrow">Удаление желания</span>
        <h2>Удалить «{wish.title}»?</h2>
        <p>Желание исчезнет из всех списков. Отменить это действие не получится.</p>
        <div className="modal-actions">
          <Button type="button" variant="ghost" data-modal-initial-focus disabled={deleting} onClick={cancelDelete}>Отмена</Button>
          <Button type="button" variant="ghost" className="button--danger" icon={Trash2} loading={deleting} onClick={remove}>Удалить</Button>
        </div>
      </div>
    </Modal>;
  }

  const fieldId = (name) => `wish-editor-${name}-${wish?.id || "new"}`;
  return <>
    <Dialog open onOpenChange={(open) => { if (!open) requestClose(); }}>
      <DialogContent>
        <form className={`wish-editor contents ${editing ? "wish-editor--edit" : "wish-editor--create"}`} onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              <span className="sr-only">{editing ? `Редактирование желания «${wish.title}»` : "Создание желания"}</span>
              <span aria-hidden="true">{editing ? "Редактировать желание" : "Новое желание"}</span>
            </DialogTitle>
            <DialogDescription>{editing ? "Обновите информацию, изображение и списки желания." : "Добавьте изображение и заполните основную информацию о желании."}</DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[calc(100dvh-18rem)] max-h-[32rem] min-h-0" aria-label="Поля желания">
            <div className="wish-editor__layout m-0 flex h-auto w-full flex-col gap-4 overflow-visible p-0 pr-3">
          <section className="wish-editor__media h-auto w-full gap-2" aria-label="Фотография желания">
            <div
              className={`wish-editor__image aspect-[4/3] h-auto min-h-0 rounded-lg ${form.imageUrl ? "has-image" : "is-empty"} ${imageDropActive ? "is-dragging" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); if (!imageUploading) setImageDropActive(true); }}
              onDragOver={(event) => { event.preventDefault(); if (!imageUploading) setImageDropActive(true); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setImageDropActive(false); }}
              onDrop={(event) => {
                event.preventDefault();
                setImageDropActive(false);
                uploadImage(event.dataTransfer.files?.[0]);
              }}
            >
              {form.imageUrl
                ? <img src={form.imageUrl} alt={`Фото желания «${form.title || wish?.title || "Новое желание"}»`} />
                : <ShadcnButton
                  type="button"
                  variant="ghost"
                  className="wish-editor__image-empty h-full w-full max-w-none flex-col gap-1.5 overflow-hidden rounded-[inherit] border-0 bg-transparent p-3 text-center whitespace-normal shadow-none hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent [&>span]:text-xs [&>span]:leading-4 [&>strong]:text-sm [&>strong]:leading-4 [&_svg:not([class*='size-'])]:size-8"
                  disabled={imageUploading}
                  onClick={() => imageFileRef.current?.click()}
                >
                  {imageUploading ? <LoaderCircle className="spin" /> : <Image />}
                  <strong>{imageUploading ? "Загружаем изображение…" : "Добавить изображение"}</strong>
                  <span>JPG, PNG или WEBP · до 8 МБ</span>
                </ShadcnButton>}
              <Input
                ref={imageFileRef}
                className="sr-only !size-px"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Загрузить фотографию желания"
                onChange={(event) => uploadImage(event.target.files?.[0])}
              />
              {form.imageUrl && <ShadcnButton type="button" variant="secondary" className="wish-editor__image-change" disabled={imageUploading} onClick={() => imageFileRef.current?.click()}><Upload /> Сменить фото</ShadcnButton>}
            </div>
            {imageError && <p className="wish-editor__image-error" role="alert">{imageError}</p>}
          </section>

          <section className="wish-editor__panel w-full overflow-visible p-0">
            <div className="wish-editor__scroll flex h-auto w-full flex-col gap-4 overflow-visible p-0 [scrollbar-gutter:auto]">
              <Field className="wish-editor__field">
                <FieldLabel htmlFor={fieldId("title")}>Название</FieldLabel>
                <Input className="h-12 text-base md:text-base" id={fieldId("title")} autoFocus={editing} required value={form.title} placeholder="Название желания" onChange={(event) => updateMetadataField("title", event.target.value)} />
              </Field>

              <Field className="wish-editor__field wish-editor__field--link grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto] items-center gap-2">
                <FieldLabel className="col-start-1 row-start-1" htmlFor={fieldId("url")}>Ссылка</FieldLabel>
                <Input className="col-span-2 row-start-2 h-12 text-base md:text-base" id={fieldId("url")} autoFocus={!editing} type="url" inputMode="url" value={form.url} placeholder="https://…" onChange={(event) => updateMetadataField("url", event.target.value)} />
                <ShadcnButton className="wish-editor__link-action col-start-2 row-start-1 h-12 justify-self-end px-4" type="button" variant="ghost" disabled={!form.url.trim() || metadata.status === "loading"} onClick={() => recognize(form.url)}>
                  {metadata.status === "loading" ? <LoaderCircle className="spin" /> : <Sparkles />}
                  <span>{metadata.status === "loading" ? "Заполняем…" : "Заполнить по ссылке"}</span>
                </ShadcnButton>
              </Field>

              {metadataNotice}

              <Field className="wish-editor__field wish-editor__field--description">
                <FieldLabel className="sr-only" htmlFor={fieldId("description")}>Описание желания</FieldLabel>
                <Textarea className="min-h-24 resize-none text-base md:text-base" id={fieldId("description")} rows={3} value={form.description} placeholder="Опишите желание" onChange={(event) => updateMetadataField("description", event.target.value)} />
              </Field>

              <Field className="wish-editor__field wish-editor__field--price grid grid-cols-[minmax(0,1fr)_84px] grid-rows-[auto_auto] items-center gap-2">
                <FieldLabel className="col-span-2 row-start-1" htmlFor={fieldId("price")}>Цена</FieldLabel>
                <Input className="col-start-1 row-start-2 h-12 text-base md:text-base" id={fieldId("price")} type="number" min="0" value={form.price} placeholder="0" onChange={(event) => updateMetadataField("price", event.target.value)} />
                <Select value={form.currency} onValueChange={(currency) => updateMetadataField("currency", currency)}>
                  <SelectTrigger className="wish-editor__currency col-start-2 row-start-2 h-12 w-full px-4 text-base md:text-base" aria-label="Валюта">
                    <SelectValue>{(currency) => WISH_CURRENCY_SYMBOLS[currency] || ""}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="min-w-0" align="end" alignItemWithTrigger={false}>
                    {WISH_CURRENCIES.map((currency) => <SelectItem className="min-h-12 px-3 text-base" value={currency} key={currency} aria-label={`${WISH_CURRENCY_SYMBOLS[currency]} ${currency}`}>{WISH_CURRENCY_SYMBOLS[currency]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>

              <div className="wish-editor__settings flex flex-col gap-2" role="group" aria-label="Настройки желания">
                <label className="wish-editor__switch-row flex min-h-12 w-full items-center gap-3 px-1">
                  <EyeOff />
                  <span><strong>Секретное желание</strong></span>
                  <Switch checked={form.privacy === "private"} onCheckedChange={(checked) => setForm({ ...form, privacy: checked ? "private" : "inherit" })} />
                </label>
                <label className="wish-editor__switch-row flex min-h-12 w-full items-center gap-3 px-1">
                  <LockKeyhole />
                  <span><strong>Многократное бронирование</strong></span>
                  <Switch checked={form.allowMultiple} onCheckedChange={(checked) => setForm({ ...form, allowMultiple: checked })} />
                </label>
              </div>

              <fieldset className="wish-editor__lists">
                <legend className="visually-hidden">Списки желания</legend>
                <div className="wish-editor__lists-head">
                  <strong>Списки</strong>
                  <ShadcnButton ref={listCreatorTriggerRef} type="button" variant="ghost" disabled={loading || deleting} onClick={() => { if (!mutationRef.current) setListCreatorOpen(true); }}><ListPlus /> Новый список</ShadcnButton>
                </div>
                {listsLoading ? <LoadingScreen compact /> : <div className="wish-editor__list-rows">
                  {selectableLists.map((list) => {
                    const selected = form.listIds.includes(list.id);
                    return <label className={`wish-editor__list-row flex min-h-12 w-full items-center gap-3 rounded-lg px-1.5 py-1.5 ${selected ? "is-selected" : ""}`} key={list.id}>
                      <span className="wish-editor__list-title">{list.title}</span>
                      <Switch
                        className="wish-editor__list-switch"
                        checked={selected}
                        onCheckedChange={(checked) => setListSelected(list.id, checked)}
                      />
                    </label>;
                  })}
                </div>}
              </fieldset>
            </div>
          </section>
            </div>
          </ScrollArea>

          <DialogFooter>
            {editing && <ShadcnButton ref={deleteTriggerRef} type="button" variant="destructive" className="wish-editor__delete static mr-auto h-12 w-auto rounded-lg px-4" aria-label="Удалить желание" disabled={loading || deleting || imageUploading} onClick={() => { if (!mutationRef.current && !loading && !deleting) setDeleteConfirm(true); }}><Trash2 /> Удалить</ShadcnButton>}
            <ShadcnButton className="wish-editor__submit h-12" type="submit" disabled={loading || deleting || imageUploading} aria-busy={loading || undefined} aria-label={editing ? "Обновить" : "Загадать желание"}>
              {loading && <Spinner />}{editing ? "Обновить" : "Загадать желание"}
            </ShadcnButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
      {listCreatorOpen && <ListModal
        listsCount={data?.lists?.length || 0}
        returnFocusRef={listCreatorTriggerRef}
        onClose={() => setListCreatorOpen(false)}
        onSaved={async (saved) => {
          if (saved?.id) {
            setForm((current) => current.listIds.includes(saved.id)
              ? current
              : { ...current, listIds: [...current.listIds, saved.id] });
          }
          try {
            await reloadDashboard({ background: true });
          } catch {
            toast("Список создан, но перечень не обновился. Откройте редактор ещё раз.", "error");
          }
          setListCreatorOpen(false);
        }}
      />}
    </>;
}

const friendSections = {
  subscriptions: {
    label: "Подписки",
    icon: Users,
    placeholder: "Поиск по подпискам",
    emptyTitle: "Подписок пока нет",
    emptyText: "Найдите близких и подпишитесь на их желания.",
  },
  followers: {
    label: "Подписчики",
    icon: CircleUserRound,
    placeholder: "Поиск по подписчикам",
    emptyTitle: "Подписчиков пока нет",
    emptyText: "Когда кто-то подпишется на вас, он появится здесь.",
  },
  search: {
    label: "Найти друзей",
    icon: UserPlus,
    placeholder: "Имя или @профиль",
    emptyTitle: "Никого не нашли",
    emptyText: "Попробуйте изменить имя или адрес профиля.",
    scope: "discover",
  },
};

function FriendsPage() {
  const { section: requestedSection } = useParams();
  const section = friendSections[requestedSection] ? requestedSection : null;
  const config = section ? friendSections[section] : null;
  const [search, setSearch] = useState("");
  const [busyPersonId, setBusyPersonId] = useState(null);
  const toast = useToast();
  const EmptyIcon = config?.icon || Users;
  const scope = config?.scope || section;
  const { data, loading, error, reload } = useAsync(
    () => api.get(`/people?scope=${encodeURIComponent(scope || "subscriptions")}&search=${encodeURIComponent(search)}`),
    [scope, search],
  );

  useEffect(() => {
    setSearch("");
  }, [section]);

  if (!section) return <Navigate to="/app/friends/subscriptions" replace />;

  const toggleFollow = async (person) => {
    setBusyPersonId(person.id);
    try {
      const result = await api.post(`/profile/${person.username}/follow`, {});
      toast(result.following ? `Вы подписались на ${person.name}` : `Вы отписались от ${person.name}`);
      await reload();
    } catch (followError) {
      toast(followError.message, "error");
    } finally {
      setBusyPersonId(null);
    }
  };

  return (
    <div className="app-page friends-page">
      <div className="friends-layout">
        <section className="friends-directory" aria-labelledby="friends-title">
          <div className="friends-directory__heading">
            <h1 id="friends-title">{config.label}</h1>
          </div>
          <nav className="friends-section-nav" aria-label="Разделы друзей">
            {Object.entries(friendSections).map(([key, item]) => {
              const Icon = item.icon;
              const active = key === section;
              return <Link
                key={key}
                to={`/app/friends/${key}`}
                data-slot="button"
                aria-current={active ? "page" : undefined}
                className={buttonVariants({ variant: active ? "secondary" : "ghost", className: "h-12 gap-2 px-4 text-base" })}
              >
                <Icon aria-hidden="true" />
                {item.label}
              </Link>;
            })}
          </nav>
          <label className="friends-search">
            <Search aria-hidden="true" />
            <span className="visually-hidden">{config.placeholder}</span>
            <Input
              className="h-full rounded-full border-0 bg-transparent px-6 py-0 pl-[60px] text-[19px] font-semibold shadow-none dark:bg-transparent md:text-[19px] max-[820px]:pl-[50px] max-[820px]:!text-base"
              type="search"
              aria-label={config.placeholder}
              placeholder={config.placeholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {loading ? <LoadingScreen compact /> : error ? (
            <div className="friends-empty" role="alert">
              <strong>Не удалось загрузить людей</strong>
              <span>{error.message}</span>
              <Button variant="outline" onClick={() => reload().catch(() => {})}>Попробовать снова</Button>
            </div>
          ) : data.people.length ? (
            <ul className="friends-list">
              {data.people.map((person) => (
                <li className="friend-row" data-username={person.username} key={person.id}>
                  <Link className="friend-row__profile" to={publicProfilePath(person.username)}>
                    <Avatar user={person} size="md" />
                    <span className="friend-row__identity">
                      <strong>{person.name}</strong>
                      <small>@{person.username} · {person.wishCount} {person.wishCount === 1 ? "желание" : "желаний"}</small>
                    </span>
                  </Link>
                  {person.isFollowing && person.isFollower && <span className="friend-row__mutual" title="Взаимная подписка" aria-label="Взаимная подписка"><Star fill="currentColor" /></span>}
                  <div className="friend-row__actions">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="friend-row__more" aria-label={`Действия для ${person.name}`}><MoreHorizontal /></DropdownMenuTrigger>
                      <DropdownMenuContent className="friend-row__menu static w-[210px]" align="end" sideOffset={8}>
                        <DropdownMenuItem nativeButton={false} className="min-h-12 gap-2 px-3" render={<Link to={publicProfilePath(person.username)} />}><CircleUserRound />Открыть профиль</DropdownMenuItem>
                        <DropdownMenuItem className="min-h-12 gap-2 px-3" disabled={busyPersonId === person.id} onClick={() => toggleFollow(person)}>
                          {busyPersonId === person.id ? <LoaderCircle className="spin" /> : person.isFollowing ? <X /> : <UserPlus />}
                          {person.isFollowing ? "Отписаться" : "Подписаться"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="friends-empty">
              <span className="friends-empty__icon"><EmptyIcon /></span>
              <strong>{config.emptyTitle}</strong>
              <span>{config.emptyText}</span>
              {section !== "search" && <ShadcnButton nativeButton={false} render={<Link to="/app/friends/search" />} className="button button--primary"><span>Найти друзей</span></ShadcnButton>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ProfileSettingsModal({ user, onClose, onSaved, finalFocus }) {
  const toast = useToast();
  const logout = useLogout();
  const initialForm = useMemo(() => ({
    name: user.name,
    username: user.username,
    bio: user.bio || "",
    birthday: user.birthday ? String(user.birthday).slice(0, 10) : "",
    avatarUrl: user.avatarUrl || "",
  }), [user]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const contentRef = useRef(null);
  const imageFileRef = useRef(null);
  const uploadedImageIdsRef = useRef(new Set());
  const changed = Object.keys(initialForm).some((key) => form[key] !== initialForm[key]);
  const cleanupUploadedImages = async (keepUrl = "") => {
    const keepId = uploadedImageIdFromUrl(keepUrl);
    const ids = [...uploadedImageIdsRef.current].filter((id) => id !== keepId);
    ids.forEach((id) => uploadedImageIdsRef.current.delete(id));
    await Promise.allSettled(ids.map((id) => api.delete(`/uploads/images/${encodeURIComponent(id)}`)));
  };
  useEffect(() => () => {
    const ids = [...uploadedImageIdsRef.current];
    uploadedImageIdsRef.current.clear();
    ids.forEach((id) => {
      fetch(`/api/uploads/images/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
        keepalive: true,
      }).catch(() => {});
    });
  }, []);
  const uploadAvatar = async (file) => {
    if (!file || imageUploading || loading || loggingOut) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setImageError("Подойдёт изображение JPG, PNG или WEBP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setImageError("Изображение должно быть не больше 8 МБ.");
      return;
    }
    setImageUploading(true);
    setImageError("");
    try {
      const result = await api.uploadImage(file);
      uploadedImageIdsRef.current.add(result.id);
      setForm((current) => ({ ...current, avatarUrl: result.imageUrl }));
    } catch (error) {
      setImageError(error.message || "Не удалось загрузить фотографию.");
    } finally {
      setImageUploading(false);
      if (imageFileRef.current) imageFileRef.current.value = "";
    }
  };
  const close = () => {
    if (loading || imageUploading || loggingOut) return;
    cleanupUploadedImages();
    onClose();
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!changed || loading || imageUploading || loggingOut) return;
    const payload = {};
    Object.keys(initialForm).forEach((key) => {
      if (form[key] === initialForm[key]) return;
      payload[key] = key === "birthday" ? form[key] || null : form[key];
    });
    setLoading(true);
    try {
      const result = await api.patch("/me", payload);
      const savedUploadId = uploadedImageIdFromUrl(result.user?.avatarUrl);
      if (savedUploadId) uploadedImageIdsRef.current.delete(savedUploadId);
      await cleanupUploadedImages(result.user?.avatarUrl || "");
      toast("Профиль обновлён");
      await onSaved(result.user);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };
  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
    <DialogContent
      ref={contentRef}
      className="max-h-[min(calc(100dvh-2rem),44rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden [&>[data-slot=dialog-close]]:size-12"
      initialFocus={() => window.innerWidth <= 820 ? true : contentRef.current?.querySelector("#settings-profile-name") || true}
      finalFocus={finalFocus}
    >
      <DialogHeader className="pr-8">
        <DialogTitle>Изменить профиль</DialogTitle>
        <DialogDescription>Эти данные видны рядом с вашими списками желаний.</DialogDescription>
      </DialogHeader>
      <ScrollArea className="-mx-1 min-h-0">
        <form id="profile-editor-form" className="flex flex-col gap-4 px-1 pb-1 pr-3" onSubmit={submit}>
          <Card className="flex items-center gap-3 p-3">
            <Avatar user={{ ...user, avatarUrl: form.avatarUrl }} size="lg" className="!size-16 shrink-0" />
            <div className="min-w-0 flex-1">
              <strong className="block text-sm font-medium">Фото профиля</strong>
              <p className="text-sm text-muted-foreground">JPG, PNG или WEBP · до 8 МБ</p>
              <ShadcnButton
                type="button"
                variant="outline"
                className="mt-2"
                disabled={imageUploading || loading || loggingOut}
                aria-busy={imageUploading || undefined}
                onClick={() => imageFileRef.current?.click()}
              >
                {imageUploading ? <Spinner /> : <Upload aria-hidden="true" />}
                {imageUploading ? "Загрузка…" : "Загрузить фото"}
              </ShadcnButton>
            </div>
            <Input ref={imageFileRef} className="sr-only !size-px" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Загрузить фото профиля" onChange={(event) => uploadAvatar(event.target.files?.[0])} />
          </Card>
          {imageError && <FieldError>{imageError}</FieldError>}
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="settings-profile-name">Имя</FieldLabel>
                <Input id="settings-profile-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="settings-profile-address">Адрес профиля</FieldLabel>
                <InputGroup className="min-w-0">
                  <InputGroupAddon align="inline-start" className="shrink-0">
                    <InputGroupText aria-hidden="true">роллапп.рф/</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    id="settings-profile-address"
                    className="min-w-0"
                    required
                    pattern="[a-z0-9-]{3,32}"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                    spellCheck={false}
                    value={form.username}
                    onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase() })}
                  />
                </InputGroup>
                <FieldDescription>Латиница, цифры и дефис · 3–32 символа.</FieldDescription>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="settings-profile-bio">О себе</FieldLabel>
              <Textarea id="settings-profile-bio" rows={4} maxLength={300} value={form.bio} placeholder="Что вам нравится?" onChange={(event) => setForm({ ...form, bio: event.target.value })} />
            </Field>
            <Field className="sm:max-w-[calc(50%-0.5rem)]">
              <FieldLabel htmlFor="settings-profile-birthday">День рождения</FieldLabel>
              <Input id="settings-profile-birthday" type="date" max={new Date().toISOString().slice(0, 10)} value={form.birthday} onChange={(event) => setForm({ ...form, birthday: event.target.value })} />
            </Field>
          </FieldGroup>
          <div className="border-t pt-4">
            <ShadcnButton
              type="button"
              variant="destructive"
              className="h-12 w-full justify-start gap-3 px-4"
              disabled={loading || imageUploading || loggingOut}
              aria-busy={loggingOut || undefined}
              onClick={async () => {
                if (loggingOut) return;
                setLoggingOut(true);
                await cleanupUploadedImages();
                const loggedOut = await logout();
                if (!loggedOut) setLoggingOut(false);
              }}
            >
              {loggingOut ? <Spinner /> : <LogOut className="size-5" aria-hidden="true" />}
              <span>Выйти из аккаунта</span>
            </ShadcnButton>
          </div>
        </form>
      </ScrollArea>
      <DialogFooter>
        <ShadcnButton type="button" variant="outline" className="h-12" disabled={loading || imageUploading || loggingOut} onClick={close}>Отмена</ShadcnButton>
        <ShadcnButton
          type="submit"
          form="profile-editor-form"
          className="h-12"
          disabled={!changed || imageUploading || loggingOut || loading}
          aria-busy={loading || undefined}
        >
          {loading && <Spinner />}
          Сохранить
        </ShadcnButton>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function PublicProfile({ shared = false }) {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: sessionLoading } = useSession();
  const { openProfileEditor } = useProfileEditor();
  const toast = useToast();
  const endpoint = shared ? "/shared/" + params.token : "/profile/" + params.username;
  const { data, loading, error, reload } = useAsync(() => api.get(endpoint), [endpoint]);
  const [selected, setSelected] = useState(shared ? "all" : params.listId || "all");
  const [selectedWishId, setSelectedWishId] = useState(params.wishId || null);
  const [editingWishId, setEditingWishId] = useState(null);
  const [listModal, setListModal] = useState(null);
  const [wishModalOpen, setWishModalOpen] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(20);
  const loadMoreRef = useRef(null);
  const lastWishOpenerRef = useRef(null);

  useEffect(() => {
    if (!params.wishId) {
      setSelected(shared ? "all" : params.listId || "all");
    }
    setSelectedWishId(params.wishId || null);
  }, [params.listId, params.wishId, shared]);

  useEffect(() => { setVisibleLimit(20); }, [selected, endpoint]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisibleLimit((value) => value + 20);
    }, { rootMargin: "500px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visibleLimit, data?.wishes?.length, selected]);

  const renderCollectionState = ({ title, text, returnPath = APP_HOME, returnLabel = "В приложение", friendsContext = !shared }) => {
    const page = <div className="app-page wishes-page public-collection-page" data-public-collection-state>
      <header className="wishes-page__topbar"><Logo className="app-shell-logo" /></header>
      <EmptyState
        icon={Gift}
        title={title}
        text={text}
        action={<ShadcnButton nativeButton={false} render={<Link to={returnPath} />}>{returnLabel}</ShadcnButton>}
      />
    </div>;
    if (user) return <AppShell friendsContext={friendsContext} collectionChrome>{page}</AppShell>;
    return <div className="app-layout app-layout--dark public-collection-shell"><main className="app-main app-main--with-profile app-main--wishes">{page}</main></div>;
  };

  if (loading || sessionLoading) return <LoadingScreen />;
  if (error && !data) return renderCollectionState({ title: "Такой список не нашёлся", text: error.message });

  const lists = shared ? [data.list] : data.lists;
  const navigationLists = shared ? lists : lists.filter((list) => !(list.title === "Мои желания" && list.description === "Всё, чему я буду рад"));
  const activeWishes = data.wishes.filter((wish) => wish.status === "active");
  const routeList = lists.find((list) => list.id === selected);
  const selectedList = routeList && !isGeneralList(routeList) ? routeList : null;
  const selectedValue = selectedList?.id || "all";
  const wishes = shared
    ? activeWishes
    : selectedValue === "all"
      ? activeWishes
      : activeWishes.filter((wish) => wish.listIds.includes(selectedValue));
  const selectedWish = selectedWishId ? activeWishes.find((wish) => wish.id === selectedWishId) : null;
  const editingWish = editingWishId ? data.wishes.find((wish) => wish.id === editingWishId) : null;
  const invalidSelection = (!shared && params.listId && !routeList) || (params.wishId && !selectedWish);
  if (invalidSelection) {
    const notFoundTitle = params.wishId ? "Желание не найдено" : "Список не найден";
    const returnPath = shared ? `/s/${params.token}` : publicProfilePath(data.profile.username);
    return renderCollectionState({
      title: notFoundTitle,
      text: "Ссылка устарела или доступ к этой странице ограничен.",
      returnPath,
      returnLabel: "Вернуться к профилю",
      friendsContext: !data.isOwner && !shared,
    });
  }
  const wishCountForList = (listId) => activeWishes.filter((wish) => wish.listIds.includes(listId)).length;
  const profileBasePath = shared ? `/s/${params.token}` : publicProfilePath(data.profile.username);
  const currentCollectionPath = shared
    ? profileBasePath
    : selectedList
      ? publicListPath(data.profile.username, selectedList.id)
      : publicProfilePath(data.profile.username);

  const selectCollection = (value) => {
    setSelected(value);
    setSelectedWishId(null);
    if (shared) return;
    navigate(value === "all" ? publicProfilePath(data.profile.username) : publicListPath(data.profile.username, value));
  };

  const openWish = (id, opener = null) => {
    lastWishOpenerRef.current = opener;
    setSelectedWishId(id);
    navigate(`${profileBasePath}/wishes/${id}`);
  };

  const closeWish = () => {
    const wishId = selectedWishId;
    const opener = lastWishOpenerRef.current;
    setSelectedWishId(null);
    navigate(currentCollectionPath, { replace: true });
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const fallback = [...document.querySelectorAll(".wish-card__open")].find((element) => element.dataset.wishId === wishId);
      const target = opener?.isConnected ? opener : fallback;
      target?.focus();
      lastWishOpenerRef.current = null;
    }));
  };

  const follow = async () => {
    if (!user) return navigate(`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
    try {
      const result = await api.post("/profile/" + data.profile.username + "/follow", {});
      toast(result.following ? "Вы подписались" : "Подписка отменена");
      reload();
    } catch (followError) {
      toast(followError.message, "error");
    }
  };

  const share = async () => {
    if (selectedList?.privacy === "private") {
      toast("Приватный список виден только вам", "error");
      return;
    }
    const path = selectedList?.privacy === "link" && selectedList.shareToken
      ? `/s/${selectedList.shareToken}`
      : currentCollectionPath;
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    toast("Ссылка скопирована");
  };

  const editWish = (id) => {
    if (!data.isOwner) return;
    setSelectedWishId(null);
    setEditingWishId(id);
    navigate(currentCollectionPath, { replace: true });
  };

  const createListForWish = (id) => {
    if (!data.isOwner || shared) return;
    setSelectedWishId(null);
    setListModal({ attachWishId: id });
    navigate(currentCollectionPath, { replace: true });
  };

  const saveProfileList = async (saved) => {
    const attachWishId = listModal?.attachWishId;
    let attached = true;
    setListModal(null);
    if (saved?.id && attachWishId) {
      try {
        await api.post(`/wishes/${encodeURIComponent(attachWishId)}/lists/${encodeURIComponent(saved.id)}`, {});
        toast(`Желание добавлено в новый список «${saved.title}»`);
      } catch (listError) {
        attached = false;
        toast(listError.message, "error");
      }
    }
    await reload();
    if (saved?.id && attached && !shared) selectCollection(saved.id);
  };

  const ownerCollection = data.isOwner && !shared;
  const profileVisitor = !data.isOwner;
  const relationshipBlock = data.isOwner
    ? <nav className="wishes-page__friend-links" aria-label="Связи профиля">
      <Link to="/app/friends/subscriptions" className="wishes-page__friend-link">Подписки</Link>
      <Link to="/app/friends/followers" className="wishes-page__friend-link">Подписчики</Link>
    </nav>
    : !shared ? <dl className="wishes-page__friend-links friend-profile-page__stats" aria-label="Связи профиля">
      <div><dt>Подписки</dt><dd>{data.followingCount}</dd></div>
      <div><dt>Подписчики</dt><dd>{data.followersCount}</dd></div>
    </dl> : null;
  const identity = data.isOwner
    ? <button
      type="button"
      className="wishes-page__identity"
      aria-label={`Редактировать профиль ${data.profile.name}`}
      title="Редактировать профиль"
      onClick={openProfileEditor}
    >
      <Avatar user={data.profile} size="xl" className="wishes-page__hero-avatar" />
      <span className="wishes-page__hero-copy"><h1 id="public-profile-name">{data.profile.name}</h1></span>
    </button>
    : <div className="wishes-page__identity friend-profile-page__identity">
      <Avatar user={data.profile} size="xl" className="wishes-page__hero-avatar" />
      <span className="wishes-page__hero-copy"><h1 id="public-profile-name">{data.profile.name}</h1></span>
    </div>;
  const collectionPage = <div className={`app-page wishes-page public-collection-page ${profileVisitor ? "friend-profile-page" : ""}`} data-public-collection>
    <header className="wishes-page__topbar">
      <Logo className="app-shell-logo" />
      <Button className="wishes-page__topbar-share h-12 px-5 text-base" variant="outline" icon={Share2} onClick={share}>Поделиться</Button>
    </header>

    <section className={`wishes-page__hero public-collection-page__hero ${profileVisitor ? "friend-profile-page__hero" : ""}`} data-friend-profile={profileVisitor && !shared ? "" : undefined} aria-labelledby="public-profile-name">
      {identity}
      {relationshipBlock}
      <div className={`page-actions wishes-page__hero-actions ${profileVisitor ? "friend-profile-page__actions" : ""}`} role="group" aria-label={data.isOwner ? "Действия со списком желаний" : "Действия с профилем"}>
        {ownerCollection ? <>
          {selectedList && <Button className="h-12 rounded-full px-5 text-base max-[560px]:flex-1" variant="outline" icon={Pencil} onClick={() => setListModal(selectedList)}>Настройки списка</Button>}
          <Button className="wishes-page__hero-add h-12 min-w-[180px] rounded-full px-6 text-base max-[560px]:min-w-0" icon={Plus} onClick={() => setWishModalOpen(true)}>Добавить</Button>
        </> : data.isOwner && shared
          ? <Button className="h-12 rounded-full px-6 text-base" onClick={() => navigate(publicListPath(data.profile.username, data.list.id))}>Открыть мой список</Button>
          : <Button
            variant={data.isFollowing ? "soft" : "primary"}
            className="h-12 min-w-[180px] rounded-full px-6 text-base"
            type="button"
            aria-pressed={data.isFollowing}
            onClick={follow}
          >{data.isFollowing ? "Отписаться" : "Подписаться"}</Button>}
      </div>
    </section>

    <div className={`list-tabs public-collection-tabs ${profileVisitor ? "friend-profile-tabs" : ""}`} aria-label="Списки желаний">
      <ToggleGroup className="contents" value={[selectedValue]} onValueChange={(values) => { if (values[0]) selectCollection(values[0]); }} aria-label="Списки желаний">
        <ToggleGroupItem value="all"><strong>{shared ? data.list.title : ownerCollection ? "Мои желания" : "Все желания"}</strong><span>{activeWishes.length}</span></ToggleGroupItem>
        {!shared && navigationLists.map((list) => <ToggleGroupItem value={list.id} key={list.id}>{ownerCollection && list.privacy === "private" && <LockKeyhole size={14} />}<strong>{list.title}</strong><span>{wishCountForList(list.id)}</span></ToggleGroupItem>)}
      </ToggleGroup>
      {ownerCollection && <ShadcnButton variant="ghost" size="icon" className="list-tabs__add" aria-label="Новый список" title="Новый список" onClick={() => setListModal({})}><Plus size={16} /><span className="visually-hidden">Новый список</span></ShadcnButton>}
    </div>

    {wishes.length
      ? <><div className="wish-grid">{wishes.slice(0, visibleLimit).map((wish) => <WishCard key={wish.id} wish={wish} owner={data.isOwner} profile={data.profile} lists={lists} shareToken={shared ? params.token : ""} onChanged={() => reload({ background: true })} onOpen={(opener) => openWish(wish.id, opener)} onEdit={ownerCollection ? () => editWish(wish.id) : undefined} onCreateList={ownerCollection ? () => setListModal({ attachWishId: wish.id }) : undefined} />)}</div>{visibleLimit < wishes.length && <div className="wish-load-more" ref={loadMoreRef}><LoaderCircle className="spin" /><span>Загружаем ещё желания…</span></div>}</>
      : <EmptyState icon={Heart} title="В этом списке пока пусто" text={ownerCollection ? "Добавьте то, что действительно порадует." : "Загляните чуть позже — новая мечта наверняка появится."} action={ownerCollection ? <Button icon={Plus} onClick={() => setWishModalOpen(true)}>Добавить желание</Button> : undefined} />}
    {selectedWish && <WishDetailsModal wish={selectedWish} owner={data.isOwner} profile={data.profile} lists={lists} wishes={data.wishes} shareToken={shared ? params.token : ""} onChanged={() => reload({ background: true })} onEdit={ownerCollection ? () => editWish(selectedWish.id) : undefined} onCreateList={ownerCollection ? () => createListForWish(selectedWish.id) : undefined} onClose={closeWish} />}
    {editingWish && <WishModal wish={editingWish} onClose={() => setEditingWishId(null)} onSaved={async () => { setEditingWishId(null); await reload(); }} onDeleted={async () => { setEditingWishId(null); await reload(); }} />}
    {listModal && <ListModal list={listModal.id ? listModal : null} listsCount={lists.length} onClose={() => setListModal(null)} onSaved={saveProfileList} onDeleted={async () => { setListModal(null); selectCollection("all"); await reload(); }} />}
    {wishModalOpen && <WishModal onClose={() => setWishModalOpen(false)} onSaved={() => { setWishModalOpen(false); reload(); }} />}
  </div>;

  if (user) return <AppShell friendsContext={!data.isOwner && !shared} collectionChrome>{collectionPage}</AppShell>;
  return <div className="app-layout app-layout--dark public-collection-shell"><main className="app-main app-main--with-profile app-main--wishes">{collectionPage}</main></div>;
}

function NotFound() { return <div className="not-found"><Logo /><Gift /><h1>Похоже, эта мечта потерялась</h1><p>Страница не существует или ссылка устарела.</p><ShadcnButton nativeButton={false} render={<Link to={APP_HOME} />} className="button button--primary"><span>В приложение</span></ShadcnButton></div>; }

function LegacyProfileRedirect() {
  const params = useParams();
  const location = useLocation();
  const suffix = String(params["*"] || "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const target = `${publicProfilePath(params.username)}${suffix ? `/${suffix}` : ""}${location.search}${location.hash}`;
  return <Navigate to={target} replace />;
}

export default function App() { return <ToastProvider><SessionProvider><ProfileEditorProvider><Routes><Route path="/" element={<RootRoute />} /><Route path="/login" element={<AuthPage mode="login" />} /><Route path="/register" element={<AuthPage mode="register" />} /><Route path="/ideas" element={<Navigate to={APP_HOME} replace />} /><Route path="/s/:token" element={<PublicProfile shared />} /><Route path="/s/:token/wishes/:wishId" element={<PublicProfile shared />} /><Route path="/app/*" element={<ProtectedApp />} /><Route path="/u/:username/*" element={<LegacyProfileRedirect />} /><Route path="/users/:username/*" element={<LegacyProfileRedirect />} /><Route path="/:username" element={<PublicProfile />} /><Route path="/:username/lists/:listId" element={<PublicProfile />} /><Route path="/:username/wishes/:wishId" element={<PublicProfile />} /><Route path="*" element={<NotFound />} /></Routes></ProfileEditorProvider></SessionProvider></ToastProvider>; }
