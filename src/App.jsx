import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Archive, ArrowLeft, ArrowRight, Bell, BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown,
  CircleUserRound, ExternalLink, Eye, EyeOff, Flame, Gift, Hand, Heart, Image, Link2, ListPlus,
  LoaderCircle, LockKeyhole, LogOut, Menu, MoreHorizontal, PackageCheck, Pencil, Plus,
  RotateCcw, Search, Settings, Share2, Sparkles, Star, Trash2, Upload, UserPlus,
  Users, WandSparkles, X,
} from "lucide-react";
import { api } from "./api.js";

const SessionContext = createContext(null);
const ToastContext = createContext(null);
const APP_HOME = "/app/wishes";
const modalStack = [];

const formatMoney = (value, currency = "RUB") => value == null ? "Цена не указана" : new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
const formatDate = (value, options = {}) => value ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", ...options }).format(new Date(value)) : "Без даты";
const initials = (name = "?") => name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const WISH_CURRENCIES = ["RUB", "USD", "EUR", "KZT", "BYN"];
const WISH_CURRENCY_SYMBOLS = { RUB: "₽", USD: "$", EUR: "€", KZT: "₸", BYN: "Br" };
const isProductUrl = (value) => { try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } };
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
  const [toasts, setToasts] = useState([]);
  const show = useCallback((message, tone = "default") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((items) => [...items, { id, message, tone }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3500);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => <div key={toast.id} className={`toast toast--${toast.tone}`}><CheckCircle2 size={17} />{toast.message}</div>)}
      </div>
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
  const [imageError, setImageError] = useState(false);
  useEffect(() => { setImageError(false); }, [avatarUrl]);
  return avatarUrl && !imageError
    ? <img className={`avatar avatar--${size} ${className}`} src={avatarUrl} alt="" onError={() => setImageError(true)} />
    : <span className={`avatar avatar--${size} avatar--fallback ${className}`}>{initials(user?.name)}</span>;
}

function Button({ children, className = "", variant = "primary", icon: Icon, loading, ...props }) {
  return <button className={`button button--${variant} ${className}`} disabled={loading || props.disabled} {...props}>{loading ? <LoaderCircle className="spin" size={18} /> : Icon ? <Icon size={18} /> : null}<span>{children}</span></button>;
}

function EmptyState({ icon: Icon = Sparkles, title, text, action }) {
  return <div className="empty-state"><span className="empty-state__icon"><Icon size={28} /></span><h3>{title}</h3><p>{text}</p>{action}</div>;
}

function LoadingScreen({ compact = false }) {
  return <div className={compact ? "inline-loader" : "page-loader"}><span className="gift-loader"><Gift size={22} /></span><span>Собираем желания…</span></div>;
}

function LandingHeader() {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", close);
    document.body.classList.add("nav-open");
    return () => { document.removeEventListener("keydown", close); document.body.classList.remove("nav-open"); };
  }, [open]);
  return (
    <header className="landing-header">
      <Logo />
      <nav id="landing-navigation" className={open ? "landing-nav is-open" : "landing-nav"}>
        <Link to={user ? "/app/wishes" : "/login?next=%2Fapp%2Fwishes"} onClick={() => setOpen(false)}>Мои желания</Link><Link to={user ? "/app/friends" : "/login?next=%2Fapp%2Ffriends"} onClick={() => setOpen(false)}>Друзья</Link><Link to="/ideas" onClick={() => setOpen(false)}>Идеи подарков</Link>
        <div className="landing-nav__mobile-actions">{user ? <Link className="button button--primary" to={APP_HOME} onClick={() => setOpen(false)}><span>Открыть мой вишлист</span></Link> : <><Link className="button button--primary" to="/register" onClick={() => setOpen(false)}><span>Создать вишлист</span></Link><Link className="button button--outline" to="/login" onClick={() => setOpen(false)}><span>Войти</span></Link></>}</div>
      </nav>
      <div className="landing-header__actions">
        {user ? <Link className="button button--primary" to={APP_HOME}><span>Мой вишлист</span><ArrowRight size={18} /></Link> : <><Link className="text-link desktop-only" to="/login">Войти</Link><Link className="button button--primary" to="/register"><span>Создать вишлист</span></Link></>}
      </div>
      <button className="mobile-menu" onClick={() => setOpen(!open)} aria-label={open ? "Закрыть меню" : "Открыть меню"} aria-expanded={open} aria-controls="landing-navigation">{open ? <X /> : <Menu />}</button>
    </header>
  );
}

function RootRoute() {
  const { user, loading } = useSession();
  if (loading) return <LoadingScreen />;
  return <Navigate to={user ? APP_HOME : "/login"} replace />;
}

function AuthPage({ mode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refresh } = useSession();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const nextPath = safeNextPath(new URLSearchParams(location.search).get("next"));
  if (user) return <Navigate to={nextPath} replace />;

  const submit = async (event) => {
    event.preventDefault(); setLoading(true);
    try {
      await api.post(mode === "register" ? "/auth/register" : "/auth/login", form);
      await refresh(); navigate(nextPath); toast(mode === "register" ? "Вишлист готов — добавьте первую мечту" : "С возвращением!");
    } catch (error) { toast(error.message, "error"); } finally { setLoading(false); }
  };

  return (
    <div className="auth-page"><div className="auth-art"><Logo /><div className="auth-art__copy"><span className="eyebrow eyebrow--light"><Heart size={15} fill="currentColor" /> Место для мечтаний</span><h1>{mode === "register" ? <>Пусть близкие<br />знают, <em>чем вас<br />порадовать.</em></> : <>Ваши желания<br /><em>ждут вас.</em></>}</h1><p>Красивый вишлист, приватные брони и ни одного случайного подарка.</p></div><div className="auth-polaroid"><img src="/art/gift.svg" alt="Подарки" /><span>Хороший сюрприз начинается здесь ✦</span></div></div><div className="auth-panel"><Link className="auth-back" to="/ideas"><ArrowLeft size={17} /> Идеи подарков</Link><form className="auth-form" onSubmit={submit}><div><span className="eyebrow">{mode === "register" ? "Новый аккаунт" : "С возвращением"}</span><h2>{mode === "register" ? "Создать свой Rollapp" : "Войти в Rollapp"}</h2><p>{mode === "register" ? "Это бесплатно и займёт меньше минуты." : "Продолжите собирать и исполнять желания."}</p></div>{mode === "register" && <label><span>Как вас зовут</span><input required minLength={2} autoComplete="name" placeholder="Алиса Морозова" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>}<label><span>Email</span><input required type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label><span>Пароль</span><input required minLength={8} type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder="Минимум 8 символов" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label><Button type="submit" loading={loading} className="auth-submit">{mode === "register" ? "Создать вишлист" : "Войти"}</Button><p className="auth-switch">{mode === "register" ? <>Уже есть аккаунт? <Link to={`/login?next=${encodeURIComponent(nextPath)}`}>Войти</Link></> : <>Впервые здесь? <Link to={`/register?next=${encodeURIComponent(nextPath)}`}>Создать аккаунт</Link></>}</p></form></div></div>
  );
}

const shellNav = [
  { to: "/app/wishes", icon: Heart, label: "Мои желания" },
  { to: "/app/ideas", icon: Sparkles, label: "Идеи" },
  { to: "/app/friends/subscriptions", icon: Users, label: "Друзья" },
];

const friendNavigation = [
  { to: "/app/friends/subscriptions", icon: Users, label: "Подписки" },
  { to: "/app/friends/followers", icon: CircleUserRound, label: "Подписчики" },
  { to: "/app/friends/search", icon: UserPlus, label: "Найти друзей" },
];

function FriendsTopbar({ unreadCount, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const accountRef = useRef(null);
  const menuButtonRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event) => {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type === "pointerdown" && accountRef.current?.contains(event.target)) return;
      setMenuOpen(false);
      if (event.type === "keydown") window.requestAnimationFrame(() => menuButtonRef.current?.focus());
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  return (
    <header className="friends-topbar">
      <nav className="friends-topbar__dock" aria-label="Основные разделы">
        <NavLink to="/app/ideas" aria-label="Идеи" title="Идеи"><Flame fill="currentColor" /></NavLink>
        <NavLink to="/app/wishes" aria-label="Мои желания" title="Мои желания"><Heart fill="currentColor" /></NavLink>
        <Link className="active" to="/app/friends/subscriptions" aria-label="Друзья" title="Друзья"><Users fill="currentColor" /></Link>
        <Link className="friends-topbar__search" to="/app/friends/search" aria-label="Найти друзей" title="Найти друзей"><Search /></Link>
      </nav>
      <div className="friends-topbar__account" ref={accountRef}>
        <button ref={menuButtonRef} type="button" className="friends-topbar__menu" aria-label={menuOpen ? "Закрыть меню аккаунта" : "Открыть меню аккаунта"} aria-expanded={menuOpen} aria-controls="friends-account-menu" onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? <X /> : <Menu />}</button>
        {menuOpen && (
          <div className="friends-topbar__panel" id="friends-account-menu">
            <Link to="/app/notifications" onClick={() => setMenuOpen(false)}><Bell />Уведомления{unreadCount > 0 && <i>{unreadCount}</i>}</Link>
            <Link to="/app/settings" onClick={() => setMenuOpen(false)}><Settings />Настройки</Link>
            <button type="button" onClick={onLogout}><LogOut />Выйти</button>
          </div>
        )}
      </div>
    </header>
  );
}

