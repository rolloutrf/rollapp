import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Archive, ArrowLeft, ArrowRight, AtSign, Bell, CalendarDays, Check, CheckCircle2, ChevronDown,
  CircleUserRound, ExternalLink, Eye, EyeOff, Gift, Hand, Heart, Image, Link2, ListPlus,
  LoaderCircle, LockKeyhole, LogOut, Mail, Menu, MoreHorizontal, PackageCheck, Pencil, Phone, Plus,
  RotateCcw, Search, Settings, Share2, Sparkles, Star, Trash2, Upload, UserPlus,
  Users, X,
} from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { api } from "./api.js";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar as ShadcnAvatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { NativeSelect } from "@/components/ui/native-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu,
  SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const SessionContext = createContext(null);
const ToastContext = createContext(null);
const APP_HOME = "/app/wishes";

const formatMoney = (value, currency = "RUB") => value == null ? "Цена не указана" : new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
const formatDate = (value, options = {}) => value ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", ...options }).format(new Date(value)) : "Без даты";
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
const LIST_PRIVACY_LABELS = { public: "Все", followers: "Подписчики", link: "Только по ссылке", private: "Только я" };
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
  const [session, setSession] = useState({ user: null, unreadCount: 0, loading: true });
  const refresh = useCallback(async () => {
    try {
      const result = await api.get("/me");
      setSession({ ...result, loading: false });
      return result;
    } catch {
      setSession({ user: null, unreadCount: 0, loading: false });
      return null;
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return <SessionContext.Provider value={{ ...session, refresh, setSession }}>{children}</SessionContext.Provider>;
}

function useSession() { return useContext(SessionContext); }
function useToast() { return useContext(ToastContext); }

function Logo({ compact = false }) {
  return (
    <Link to={APP_HOME} className={`logo ${compact ? "logo--compact" : ""}`} aria-label="Rollapp — в приложение">
      <span className="logo__mark"><span /><span /><span /></span>
      {!compact && <span>rollapp</span>}
    </Link>
  );
}

function Avatar({ user, size = "md", className = "" }) {
  const avatarUrl = user?.avatarUrl || user?.avatar_url || "";
  const shadcnSize = size === "sm" ? "sm" : size === "xl" ? "xl" : "default";
  return (
    <ShadcnAvatar size={shadcnSize} className={`avatar avatar--${size} ${className}`}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
      <AvatarFallback className="avatar--fallback">{initials(user?.name)}</AvatarFallback>
    </ShadcnAvatar>
  );
}

function Button({ children, className = "", variant = "primary", icon: Icon, loading, ...props }) {
  const shadcnVariant = { primary: "default", soft: "secondary", reserved: "secondary" }[variant] || variant;
  return <ShadcnButton variant={shadcnVariant} className={`button button--${variant} ${className}`} {...props} disabled={loading || props.disabled} aria-busy={loading || props["aria-busy"] || undefined}>{loading ? <Spinner /> : Icon ? <Icon size={18} /> : null}<span>{children}</span></ShadcnButton>;
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
      <ShadcnButton variant="ghost" size="sm" type="button" disabled={flow.loading} onClick={flow.changePhone}>Изменить</ShadcnButton>
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

function FriendsTopbar({ unreadCount, onLogout }) {
  return (
    <header className="friends-topbar">
      <nav className="friends-topbar__dock" aria-label="Основные разделы">
        <NavLink to="/app/wishes" aria-label="Мои желания" title="Мои желания"><Heart fill="currentColor" /></NavLink>
        <Link className="active" to="/app/friends/subscriptions" aria-label="Друзья" title="Друзья"><Users fill="currentColor" /></Link>
        <Link className="friends-topbar__search" to="/app/friends/search" aria-label="Найти друзей" title="Найти друзей"><Search /></Link>
      </nav>
      <div className="friends-topbar__account">
        <DropdownMenu>
          <DropdownMenuTrigger className="friends-topbar__menu" aria-label="Открыть меню аккаунта"><Menu /></DropdownMenuTrigger>
          <DropdownMenuContent className="friends-topbar__panel static w-[220px]" align="end" sideOffset={8}>
            <DropdownMenuItem nativeButton={false} className="min-h-10 gap-2 px-3" render={<Link to="/app/notifications" />}><Bell />Уведомления{unreadCount > 0 && <i>{unreadCount}</i>}</DropdownMenuItem>
            <DropdownMenuItem nativeButton={false} className="min-h-10 gap-2 px-3" render={<Link to="/app/settings" />}><Settings />Настройки</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-10 gap-2 px-3" onClick={onLogout}><LogOut />Выйти</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function AppSidebar({ user, unreadCount, friendsRoute, pathname, onAddWish, onLogout }) {
  const { setOpenMobile } = useSidebar();
  const closeMobile = () => setOpenMobile(false);
  const isActive = (to) => to.startsWith("/app/friends") ? friendsRoute : pathname === to || pathname.startsWith(`${to}/`);
  return (
    <Sidebar id="app-sidebar" collapsible="offcanvas" aria-label="Меню приложения">
      <div className="sidebar !static !inset-auto !h-full !max-h-full !w-full !translate-x-0 !transform-none">
        <SidebarHeader className="sidebar__head">
          <Logo />
          <SidebarTrigger className="sidebar-close min-[821px]:hidden" aria-label="Закрыть меню" />
        </SidebarHeader>
        <Button icon={Plus} onClick={() => { closeMobile(); onAddWish(); }} className="sidebar__add">Добавить желание</Button>
        <SidebarContent>
          <nav aria-label="Основные разделы">
            <SidebarMenu className="sidebar__nav">
              {shellNav.map(({ to, icon: Icon, label, end }) => (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton nativeButton={false} render={<NavLink to={to} end={end} onClick={closeMobile} />} isActive={isActive(to)}>
                    <Icon size={19} /><span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
        </SidebarContent>
        <SidebarFooter className="sidebar__bottom">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton nativeButton={false} render={<NavLink to="/app/notifications" onClick={closeMobile} />} isActive={pathname === "/app/notifications"}>
                <Bell size={19} /><span>Уведомления</span>
              </SidebarMenuButton>
              {unreadCount > 0 && <SidebarMenuBadge className="bg-primary text-primary-foreground">{unreadCount}</SidebarMenuBadge>}
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton nativeButton={false} render={<NavLink to="/app/settings" onClick={closeMobile} />} isActive={pathname === "/app/settings"}>
                <Settings size={19} /><span>Настройки</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="sidebar__user">
            <Avatar user={user} size="sm" />
            <div><strong>{user.name}</strong><span>@{user.username}</span></div>
            <ShadcnButton variant="ghost" size="icon-sm" onClick={onLogout} aria-label="Выйти" title="Выйти"><LogOut size={18} /></ShadcnButton>
          </div>
        </SidebarFooter>
      </div>
    </Sidebar>
  );
}

function AppShell({ children, onAddWish }) {
  const { user, unreadCount, refresh } = useSession();
  const navigate = useNavigate(); const location = useLocation(); const toast = useToast();
  const friendsRoute = location.pathname.startsWith("/app/friends");
  const logout = async () => { await api.post("/auth/logout", {}); await refresh(); navigate("/"); toast("Вы вышли из аккаунта"); };
  return (
    <SidebarProvider className={`app-layout app-layout--dark ${friendsRoute ? "app-layout--friends" : ""}`} style={{ "--sidebar-width": "236px" }}>
      <AppSidebar user={user} unreadCount={unreadCount} friendsRoute={friendsRoute} pathname={location.pathname} onAddWish={onAddWish} onLogout={logout} />
      <SidebarInset className="app-main">
        <header className="mobile-app-head">
          <SidebarTrigger aria-label="Открыть меню" />
          <Logo />
          <Link to="/app/notifications" aria-label="Уведомления"><Bell />{unreadCount > 0 && <i />}</Link>
        </header>
        {friendsRoute && <FriendsTopbar unreadCount={unreadCount} onLogout={logout} />}
        {children}
        <nav className="mobile-bottom-nav" aria-label="Основные разделы">{shellNav.map(({ to, icon: Icon, label, end }) => <NavLink key={to} to={to} end={end} className={({ isActive: navActive }) => navActive || (friendsRoute && to.startsWith("/app/friends")) ? "active" : ""}><Icon /><span>{label === "Мои желания" ? "Желания" : label}</span></NavLink>)}</nav>
      </SidebarInset>
    </SidebarProvider>
  );
}

function ProtectedApp() {
  const { user, loading } = useSession(); const [wishModal, setWishModal] = useState(false); const [version, setVersion] = useState(0);
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell onAddWish={() => setWishModal(true)}><Routes><Route index element={<Navigate to={APP_HOME} replace />} /><Route path="wishes" element={<WishesPage onAdd={() => setWishModal(true)} version={version} />} /><Route path="ideas" element={<Navigate to={APP_HOME} replace />} /><Route path="friends" element={<Navigate to="/app/friends/subscriptions" replace />} /><Route path="friends/:section" element={<FriendsPage />} /><Route path="gifts" element={<Navigate to={APP_HOME} replace />} /><Route path="notifications" element={<NotificationsPage />} /><Route path="settings" element={<SettingsPage />} /><Route path="*" element={<Navigate to={APP_HOME} replace />} /></Routes>{wishModal && <WishModal onClose={() => setWishModal(false)} onSaved={() => { setWishModal(false); setVersion((v) => v + 1); }} />}</AppShell>;
}

function PageTitle({ eyebrow, title, text, action }) { return <div className="app-page-title"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{text && <p>{text}</p>}</div>{action}</div>; }

function Priority({ value }) { return <span className="priority" title={`Важность: ${value} из 3`}>{[1, 2, 3].map((item) => <i key={item} className={item <= value ? "is-on" : ""} />)}</span>; }

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
    const linkedLists = lists.filter((list) => wish.listIds?.includes(list.id));
    const privateOnly = wish.privacy === "private" || (linkedLists.length > 0 && linkedLists.every((list) => list.privacy === "private"));
    if (privateOnly) {
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
      <div className="wish-card__image">{wish.imageUrl ? <img src={wish.imageUrl} alt="" /> : <span><Gift size={36} /></span>}<Priority value={wish.priority} />{wish.status === "fulfilled" && <Badge className="fulfilled-badge"><Check /> Исполнено</Badge>}</div>
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
              className="wish-card-actions-menu w-70 rounded-2xl p-2 [&_[data-slot=dropdown-menu-item]]:min-h-[44px] [&_[data-slot=dropdown-menu-sub-trigger]]:min-h-[44px]"
              aria-label={`Действия с желанием «${wish.title}»`}
            >
              {!owner && <DropdownMenuItem className="min-h-9 gap-2 px-2 py-2 text-base" disabled={busy} onClick={reserve}><Gift /> {wish.reservedByMe ? "Снять бронь" : "Забронировать"}</DropdownMenuItem>}
              {!owner && <DropdownMenuItem className="min-h-9 gap-2 px-2 py-2 text-base" disabled={busy} onClick={save}><Archive /> Сохранить к себе</DropdownMenuItem>}
              {owner && wish.status === "fulfilled" ? <>
                <DropdownMenuItem className="min-h-9 gap-2 px-2 py-2 text-base" disabled={busy} onClick={fulfilled}><RotateCcw /> Не исполнено</DropdownMenuItem>
                <DropdownMenuItem className="min-h-9 gap-2 px-2 py-2 text-base" disabled={busy} onClick={repeat}><Plus /> Загадать ещё раз</DropdownMenuItem>
                {onEdit && <DropdownMenuItem className="min-h-9 gap-2 px-2 py-2 text-base" disabled={busy} aria-haspopup="dialog" onClick={onEdit}><Pencil /> Редактировать</DropdownMenuItem>}
              </> : owner && <>
                <DropdownMenuItem className="min-h-9 gap-2 px-2 py-2 text-base" disabled={busy} onClick={fulfilled}><Check /> Исполнено</DropdownMenuItem>
                {onEdit && <DropdownMenuItem className="min-h-9 gap-2 px-2 py-2 text-base" disabled={busy} aria-haspopup="dialog" onClick={onEdit}><Pencil /> Редактировать</DropdownMenuItem>}
                <DropdownMenuItem
                  className="min-h-9 gap-2 px-2 py-2 text-base"
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
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="card-menu__submenu-trigger min-h-9 gap-2 px-2 py-2 text-base" disabled={busy}>
                    <ListPlus /> <span>Добавить в список</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    id={`wish-lists-${wish.id}`}
                    className="wish-card-lists-menu w-70 rounded-2xl p-2 [&_[data-slot=dropdown-menu-item]]:min-h-[44px] [&_[data-slot=dropdown-menu-sub-trigger]]:min-h-[44px]"
                    aria-label={`Списки желания «${wish.title}»`}
                  >
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="px-2 py-2 text-sm">Списки</DropdownMenuLabel>
                      {onCreateList && <DropdownMenuItem className="min-h-9 gap-2 px-2 py-2 text-sm" disabled={busy} onClick={onCreateList}><ListPlus /> Новый список</DropdownMenuItem>}
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
                          <span className={`grid size-10 shrink-0 place-items-center rounded-xl bg-muted list-dot--${list.color}`} aria-hidden="true"><ListPlus /></span>
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
                      <DropdownMenuItem className="min-h-9 gap-2 px-2 py-2 text-sm" disabled={busy} closeOnClick={false} onClick={() => setSelectedListIds([...(wish.listIds || [])])}><RotateCcw /> Отменить изменения</DropdownMenuItem>
                      <DropdownMenuItem className="min-h-9 gap-2 px-2 py-2 text-sm font-medium" disabled={busy} closeOnClick={false} onClick={saveLists}>{busy ? <LoaderCircle className="spin" /> : <Check />} Сохранить списки</DropdownMenuItem>
                    </>}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>}
              {(!owner || wish.status !== "fulfilled") && <DropdownMenuItem className="min-h-9 gap-2 px-2 py-2 text-base" disabled={busy} onClick={share}><Share2 /> Поделиться</DropdownMenuItem>}
              {!owner && wish.url && <DropdownMenuItem nativeButton={false} className="min-h-9 gap-2 px-2 py-2 text-base" render={<a href={wish.url} target="_blank" rel="noreferrer" />}><ExternalLink /> Открыть магазин</DropdownMenuItem>}
              {owner && <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" className="danger min-h-9 gap-2 px-2 py-2 text-base" disabled={busy} aria-haspopup="dialog" onClick={() => setDeleteOpen(true)}><Trash2 /> Удалить</DropdownMenuItem>
              </>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <h3>{wish.title}</h3>
        <p>{wish.description || "Без дополнительного описания"}</p>
        {owner ? <div className="wish-card__owner-meta">{wish.privacy === "private" ? <span><LockKeyhole /> Только вам</span> : <span><Eye /> Виден друзьям</span>}{wish.reservationCount > 0 && <span><Gift /> Кто-то готовит подарок</span>}</div> : <Button variant={wish.reservedByMe ? "reserved" : "outline"} loading={busy} icon={wish.reservedByMe ? Check : Gift} onClick={reserve} disabled={wish.status !== "active" || reservationUnavailable}>{wish.reservedByMe ? "Забронировано вами" : reservationUnavailable ? "Уже забронировано" : "Забронировать"}</Button>}
      </div>
    </Card>
    {deleteOpen && <Modal
      onClose={() => { if (!busy) setDeleteOpen(false); }}
      className="modal--wish-delete"
      ariaLabel={`Удаление желания «${wish.title}»`}
    >
      <div className="wish-delete-confirm">
        <span className="modal-icon"><Trash2 /></span>
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
  return <div className="app-page wishes-page"><PageTitle eyebrow="Личная коллекция" title="Мои желания" text={`${activeWishes.length} активных · ${data.wishes.filter((wish) => wish.status === "fulfilled").length} исполнено`} action={<div className="page-actions">{selectedList && <Button variant="outline" icon={Pencil} onClick={() => setListModal(selectedList)}>Настройки списка</Button>}<Button variant="outline" icon={Share2} onClick={share}>Поделиться</Button><Button icon={Plus} onClick={onAdd}>Добавить</Button></div>} /><div className="list-tabs"><ToggleGroup className="contents" value={[selected]} onValueChange={(values) => { if (values[0]) setSelected(values[0]); }} aria-label="Списки желаний"><ToggleGroupItem value="all"><Heart size={16} /> Мои желания <span>{activeWishes.length}</span></ToggleGroupItem>{categoryLists.map((list) => <ToggleGroupItem value={list.id} key={list.id}>{list.privacy === "private" && <LockKeyhole size={14} />}{list.title} <span>{list.wishCount}</span></ToggleGroupItem>)}</ToggleGroup><ShadcnButton variant="ghost" size="icon" className="list-tabs__add" aria-label="Новый список" title="Новый список" onClick={() => setListModal({})}><Plus size={16} /><span className="visually-hidden">Новый список</span></ShadcnButton></div>{wishes.length ? <div className="wish-grid">{wishes.map((wish) => <WishCard key={wish.id} wish={wish} owner profile={user} lists={data.lists} onChanged={() => reload({ background: true })} onOpen={() => setSelectedWishId(wish.id)} onEdit={() => editWish(wish.id)} onCreateList={() => setListModal({ attachWishId: wish.id })} />)}</div> : <EmptyState icon={Heart} title="В этом списке пока пусто" text="Добавьте то, что действительно порадует." action={<Button icon={Plus} onClick={onAdd}>Добавить желание</Button>} />}{selectedWish && <WishDetailsModal wish={selectedWish} owner profile={user} lists={data.lists} wishes={data.wishes} onChanged={() => reload({ background: true })} onEdit={() => editWish(selectedWish.id)} onCreateList={() => { setSelectedWishId(null); setListModal({ attachWishId: selectedWish.id }); }} onClose={() => setSelectedWishId(null)} />}{editingWish && <WishModal wish={editingWish} onClose={() => setEditingWishId(null)} onSaved={async () => { setEditingWishId(null); await reload(); }} onDeleted={async () => { setEditingWishId(null); await reload(); }} />}{listModal && <ListModal list={listModal.id ? listModal : null} listsCount={data.lists.length} onClose={() => setListModal(null)} onSaved={saveList} onDeleted={async () => { setListModal(null); setSelected("all"); await reload(); }} />}</div>;
}

function Modal({ children, onClose, onEscape, finalFocus, wide = false, className = "", ariaLabel = "Диалог Rollapp", backdropClassName = "" }) {
  const contentRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const onEscapeRef = useRef(onEscape);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { onEscapeRef.current = onEscape; }, [onEscape]);
  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => {
      window.requestAnimationFrame(() => {
        if (!document.querySelector('[data-slot="dialog-content"]')) document.body.classList.remove("modal-open");
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
      className={`modal ${wide ? "modal--wide" : ""} ${className}`}
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
  const detailContentRef = useRef(null);
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
  const linkedLists = categoryLists.filter((list) => selectedListIds.includes(list.id));
  const linkedListNames = linkedLists.map((list) => list.title);
  const listLabel = linkedListNames.length > 1 ? `${linkedListNames[0]} +${linkedListNames.length - 1}` : linkedListNames[0] || "Без списка";
  const listTitleText = linkedListNames.join(", ") || "Без списка";

  useEffect(() => {
    if (!listMutationRef.current) setSelectedListIds(normalizeListIds(wish.listIds));
  }, [wish.id, wish.listIds, normalizeListIds]);

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
          className={`card-menu__list-row min-h-[44px] [&_[data-slot=dropdown-menu-checkbox-item-indicator]]:hidden ${selected ? "is-selected" : ""}`}
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
        <DialogContent
          ref={detailContentRef}
          initialFocus={() => detailContentRef.current?.querySelector("[data-modal-initial-focus]") || true}
          showCloseButton={false}
          viewportClassName="modal-backdrop modal-backdrop--wish-detail"
          className="modal modal--wish-detail"
        >
          <DialogTitle className="visually-hidden">Желание: {wish.title}</DialogTitle>
          <article className="wish-detail">
          <div className="wish-detail__media">
            {wish.imageUrl ? <img src={wish.imageUrl} alt={`Фото желания «${wish.title}»`} /> : <span className="wish-detail__placeholder"><Gift /></span>}
            <Priority value={wish.priority} />
            {wish.status === "fulfilled" && <span className="wish-detail__fulfilled"><Check /> Исполнено</span>}
          </div>
          <div className="wish-detail__side">
            <div className="wish-detail__toolbar">
              <div className={`wish-detail__list-control ${owner ? "is-editable" : ""} ${listsOpen ? "is-open" : ""}`} title={listTitleText}>
                {owner
                  ? <DropdownMenu open={listsOpen} onOpenChange={(open) => {
                      setListsOpen(open);
                      if (open) setMenuOpen(false);
                    }}>
                      <DropdownMenuTrigger aria-label={`Изменить списки желания. Сейчас: ${listTitleText}`}>
                        <span>{listLabel}</span>{listsOpen ? <X /> : <ChevronDown />}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        id={`wish-detail-lists-${wish.id}`}
                        className="card-menu--popover wish-detail__list-popover static w-[280px] min-w-[280px] max-w-[calc(100vw-12px)] [&_[data-slot=dropdown-menu-item]]:min-h-[44px] [&_[data-slot=dropdown-menu-sub-trigger]]:min-h-[44px]"
                        align="start"
                        sideOffset={10}
                        aria-label={`Списки желания «${wish.title}»`}
                      >
                        {renderListPickerBody()}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  : <span><span>{listLabel}</span><ChevronDown /></span>}
              </div>
              <DropdownMenu open={menuOpen} onOpenChange={(open) => {
                setMenuOpen(open);
                if (open) setListsOpen(false);
              }}>
                <DropdownMenuTrigger
                  className="wish-detail__share"
                  aria-label={`Опции желания «${wish.title}»`}
                  title="Опции желания"
                ><MoreHorizontal /></DropdownMenuTrigger>
                <DropdownMenuContent
                  id={`wish-detail-menu-${wish.id}`}
                  className={`card-menu card-menu--popover wish-detail__actions-menu static w-[280px] min-w-[280px] max-w-[calc(100vw-12px)] [&_[data-slot=dropdown-menu-item]]:min-h-[44px] [&_[data-slot=dropdown-menu-sub-trigger]]:min-h-[44px] ${owner ? "card-menu--owner" : ""}`}
                  align="end"
                  sideOffset={10}
                  aria-label={`Действия с желанием «${wish.title}»`}
                >
                  <div className="card-menu__main">
                    {!owner && <DropdownMenuItem disabled={busy || wish.status !== "active" || reservationUnavailable} onClick={reserve}><Gift /> {wish.reservedByMe ? "Снять бронь" : "Забронировать"}</DropdownMenuItem>}
                    {!owner && <DropdownMenuItem disabled={busy} onClick={save}><Archive /> Сохранить к себе</DropdownMenuItem>}
                    {owner && wish.status === "fulfilled" ? <>
                      <DropdownMenuItem disabled={busy} onClick={fulfilled}><RotateCcw /> Не исполнено</DropdownMenuItem>
                      <DropdownMenuItem disabled={busy} onClick={repeat}><Plus /> Загадать ещё раз</DropdownMenuItem>
                      {onEdit && <DropdownMenuItem disabled={busy} aria-haspopup="dialog" onClick={onEdit}><Pencil /> Редактировать</DropdownMenuItem>}
                    </> : owner && <>
                      <DropdownMenuItem disabled={busy} onClick={fulfilled}><Check /> Исполнено</DropdownMenuItem>
                      {onEdit && <DropdownMenuItem disabled={busy} aria-haspopup="dialog" onClick={onEdit}><Pencil /> Редактировать</DropdownMenuItem>}
                      <DropdownMenuItem
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
                      </DropdownMenuItem>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="card-menu__submenu-trigger" disabled={busy}>
                          <ListPlus /> <span>Добавить в список</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent
                          id={`wish-detail-action-lists-${wish.id}`}
                          className="card-menu__lists static w-[280px] min-w-[280px] max-w-[calc(100vw-12px)] [&_[data-slot=dropdown-menu-item]]:min-h-[44px] [&_[data-slot=dropdown-menu-sub-trigger]]:min-h-[44px]"
                          sideOffset={8}
                          aria-label={`Списки желания «${wish.title}»`}
                        >
                          {renderListPickerBody()}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </>}
                    {(!owner || wish.status !== "fulfilled") && <DropdownMenuItem disabled={busy} onClick={share}><Share2 /> Поделиться</DropdownMenuItem>}
                    {!owner && wish.url && <DropdownMenuItem nativeButton={false} render={<a href={wish.url} target="_blank" rel="noreferrer" />}><ExternalLink /> Открыть магазин</DropdownMenuItem>}
                    {owner && <DropdownMenuItem variant="destructive" className="danger" disabled={busy} aria-haspopup="dialog" onClick={() => setDeleteOpen(true)}><Trash2 /> Удалить</DropdownMenuItem>}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {!owner && <div className="wish-detail__notice"><Hand /><p>Если вы решили исполнить это желание, обязательно забронируйте его, чтобы никто другой не подарил то же самое.</p></div>}
            <div className="wish-detail__content">
              <Link className="wish-detail__owner" to={profile?.username ? publicProfilePath(profile.username) : "#"}><Avatar user={profile} size="sm" /><strong>{profile?.name || "Автор желания"}</strong></Link>
              <div className="wish-detail__heading"><h2>{wish.title}</h2></div>
              <p className={`wish-detail__description ${wish.description ? "" : "is-muted"}`}>{wish.description || "Автор пока не добавил описание — иногда желание говорит само за себя."}</p>
              <div className="wish-detail__price-bar">
                <strong className="wish-detail__price">{formatMoney(wish.price, wish.currency)}</strong>
                {wish.url && <ShadcnButton nativeButton={false} render={<a href={wish.url} target="_blank" rel="noreferrer" />} className="wish-detail__store-button h-[44px] min-w-[140px] rounded-full px-4 text-base">Где купить <ExternalLink /></ShadcnButton>}
              </div>
              <div className="wish-detail__actions">
                {!owner && <Button variant={wish.reservedByMe ? "reserved" : "primary"} loading={busy} onClick={reserve} disabled={wish.status !== "active" || reservationUnavailable}>{wish.reservedByMe ? "Забронировано вами" : reservationUnavailable ? "Уже забронировано" : "Забронировать"}</Button>}
                {owner && <Button type="button" variant="outline" icon={PackageCheck} loading={busy} onClick={fulfilled}>{wish.status === "fulfilled" ? "Вернуть в активные" : "Отметить исполненным"}</Button>}
              </div>
            </div>
          </div>
          </article>
          <DialogClose type="button" className="modal__close" data-modal-initial-focus aria-label="Закрыть диалог"><X /></DialogClose>
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
          <span className="modal-icon"><Trash2 /></span>
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
  const privacyLabelId = useId();
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
  return <><Modal onClose={onClose} className="modal--list" ariaLabel={editing ? `Настройки списка: ${list.title}` : "Создание списка"}><form className="modal-form" onSubmit={submit}><div className="modal-heading"><span className="modal-icon">{editing ? <Pencil /> : <ListPlus />}</span><div><span className="eyebrow">{editing ? "Настройки списка" : "Новая глава"}</span><h2>{editing ? "Изменить список" : "Создать список"}</h2><p>{editing ? "Название, описание и доступ можно менять в любое время." : "Для отдельной темы, настроения или большой мечты."}</p></div></div><label><span>Название</span><Input autoFocus required placeholder="Например, Новоселье" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label><span>Описание</span><Textarea rows={3} placeholder="Расскажите друзьям о списке" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><Field className="gap-[7px]"><FieldLabel className="items-start" id={privacyLabelId}>Кто увидит</FieldLabel><Select value={form.privacy} onValueChange={(privacy) => setForm((current) => ({ ...current, privacy }))}><SelectTrigger className="h-11 w-full px-3.5 text-base md:text-base data-[size=default]:h-11" aria-labelledby={privacyLabelId}><SelectValue>{(privacy) => LIST_PRIVACY_LABELS[privacy] || ""}</SelectValue></SelectTrigger><SelectContent align="start" alignItemWithTrigger={false}><SelectItem className="min-h-[44px] px-3 text-base" value="public">Все</SelectItem><SelectItem className="min-h-[44px] px-3 text-base" value="followers">Подписчики</SelectItem><SelectItem className="min-h-[44px] px-3 text-base" value="link">Только по ссылке</SelectItem><SelectItem className="min-h-[44px] px-3 text-base" value="private">Только я</SelectItem></SelectContent></Select></Field>{editing && <div className="list-danger"><div><strong>Удалить список</strong><span>Желания не пропадут и будут перенесены в оставшийся список.</span></div><Button type="button" variant="ghost" className="button--danger" icon={Trash2} loading={deleting} disabled={listsCount <= 1} onClick={() => setDeleteOpen(true)}>Удалить</Button></div>}<div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Отмена</Button><Button type="submit" loading={loading}>{editing ? "Сохранить изменения" : "Создать список"}</Button></div></form></Modal>{deleteOpen && <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open); }}><AlertDialogContent><AlertDialogHeader><AlertDialogMedia><Trash2 /></AlertDialogMedia><AlertDialogTitle>Удалить «{list.title}»?</AlertDialogTitle><AlertDialogDescription>Желания из этого списка останутся в вашем общем списке. Отменить удаление списка не получится.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel><AlertDialogAction className="bg-destructive/10 text-destructive hover:bg-destructive/20" disabled={deleting} onClick={remove}>{deleting ? <Spinner /> : <Trash2 />} Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}</>;
}

function ListActionsMenu({ list = null, onEdit, onShare, onCreate, compact = false }) {
  return <div className={`list-actions-menu ${compact ? "is-compact" : ""}`}><DropdownMenu><DropdownMenuTrigger className="public-wishes-head__options" aria-label="Опции списка"><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent className="list-actions-menu__panel static w-[232px]" align="end" sideOffset={8}>{list && <DropdownMenuItem className="min-h-10 gap-2 px-3" onClick={onEdit}><Pencil /> Редактировать список</DropdownMenuItem>}<DropdownMenuItem className="min-h-10 gap-2 px-3" onClick={onShare}><Share2 /> {list ? "Поделиться списком" : "Поделиться профилем"}</DropdownMenuItem><DropdownMenuItem className="min-h-10 gap-2 px-3" onClick={onCreate}><Plus /> Создать новый список</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>;
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
  const metadataNotice = metadata.status !== "idle" && <div className={`metadata-status metadata-status--${metadata.status}`} role="status" aria-live="polite"><span className="metadata-status__icon">{["waiting", "loading"].includes(metadata.status) ? <LoaderCircle className="spin" /> : metadata.status === "success" ? <CheckCircle2 /> : <X />}</span><div><strong>{metadata.status === "waiting" ? "Готовим автозаполнение" : metadata.status === "loading" ? "Читаем карточку товара" : metadata.status === "success" ? "Готово" : "Не получилось автоматически"}</strong><span>{metadata.message}</span></div>{metadata.status === "error" && form.url && <ShadcnButton variant="ghost" size="sm" type="button" onClick={() => recognize(form.url)}>Повторить</ShadcnButton>}</div>;
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
        <span className="modal-icon"><Trash2 /></span>
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
    <Modal
      onClose={requestClose}
      className="modal--wish-editor"
      backdropClassName="modal-backdrop--wish-editor"
      ariaLabel={editing ? `Редактирование желания «${wish.title}»` : "Создание желания"}
    >
      <form className={`wish-editor ${editing ? "wish-editor--edit" : "wish-editor--create"}`} onSubmit={submit}>
        {!editing && <h2 className="wish-editor__title">Новое желание</h2>}
        <Button className="wish-editor__submit" type="submit" loading={loading} aria-label={editing ? "Обновить" : "Загадать желание"}>
          <span className="wish-editor__submit-full">{editing ? "Обновить" : "Загадать желание"}</span>
          {!editing && <span className="wish-editor__submit-mobile" aria-hidden="true">Готово</span>}
        </Button>
        <div className="wish-editor__layout">
          <section className="wish-editor__media" aria-label="Фотография желания">
            <div
              className={`wish-editor__image ${form.imageUrl ? "has-image" : "is-empty"} ${imageDropActive ? "is-dragging" : ""}`}
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
                  className="wish-editor__image-empty h-full w-full max-w-none flex-col gap-2.5 overflow-hidden rounded-[inherit] border-0 bg-transparent p-6 text-center whitespace-normal shadow-none hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent [&_svg:not([class*='size-'])]:size-12"
                  disabled={imageUploading}
                  onClick={() => imageFileRef.current?.click()}
                >
                  {imageUploading ? <LoaderCircle className="spin" /> : <Image />}
                  <strong>{imageUploading ? "Загружаем изображение…" : "Перетащите изображение или нажмите для загрузки"}</strong>
                  <span>JPG, PNG, WEBP · НЕ БОЛЕЕ 8 МБ</span>
                </ShadcnButton>}
              <Input
                ref={imageFileRef}
                className="sr-only !size-px"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Загрузить фотографию желания"
                onChange={(event) => uploadImage(event.target.files?.[0])}
              />
              {editing && <ShadcnButton ref={deleteTriggerRef} type="button" variant="ghost" size="icon" className="wish-editor__delete" aria-label="Удалить желание" title="Удалить желание" disabled={loading || deleting || imageUploading} onClick={() => { if (!mutationRef.current && !loading && !deleting) setDeleteConfirm(true); }}><Trash2 /></ShadcnButton>}
              {form.imageUrl && <ShadcnButton type="button" variant="secondary" className="wish-editor__image-change" disabled={imageUploading} onClick={() => imageFileRef.current?.click()}><Upload /> Сменить фото</ShadcnButton>}
            </div>
            {imageError && <p className="wish-editor__image-error" role="alert">{imageError}</p>}
          </section>

          <section className="wish-editor__panel">
            <div className="wish-editor__scroll">
              <Field className="wish-editor__field">
                <FieldLabel htmlFor={fieldId("title")}>Название</FieldLabel>
                <Input className="h-11 text-base md:text-base" id={fieldId("title")} data-modal-initial-focus={editing ? "" : undefined} required value={form.title} placeholder="Название желания" onChange={(event) => updateMetadataField("title", event.target.value)} />
              </Field>

              <Field className="wish-editor__field wish-editor__field--link grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto] items-center gap-2">
                <FieldLabel htmlFor={fieldId("url")}>Ссылка</FieldLabel>
                <Input className="h-11 text-base md:text-base" id={fieldId("url")} data-modal-initial-focus={!editing ? "" : undefined} type="url" inputMode="url" value={form.url} placeholder="https://…" onChange={(event) => updateMetadataField("url", event.target.value)} />
                <ShadcnButton className="wish-editor__link-action h-8 px-2" type="button" variant="ghost" disabled={!form.url.trim() || metadata.status === "loading"} onClick={() => recognize(form.url)}>
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
                <FieldLabel htmlFor={fieldId("price")}>Цена</FieldLabel>
                <Input className="h-11 text-base md:text-base" id={fieldId("price")} type="number" min="0" value={form.price} placeholder="0" onChange={(event) => updateMetadataField("price", event.target.value)} />
                <NativeSelect className="wish-editor__currency w-full [&>select]:h-11 [&>select]:text-base" aria-label="Валюта" value={form.currency} onChange={(event) => updateMetadataField("currency", event.target.value)}>
                  {WISH_CURRENCIES.map((currency) => <option value={currency} key={currency}>{WISH_CURRENCY_SYMBOLS[currency]}</option>)}
                </NativeSelect>
              </Field>

              <div className="wish-editor__settings" role="group" aria-label="Настройки желания">
                <label className="wish-editor__switch-row">
                  <EyeOff />
                  <span><strong>Секретное желание <i aria-hidden="true" title="Такое желание видно только вам">?</i></strong></span>
                  <Switch className="wish-editor__switch" checked={form.privacy === "private"} onCheckedChange={(checked) => setForm({ ...form, privacy: checked ? "private" : "inherit" })} />
                </label>
                <label className="wish-editor__switch-row">
                  <LockKeyhole />
                  <span><strong>Многократное бронирование <i aria-hidden="true" title="Разрешает нескольким друзьям забронировать одинаковый подарок">?</i></strong></span>
                  <Switch className="wish-editor__switch" checked={form.allowMultiple} onCheckedChange={(checked) => setForm({ ...form, allowMultiple: checked })} />
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
                    return <label className={`wish-editor__list-row ${selected ? "is-selected" : ""}`} key={list.id}>
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
      </form>
      </Modal>
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
  const navigate = useNavigate();
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
          <h1 id="friends-title">{config.label}</h1>
          <nav className="friends-section-nav" aria-label="Разделы друзей">
            <ToggleGroup className="w-full" value={[section]} onValueChange={(values) => { if (values[0] && values[0] !== section) navigate(`/app/friends/${values[0]}`); }} aria-label="Разделы друзей">
              {Object.entries(friendSections).map(([key, item]) => {
                const Icon = item.icon;
                return <ToggleGroupItem className="min-h-[44px] flex-1" value={key} key={key}><Icon /><span>{item.label}</span></ToggleGroupItem>;
              })}
            </ToggleGroup>
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
                        <DropdownMenuItem nativeButton={false} className="min-h-10 gap-2 px-3" render={<Link to={publicProfilePath(person.username)} />}><CircleUserRound />Открыть профиль</DropdownMenuItem>
                        <DropdownMenuItem className="min-h-10 gap-2 px-3" disabled={busyPersonId === person.id} onClick={() => toggleFollow(person)}>
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

function NotificationsPage() { const { refresh } = useSession(); const { data, loading } = useAsync(() => api.get("/notifications"), []); useEffect(() => { api.post("/notifications/read", {}).then(() => refresh()); }, [refresh]); if (loading) return <LoadingScreen compact />; const icons = { reservation: Gift, follow: UserPlus, welcome: Sparkles }; return <div className="app-page notifications-page"><PageTitle eyebrow="В курсе важного" title="Уведомления" text="Сюрпризы останутся скрыты, а важные события — нет." />{data.notifications.length ? <div className="notification-list">{data.notifications.map((item) => { const Icon = icons[item.type] || Bell; return <Link to={item.href || "#"} key={item.id} className={!item.readAt ? "is-unread" : ""}><span><Icon /></span><div><strong>{item.title}</strong><p>{item.body}</p><small>{formatDate(item.createdAt, { hour: "2-digit", minute: "2-digit" })}</small></div><ArrowRight /></Link>; })}</div> : <EmptyState icon={Bell} title="Пока тихо" text="Здесь появятся новые подписки и важные события." />}</div>; }

function ProfileSettingsModal({ user, onClose, onSaved }) {
  const toast = useToast();
  const initialForm = useMemo(() => ({
    name: user.name,
    username: user.username,
    bio: user.bio || "",
    birthday: user.birthday ? String(user.birthday).slice(0, 10) : "",
    avatarUrl: user.avatarUrl || "",
  }), [user]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState("");
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
      setForm((current) => ({ ...current, avatarUrl: result.imageUrl }));
    } catch (error) {
      setImageError(error.message || "Не удалось загрузить фотографию.");
    } finally {
      setImageUploading(false);
      if (imageFileRef.current) imageFileRef.current.value = "";
    }
  };
  const close = () => {
    if (loading || imageUploading) return;
    cleanupUploadedImages();
    onClose();
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!changed || loading || imageUploading) return;
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
  return <Modal onClose={close} wide ariaLabel="Редактирование общих сведений">
    <form className="modal-form settings-editor" onSubmit={submit}>
      <div className="modal-heading">
        <span className="modal-icon"><Pencil /></span>
        <div><span className="eyebrow">Общие сведения</span><h2>Изменить профиль</h2><p>Эти данные видны рядом с вашими списками желаний.</p></div>
      </div>
      <div className="settings-editor__avatar">
        <Avatar user={{ ...user, avatarUrl: form.avatarUrl }} size="xl" />
        <div><strong>Фото профиля</strong><span>JPG, PNG или WEBP · до 8 МБ</span><Button type="button" variant="outline" icon={Upload} loading={imageUploading} onClick={() => imageFileRef.current?.click()}>Загрузить фото</Button></div>
        <Input ref={imageFileRef} className="sr-only !size-px" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Загрузить фото профиля" onChange={(event) => uploadAvatar(event.target.files?.[0])} />
      </div>
      {imageError && <p className="settings-editor__error" role="alert">{imageError}</p>}
      <label><span>Ссылка на фото</span><Input type="text" inputMode="url" value={form.avatarUrl} placeholder="https://… или /api/media/…" onChange={(event) => setForm({ ...form, avatarUrl: event.target.value })} /></label>
      <div className="form-row">
        <Field className="gap-[7px]">
          <FieldLabel className="text-xs font-[760]" htmlFor="settings-profile-name">Имя</FieldLabel>
          <Input id="settings-profile-name" className="h-[52px] text-base md:text-base" data-modal-initial-focus required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </Field>
        <Field className="gap-[7px]">
          <FieldLabel className="text-xs font-[760]" htmlFor="settings-profile-address">Адрес профиля</FieldLabel>
          <InputGroup className="h-[52px] min-w-0">
            <InputGroupAddon align="inline-start" className="shrink-0 pl-4 pr-1">
              <InputGroupText aria-hidden="true">роллапп.рф/</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id="settings-profile-address"
              className="h-full min-w-0 text-base md:text-base"
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
        </Field>
      </div>
      <label><span>О себе</span><Textarea rows={4} maxLength={300} value={form.bio} placeholder="Что вам нравится?" onChange={(event) => setForm({ ...form, bio: event.target.value })} /></label>
      <label className="short-field"><span>День рождения</span><Input type="date" max={new Date().toISOString().slice(0, 10)} value={form.birthday} onChange={(event) => setForm({ ...form, birthday: event.target.value })} /></label>
      <div className="modal-actions"><Button type="button" variant="ghost" onClick={close}>Отмена</Button><Button type="submit" loading={loading} disabled={!changed || imageUploading}>Сохранить</Button></div>
    </form>
  </Modal>;
}

function SettingsSection({ title, children }) {
  return <section className="settings-section"><h2>{title}</h2>{children}</section>;
}

function SettingsRow({ icon: Icon, label, detail = "", action = null, to = "", onClick = null }) {
  const content = <>
    <span className="settings-row__icon"><Icon /></span>
    <span className="settings-row__copy"><strong>{label}</strong>{detail && <small>{detail}</small>}</span>
    {action || ((to || onClick) && <span className="settings-row__arrow"><ArrowRight /></span>)}
  </>;
  if (to) return <Link className="settings-row" to={to}>{content}</Link>;
  if (onClick) return <ShadcnButton variant="ghost" className="settings-row grid h-auto justify-normal gap-[11px] rounded-[14px] border-0 p-0 [&_svg:not([class*='size-'])]:size-6 max-[561px]:gap-2.5" type="button" onClick={onClick}>{content}</ShadcnButton>;
  return <div className="settings-row">{content}</div>;
}

function PhoneSettingsModal({ user, onClose, onSaved }) {
  const toast = useToast();
  const [config, setConfig] = useState({ loading: true, enabled: false });
  const phoneFlow = usePhoneOtp({
    requestPath: "/me/phone/request",
    verifyPath: "/me/phone/verify",
    onVerified: async (result) => {
      toast(user.hasPhone ? "Номер телефона обновлён" : "Номер телефона привязан");
      await onSaved(result.user);
    },
  });

  useEffect(() => {
    let active = true;
    api.get("/auth/phone/config")
      .then((result) => {
        if (active) setConfig({ loading: false, enabled: Boolean(result.enabled) });
      })
      .catch(() => {
        if (active) setConfig({ loading: false, enabled: false });
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (config.loading || !config.enabled) return undefined;
    const focusField = window.requestAnimationFrame(() => phoneFlow.phoneInputRef.current?.focus());
    return () => window.cancelAnimationFrame(focusField);
  }, [config.loading, config.enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = user.hasPhone ? "Изменить номер" : "Привязать номер";
  return <Modal onClose={onClose} ariaLabel={title}>
    <div className="modal-heading">
      <span className="modal-icon"><Phone /></span>
      <div>
        <span className="eyebrow">Безопасный вход</span>
        <h2>{phoneFlow.step === "otp" ? "Подтвердите номер" : title}</h2>
        <p>{phoneFlow.step === "otp" ? `Введите код из SMS на ${phoneFlow.phoneMasked}.` : "После подтверждения вы сможете входить в Rollapp без пароля."}</p>
      </div>
    </div>
    {user.phoneMasked && (
      <div className="phone-settings__current">
        <Phone aria-hidden="true" />
        <span><small>Текущий номер</small><strong>{user.phoneMasked}</strong></span>
      </div>
    )}
    {config.loading
      ? <div className="phone-settings__status" role="status"><LoaderCircle className="spin" /><span>Проверяем доступность SMS…</span></div>
      : config.enabled
        ? <form className="modal-form phone-settings__form" aria-busy={phoneFlow.loading} onSubmit={phoneFlow.submit}>
          <PhoneOtpFields flow={phoneFlow} initialFocus requestLabel="Отправить код" verifyLabel="Подтвердить номер" />
        </form>
        : <div className="phone-settings__status phone-settings__status--unavailable" role="status">
          <Phone />
          <span><strong>Вход по телефону временно недоступен</strong><small>Попробуйте снова немного позже.</small></span>
        </div>}
  </Modal>;
}

function SettingsPage() {
  const { user, refresh } = useSession();
  const [editorOpen, setEditorOpen] = useState(false);
  const [phoneEditorOpen, setPhoneEditorOpen] = useState(false);
  const birthday = user.birthday ? formatDate(user.birthday, { year: "numeric" }) : "Не указан";
  return <div className="app-page settings-page">
    <SettingsSection title="Общие сведения">
      <Card className="settings-profile-card grid gap-[30px] overflow-visible p-5 max-[820px]:gap-5 max-[390px]:gap-3">
        <Avatar user={user} size="xl" />
        <div><strong>{user.name}</strong><span>@{user.username}</span><small>{user.bio || "Расскажите немного о себе"}</small></div>
        <ShadcnButton variant="ghost" size="icon" type="button" aria-label="Редактировать общие сведения" onClick={() => setEditorOpen(true)}><Pencil /></ShadcnButton>
      </Card>
    </SettingsSection>

    <SettingsSection title="Управление данными">
      <Card className="settings-card gap-0 overflow-visible p-5 max-[820px]:px-3 max-[820px]:py-2">
        <SettingsRow icon={Mail} label={user.email} detail="Email для входа" action={<Badge className="settings-row__badge">Основной</Badge>} />
        <SettingsRow icon={Phone} label={user.phoneMasked || "Номер телефона"} detail={user.hasPhone ? "Вход по коду из SMS" : "Не привязан"} onClick={() => setPhoneEditorOpen(true)} />
        <SettingsRow icon={CalendarDays} label="День рождения" detail={birthday} onClick={() => setEditorOpen(true)} />
        <SettingsRow icon={AtSign} label="Адрес профиля" detail={`роллапп.рф/${user.username}`} to={publicProfilePath(user.username)} />
      </Card>
    </SettingsSection>

    <SettingsSection title="Приватность">
      <Card className="settings-card gap-0 overflow-visible p-5 max-[820px]:px-3 max-[820px]:py-2">
        <SettingsRow icon={ListPlus} label="Доступ к спискам" detail="Настройте видимость каждого списка" to="/app/wishes" />
        <SettingsRow icon={EyeOff} label="Секретные желания" detail="Видны только вам" to={`${publicProfilePath(user.username)}?view=secret`} />
      </Card>
    </SettingsSection>

    {editorOpen && <ProfileSettingsModal
      user={user}
      onClose={() => setEditorOpen(false)}
      onSaved={async () => {
        await refresh();
        setEditorOpen(false);
      }}
    />}
    {phoneEditorOpen && <PhoneSettingsModal
      user={user}
      onClose={() => setPhoneEditorOpen(false)}
      onSaved={async () => {
        await refresh();
        setPhoneEditorOpen(false);
      }}
    />}
  </div>;
}

function PublicProfile({ shared = false }) {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSession();
  const toast = useToast();
  const endpoint = shared ? "/shared/" + params.token : "/profile/" + params.username;
  const { data, loading, error, reload } = useAsync(() => api.get(endpoint), [endpoint]);
  const initialView = new URLSearchParams(location.search).get("view");
  const [selected, setSelected] = useState(params.listId || (["secret", "fulfilled"].includes(initialView) ? initialView : "all"));
  const [selectedWishId, setSelectedWishId] = useState(params.wishId || null);
  const [editingWishId, setEditingWishId] = useState(null);
  const [listModal, setListModal] = useState(null);
  const [wishModalOpen, setWishModalOpen] = useState(false);
  const [profileCompact, setProfileCompact] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(20);
  const loadMoreRef = useRef(null);
  const lastWishOpenerRef = useRef(null);

  useEffect(() => {
    const view = new URLSearchParams(location.search).get("view");
    if (!params.wishId) {
      setSelected(params.listId || (["secret", "fulfilled"].includes(view) ? view : "all"));
    }
    setSelectedWishId(params.wishId || null);
  }, [params.listId, params.wishId, location.search]);

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

  useEffect(() => {
    const updateHeader = () => setProfileCompact(window.scrollY > 220);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, []);

  if (loading) return <div className="public-profile public-profile--dark public-profile--state"><LoadingScreen /></div>;
  if (error && !data) return <div className="public-profile public-profile--dark public-profile--state"><div className="not-found"><Logo /><Gift /><h1>Такой список не нашёлся</h1><p>{error.message}</p><ShadcnButton nativeButton={false} render={<Link to={APP_HOME} />} className="button button--primary"><span>В приложение</span></ShadcnButton></div></div>;

  const lists = shared ? [data.list] : data.lists;
  const navigationLists = shared ? lists : lists.filter((list) => !(list.title === "Мои желания" && list.description === "Всё, чему я буду рад"));
  const tabLists = data.isOwner ? navigationLists : [...navigationLists].reverse();
  const activeWishes = data.wishes.filter((wish) => wish.status === "active");
  const fulfilledWishes = data.wishes.filter((wish) => wish.status === "fulfilled");
  const privateListIds = new Set(lists.filter((list) => list.privacy === "private").map((list) => list.id));
  const secretWishes = activeWishes.filter((wish) => wish.privacy === "private" || wish.listIds.some((id) => privateListIds.has(id)));
  const selectedList = lists.find((list) => list.id === selected);
  const wishes = shared
    ? data.wishes
    : selected === "all"
      ? activeWishes
      : selected === "secret"
        ? secretWishes
        : selected === "fulfilled"
          ? fulfilledWishes
          : activeWishes.filter((wish) => wish.listIds.includes(selected));
  const selectedWish = selectedWishId ? data.wishes.find((wish) => wish.id === selectedWishId) : null;
  const editingWish = editingWishId ? data.wishes.find((wish) => wish.id === editingWishId) : null;
  if ((!shared && params.listId && !selectedList) || (params.wishId && !selectedWish)) {
    return <div className="public-profile public-profile--dark public-profile--state"><div className="not-found"><Logo /><Gift /><h1>{params.wishId ? "Желание не найдено" : "Список не найден"}</h1><p>Ссылка устарела или доступ к этой странице ограничен.</p><ShadcnButton nativeButton={false} render={<Link to={shared ? `/s/${params.token}` : publicProfilePath(data.profile.username)} />} className="button button--primary"><span>Вернуться к профилю</span></ShadcnButton></div></div>;
  }
  const sectionTitle = shared ? data.list.title : selected === "secret" ? "Секретные желания" : selected === "fulfilled" ? "Исполнено" : selectedList?.title || (data.isOwner ? "Мои желания" : "Все желания");
  const appTarget = user ? APP_HOME : "/register";
  const friendsTarget = user ? "/app/friends" : "/login";
  const wishCountForList = (listId) => activeWishes.filter((wish) => wish.listIds.includes(listId)).length;
  const profileBasePath = shared ? `/s/${params.token}` : publicProfilePath(data.profile.username);
  const currentCollectionPath = shared
    ? profileBasePath
    : selectedList
      ? publicListPath(data.profile.username, selectedList.id)
      : ["secret", "fulfilled"].includes(selected)
        ? `${publicProfilePath(data.profile.username)}?view=${selected}`
        : publicProfilePath(data.profile.username);

  const selectCollection = (value) => {
    setSelected(value);
    setSelectedWishId(null);
    if (shared) return;
    navigate(value === "all"
      ? publicProfilePath(data.profile.username)
      : ["secret", "fulfilled"].includes(value)
        ? `${publicProfilePath(data.profile.username)}?view=${value}`
        : publicListPath(data.profile.username, value));
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
    if (selected === "secret" || selectedList?.privacy === "private") {
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

  return (
    <div className={`public-profile public-profile--dark ${data.isOwner && !shared ? "public-profile--list-layout" : shared ? "public-profile--shared-layout" : "public-profile--guest-layout"} ${data.isOwner ? "is-owner" : "is-guest"}`}>
      <header className={`profile-header ${profileCompact ? "is-compact" : ""}`}>
        <Logo />
        <div className="profile-header__compact" aria-hidden={!profileCompact}>
          <Avatar user={data.profile} size="sm" />
          <div><strong>{data.profile.name}</strong><span>@{data.profile.username}</span></div>
        </div>
        <nav className="profile-header__dock" aria-label="Основная навигация">
          <Link className="is-active" to={appTarget} aria-label="Мои желания" title="Мои желания"><Heart fill="currentColor" /></Link>
          <Link to={friendsTarget} aria-label="Друзья" title="Друзья"><Users fill="currentColor" /></Link>
          <Link className="profile-header__search" to={friendsTarget} aria-label="Поиск" title="Поиск"><Search /></Link>
        </nav>
        <div className="profile-header__actions">
          {user ? <DropdownMenu><DropdownMenuTrigger className="profile-desktop-menu" aria-label="Открыть меню"><Menu /></DropdownMenuTrigger><DropdownMenuContent className="profile-desktop-panel static visible w-[220px] translate-y-0 opacity-100 pointer-events-auto" align="end" sideOffset={8}><DropdownMenuItem nativeButton={false} className="min-h-10 gap-2 px-3" render={<Link to={APP_HOME} />}><Heart /> Мои желания</DropdownMenuItem><DropdownMenuItem nativeButton={false} className="min-h-10 gap-2 px-3" render={<Link to="/app/settings" />}><Settings /> Настройки</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : <ShadcnButton nativeButton={false} render={<Link to={`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`} />} className="button button--primary"><span>Вход</span></ShadcnButton>}
        </div>
        {!data.isOwner && !shared && <ShadcnButton variant={data.isFollowing ? "secondary" : "default"} className="profile-header__compact-follow" type="button" onClick={follow}>{data.isFollowing ? "Вы подписаны" : "Подписаться"}</ShadcnButton>}
        <Sheet>
          <SheetTrigger className="profile-mobile-menu" aria-label="Открыть меню"><Menu /></SheetTrigger>
          <SheetContent id="profile-mobile-navigation" side="top" showCloseButton={false} className="profile-mobile-panel !fixed !inset-0 !flex !h-dvh !max-h-dvh !w-full !max-w-none !gap-0 !overflow-y-auto !border-0 !bg-popover !text-popover-foreground" aria-label="Меню профиля">
          <SheetTitle className="sr-only">Меню профиля</SheetTitle>
          <SheetDescription className="sr-only">Информация о Rollapp и ссылка на ваш вишлист</SheetDescription>
          <div className="profile-mobile-panel__head"><Logo /><SheetClose aria-label="Закрыть меню"><X /></SheetClose></div>
          <div className="profile-mobile-panel__promo"><div><strong>Rollapp — бесплатный сервис для создания вишлистов и списков желаний</strong><SheetClose nativeButton={false} render={<Link className="button button--primary bg-primary text-primary-foreground hover:bg-primary/80" to={user ? APP_HOME : `/register?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`} />}><span>{user ? "Открыть мой вишлист" : "Создать вишлист"}</span></SheetClose></div><img src="/art/gift-3d.png" alt="" /></div>
          <div className="profile-mobile-panel__about"><p>Rollapp — это бесплатный онлайн-сервис вишлистов. Создайте персональный список желаний, добавьте ссылки на товары из любых магазинов с ценами и поделитесь списком с друзьями или семьёй.</p><p>Друзья бронируют подарки через быстрое бронирование без долгой регистрации — система исключает повторы.</p><p>Вишлист работает в браузере и в приложениях для iOS и Android. Регистрация занимает секунды через электронную почту, а функция многократного бронирования идеально подходит для подарочных сертификатов.</p></div>
          <div className="profile-mobile-panel__legal"><span>© Rollapp</span><span>Россия</span><ShadcnButton variant="link" className="h-auto justify-start p-0 text-inherit" onClick={() => toast("Политика конфиденциальности готовится к публикации")}>Конфиденциальность</ShadcnButton><ShadcnButton variant="link" className="h-auto justify-start p-0 text-inherit" onClick={() => toast("Пользовательское соглашение готовится к публикации")}>Пользовательское соглашение</ShadcnButton></div>
          </SheetContent>
        </Sheet>
      </header>

      <div className="public-profile__layout">
        {data.isOwner && !shared ? <aside className="profile-rail profile-list-rail">
          <nav className="profile-list-rail__lists" aria-label="Списки желаний">
            <ShadcnButton variant="ghost" className="profile-list-rail__create" type="button" onClick={() => setListModal({})}><i aria-hidden="true"><Plus /></i> Создать новый список</ShadcnButton>
            <ShadcnButton variant="ghost" className={selected === "all" ? "active" : ""} type="button" aria-pressed={selected === "all"} onClick={() => selectCollection("all")}><Heart fill={selected === "all" ? "currentColor" : "none"} /><span>Мои желания</span></ShadcnButton>
            {navigationLists.map((list) => <ShadcnButton variant="ghost" className={selected === list.id ? "active" : ""} type="button" aria-pressed={selected === list.id} onClick={() => selectCollection(list.id)} key={list.id}><strong>{wishCountForList(list.id)}</strong><span>{list.title}</span></ShadcnButton>)}
            <ShadcnButton variant="ghost" className={selected === "secret" ? "active" : ""} type="button" aria-pressed={selected === "secret"} onClick={() => selectCollection("secret")}><EyeOff /><span>Секретные желания</span></ShadcnButton>
            <ShadcnButton variant="ghost" className={selected === "fulfilled" ? "active" : ""} type="button" aria-pressed={selected === "fulfilled"} onClick={() => selectCollection("fulfilled")}><Check /><span>Исполнено</span></ShadcnButton>
          </nav>
          <small>© 2026 Rollapp</small>
        </aside> : <aside className="profile-rail profile-guest-rail">
          <div className="profile-rail__intro">
            <p>Rollapp — бесплатный сервис для создания вишлистов и списков желаний</p>
            <ShadcnButton nativeButton={false} render={<Link to={appTarget} />} className="button button--primary"><span>{user ? "Открыть мой список" : "Создать вишлист"}</span></ShadcnButton>
          </div>
          <nav className="profile-guest-rail__people" aria-label="Люди в Rollapp"><Link to={friendsTarget}><Users /> Подписки</Link><Link to={friendsTarget}><UserPlus /> Подписчики</Link><Link to={friendsTarget}><CircleUserRound /> Найти друзей</Link></nav>
          <div className="profile-guest-rail__legal"><span>© Rollapp</span><span>Россия</span><ShadcnButton variant="link" size="xs" type="button" onClick={() => toast("Политика конфиденциальности готовится к публикации")}>Конфиденциальность</ShadcnButton><ShadcnButton variant="link" size="xs" type="button" onClick={() => toast("Пользовательское соглашение готовится к публикации")}>Пользовательское соглашение</ShadcnButton></div>
        </aside>}

        <main>
          <Link className="public-profile__back" to={user ? "/app/friends" : "/login"}><i aria-hidden="true"><ArrowLeft /></i><span>{user ? "Назад" : "Войти"}</span></Link>

          <section className="profile-cover">
            <div className="profile-cover__pattern" />
            <Avatar user={data.profile} size="xl" />
            <div className="profile-cover__copy">
              <span className="profile-handle">@{data.profile.username}</span>
              <h1>{data.profile.name}</h1>
              <p>{data.profile.bio || "Здесь живут желания, которым пора сбыться."}</p>
            </div>
            {data.isOwner && !shared && <Link className="profile-cover__birthday" to="/app/settings"><CalendarDays />{data.profile.birthday ? formatDate(data.profile.birthday) : "Укажите день рождения"}</Link>}
            <div className="profile-cover__controls">
              {data.isOwner ? shared
                ? <Button className="profile-cover__wish-action" onClick={() => navigate(publicListPath(data.profile.username, data.list.id))}>Открыть мой список</Button>
                : <Button className="profile-cover__wish-action" icon={Plus} onClick={() => setWishModalOpen(true)}>Загадать желание</Button> : <>
                <Button variant={data.isFollowing ? "soft" : "primary"} onClick={follow}>{data.isFollowing ? "Вы подписаны" : "Подписаться"}</Button>
                <span className="profile-cover__metric"><Users />{shared ? `${data.wishes.length} желаний` : `${data.followersCount} друзей`}</span>
                <ShadcnButton variant="ghost" size="icon" type="button" className="profile-cover__options" aria-label="Опции профиля" onClick={share}><MoreHorizontal /></ShadcnButton>
              </>}
            </div>
          </section>

          {!shared && <div className="public-list-tabs" aria-label="Списки желаний">
            <ToggleGroup className="contents" value={[selected]} onValueChange={(values) => { if (values[0]) selectCollection(values[0]); }} aria-label="Списки желаний">
              <ToggleGroupItem value="all"><strong>{data.isOwner ? "Мои желания" : "Все желания"}</strong><span>{activeWishes.length}</span></ToggleGroupItem>
              {tabLists.map((list) => <ToggleGroupItem value={list.id} key={list.id}><strong>{list.title}</strong><span>{wishCountForList(list.id)}</span></ToggleGroupItem>)}
              {data.isOwner && <ToggleGroupItem value="secret"><strong>Секретные</strong><span>{secretWishes.length}</span></ToggleGroupItem>}
              {data.isOwner && <ToggleGroupItem value="fulfilled"><strong>Исполнено</strong><span>{fulfilledWishes.length}</span></ToggleGroupItem>}
            </ToggleGroup>
          </div>}

          {shared && <div className={"shared-list-head shared-list-head--" + data.list.color}><ListPlus /><div><span>Отдельный список</span><h2>{data.list.title}</h2><p>{data.list.description}</p></div></div>}

          <div className="public-wishes-head">
            <h2>{sectionTitle} <span>{wishes.length}</span></h2>
            <div className="public-wishes-head__actions"><Button variant="soft" icon={Upload} onClick={share}>Поделиться</Button>{data.isOwner && !shared && <ListActionsMenu list={selectedList} onEdit={() => selectedList && setListModal(selectedList)} onShare={share} onCreate={() => setListModal({})} />}</div>
          </div>

          {wishes.length ? <><div className="wish-grid">{wishes.slice(0, visibleLimit).map((wish) => <WishCard key={wish.id} variant="public" wish={wish} owner={data.isOwner} profile={data.profile} lists={lists} shareToken={shared ? params.token : ""} onChanged={() => reload({ background: true })} onOpen={(opener) => openWish(wish.id, opener)} onEdit={data.isOwner ? () => editWish(wish.id) : undefined} onCreateList={data.isOwner && !shared ? () => setListModal({ attachWishId: wish.id }) : undefined} />)}</div>{visibleLimit < wishes.length && <div className="wish-load-more" ref={loadMoreRef}><LoaderCircle className="spin" /><span>Загружаем ещё желания…</span></div>}</> : <EmptyState icon={Heart} title="В этом списке пока пусто" text="Загляните чуть позже — новая мечта наверняка появится." />}
          {selectedWish && <WishDetailsModal wish={selectedWish} owner={data.isOwner} profile={data.profile} lists={lists} wishes={data.wishes} shareToken={shared ? params.token : ""} onChanged={() => reload({ background: true })} onEdit={data.isOwner && !shared ? () => editWish(selectedWish.id) : undefined} onCreateList={data.isOwner && !shared ? () => createListForWish(selectedWish.id) : undefined} onClose={closeWish} />}
          {editingWish && <WishModal wish={editingWish} onClose={() => setEditingWishId(null)} onSaved={async () => { setEditingWishId(null); await reload(); }} onDeleted={async () => { setEditingWishId(null); await reload(); }} />}
          {listModal && <ListModal list={listModal.id ? listModal : null} listsCount={lists.length} onClose={() => setListModal(null)} onSaved={saveProfileList} onDeleted={async () => { setListModal(null); selectCollection("all"); await reload(); }} />}
          {wishModalOpen && <WishModal onClose={() => setWishModalOpen(false)} onSaved={() => { setWishModalOpen(false); reload(); }} />}
        </main>
      </div>

      <footer><Logo /><span>Создано с мечтами в Rollapp</span><Link to="/register">Собрать свой список <ArrowRight size={16} /></Link></footer>
    </div>
  );
}

function NotFound() { return <div className="not-found"><Logo /><Gift /><h1>Похоже, эта мечта потерялась</h1><p>Страница не существует или ссылка устарела.</p><ShadcnButton nativeButton={false} render={<Link to={APP_HOME} />} className="button button--primary"><span>В приложение</span></ShadcnButton></div>; }

function LegacyProfileRedirect() {
  const params = useParams();
  const location = useLocation();
  const suffix = String(params["*"] || "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const target = `${publicProfilePath(params.username)}${suffix ? `/${suffix}` : ""}${location.search}${location.hash}`;
  return <Navigate to={target} replace />;
}

export default function App() { return <ToastProvider><SessionProvider><Routes><Route path="/" element={<RootRoute />} /><Route path="/login" element={<AuthPage mode="login" />} /><Route path="/register" element={<AuthPage mode="register" />} /><Route path="/ideas" element={<Navigate to={APP_HOME} replace />} /><Route path="/s/:token" element={<PublicProfile shared />} /><Route path="/s/:token/wishes/:wishId" element={<PublicProfile shared />} /><Route path="/app/*" element={<ProtectedApp />} /><Route path="/u/:username/*" element={<LegacyProfileRedirect />} /><Route path="/users/:username/*" element={<LegacyProfileRedirect />} /><Route path="/:username" element={<PublicProfile />} /><Route path="/:username/lists/:listId" element={<PublicProfile />} /><Route path="/:username/wishes/:wishId" element={<PublicProfile />} /><Route path="*" element={<NotFound />} /></Routes></SessionProvider></ToastProvider>; }