function AppShell({ children, onAddWish }) {
  const { user, unreadCount, refresh } = useSession();
  const navigate = useNavigate(); const location = useLocation(); const toast = useToast(); const [mobileOpen, setMobileOpen] = useState(false);
  const friendsRoute = location.pathname.startsWith("/app/friends");
  const sidebarRef = useRef(null); const mobileMenuButtonRef = useRef(null);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const focusableSelector = "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const closeButton = sidebarRef.current?.querySelector(".sidebar-close");
    window.requestAnimationFrame(() => closeButton?.focus());
    const handleKeyDown = (event) => {
      if (event.key === "Escape") { setMobileOpen(false); return; }
      if (event.key !== "Tab") return;
      const focusable = [...(sidebarRef.current?.querySelectorAll(focusableSelector) || [])].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.classList.add("drawer-open");
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("drawer-open");
      if (mobileMenuButtonRef.current?.isConnected) mobileMenuButtonRef.current.focus();
    };
  }, [mobileOpen]);
  const logout = async () => { await api.post("/auth/logout", {}); await refresh(); navigate("/"); toast("Вы вышли из аккаунта"); };
  return <div className={`app-layout app-layout--dark ${friendsRoute ? "app-layout--friends" : ""}`}><aside ref={sidebarRef} id="app-sidebar" aria-label="Меню приложения" className={`sidebar ${mobileOpen ? "is-open" : ""}`}><div className="sidebar__head"><Logo /><button className="sidebar-close" aria-label="Закрыть меню" onClick={() => setMobileOpen(false)}><X /></button></div>{friendsRoute ? <nav className="sidebar__friend-nav" aria-label="Разделы друзей">{friendNavigation.map(({ to, icon: Icon, label }, index) => <NavLink key={to} to={to} onClick={() => setMobileOpen(false)} className={({ isActive }) => `${index === 2 ? "is-separated" : ""} ${isActive ? "active" : ""}`}><Icon /><span>{label}</span></NavLink>)}</nav> : <><Button icon={Plus} onClick={onAddWish} className="sidebar__add">Добавить желание</Button><nav className="sidebar__nav">{shellNav.map(({ to, icon: Icon, label, end }) => <NavLink key={to} to={to} end={end} onClick={() => setMobileOpen(false)}><Icon size={19} /><span>{label}</span></NavLink>)}</nav></>}<div className="sidebar__bottom"><NavLink to="/app/notifications"><Bell size={19} /><span>Уведомления</span>{unreadCount > 0 && <i>{unreadCount}</i>}</NavLink><NavLink to="/app/settings"><Settings size={19} /><span>Настройки</span></NavLink><div className="sidebar__user"><Avatar user={user} size="sm" /><div><strong>{user.name}</strong><span>@{user.username}</span></div><button onClick={logout} aria-label="Выйти" title="Выйти"><LogOut size={18} /></button></div></div></aside><button className="mobile-overlay" aria-label="Закрыть меню" onClick={() => setMobileOpen(false)} /><main className="app-main"><header className="mobile-app-head"><button ref={mobileMenuButtonRef} onClick={() => setMobileOpen(true)} aria-label="Открыть меню" aria-expanded={mobileOpen} aria-controls="app-sidebar"><Menu /></button><Logo /><Link to="/app/notifications" aria-label="Уведомления"><Bell />{unreadCount > 0 && <i />}</Link></header>{friendsRoute && <FriendsTopbar unreadCount={unreadCount} onLogout={logout} />}{children}</main><nav className="mobile-bottom-nav" aria-label="Основные разделы">{shellNav.map(({ to, icon: Icon, label, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive || (friendsRoute && to.startsWith("/app/friends")) ? "active" : ""}><Icon /><span>{label === "Мои желания" ? "Желания" : label}</span></NavLink>)}</nav></div>;
}

function ProtectedApp() {
  const { user, loading } = useSession(); const [wishModal, setWishModal] = useState(false); const [version, setVersion] = useState(0);
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell onAddWish={() => setWishModal(true)}><Routes><Route index element={<Navigate to={APP_HOME} replace />} /><Route path="wishes" element={<WishesPage onAdd={() => setWishModal(true)} version={version} />} /><Route path="ideas" element={<IdeasPage appMode />} /><Route path="friends" element={<Navigate to="/app/friends/subscriptions" replace />} /><Route path="friends/:section" element={<FriendsPage />} /><Route path="gifts" element={<Navigate to={APP_HOME} replace />} /><Route path="notifications" element={<NotificationsPage />} /><Route path="settings" element={<SettingsPage />} /><Route path="*" element={<Navigate to={APP_HOME} replace />} /></Routes>{wishModal && <WishModal onClose={() => setWishModal(false)} onSaved={() => { setWishModal(false); setVersion((v) => v + 1); }} />}</AppShell>;
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
  const [listsOpen, setListsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const [listPanelPosition, setListPanelPosition] = useState(null);
  const [selectedListIds, setSelectedListIds] = useState(() => [...(wish.listIds || [])]);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const listTriggerRef = useRef(null);
  const listPanelRef = useRef(null);
  const focusMenuOnOpenRef = useRef(false);
  const focusListsOnOpenRef = useRef(false);
  const listCloseTimerRef = useRef(null);
  const { busy, reserve, remove, fulfilled, share, save, update, repeat } = useWishActions({ wish, profile, lists, shareToken, onChanged });
  const categoryLists = lists.filter((list) => !isGeneralList(list));
  const listSelectionChanged = selectedListIds.length !== (wish.listIds || []).length
    || selectedListIds.some((id) => !(wish.listIds || []).includes(id));
  const reservationUnavailable = wish.reservationCount > 0 && !wish.allowMultiple && !wish.reservedByMe;

  useEffect(() => {
    if (!listsOpen) setSelectedListIds([...(wish.listIds || [])]);
  }, [wish.id, wish.listIds, listsOpen]);

  const closeMenu = (restoreFocus = false) => {
    window.clearTimeout(listCloseTimerRef.current);
    if (restoreFocus) triggerRef.current?.focus();
    setMenu(false);
    setListsOpen(false);
    setSelectedListIds([...(wish.listIds || [])]);
    setMenuPosition(null);
    setListPanelPosition(null);
  };

  useEffect(() => {
    if (!menu) return undefined;
    const position = () => {
      const trigger = triggerRef.current;
      const popover = menuRef.current;
      if (!trigger || !popover) return;
      const margin = 6;
      const gap = 10;
      const triggerRect = trigger.getBoundingClientRect();
      const width = Math.min(280, window.innerWidth - margin * 2);
      const height = popover.offsetHeight;
      const left = Math.min(Math.max(margin, triggerRect.left), window.innerWidth - width - margin);
      const below = triggerRect.bottom + gap;
      const top = below + height <= window.innerHeight - margin
        ? below
        : Math.max(margin, triggerRect.top - height - gap);
      setMenuPosition({ left, top, width });
    };
    const frame = window.requestAnimationFrame(position);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [menu, owner]);

  useEffect(() => {
    if (!menu || !menuPosition || !focusMenuOnOpenRef.current) return;
    menuRef.current?.querySelector(".card-menu__main [role='menuitem']:not(:disabled)")?.focus();
    focusMenuOnOpenRef.current = false;
  }, [menu, menuPosition]);

  useEffect(() => {
    if (!menu || !listsOpen) return undefined;
    const position = () => {
      const popover = menuRef.current;
      const panel = listPanelRef.current;
      if (!popover || !panel) return;
      const margin = 6;
      const popoverRect = popover.getBoundingClientRect();
      const anchorRect = listTriggerRef.current?.getBoundingClientRect() || popoverRect;
      const mobile = window.innerWidth <= 640;
      const width = window.innerWidth <= 640
        ? popoverRect.width
        : Math.min(280, window.innerWidth - margin * 2);
      const height = panel.offsetHeight;
      let left;
      if (mobile) left = popoverRect.left;
      else if (anchorRect.right - 8 + width <= window.innerWidth - margin) left = anchorRect.right - 8;
      else left = Math.max(margin, anchorRect.left - width + 8);
      const preferredTop = anchorRect.top - 8 + height <= window.innerHeight - margin
        ? anchorRect.top - 8
        : anchorRect.bottom - height + 8;
      const top = Math.min(Math.max(margin, preferredTop), Math.max(margin, window.innerHeight - height - margin));
      setListPanelPosition({ left, top, width });
    };
    const frame = window.requestAnimationFrame(position);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [menu, listsOpen, menuPosition, categoryLists.length, listSelectionChanged]);

  useEffect(() => () => window.clearTimeout(listCloseTimerRef.current), []);

  useEffect(() => {
    if (!listsOpen || !listPanelPosition || !focusListsOnOpenRef.current) return;
    const firstList = listPanelRef.current?.querySelector("[role='menuitemcheckbox']:not(:disabled)")
      || listPanelRef.current?.querySelector("[role='menuitem']:not(:disabled)");
    firstList?.focus();
    focusListsOnOpenRef.current = false;
  }, [listsOpen, listPanelPosition]);

  useEffect(() => {
    if (!menu) return undefined;
    const handlePointerDown = (event) => {
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      closeMenu(false);
    };
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (listsOpen) {
        setListsOpen(false);
        setSelectedListIds([...(wish.listIds || [])]);
        setListPanelPosition(null);
        window.requestAnimationFrame(() => listTriggerRef.current?.focus());
      } else {
        closeMenu(true);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menu, listsOpen]);

  const toggleList = (list) => {
    if (busy) return;
    const selected = selectedListIds.includes(list.id);
    const nextListIds = selected
      ? selectedListIds.filter((id) => id !== list.id)
      : [...selectedListIds, list.id];
    setSelectedListIds(nextListIds);
  };

  const saveLists = async () => {
    if (!listSelectionChanged || busy) return;
    const updatedWish = await update({ listIds: selectedListIds }, "Списки желания обновлены");
    if (updatedWish) closeMenu(true);
  };

  const cancelListClose = () => window.clearTimeout(listCloseTimerRef.current);
  const scheduleListClose = () => {
    if (listSelectionChanged) return;
    cancelListClose();
    listCloseTimerRef.current = window.setTimeout(() => {
      setListsOpen(false);
      setSelectedListIds([...(wish.listIds || [])]);
      setListPanelPosition(null);
    }, 140);
  };
  const openListsOnHover = () => {
    if (!window.matchMedia("(hover: hover)").matches) return;
    cancelListClose();
    if (!listsOpen) {
      setListsOpen(true);
      setListPanelPosition(null);
    }
  };

  const handleMenuKeyDown = (event) => {
    const inListPanel = Boolean(listPanelRef.current?.contains(event.target));
    const container = inListPanel ? listPanelRef.current : menuRef.current?.querySelector(".card-menu__main");
    const items = [...(container?.querySelectorAll("[role='menuitem']:not(:disabled), [role='menuitemcheckbox']:not(:disabled)") || [])]
      .filter((item) => item.getClientRects().length > 0);
    const currentIndex = items.indexOf(document.activeElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && items.length) {
      event.preventDefault();
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (currentIndex + 1 + items.length) % items.length
            : (currentIndex - 1 + items.length) % items.length;
      items[nextIndex]?.focus();
      return;
    }
    if (event.key === "ArrowRight" && event.target === listTriggerRef.current && !listsOpen) {
      event.preventDefault();
      focusListsOnOpenRef.current = true;
      setListsOpen(true);
      setListPanelPosition(null);
      return;
    }
    if (event.key === "ArrowLeft" && inListPanel) {
      event.preventDefault();
      setListsOpen(false);
      setSelectedListIds([...(wish.listIds || [])]);
      setListPanelPosition(null);
      window.requestAnimationFrame(() => listTriggerRef.current?.focus());
      return;
    }
    if (event.key === "Tab") closeMenu(true);
  };

  const menuContent = menu ? createPortal(
    <>
      <div className="card-menu__dismiss-layer" aria-hidden="true" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); closeMenu(false); }} />
      <div
        ref={menuRef}
        id={`wish-menu-${wish.id}`}
        className={`card-menu card-menu--popover ${owner ? "card-menu--owner" : ""} ${listsOpen ? "is-showing-lists" : ""}`}
        style={menuPosition || { left: 0, top: 0, visibility: "hidden" }}
        role="menu"
        aria-label={`Действия с желанием «${wish.title}»`}
        onKeyDown={handleMenuKeyDown}
      >
      <div className="card-menu__main" role="group">
        {!owner && <button role="menuitem" type="button" disabled={busy} onClick={() => { closeMenu(true); reserve(); }}><Gift /> {wish.reservedByMe ? "Снять бронь" : "Забронировать"}</button>}
        {!owner && <button role="menuitem" type="button" disabled={busy} onClick={() => { closeMenu(true); save(); }}><Archive /> Сохранить к себе</button>}
        {owner && wish.status === "fulfilled" ? <>
          <button role="menuitem" type="button" disabled={busy} onClick={() => { closeMenu(true); fulfilled(); }}><RotateCcw /> Не исполнено</button>
          <button role="menuitem" type="button" disabled={busy} onClick={() => { closeMenu(true); repeat(); }}><Plus /> Загадать ещё раз</button>
          {onEdit && <button role="menuitem" type="button" disabled={busy} aria-haspopup="dialog" onClick={() => { closeMenu(true); onEdit(); }}><Pencil /> Редактировать</button>}
        </> : owner && <>
          <button role="menuitem" type="button" disabled={busy} onClick={() => { closeMenu(true); fulfilled(); }}><Check /> Исполнено</button>
          {onEdit && <button role="menuitem" type="button" disabled={busy} aria-haspopup="dialog" onClick={() => { closeMenu(true); onEdit(); }}><Pencil /> Редактировать</button>}
          <button
            role="menuitem"
            type="button"
            disabled={busy}
            onClick={() => {
              const nextPrivacy = wish.privacy === "private" ? "inherit" : "private";
              closeMenu(true);
              update(
                { privacy: nextPrivacy },
                nextPrivacy === "private" ? "Желание стало секретным" : "Желание снова видно друзьям",
              );
            }}
          >
            {wish.privacy === "private" ? <Eye /> : <EyeOff />}
            {wish.privacy === "private" ? "Сделать видимым" : "Сделать секретным"}
          </button>
          <button
            ref={listTriggerRef}
            role="menuitem"
            type="button"
            className="card-menu__submenu-trigger"
            disabled={busy}
            aria-haspopup="menu"
            aria-expanded={listsOpen}
            aria-controls={`wish-lists-${wish.id}`}
            onMouseEnter={openListsOnHover}
            onMouseLeave={scheduleListClose}
            onClick={(event) => {
              if (event.detail === 0 && !listsOpen) focusListsOnOpenRef.current = true;
              const hoverCapable = window.matchMedia("(hover: hover)").matches;
              setListsOpen((open) => {
                const nextOpen = event.detail > 0 && hoverCapable ? true : !open;
                if (!nextOpen) setSelectedListIds([...(wish.listIds || [])]);
                return nextOpen;
              });
              setListPanelPosition(null);
            }}
          >
            <ListPlus /> <span>Добавить в список</span><ArrowRight className="card-menu__chevron" />
          </button>
        </>}
        {(!owner || wish.status !== "fulfilled") && <button role="menuitem" type="button" disabled={busy} onClick={() => { closeMenu(true); share(); }}><Share2 /> Поделиться</button>}
        {!owner && wish.url && <a role="menuitem" href={wish.url} target="_blank" rel="noreferrer" onClick={() => closeMenu(true)}><ExternalLink /> Открыть магазин</a>}
        {owner && <button role="menuitem" type="button" className="danger" disabled={busy} onClick={() => { closeMenu(true); setDeleteOpen(true); }}><Trash2 /> Удалить</button>}
      </div>

        {owner && listsOpen && <section
          ref={listPanelRef}
          id={`wish-lists-${wish.id}`}
          className="card-menu__lists"
          style={listPanelPosition || { left: 0, top: 0, visibility: "hidden" }}
          role="menu"
          aria-label={`Списки желания «${wish.title}»`}
          onMouseEnter={cancelListClose}
          onMouseLeave={scheduleListClose}
        >
        <div className="card-menu__lists-head">
          <strong>Списки</strong>
          {onCreateList && <button role="menuitem" type="button" disabled={busy} onClick={() => { closeMenu(true); onCreateList(); }}><ListPlus /> Новый список</button>}
        </div>
        <div className="card-menu__list-scroll">
          {categoryLists.length ? categoryLists.map((list) => {
            const selected = selectedListIds.includes(list.id);
            return <button
              type="button"
              key={list.id}
              className={`card-menu__list-row ${selected ? "is-selected" : ""}`}
              role="menuitemcheckbox"
              aria-checked={selected}
              disabled={busy}
              onClick={() => toggleList(list)}
            >
              <span className={`card-menu__list-thumb list-dot--${list.color}`}>
                <ListPlus />
              </span>
              <span>
                {list.title}
                {list.privacy !== "public" && <small className="card-menu__list-privacy" aria-hidden="true">
                  {list.privacy === "private" ? <LockKeyhole /> : list.privacy === "link" ? <Link2 /> : <Users />}
                </small>}
              </span>
              <span className="card-menu__list-state">{selected ? <Check /> : <Plus />}</span>
            </button>;
          }) : <p className="card-menu__lists-empty">Создайте первый тематический список.</p>}
        </div>
        {listSelectionChanged && <div className="card-menu__lists-actions">
          <button role="menuitem" type="button" disabled={busy} onClick={() => setSelectedListIds([...(wish.listIds || [])])}>Отменить</button>
          <button role="menuitem" type="button" className="is-primary" disabled={busy} onClick={saveLists}>{busy ? <LoaderCircle className="spin" /> : <Check />} Сохранить</button>
        </div>}
      </section>}
      </div>
    </>,
    document.body,
  ) : null;

  return (
    <>
    <article className={`wish-card ${variant ? `wish-card--${variant}` : ""} ${wish.status === "fulfilled" ? "is-fulfilled" : ""}`}>
      {onOpen && <button type="button" className="wish-card__open" data-wish-id={wish.id} aria-label={`Открыть желание «${wish.title}»`} aria-haspopup="dialog" onClick={(event) => { closeMenu(); onOpen(event.currentTarget); }} />}
      <div className="wish-card__image">{wish.imageUrl ? <img src={wish.imageUrl} alt="" /> : <span><Gift size={36} /></span>}<Priority value={wish.priority} />{wish.status === "fulfilled" && <div className="fulfilled-badge"><Check /> Исполнено</div>}</div>
      <div className="wish-card__body">
        <div className="wish-card__top"><span>{formatMoney(wish.price, wish.currency)}</span><button ref={triggerRef} type="button" aria-label={`Опции желания «${wish.title}»`} aria-haspopup="menu" aria-expanded={menu} aria-controls={`wish-menu-${wish.id}`} onKeyDown={(event) => { if (event.key === "ArrowDown" && !menu) { event.preventDefault(); focusMenuOnOpenRef.current = true; setMenu(true); } }} onClick={(event) => { if (!menu && event.detail === 0) focusMenuOnOpenRef.current = true; setMenu((open) => !open); setListsOpen(false); setMenuPosition(null); setListPanelPosition(null); }}><MoreHorizontal /></button></div>
        <h3>{wish.title}</h3>
        <p>{wish.description || "Без дополнительного описания"}</p>
        {owner ? <div className="wish-card__owner-meta">{wish.privacy === "private" ? <span><LockKeyhole /> Только вам</span> : <span><Eye /> Виден друзьям</span>}{wish.reservationCount > 0 && <span><Gift /> Кто-то готовит подарок</span>}</div> : <Button variant={wish.reservedByMe ? "reserved" : "outline"} loading={busy} icon={wish.reservedByMe ? Check : Gift} onClick={reserve} disabled={wish.status !== "active" || reservationUnavailable}>{wish.reservedByMe ? "Забронировано вами" : reservationUnavailable ? "Уже забронировано" : "Забронировать"}</Button>}
      </div>
      {menuContent}
    </article>
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
  return <div className="app-page wishes-page"><PageTitle eyebrow="Личная коллекция" title="Мои желания" text={`${activeWishes.length} активных · ${data.wishes.filter((wish) => wish.status === "fulfilled").length} исполнено`} action={<div className="page-actions">{selectedList && <Button variant="outline" icon={Pencil} onClick={() => setListModal(selectedList)}>Настройки списка</Button>}<Button variant="outline" icon={Share2} onClick={share}>Поделиться</Button><Button icon={Plus} onClick={onAdd}>Добавить</Button></div>} /><div className="list-tabs"><button className={selected === "all" ? "active" : ""} onClick={() => setSelected("all")}><Heart size={16} /> Мои желания <span>{activeWishes.length}</span></button>{categoryLists.map((list) => <button className={selected === list.id ? "active" : ""} key={list.id} onClick={() => setSelected(list.id)}>{list.privacy === "private" && <LockKeyhole size={14} />}{list.title} <span>{list.wishCount}</span></button>)}<button className="list-tabs__add" onClick={() => setListModal({})}><Plus size={16} /> Новый список</button></div>{wishes.length ? <div className="wish-grid">{wishes.map((wish) => <WishCard key={wish.id} wish={wish} owner profile={user} lists={data.lists} onChanged={() => reload({ background: true })} onOpen={() => setSelectedWishId(wish.id)} onEdit={() => editWish(wish.id)} onCreateList={() => setListModal({ attachWishId: wish.id })} />)}</div> : <EmptyState icon={Heart} title="В этом списке пока пусто" text="Добавьте то, что действительно порадует." action={<Button icon={Plus} onClick={onAdd}>Добавить желание</Button>} />}{selectedWish && <WishDetailsModal wish={selectedWish} owner profile={user} lists={data.lists} wishes={data.wishes} onChanged={() => reload({ background: true })} onEdit={() => editWish(selectedWish.id)} onCreateList={() => { setSelectedWishId(null); setListModal({ attachWishId: selectedWish.id }); }} onClose={() => setSelectedWishId(null)} />}{editingWish && <WishModal wish={editingWish} onClose={() => setEditingWishId(null)} onSaved={async () => { setEditingWishId(null); await reload(); }} onDeleted={async () => { setEditingWishId(null); await reload(); }} />}{listModal && <ListModal list={listModal.id ? listModal : null} listsCount={data.lists.length} onClose={() => setListModal(null)} onSaved={saveList} onDeleted={async () => { setListModal(null); setSelected("all"); await reload(); }} />}</div>;
}

function Modal({ children, onClose, onEscape, wide = false, className = "", ariaLabel = "Диалог Rollapp", portal = true, backdropClassName = "" }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const onEscapeRef = useRef(onEscape);
  const modalTokenRef = useRef(Symbol("modal"));
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { onEscapeRef.current = onEscape; }, [onEscape]);
  useEffect(() => {
    const modalToken = modalTokenRef.current;
    const previousFocus = document.activeElement;
    modalStack.push(modalToken);
    document.body.classList.add("modal-open");
    const focusableSelector = "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const focusDialog = window.requestAnimationFrame(() => {
      if (modalStack.at(-1) !== modalToken) return;
      if (dialogRef.current?.contains(document.activeElement)) return;
      const target = dialogRef.current?.querySelector("[autofocus], [data-modal-initial-focus]") || dialogRef.current;
      target?.focus();
    });
    const handleKeyDown = (event) => {
      if (modalStack.at(-1) !== modalToken) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (onEscapeRef.current?.(event)) return;
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll(focusableSelector)].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) { event.preventDefault(); dialogRef.current.focus(); return; }
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (active === dialogRef.current || !dialogRef.current.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusDialog);
      document.removeEventListener("keydown", handleKeyDown);
      const wasTopModal = modalStack.at(-1) === modalToken;
      const stackIndex = modalStack.lastIndexOf(modalToken);
      if (stackIndex >= 0) modalStack.splice(stackIndex, 1);
      if (!modalStack.length) document.body.classList.remove("modal-open");
      if (wasTopModal && previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  const modal = <div className={`modal-backdrop ${backdropClassName}`} onMouseDown={(event) => event.target === event.currentTarget && onCloseRef.current()}><div ref={dialogRef} className={`modal ${wide ? "modal--wide" : ""} ${className}`} role="dialog" aria-modal="true" aria-label={ariaLabel} tabIndex={-1}>{children}<button type="button" className="modal__close" data-modal-initial-focus aria-label="Закрыть диалог" onClick={() => onCloseRef.current()}><X /></button></div></div>;
  return portal ? createPortal(modal, document.body) : modal;
}

function WishDetailsModal({ wish, owner = false, profile, shareToken = "", lists = [], wishes = [], onChanged, onEdit, onCreateList, onClose }) {
  const categoryLists = useMemo(() => lists.filter((list) => !isGeneralList(list)), [lists]);
  const normalizeListIds = useCallback((ids = []) => categoryLists.filter((list) => ids.includes(list.id)).map((list) => list.id), [categoryLists]);
  const [listsOpen, setListsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuListsOpen, setMenuListsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedListIds, setSelectedListIds] = useState(() => normalizeListIds(wish.listIds));
  const [menuPosition, setMenuPosition] = useState(null);
  const [menuListsPosition, setMenuListsPosition] = useState(null);
  const listTriggerRef = useRef(null);
  const listPanelRef = useRef(null);
  const menuTriggerRef = useRef(null);
  const menuRef = useRef(null);
  const menuListsTriggerRef = useRef(null);
  const menuListsPanelRef = useRef(null);
  const listMutationRef = useRef(false);
  const focusListOnOpenRef = useRef(false);
  const focusMenuOnOpenRef = useRef(false);
  const focusMenuListsOnOpenRef = useRef(false);
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

  const closeListPicker = useCallback((restoreFocus = false) => {
    setListsOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => listTriggerRef.current?.focus());
  }, []);

  const closeActionMenu = useCallback((restoreFocus = false) => {
    setMenuOpen(false);
    setMenuListsOpen(false);
    setMenuPosition(null);
    setMenuListsPosition(null);
    if (restoreFocus) window.requestAnimationFrame(() => menuTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const position = () => {
      const trigger = menuTriggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const margin = 6;
      const gap = 10;
      const triggerRect = trigger.getBoundingClientRect();
      const width = Math.min(280, window.innerWidth - margin * 2);
      const height = menu.offsetHeight;
      const left = Math.min(
        Math.max(margin, triggerRect.left),
        window.innerWidth - width - margin,
      );
      const below = triggerRect.bottom + gap;
      const top = below + height <= window.innerHeight - margin
        ? below
        : Math.max(margin, triggerRect.top - height - gap);
      setMenuPosition({ left, top, width });
    };
    const frame = window.requestAnimationFrame(position);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [menuOpen, owner, wish.status]);

  useEffect(() => {
    if (!menuOpen || !menuPosition || !focusMenuOnOpenRef.current) return;
    menuRef.current?.querySelector(".card-menu__main [role='menuitem']:not(:disabled)")?.focus();
    focusMenuOnOpenRef.current = false;
  }, [menuOpen, menuPosition]);

  useEffect(() => {
    if (!menuOpen || !menuListsOpen) return undefined;
    const position = () => {
      const menu = menuRef.current;
      const panel = menuListsPanelRef.current;
      if (!menu || !panel) return;
      const margin = 6;
      const menuRect = menu.getBoundingClientRect();
      const anchorRect = menuListsTriggerRef.current?.getBoundingClientRect() || menuRect;
      const mobile = window.innerWidth <= 640;
      const width = mobile ? menuRect.width : Math.min(280, window.innerWidth - margin * 2);
      const height = panel.offsetHeight;
      let left;
      if (mobile) left = menuRect.left;
      else if (anchorRect.right - 8 + width <= window.innerWidth - margin) left = anchorRect.right - 8;
      else left = Math.max(margin, anchorRect.left - width + 8);
      const preferredTop = anchorRect.top - 8 + height <= window.innerHeight - margin
        ? anchorRect.top - 8
        : anchorRect.bottom - height + 8;
      const top = mobile
        ? Math.min(Math.max(margin, menuRect.top), Math.max(margin, window.innerHeight - height - margin))
        : Math.min(Math.max(margin, preferredTop), Math.max(margin, window.innerHeight - height - margin));
      setMenuListsPosition({ left, top, width });
    };
    const frame = window.requestAnimationFrame(position);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [menuOpen, menuListsOpen, menuPosition, categoryLists.length]);

  useEffect(() => {
    if (!menuListsOpen || !menuListsPosition || !focusMenuListsOnOpenRef.current) return;
    const selected = menuListsPanelRef.current?.querySelector("[role='menuitemcheckbox'][aria-checked='true']:not(:disabled)");
    const first = menuListsPanelRef.current?.querySelector("[role='menuitemcheckbox']:not(:disabled), [role='menuitem']:not(:disabled)");
    (selected || first)?.focus();
    focusMenuListsOnOpenRef.current = false;
  }, [menuListsOpen, menuListsPosition]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handlePointerDown = (event) => {
      if (menuTriggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      closeActionMenu(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen, closeActionMenu]);

  useEffect(() => {
    if (!listsOpen) return undefined;
    const handlePointerDown = (event) => {
      if (listTriggerRef.current?.contains(event.target) || listPanelRef.current?.contains(event.target)) return;
      closeListPicker(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [listsOpen, closeListPicker]);

  useEffect(() => {
    if (!listsOpen || !focusListOnOpenRef.current) return;
    const selected = listPanelRef.current?.querySelector("[role='menuitemcheckbox'][aria-checked='true']:not(:disabled)");
    const first = listPanelRef.current?.querySelector("[role='menuitemcheckbox']:not(:disabled), [role='menuitem']:not(:disabled)");
    (selected || first)?.focus();
    focusListOnOpenRef.current = false;
  }, [listsOpen]);

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

  const handleListPickerKeyDown = (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...(listPanelRef.current?.querySelectorAll("[role='menuitemcheckbox']:not(:disabled), [role='menuitem']:not(:disabled)") || [])]
      .filter((item) => item.getClientRects().length > 0);
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1 + items.length) % items.length
          : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  const renderListPickerBody = (createList) => <>
    <div className="card-menu__lists-head">
      <strong>Списки</strong>
      {onCreateList && <button role="menuitem" type="button" disabled={busy} onClick={createList}><ListPlus /> Новый список</button>}
    </div>
    <div className="card-menu__list-scroll">
      {categoryLists.length ? categoryLists.map((list) => {
        const selected = selectedListIds.includes(list.id);
        const cover = wishes.find((item) => item.imageUrl && item.listIds?.includes(list.id))?.imageUrl || "";
        return <button
          type="button"
          key={list.id}
          className={`card-menu__list-row ${selected ? "is-selected" : ""}`}
          role="menuitemcheckbox"
          aria-checked={selected}
          disabled={busy}
          onClick={() => toggleList(list)}
        >
          <span className={`card-menu__list-thumb list-dot--${list.color}`}>
            {cover ? <img src={cover} alt="" /> : <ListPlus />}
          </span>
          <span>
            {list.title}
            {list.privacy !== "public" && <small className="card-menu__list-privacy" aria-hidden="true">
              {list.privacy === "private" ? <LockKeyhole /> : list.privacy === "link" ? <Link2 /> : <Users />}
            </small>}
          </span>
          <span className="card-menu__list-state">{selected ? <Check /> : <Plus />}</span>
        </button>;
      }) : <p className="card-menu__lists-empty">Создайте первый тематический список.</p>}
    </div>
  </>;

  const handleActionMenuKeyDown = (event) => {
    const inListPanel = Boolean(menuListsPanelRef.current?.contains(event.target));
    const container = inListPanel ? menuListsPanelRef.current : menuRef.current?.querySelector(".card-menu__main");
    const items = [...(container?.querySelectorAll("[role='menuitem']:not(:disabled), [role='menuitemcheckbox']:not(:disabled)") || [])]
      .filter((item) => item.getClientRects().length > 0);
    const currentIndex = items.indexOf(document.activeElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && items.length) {
      event.preventDefault();
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (currentIndex + 1 + items.length) % items.length
            : (currentIndex - 1 + items.length) % items.length;
      items[nextIndex]?.focus();
      return;
    }
    if (event.key === "ArrowRight" && event.target === menuListsTriggerRef.current && !menuListsOpen) {
      event.preventDefault();
      focusMenuListsOnOpenRef.current = true;
      setMenuListsOpen(true);
      setMenuListsPosition(null);
      return;
    }
    if (event.key === "ArrowLeft" && inListPanel) {
      event.preventDefault();
      setMenuListsOpen(false);
      setMenuListsPosition(null);
      window.requestAnimationFrame(() => menuListsTriggerRef.current?.focus());
      return;
    }
    if (event.key === "Tab") closeActionMenu(false);
  };

  const listPicker = owner && listsOpen ? <section
    ref={listPanelRef}
    id={`wish-detail-lists-${wish.id}`}
    className="card-menu--popover wish-detail__list-popover"
    role="menu"
    aria-label={`Списки желания «${wish.title}»`}
    onKeyDown={handleListPickerKeyDown}
  >
    {renderListPickerBody(() => { closeListPicker(false); onCreateList?.(); })}
  </section> : null;

  const actionMenu = menuOpen ? <div
    ref={menuRef}
    id={`wish-detail-menu-${wish.id}`}
    className={`card-menu card-menu--popover wish-detail__actions-menu ${owner ? "card-menu--owner" : ""} ${menuListsOpen ? "is-showing-lists" : ""}`}
    style={menuPosition || { left: 0, top: 0, visibility: "hidden" }}
    role="menu"
    aria-label={`Действия с желанием «${wish.title}»`}
    onKeyDown={handleActionMenuKeyDown}
  >
    <div className="card-menu__main" role="group">
      {!owner && <button role="menuitem" type="button" disabled={busy || wish.status !== "active" || reservationUnavailable} onClick={() => { closeActionMenu(true); reserve(); }}><Gift /> {wish.reservedByMe ? "Снять бронь" : "Забронировать"}</button>}
      {!owner && <button role="menuitem" type="button" disabled={busy} onClick={() => { closeActionMenu(true); save(); }}><Archive /> Сохранить к себе</button>}
      {owner && wish.status === "fulfilled" ? <>
        <button role="menuitem" type="button" disabled={busy} onClick={() => { closeActionMenu(true); fulfilled(); }}><RotateCcw /> Не исполнено</button>
        <button role="menuitem" type="button" disabled={busy} onClick={() => { closeActionMenu(true); repeat(); }}><Plus /> Загадать ещё раз</button>
        {onEdit && <button role="menuitem" type="button" disabled={busy} aria-haspopup="dialog" onClick={() => { closeActionMenu(false); onEdit(); }}><Pencil /> Редактировать</button>}
      </> : owner && <>
        <button role="menuitem" type="button" disabled={busy} onClick={() => { closeActionMenu(true); fulfilled(); }}><Check /> Исполнено</button>
        {onEdit && <button role="menuitem" type="button" disabled={busy} aria-haspopup="dialog" onClick={() => { closeActionMenu(false); onEdit(); }}><Pencil /> Редактировать</button>}
        <button
          role="menuitem"
          type="button"
          disabled={busy}
          onClick={() => {
            const nextPrivacy = wish.privacy === "private" ? "inherit" : "private";
            closeActionMenu(true);
            update(
              { privacy: nextPrivacy },
              nextPrivacy === "private" ? "Желание стало секретным" : "Желание снова видно друзьям",
            );
          }}
        >
          {wish.privacy === "private" ? <Eye /> : <EyeOff />}
          {wish.privacy === "private" ? "Сделать видимым" : "Сделать секретным"}
        </button>
        <button
          ref={menuListsTriggerRef}
          role="menuitem"
          type="button"
          className="card-menu__submenu-trigger"
          disabled={busy}
          aria-haspopup="menu"
          aria-expanded={menuListsOpen}
          aria-controls={`wish-detail-action-lists-${wish.id}`}
          onMouseEnter={() => {
            if (!window.matchMedia("(hover: hover)").matches || menuListsOpen) return;
            setMenuListsOpen(true);
            setMenuListsPosition(null);
          }}
          onClick={(event) => {
            if (event.detail === 0 && !menuListsOpen) focusMenuListsOnOpenRef.current = true;
            const hoverCapable = window.matchMedia("(hover: hover)").matches;
            setMenuListsOpen((open) => event.detail > 0 && hoverCapable ? true : !open);
            setMenuListsPosition(null);
          }}
        >
          <ListPlus /> <span>Добавить в список</span><ArrowRight className="card-menu__chevron" />
        </button>
      </>}
      {(!owner || wish.status !== "fulfilled") && <button role="menuitem" type="button" disabled={busy} onClick={() => { closeActionMenu(true); share(); }}><Share2 /> Поделиться</button>}
      {!owner && wish.url && <a role="menuitem" href={wish.url} target="_blank" rel="noreferrer" onClick={() => closeActionMenu(true)}><ExternalLink /> Открыть магазин</a>}
      {owner && <button role="menuitem" type="button" className="danger" disabled={busy} aria-haspopup="dialog" onClick={() => { closeActionMenu(false); setDeleteOpen(true); }}><Trash2 /> Удалить</button>}
    </div>
    {owner && menuListsOpen && <section
      ref={menuListsPanelRef}
      id={`wish-detail-action-lists-${wish.id}`}
      className="card-menu__lists"
      style={menuListsPosition || { left: 0, top: 0, visibility: "hidden" }}
      role="menu"
      aria-label={`Списки желания «${wish.title}»`}
    >
      {renderListPickerBody(() => { closeActionMenu(false); onCreateList?.(); })}
    </section>}
  </div> : null;

  return (
    <>
      <Modal
        portal
        onClose={onClose}
        onEscape={() => {
          if (menuListsOpen) {
            setMenuListsOpen(false);
            setMenuListsPosition(null);
            window.requestAnimationFrame(() => menuListsTriggerRef.current?.focus());
            return true;
          }
          if (menuOpen) {
            closeActionMenu(true);
            return true;
          }
          if (listsOpen) {
            closeListPicker(true);
            return true;
          }
          return false;
        }}
        className="modal--wish-detail"
        backdropClassName="modal-backdrop--wish-detail"
        ariaLabel={`Желание: ${wish.title}`}
      >
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
                  ? <button
                      ref={listTriggerRef}
                      type="button"
                      aria-label={`Изменить списки желания. Сейчас: ${listTitleText}`}
                      aria-haspopup="menu"
                      aria-expanded={listsOpen}
                      aria-controls={`wish-detail-lists-${wish.id}`}
                      onKeyDown={(event) => {
                        if (event.key !== "ArrowDown" || listsOpen) return;
                        event.preventDefault();
                        closeActionMenu(false);
                        focusListOnOpenRef.current = true;
                        setListsOpen(true);
                      }}
                      onClick={(event) => {
                        closeActionMenu(false);
                        if (!listsOpen && event.detail === 0) focusListOnOpenRef.current = true;
                        setListsOpen((open) => !open);
                      }}
                    ><span>{listLabel}</span>{listsOpen ? <X /> : <ChevronDown />}</button>
                  : <span><span>{listLabel}</span><ChevronDown /></span>}
                {listPicker}
              </div>
              <button
                ref={menuTriggerRef}
                className="wish-detail__share"
                type="button"
                aria-label={`Опции желания «${wish.title}»`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={`wish-detail-menu-${wish.id}`}
                title="Опции желания"
                onKeyDown={(event) => {
                  if (event.key !== "ArrowDown" || menuOpen) return;
                  event.preventDefault();
                  closeListPicker(false);
                  focusMenuOnOpenRef.current = true;
                  setMenuOpen(true);
                  setMenuPosition(null);
                }}
                onClick={(event) => {
                  closeListPicker(false);
                  if (menuOpen) {
                    closeActionMenu(false);
                    return;
                  }
                  if (event.detail === 0) focusMenuOnOpenRef.current = true;
                  setMenuListsOpen(false);
                  setMenuListsPosition(null);
                  setMenuPosition(null);
                  setMenuOpen(true);
                }}
              ><MoreHorizontal /></button>
              {actionMenu}
            </div>
            {!owner && <div className="wish-detail__notice"><Hand /><p>Если вы решили исполнить это желание, обязательно забронируйте его, чтобы никто другой не подарил то же самое.</p></div>}
            <div className="wish-detail__content">
              <Link className="wish-detail__owner" to={profile?.username ? publicProfilePath(profile.username) : "#"}><Avatar user={profile} size="sm" /><strong>{profile?.name || "Автор желания"}</strong></Link>
              <div className="wish-detail__heading"><h2>{wish.title}</h2></div>
              <p className={`wish-detail__description ${wish.description ? "" : "is-muted"}`}>{wish.description || "Автор пока не добавил описание — иногда желание говорит само за себя."}</p>
              <div className="wish-detail__price-bar">
                <strong className="wish-detail__price">{formatMoney(wish.price, wish.currency)}</strong>
                {wish.url && <a href={wish.url} target="_blank" rel="noreferrer">Где купить <ExternalLink /></a>}
              </div>
              <div className="wish-detail__actions">
                {!owner && <Button variant={wish.reservedByMe ? "reserved" : "primary"} loading={busy} onClick={reserve} disabled={wish.status !== "active" || reservationUnavailable}>{wish.reservedByMe ? "Забронировано вами" : reservationUnavailable ? "Уже забронировано" : "Забронировать"}</Button>}
                {owner && <Button type="button" variant="outline" icon={PackageCheck} loading={busy} onClick={fulfilled}>{wish.status === "fulfilled" ? "Вернуть в активные" : "Отметить исполненным"}</Button>}
              </div>
            </div>
          </div>
        </article>
      </Modal>
      {deleteOpen && <Modal
        onClose={() => {
          if (busy) return;
          setDeleteOpen(false);
          window.requestAnimationFrame(() => menuTriggerRef.current?.focus());
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
            <Button type="button" variant="ghost" disabled={busy} onClick={() => {
              setDeleteOpen(false);
              window.requestAnimationFrame(() => menuTriggerRef.current?.focus());
            }}>Отмена</Button>
            <Button type="button" variant="ghost" className="button--danger" icon={Trash2} loading={busy} onClick={async () => { if (await remove()) setDeleteOpen(false); }}>Удалить</Button>
          </div>
        </div>
      </Modal>}
    </>
  );
}

function ListModal({ list = null, listsCount = 0, onClose, onSaved, onDeleted }) {
  const editing = Boolean(list?.id);
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState(() => ({
    title: list?.title || "",
    description: list?.description || "",
    privacy: list?.privacy || "public",
    occasionDate: list?.occasionDate ? String(list.occasionDate).slice(0, 10) : "",
    color: list?.color || "coral",
  }));
  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form, occasionDate: form.occasionDate || null };
      const result = editing ? await api.patch(`/lists/${list.id}`, payload) : await api.post("/lists", payload);
      toast(editing ? "Настройки списка сохранены" : "Новый список создан");
      await onSaved?.(result.list);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };
  const remove = async () => {
    if (!editing || !window.confirm(`Удалить список «${list.title}»? Желания из него останутся в вашем общем списке.`)) return;
    setDeleting(true);
    try {
      const result = await api.delete(`/lists/${list.id}`);
      toast(result.reassignedCount ? `Список удалён, ${result.reassignedCount} желаний сохранено` : "Список удалён");
      await onDeleted?.(result);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setDeleting(false);
    }
  };
  return <Modal onClose={onClose} className="modal--list" ariaLabel={editing ? `Настройки списка: ${list.title}` : "Создание списка"}><form className="modal-form" onSubmit={submit}><div className="modal-heading"><span className="modal-icon">{editing ? <Pencil /> : <ListPlus />}</span><div><span className="eyebrow">{editing ? "Настройки списка" : "Новая глава"}</span><h2>{editing ? "Изменить список" : "Создать список"}</h2><p>{editing ? "Название, доступ и оформление можно менять в любое время." : "Для отдельного события, настроения или большой мечты."}</p></div></div><label><span>Название</span><input autoFocus required placeholder="Например, Новоселье" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label><span>Описание</span><textarea rows={3} placeholder="Расскажите друзьям о списке" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><div className="form-row"><label><span>Дата события</span><input type="date" value={form.occasionDate} onChange={(event) => setForm({ ...form, occasionDate: event.target.value })} /></label><label><span>Кто увидит</span><select value={form.privacy} onChange={(event) => setForm({ ...form, privacy: event.target.value })}><option value="public">Все</option><option value="followers">Подписчики</option><option value="link">Только по ссылке</option><option value="private">Только я</option></select></label></div><fieldset className="color-picker"><legend>Цвет обложки</legend>{["coral", "blue", "lime", "sun", "ink"].map((color) => <button type="button" aria-label={`Цвет ${color}`} aria-pressed={form.color === color} className={`${color} ${form.color === color ? "active" : ""}`} onClick={() => setForm({ ...form, color })} key={color}>{form.color === color && <Check />}</button>)}</fieldset>{editing && <div className="list-danger"><div><strong>Удалить список</strong><span>Желания не пропадут и будут перенесены в оставшийся список.</span></div><Button type="button" variant="ghost" className="button--danger" icon={Trash2} loading={deleting} disabled={listsCount <= 1} onClick={remove}>Удалить</Button></div>}<div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Отмена</Button><Button type="submit" loading={loading}>{editing ? "Сохранить изменения" : "Создать список"}</Button></div></form></Modal>;
}

function ListActionsMenu({ list = null, onEdit, onShare, onCreate, compact = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type === "pointerdown" && rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", close); };
  }, [open]);
  return <div className={`list-actions-menu ${compact ? "is-compact" : ""}`} ref={rootRef}><button className="public-wishes-head__options" type="button" aria-label="Опции списка" aria-expanded={open} onClick={() => setOpen((value) => !value)}><MoreHorizontal /></button>{open && <div className="list-actions-menu__panel">{list && <button type="button" onClick={() => { setOpen(false); onEdit?.(); }}><Pencil /> Редактировать список</button>}<button type="button" onClick={() => { setOpen(false); onShare?.(); }}><Share2 /> {list ? "Поделиться списком" : "Поделиться профилем"}</button><button type="button" onClick={() => { setOpen(false); onCreate?.(); }}><Plus /> Создать новый список</button></div>}</div>;
}

function WishModal({ onClose, onSaved, onDeleted, wish = null }) {
  const editing = Boolean(wish?.id);
  const toast = useToast();
  const { data, loading: listsLoading, reload: reloadDashboard } = useAsync(() => api.get("/dashboard"), []);
  const [step, setStep] = useState(editing ? "details" : "link");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [listCreatorOpen, setListCreatorOpen] = useState(false);
  const [metadata, setMetadata] = useState({ status: "idle", message: "" });
  const [form, setForm] = useState(() => wishFormFrom(wish));
  const autoTimerRef = useRef(null);
  const metadataRequestRef = useRef(0);
  const editedMetadataFieldsRef = useRef(new Set());
  const mutationRef = useRef(null);
  const deleteTriggerRef = useRef(null);
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
  const recognize = async (sourceUrl = form.url, { advance = true } = {}) => {
    const url = sourceUrl.trim();
    window.clearTimeout(autoTimerRef.current);
    if (!url) { setMetadata({ status: "idle", message: "" }); setStep("details"); return false; }
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
      if (advance) setStep("details");
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
  const continueFromLink = () => { if (!form.url.trim()) { setStep("details"); return; } if (metadata.status === "success") { setStep("details"); return; } recognize(); };
  const fillManually = () => { window.clearTimeout(autoTimerRef.current); metadataRequestRef.current += 1; setMetadata((current) => current.status === "error" ? current : { status: "idle", message: "" }); setStep("details"); };
  const submit = async (event) => {
    event.preventDefault();
    if (mutationRef.current || deleting) return;
    mutationRef.current = "save";
    setLoading(true);
    try {
      const payload = { ...form, price: form.price === "" ? null : Number(form.price) };
      const result = editing ? await api.patch(`/wishes/${wish.id}`, payload) : await api.post("/wishes", payload);
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
  const toggleList = (id) => setForm((current) => ({
    ...current,
    listIds: current.listIds.includes(id) ? current.listIds.filter((item) => item !== id) : [...current.listIds, id],
  }));
  const metadataNotice = metadata.status !== "idle" && <div className={`metadata-status metadata-status--${metadata.status}`} role="status" aria-live="polite"><span className="metadata-status__icon">{["waiting", "loading"].includes(metadata.status) ? <LoaderCircle className="spin" /> : metadata.status === "success" ? <CheckCircle2 /> : <X />}</span><div><strong>{metadata.status === "waiting" ? "Готовим автозаполнение" : metadata.status === "loading" ? "Читаем карточку товара" : metadata.status === "success" ? "Готово" : "Не получилось автоматически"}</strong><span>{metadata.message}</span></div>{step === "details" && metadata.status === "error" && form.url && <button type="button" onClick={() => recognize(form.url, { advance: false })}>Повторить</button>}</div>;
  const requestClose = () => { if (!loading && !deleting) onClose(); };
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

  if (editing) {
    const fieldId = (name) => `wish-editor-${name}-${wish.id}`;
    const coverForList = (listId) => data?.wishes?.find((item) => item.imageUrl && item.listIds.includes(listId))?.imageUrl || "";
    return <>
      <Modal
        onClose={requestClose}
        className="modal--wish-editor"
        backdropClassName="modal-backdrop--wish-editor"
        ariaLabel={`Редактирование желания «${wish.title}»`}
      >
      <form className="wish-editor" onSubmit={submit}>
        <Button className="wish-editor__submit" type="submit" loading={loading}>Обновить</Button>
        <div className="wish-editor__layout">
          <section className="wish-editor__media" aria-label="Фотография желания">
            <div className={`wish-editor__image ${form.imageUrl ? "has-image" : "is-empty"}`}>
              {form.imageUrl
                ? <img src={form.imageUrl} alt={`Фото желания «${form.title || wish.title}»`} />
                : <button type="button" className="wish-editor__image-empty" onClick={() => setImageEditorOpen(true)}><Image /><span>Добавить фото</span></button>}
              <button ref={deleteTriggerRef} type="button" className="wish-editor__delete" aria-label="Удалить желание" title="Удалить желание" disabled={loading || deleting} onClick={() => { if (!mutationRef.current && !loading && !deleting) setDeleteConfirm(true); }}><Trash2 /></button>
              <button type="button" className="wish-editor__image-change" aria-expanded={imageEditorOpen} onClick={() => setImageEditorOpen((value) => !value)}><Pencil /> {form.imageUrl ? "Сменить фото" : "Указать ссылку"}</button>
              {imageEditorOpen && <div className="wish-editor__image-url">
                <label htmlFor={fieldId("image")}>Ссылка на фото</label>
                <input id={fieldId("image")} type="text" inputMode="url" value={form.imageUrl} placeholder="https://… или /art/…" onChange={(event) => updateMetadataField("imageUrl", event.target.value)} />
                <button type="button" aria-label="Готово" onClick={() => setImageEditorOpen(false)}><Check /></button>
              </div>}
            </div>
          </section>

          <section className="wish-editor__panel">
            <div className="wish-editor__scroll">
              <label className="wish-editor__field" htmlFor={fieldId("title")}>
                <span>Название</span>
                <input id={fieldId("title")} data-modal-initial-focus required value={form.title} placeholder="Название желания" onChange={(event) => updateMetadataField("title", event.target.value)} />
              </label>

              <div className="wish-editor__field wish-editor__field--link">
                <label htmlFor={fieldId("url")}>Ссылка</label>
                <input id={fieldId("url")} type="url" inputMode="url" value={form.url} placeholder="https://…" onChange={(event) => updateMetadataField("url", event.target.value)} />
                <button type="button" disabled={!form.url.trim() || metadata.status === "loading"} onClick={() => recognize(form.url, { advance: false })}>
                  <span>{metadata.status === "loading" ? "Заполняем…" : "Заполнить по ссылке"}</span>
                  <i>{metadata.status === "loading" ? <LoaderCircle className="spin" /> : <ArrowRight />}</i>
                </button>
              </div>

              {metadataNotice}

              <label className="wish-editor__field wish-editor__field--description" htmlFor={fieldId("description")}>
                <span className="visually-hidden">Описание желания</span>
                <textarea id={fieldId("description")} rows={2} value={form.description} placeholder="Опишите желание" onChange={(event) => updateMetadataField("description", event.target.value)} />
              </label>

              <label className="wish-editor__field wish-editor__field--price" htmlFor={fieldId("price")}>
                <span>Цена</span>
                <input id={fieldId("price")} type="number" min="0" value={form.price} placeholder="0" onChange={(event) => updateMetadataField("price", event.target.value)} />
                <select aria-label="Валюта" value={form.currency} onChange={(event) => updateMetadataField("currency", event.target.value)}>
                  {WISH_CURRENCIES.map((currency) => <option value={currency} key={currency}>{WISH_CURRENCY_SYMBOLS[currency]}</option>)}
                </select>
              </label>

              <div className="wish-editor__settings" role="group" aria-label="Настройки желания">
                <label className="wish-editor__switch-row">
                  <EyeOff />
                  <span><strong>Секретное желание <i title="Такое желание видно только вам">?</i></strong></span>
                  <input type="checkbox" role="switch" aria-label="Секретное желание" checked={form.privacy === "private"} onChange={(event) => setForm({ ...form, privacy: event.target.checked ? "private" : "inherit" })} />
                  <span className="wish-editor__switch" aria-hidden="true"><i /></span>
                </label>
                <label className="wish-editor__switch-row">
                  <LockKeyhole />
                  <span><strong>Многократное бронирование <i title="Разрешает нескольким друзьям забронировать одинаковый подарок">?</i></strong></span>
                  <input type="checkbox" role="switch" aria-label="Многократное бронирование" checked={form.allowMultiple} onChange={(event) => setForm({ ...form, allowMultiple: event.target.checked })} />
                  <span className="wish-editor__switch" aria-hidden="true"><i /></span>
                </label>
              </div>

              <fieldset className="wish-editor__lists">
                <legend className="visually-hidden">Списки желания</legend>
                <div className="wish-editor__lists-head">
                  <strong>Списки</strong>
                  <button type="button" disabled={loading || deleting} onClick={() => { if (!mutationRef.current) setListCreatorOpen(true); }}><ListPlus /> Новый список</button>
                </div>
                {listsLoading ? <LoadingScreen compact /> : <div className="wish-editor__list-rows">
                  {selectableLists.map((list) => {
                    const selected = form.listIds.includes(list.id);
                    const cover = coverForList(list.id);
                    return <label className={`wish-editor__list-row ${selected ? "is-selected" : ""}`} key={list.id}>
                      <input type="checkbox" checked={selected} onChange={() => toggleList(list.id)} />
                      <span className={`wish-editor__list-thumb list-dot--${list.color}`}>{cover ? <img src={cover} alt="" /> : <ListPlus />}</span>
                      <span>{list.title}</span>
                      <span className="wish-editor__list-state" aria-hidden="true">{selected ? <Check /> : <Plus />}</span>
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

  return <Modal onClose={requestClose} wide><form className="modal-form wish-form" onSubmit={submit}><div className="modal-heading"><span className="modal-icon"><Heart fill="currentColor" /></span><div><span className="eyebrow">Новое желание</span><h2>{step === "link" ? "Добавим мечту" : "Проверьте карточку"}</h2><p>{step === "link" ? "Вставьте ссылку — название, фото и цену подставим сами." : "Чем точнее детали, тем проще друзьям."}</p></div></div>{step === "link" ? <div className="link-step"><label className="link-input"><Link2 /><input autoFocus type="url" inputMode="url" placeholder="https://магазин.ru/то-самое" value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value.trim() }))} /></label>{metadataNotice}<Button type="button" onClick={continueFromLink} loading={metadata.status === "loading"}>{metadata.status === "error" ? "Попробовать снова" : "Продолжить"}</Button><button type="button" className="manual-link" onClick={fillManually}>У меня нет ссылки — заполнить вручную</button><div className="recognition-note"><WandSparkles /><div><strong>Автоматическое заполнение</strong><span>Начнём разбор через мгновение после вставки ссылки.</span></div></div></div> : <>{metadataNotice}<div className="wish-form__grid"><div className="image-preview"><div>{form.imageUrl ? <img src={form.imageUrl} alt="Предпросмотр" /> : <><Image size={35} /><span>Фото желания</span></>}</div><label><Image size={16} /> Ссылка на фото<input type="text" inputMode="url" value={form.imageUrl} onChange={(event) => updateMetadataField("imageUrl", event.target.value)} /></label></div><div className="wish-fields"><label><span>Название</span><input autoFocus required value={form.title} placeholder="Что вы хотите?" onChange={(event) => updateMetadataField("title", event.target.value)} /></label><label><span>Комментарий для друзей</span><textarea rows={3} value={form.description} placeholder="Размер, цвет, важные детали…" onChange={(event) => updateMetadataField("description", event.target.value)} /></label><div className="form-row form-row--price"><label><span>Цена</span><input type="number" min="0" value={form.price} placeholder="0" onChange={(event) => updateMetadataField("price", event.target.value)} /></label><label><span>Валюта</span><select value={form.currency} onChange={(event) => updateMetadataField("currency", event.target.value)}>{WISH_CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select></label><label><span>Важность</span><div className="priority-picker">{[1, 2, 3].map((item) => <button type="button" aria-label={`Важность ${item} из 3`} aria-pressed={form.priority === item} className={item <= form.priority ? "active" : ""} onClick={() => setForm({ ...form, priority: item })} key={item}><Star fill="currentColor" /></button>)}</div></label></div></div></div><fieldset className="list-choice"><legend>Добавить в списки</legend>{listsLoading ? <LoadingScreen compact /> : selectableLists.map((list) => <label key={list.id}><input type="checkbox" checked={form.listIds.includes(list.id)} onChange={() => toggleList(list.id)} /><span className={`list-dot list-dot--${list.color}`} /><span>{list.title}</span><small>{list.wishCount} желаний</small><Check /></label>)}</fieldset><p className="wish-form__list-hint">Список можно не выбирать — желание останется в «Моих желаниях».</p><div className="wish-settings"><label><input type="checkbox" checked={form.privacy === "private"} onChange={(event) => setForm({ ...form, privacy: event.target.checked ? "private" : "inherit" })} /><span><LockKeyhole /> Секретное желание<small>Видно только вам</small></span></label><label><input type="checkbox" checked={form.allowMultiple} onChange={(event) => setForm({ ...form, allowMultiple: event.target.checked })} /><span><Gift /> Можно подарить несколько<small>Например, сертификаты</small></span></label></div><div className="modal-actions"><Button type="button" variant="ghost" onClick={() => setStep("link")} icon={ArrowLeft}>Назад</Button><Button type="submit" loading={loading} icon={Heart}>Добавить желание</Button></div></>}</form></Modal>;
}

function IdeasPage({ appMode = false }) {
  const { user } = useSession();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [selectedIdea, setSelectedIdea] = useState(null);
  const { data, loading } = useAsync(
    () => api.get(`/ideas?category=${encodeURIComponent(category)}&search=${encodeURIComponent(search)}`),
    [category, search],
  );
  const searchControl = <label className="ideas-search"><Search /><input aria-label="Поиск идей" placeholder="Керамика, музыка, впечатления…" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></label>;
  const content = <>
    {appMode
      ? <div className="ideas-catalog-head"><PageTitle eyebrow="Подборка идей" title="Идеи подарков" text="Найдите то, что действительно захочется добавить в свой список." />{searchControl}</div>
      : <div className="ideas-hero"><span className="eyebrow"><WandSparkles size={15} /> Отобрано с любопытством</span><h1>Идеи, от которых<br /><em>что-то ёкает</em></h1><p>Не безликий каталог товаров, а поводы заметить: «Да, вот этого мне и хотелось».</p>{searchControl}</div>}
    {loading ? <LoadingScreen compact /> : <>
      <div className="category-row">
        <button className={!category ? "active" : ""} onClick={() => setCategory("")}>Всё <span>{data.categories.reduce((sum, item) => sum + item.count, 0)}</span></button>
        {data.categories.map((item) => <button className={category === item.name ? "active" : ""} onClick={() => setCategory(item.name)} key={item.name}>{item.name} <span>{item.count}</span></button>)}
      </div>
      <div className="ideas-grid">
        {data.ideas.map((idea, index) => <article className={`idea-card idea-card--${index % 5}`} key={idea.id}><div className="idea-card__image"><img src={idea.imageUrl} alt="" /><span>{idea.badge}</span><button aria-label={`Сохранить идею «${idea.title}»`} onClick={() => user ? setSelectedIdea(idea) : toast("Войдите, чтобы сохранить идею", "error")}><Heart /></button></div><div className="idea-card__copy"><small>{idea.category}</small><h3>{idea.title}</h3><p>{idea.description}</p><strong>{formatMoney(idea.price, idea.currency)}</strong></div></article>)}
      </div>
    </>}
    {selectedIdea && <SaveIdeaModal idea={selectedIdea} onClose={() => setSelectedIdea(null)} />}
  </>;
  if (appMode) return <div className="app-page ideas-page">{content}</div>;
  return <div className="public-ideas"><LandingHeader /><main>{content}</main><footer className="landing-footer"><Logo /><p>Списки желаний, которые приятно исполнять.</p><span>© 2026 Rollapp</span></footer></div>;
}

function IdeasRoute() {
  const { user, loading } = useSession();
  if (loading) return <LoadingScreen />;
  return user ? <Navigate to="/app/ideas" replace /> : <IdeasPage />;
}

function SaveIdeaModal({ idea, onClose }) { const toast = useToast(); const { data, loading } = useAsync(() => api.get("/dashboard"), []); const [listId, setListId] = useState(""); const [busy, setBusy] = useState(false); useEffect(() => { if (data?.lists?.[0]) setListId(data.lists[0].id); }, [data]); const save = async () => { setBusy(true); try { await api.post(`/ideas/${idea.id}/save`, { listId }); toast("Идея сохранена в ваш список"); onClose(); } catch (error) { toast(error.message, "error"); } finally { setBusy(false); } }; return <Modal onClose={onClose}><div className="save-idea"><img src={idea.imageUrl} alt="" /><span className="eyebrow">Сохранить идею</span><h2>{idea.title}</h2><p>{idea.description}</p>{loading ? <LoadingScreen compact /> : <label><span>Выберите список</span><select value={listId} onChange={(event) => setListId(event.target.value)}>{data.lists.map((list) => <option value={list.id} key={list.id}>{list.title}</option>)}</select></label>}<div className="modal-actions"><Button variant="ghost" onClick={onClose}>Отмена</Button><Button icon={Heart} onClick={save} loading={busy}>Сохранить</Button></div></div></Modal>; }

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
  const [openPersonId, setOpenPersonId] = useState(null);
  const [busyPersonId, setBusyPersonId] = useState(null);
  const menuRef = useRef(null);
  const toast = useToast();
  const EmptyIcon = config?.icon || Users;
  const scope = config?.scope || section;
  const { data, loading, error, reload } = useAsync(
    () => api.get(`/people?scope=${encodeURIComponent(scope || "subscriptions")}&search=${encodeURIComponent(search)}`),
    [scope, search],
  );

  useEffect(() => {
    setSearch("");
    setOpenPersonId(null);
  }, [section]);

  useEffect(() => {
    if (!openPersonId) return undefined;
    const close = (event) => {
      if (event.type === "keydown") {
        if (event.key !== "Escape") return;
        const trigger = document.querySelector(`[aria-controls="friend-actions-${CSS.escape(openPersonId)}"]`);
        setOpenPersonId(null);
        window.requestAnimationFrame(() => trigger?.focus());
        return;
      }
      if (event.type === "pointerdown" && menuRef.current?.contains(event.target)) return;
      setOpenPersonId(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [openPersonId]);

  if (!section) return <Navigate to="/app/friends/subscriptions" replace />;

  const toggleFollow = async (person) => {
    setBusyPersonId(person.id);
    try {
      const result = await api.post(`/profile/${person.username}/follow`, {});
      toast(result.following ? `Вы подписались на ${person.name}` : `Вы отписались от ${person.name}`);
      setOpenPersonId(null);
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
            {Object.entries(friendSections).map(([key, item]) => {
              const Icon = item.icon;
              return <NavLink key={key} to={`/app/friends/${key}`}><Icon /><span>{item.label}</span></NavLink>;
            })}
          </nav>
          <label className="friends-search">
            <Search aria-hidden="true" />
            <span className="visually-hidden">{config.placeholder}</span>
            <input type="search" aria-label={config.placeholder} placeholder={config.placeholder} value={search} onChange={(event) => setSearch(event.target.value)} />
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
                  <div className="friend-row__actions" ref={openPersonId === person.id ? menuRef : null}>
                    <button type="button" className="friend-row__more" aria-label={`Действия для ${person.name}`} aria-expanded={openPersonId === person.id} aria-controls={`friend-actions-${person.id}`} onClick={() => setOpenPersonId((current) => current === person.id ? null : person.id)}>
                      <MoreHorizontal />
                    </button>
                    {openPersonId === person.id && (
                      <div className="friend-row__menu" id={`friend-actions-${person.id}`}>
                        <Link to={publicProfilePath(person.username)}><CircleUserRound />Открыть профиль</Link>
                        <button type="button" disabled={busyPersonId === person.id} onClick={() => toggleFollow(person)}>
                          {busyPersonId === person.id ? <LoaderCircle className="spin" /> : person.isFollowing ? <X /> : <UserPlus />}
                          {person.isFollowing ? "Отписаться" : "Подписаться"}
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="friends-empty">
              <span className="friends-empty__icon"><EmptyIcon /></span>
              <strong>{config.emptyTitle}</strong>
              <span>{config.emptyText}</span>
              {section !== "search" && <Link className="button button--primary" to="/app/friends/search">Найти друзей</Link>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function NotificationsPage() { const { refresh } = useSession(); const { data, loading } = useAsync(() => api.get("/notifications"), []); useEffect(() => { api.post("/notifications/read", {}).then(() => refresh()); }, [refresh]); if (loading) return <LoadingScreen compact />; const icons = { reservation: Gift, follow: UserPlus, welcome: Sparkles }; return <div className="app-page notifications-page"><PageTitle eyebrow="В курсе важного" title="Уведомления" text="Сюрпризы останутся скрыты, а важные события — нет." />{data.notifications.length ? <div className="notification-list">{data.notifications.map((item) => { const Icon = icons[item.type] || Bell; return <Link to={item.href || "#"} key={item.id} className={!item.readAt ? "is-unread" : ""}><span><Icon /></span><div><strong>{item.title}</strong><p>{item.body}</p><small>{formatDate(item.createdAt, { hour: "2-digit", minute: "2-digit" })}</small></div><ArrowRight /></Link>; })}</div> : <EmptyState icon={Bell} title="Пока тихо" text="Здесь появятся новые подписки и важные события." />}</div>; }

function SettingsPage() { const { user, refresh } = useSession(); const toast = useToast(); const [form, setForm] = useState({ name: user.name, username: user.username, bio: user.bio || "", birthday: user.birthday ? String(user.birthday).slice(0, 10) : "", avatarUrl: user.avatarUrl || "" }); const [loading, setLoading] = useState(false); const submit = async (event) => { event.preventDefault(); setLoading(true); try { await api.patch("/me", { ...form, birthday: form.birthday || null }); await refresh(); toast("Профиль обновлён"); } catch (error) { toast(error.message, "error"); } finally { setLoading(false); } }; return <div className="app-page settings-page"><PageTitle eyebrow="Личное пространство" title="Настройки профиля" text="Эту информацию увидят друзья рядом с вашим вишлистом." /><form className="settings-form panel" onSubmit={submit}><div className="avatar-editor"><Avatar user={{ ...user, avatarUrl: form.avatarUrl }} size="xl" /><div><strong>Фото профиля</strong><span>Укажите публичную ссылку на изображение</span></div></div><label><span>Ссылка на фото</span><input type="url" value={form.avatarUrl} placeholder="https://…" onChange={(event) => setForm({ ...form, avatarUrl: event.target.value })} /></label><div className="form-row"><label><span>Имя</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label><span>Адрес профиля</span><div className="input-prefix"><span>{window.location.host}/</span><input required pattern="[a-z0-9-]{3,32}" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase() })} /></div></label></div><label><span>О себе</span><textarea rows={4} maxLength={300} value={form.bio} placeholder="Что вам нравится?" onChange={(event) => setForm({ ...form, bio: event.target.value })} /></label><label className="short-field"><span>День рождения</span><input type="date" value={form.birthday} onChange={(event) => setForm({ ...form, birthday: event.target.value })} /></label><div className="settings-save"><Button type="submit" loading={loading}>Сохранить изменения</Button></div></form></div>; }

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
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    if (!mobileMenuOpen) return undefined;
    const close = (event) => event.key === "Escape" && setMobileMenuOpen(false);
    document.addEventListener("keydown", close);
    document.body.classList.add("profile-menu-open");
    return () => { document.removeEventListener("keydown", close); document.body.classList.remove("profile-menu-open"); };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!desktopMenuOpen) return undefined;
    const close = (event) => {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type === "pointerdown" && event.target instanceof Element && event.target.closest(".profile-header__actions")) return;
      setDesktopMenuOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", close); };
  }, [desktopMenuOpen]);

  useEffect(() => {
    const updateHeader = () => setProfileCompact(window.scrollY > 220);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, []);

  if (loading) return <div className="public-profile public-profile--dark public-profile--state"><LoadingScreen /></div>;
  if (error && !data) return <div className="public-profile public-profile--dark public-profile--state"><div className="not-found"><Logo /><Gift /><h1>Такой список не нашёлся</h1><p>{error.message}</p><Link className="button button--primary" to={APP_HOME}><span>В приложение</span></Link></div></div>;

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
    return <div className="public-profile public-profile--dark public-profile--state"><div className="not-found"><Logo /><Gift /><h1>{params.wishId ? "Желание не найдено" : "Список не найден"}</h1><p>Ссылка устарела или доступ к этой странице ограничен.</p><Link className="button button--primary" to={shared ? `/s/${params.token}` : publicProfilePath(data.profile.username)}><span>Вернуться к профилю</span></Link></div></div>;
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
          <Link className={!data.isOwner ? "profile-header__ideas is-active" : "profile-header__ideas"} to={user ? "/app/ideas" : "/ideas"} aria-label="Идеи подарков" title="Идеи подарков"><Flame fill="currentColor" /></Link>
          <Link className={data.isOwner ? "is-active" : ""} to={appTarget} aria-label="Мои желания" title="Мои желания"><Heart fill="currentColor" /></Link>
          <Link to={friendsTarget} aria-label="Друзья" title="Друзья"><Users fill="currentColor" /></Link>
          <Link className="profile-header__search" to={friendsTarget} aria-label="Поиск" title="Поиск"><Search /></Link>
        </nav>
        <div className="profile-header__actions">
          {user ? <button className="profile-desktop-menu" type="button" aria-label={desktopMenuOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={desktopMenuOpen} onClick={() => setDesktopMenuOpen((value) => !value)}>{desktopMenuOpen ? <X /> : <Menu />}</button> : <Link className="button button--primary" to={`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`}><span>Вход</span></Link>}
          {user && <nav className={`profile-desktop-panel ${desktopMenuOpen ? "is-open" : ""}`} aria-label="Меню аккаунта" aria-hidden={!desktopMenuOpen}><Link to={APP_HOME} onClick={() => setDesktopMenuOpen(false)}><Heart /> Мои желания</Link><Link to="/app/settings" onClick={() => setDesktopMenuOpen(false)}><Settings /> Настройки</Link></nav>}
        </div>
        {!data.isOwner && !shared && <button className="profile-header__compact-follow" type="button" onClick={follow}>{data.isFollowing ? "Вы подписаны" : "Подписаться"}</button>}
        <button className="profile-mobile-menu" type="button" aria-label={mobileMenuOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={mobileMenuOpen} aria-controls="profile-mobile-navigation" onClick={() => setMobileMenuOpen((value) => !value)}>{mobileMenuOpen ? <X /> : <Menu />}</button>
        <button className={`profile-mobile-overlay ${mobileMenuOpen ? "is-open" : ""}`} type="button" aria-label="Закрыть меню" onClick={() => setMobileMenuOpen(false)} />
        <nav id="profile-mobile-navigation" className={`profile-mobile-panel ${mobileMenuOpen ? "is-open" : ""}`} aria-label="Меню профиля">
          <div className="profile-mobile-panel__head"><Logo /><button type="button" aria-label="Закрыть меню" onClick={() => setMobileMenuOpen(false)}><X /></button></div>
          <div className="profile-mobile-panel__promo"><div><strong>Rollapp — бесплатный сервис для создания вишлистов и списков желаний</strong><Link className="button button--primary" to={user ? APP_HOME : `/register?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`} onClick={() => setMobileMenuOpen(false)}><span>{user ? "Открыть мой вишлист" : "Создать вишлист"}</span></Link></div><img src="/art/gift-3d.png" alt="" /></div>
          <div className="profile-mobile-panel__about"><p>Rollapp — это бесплатный онлайн-сервис вишлистов. Создайте персональный список желаний, добавьте ссылки на товары из любых магазинов с ценами и поделитесь списком с друзьями или семьёй.</p><p>Друзья бронируют подарки через быстрое бронирование без долгой регистрации — система исключает повторы. Встроенный каталог содержит идеи для дня рождения, Нового года, свадьбы и других праздников: от электроники до впечатлений.</p><p>Вишлист работает в браузере и в приложениях для iOS и Android. Регистрация занимает секунды через электронную почту, а функция многократного бронирования идеально подходит для подарочных сертификатов.</p></div>
          <div className="profile-mobile-panel__legal"><span>© Rollapp</span><span>Россия</span><button type="button" onClick={() => toast("Политика конфиденциальности готовится к публикации")}>Конфиденциальность</button><button type="button" onClick={() => toast("Пользовательское соглашение готовится к публикации")}>Пользовательское соглашение</button></div>
        </nav>
      </header>

      <div className="public-profile__layout">
        {data.isOwner && !shared ? <aside className="profile-rail profile-list-rail">
          <nav className="profile-list-rail__lists" aria-label="Списки желаний">
            <button className="profile-list-rail__create" type="button" onClick={() => setListModal({})}><i aria-hidden="true"><Plus /></i> Создать новый список</button>
            <button className={selected === "all" ? "active" : ""} type="button" aria-pressed={selected === "all"} onClick={() => selectCollection("all")}><Heart fill={selected === "all" ? "currentColor" : "none"} /><span>Мои желания</span></button>
            {navigationLists.map((list) => <button className={selected === list.id ? "active" : ""} type="button" aria-pressed={selected === list.id} onClick={() => selectCollection(list.id)} key={list.id}><strong>{wishCountForList(list.id)}</strong><span>{list.title}</span></button>)}
            <button className={selected === "secret" ? "active" : ""} type="button" aria-pressed={selected === "secret"} onClick={() => selectCollection("secret")}><EyeOff /><span>Секретные желания</span></button>
            <button className={selected === "fulfilled" ? "active" : ""} type="button" aria-pressed={selected === "fulfilled"} onClick={() => selectCollection("fulfilled")}><Check /><span>Исполнено</span></button>
          </nav>
          <small>© 2026 Rollapp</small>
        </aside> : <aside className="profile-rail profile-guest-rail">
          <div className="profile-rail__intro">
            <p>Rollapp — бесплатный сервис для создания вишлистов и списков желаний</p>
            <Link className="button button--primary" to={appTarget}>{user ? "Открыть мой список" : "Создать вишлист"}</Link>
          </div>
          <nav className="profile-guest-rail__people" aria-label="Люди в Rollapp"><Link to={friendsTarget}><Users /> Подписки</Link><Link to={friendsTarget}><UserPlus /> Подписчики</Link><Link to={friendsTarget}><CircleUserRound /> Найти друзей</Link></nav>
          <div className="profile-guest-rail__legal"><span>© Rollapp</span><span>Россия</span><button type="button" onClick={() => toast("Политика конфиденциальности готовится к публикации")}>Конфиденциальность</button><button type="button" onClick={() => toast("Пользовательское соглашение готовится к публикации")}>Пользовательское соглашение</button></div>
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
                <button type="button" className="profile-cover__options" aria-label="Опции профиля" onClick={share}><MoreHorizontal /></button>
              </>}
            </div>
          </section>

          {!shared && <div className="public-list-tabs" aria-label="Списки желаний">
            <button className={selected === "all" ? "active" : ""} aria-pressed={selected === "all"} onClick={() => selectCollection("all")}><strong>{data.isOwner ? "Мои желания" : "Все желания"}</strong><span>{activeWishes.length}</span></button>
            {tabLists.map((list) => <button className={selected === list.id ? "active" : ""} aria-pressed={selected === list.id} onClick={() => selectCollection(list.id)} key={list.id}><strong>{list.title}</strong><span>{wishCountForList(list.id)}</span></button>)}
            {data.isOwner && <button className={selected === "secret" ? "active" : ""} aria-pressed={selected === "secret"} onClick={() => selectCollection("secret")}><strong>Секретные</strong><span>{secretWishes.length}</span></button>}
            {data.isOwner && <button className={selected === "fulfilled" ? "active" : ""} aria-pressed={selected === "fulfilled"} onClick={() => selectCollection("fulfilled")}><strong>Исполнено</strong><span>{fulfilledWishes.length}</span></button>}
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

function NotFound() { return <div className="not-found"><Logo /><Gift /><h1>Похоже, эта мечта потерялась</h1><p>Страница не существует или ссылка устарела.</p><Link className="button button--primary" to={APP_HOME}><span>В приложение</span></Link></div>; }

function LegacyProfileRedirect() {
  const params = useParams();
  const location = useLocation();
  const suffix = String(params["*"] || "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const target = `${publicProfilePath(params.username)}${suffix ? `/${suffix}` : ""}${location.search}${location.hash}`;
  return <Navigate to={target} replace />;
}

export default function App() { return <ToastProvider><SessionProvider><Routes><Route path="/" element={<RootRoute />} /><Route path="/login" element={<AuthPage mode="login" />} /><Route path="/register" element={<AuthPage mode="register" />} /><Route path="/ideas" element={<IdeasRoute />} /><Route path="/s/:token" element={<PublicProfile shared />} /><Route path="/s/:token/wishes/:wishId" element={<PublicProfile shared />} /><Route path="/app/*" element={<ProtectedApp />} /><Route path="/u/:username/*" element={<LegacyProfileRedirect />} /><Route path="/users/:username/*" element={<LegacyProfileRedirect />} /><Route path="/:username" element={<PublicProfile />} /><Route path="/:username/lists/:listId" element={<PublicProfile />} /><Route path="/:username/wishes/:wishId" element={<PublicProfile />} /><Route path="*" element={<NotFound />} /></Routes></SessionProvider></ToastProvider>; }
