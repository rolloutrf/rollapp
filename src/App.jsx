import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Apple, Archive, ArrowLeft, ArrowRight, Bell, BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown,
  CircleUserRound, ExternalLink, Eye, EyeOff, Flame, Gift, Globe, Hand, Heart, Home, Image, Link2, ListPlus,
  LoaderCircle, LockKeyhole, LogOut, Menu, MessageCircle, MoreHorizontal, PackageCheck, Pencil, Play, Plus,
  Radio, Search, Send, Settings, Share2, ShoppingBag, Smartphone, Sparkles, Star, Trash2, Upload, UserPlus,
  Users, WandSparkles, X, Zap,
} from "lucide-react";
import { api } from "./api.js";

const SessionContext = createContext(null);
const ToastContext = createContext(null);

const formatMoney = (value, currency = "RUB") => value == null ? "Цена не указана" : new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
const formatDate = (value, options = {}) => value ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", ...options }).format(new Date(value)) : "Без даты";
const initials = (name = "?") => name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const WISH_CURRENCIES = ["RUB", "USD", "EUR", "KZT", "BYN"];
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
const safeNextPath = (value) => typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/app";
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
  const reload = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await load();
      setState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      setState({ data: null, loading: false, error });
      throw error;
    }
  }, dependencies); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload().catch(() => {}); }, [reload]);
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
    <Link to="/" className={`logo ${compact ? "logo--compact" : ""}`} aria-label="Rollapp — на главную">
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
        <a href="#how" onClick={() => setOpen(false)}>Как работает</a><a href="#features" onClick={() => setOpen(false)}>Возможности</a><Link to="/ideas" onClick={() => setOpen(false)}>Идеи подарков</Link>
        <div className="landing-nav__mobile-actions">{user ? <Link className="button button--primary" to="/app" onClick={() => setOpen(false)}><span>Открыть мой вишлист</span></Link> : <><Link className="button button--primary" to="/register" onClick={() => setOpen(false)}><span>Создать вишлист</span></Link><Link className="button button--outline" to="/login" onClick={() => setOpen(false)}><span>Войти</span></Link></>}</div>
      </nav>
      <div className="landing-header__actions">
        {user ? <Link className="button button--primary" to="/app"><span>Мой вишлист</span><ArrowRight size={18} /></Link> : <><Link className="text-link desktop-only" to="/login">Войти</Link><Link className="button button--primary" to="/register"><span>Создать вишлист</span></Link></>}
      </div>
      <button className="mobile-menu" onClick={() => setOpen(!open)} aria-label={open ? "Закрыть меню" : "Открыть меню"} aria-expanded={open} aria-controls="landing-navigation">{open ? <X /> : <Menu />}</button>
    </header>
  );
}

const previewWishes = [
  { title: "Плёночная камера", price: "8 990 ₽", image: "/art/camera.svg", tilt: "-3deg" },
  { title: "Урок керамики", price: "для двоих", image: "/art/pottery.svg", tilt: "2deg" },
  { title: "Альбом про Баухаус", price: "3 490 ₽", image: "/art/book.svg", tilt: "-1deg" },
];

function LandingPage() {
  return (
    <div className="landing">
      <LandingHeader />
      <main>
        <section className="hero">
          <div className="hero__copy">
            <span className="eyebrow"><Sparkles size={15} /> Желания любят ясность</span>
            <h1>Дарите радость.<br /><em>Без угадываний.</em></h1>
            <p>Соберите всё, что хочется, в одном красивом вишлисте. Друзья договорятся о подарках так, что сюрприз останется сюрпризом.</p>
            <div className="hero__actions"><Link className="button button--primary button--large" to="/register"><span>Начать свой список</span><ArrowRight size={20} /></Link><a className="button button--ghost button--large" href="#how"><span>Посмотреть, как это работает</span></a></div>
            <div className="hero__proof"><div className="avatar-stack"><Avatar user={{ name: "А" }} size="sm" /><Avatar user={{ name: "М" }} size="sm" /><Avatar user={{ name: "С" }} size="sm" /></div><span>Списки для дней рождения, свадеб<br />и обычных счастливых вторников</span></div>
          </div>
          <div className="hero__visual" aria-label="Пример вишлиста">
            <div className="hero-blob hero-blob--one" /><div className="hero-blob hero-blob--two" />
            <div className="preview-profile"><Avatar user={{ name: "Алиса" }} /><div><small>Вишлист</small><strong>Алиса, 14 августа</strong></div><Heart size={19} fill="currentColor" /></div>
            <div className="preview-grid">{previewWishes.map((wish) => <article className="preview-card" key={wish.title} style={{ "--tilt": wish.tilt }}><img src={wish.image} alt="" /><div><strong>{wish.title}</strong><span>{wish.price}</span></div><button aria-label="Добавить"><Plus size={16} /></button></article>)}</div>
            <div className="reserved-note"><Check size={17} /><div><strong>Подарок забронирован</strong><span>Алиса не узнает кем</span></div></div>
          </div>
        </section>

        <section className="marquee" aria-label="Сценарии"><div>день рождения <span>✦</span> новоселье <span>✦</span> свадьба <span>✦</span> путешествия <span>✦</span> мечты без повода <span>✦</span> день рождения <span>✦</span></div></section>

        <section className="how-section" id="how">
          <div className="section-heading"><span className="eyebrow">Три простых шага</span><h2>Никаких неловких<br />«что тебе подарить?»</h2><p>Список создаётся за минуту, а хорошее предвкушение остаётся надолго.</p></div>
          <div className="steps-grid">
            <article className="step-card step-card--coral"><span className="step-number">01</span><div className="step-visual step-visual--link"><Link2 size={30} /><span>Вставьте ссылку на товар</span><div className="fake-cursor" /></div><h3>Соберите желания</h3><p>Добавляйте из любого магазина по ссылке или просто опишите мечту своими словами.</p></article>
            <article className="step-card step-card--blue"><span className="step-number">02</span><div className="step-visual step-visual--share"><div className="share-bubble"><Share2 size={22} /> rollapp · /alisa</div><div className="share-people"><span>МА</span><span>С</span><span>Л</span></div></div><h3>Поделитесь красиво</h3><p>Одна ссылка откроет друзьям ваши списки. Приватность настраивается отдельно.</p></article>
            <article className="step-card step-card--lime"><span className="step-number">03</span><div className="step-visual step-visual--reserve"><Gift size={36} /><span><Check size={14} /> Уже забронировано</span></div><h3>Сохраните сюрприз</h3><p>Друзья видят брони друг друга, а вы — нет. Повторяющихся подарков не будет.</p></article>
          </div>
        </section>

        <section className="feature-story" id="features">
          <div className="feature-story__visual"><div className="phone-frame"><div className="phone-notch" /><div className="mini-app-head"><Logo compact /><Bell size={18} /></div><div className="mini-profile"><span>Мои желания</span><strong>Когда-нибудь</strong></div><div className="mini-card"><img src={previewWishes[0].image} alt="" /><div><strong>Плёночная камера</strong><span>важность •••</span></div></div><div className="mini-card"><img src={previewWishes[2].image} alt="" /><div><strong>Альбом про Баухаус</strong><span>важность ••</span></div></div><button><Plus /> Добавить желание</button></div><div className="feature-sticker"><WandSparkles size={18} /> Умная карточка<br />из любой ссылки</div></div>
          <div className="feature-story__copy"><span className="eyebrow">Всегда под рукой</span><h2>Ваши желания —<br /><em>ваши правила</em></h2><div className="feature-list"><div><span><Eye /></span><div><strong>Гибкая приватность</strong><p>Открытый список, только для подписчиков, по секретной ссылке или исключительно для себя.</p></div></div><div><span><Bell /></span><div><strong>Деликатные напоминания</strong><p>Дни рождения друзей не застанут врасплох, а брони не раскроют сюрприз.</p></div></div><div><span><ListPlus /></span><div><strong>Сколько угодно списков</strong><p>Планы на дом, путешествие, праздник или мечты без конкретного повода.</p></div></div></div></div>
        </section>

        <section className="final-cta"><div className="final-cta__spark">✦</div><span className="eyebrow">Первое желание — самое важное</span><h2>Что хочется<br /><em>прямо сейчас?</em></h2><p>Начните список бесплатно. Возможно, кто-то как раз ищет идею для вашего подарка.</p><Link className="button button--primary button--large" to="/register"><span>Создать свой Rollapp</span><ArrowRight size={19} /></Link></section>
      </main>
      <footer className="landing-footer"><Logo /><p>Списки желаний, которые приятно исполнять.</p><div><Link to="/ideas">Идеи</Link><a href="#how">Как работает</a><Link to="/login">Войти</Link></div><span>© 2026 Rollapp</span></footer>
    </div>
  );
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
    <div className="auth-page"><div className="auth-art"><Logo /><div className="auth-art__copy"><span className="eyebrow eyebrow--light"><Heart size={15} fill="currentColor" /> Место для мечтаний</span><h1>{mode === "register" ? <>Пусть близкие<br />знают, <em>чем вас<br />порадовать.</em></> : <>Ваши желания<br /><em>ждут вас.</em></>}</h1><p>Красивый вишлист, приватные брони и ни одного случайного подарка.</p></div><div className="auth-polaroid"><img src="/art/gift.svg" alt="Подарки" /><span>Хороший сюрприз начинается здесь ✦</span></div></div><div className="auth-panel"><Link className="auth-back" to="/"><ArrowLeft size={17} /> На главную</Link><form className="auth-form" onSubmit={submit}><div><span className="eyebrow">{mode === "register" ? "Новый аккаунт" : "С возвращением"}</span><h2>{mode === "register" ? "Создать свой Rollapp" : "Войти в Rollapp"}</h2><p>{mode === "register" ? "Это бесплатно и займёт меньше минуты." : "Продолжите собирать и исполнять желания."}</p></div>{mode === "register" && <label><span>Как вас зовут</span><input required minLength={2} autoComplete="name" placeholder="Алиса Морозова" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>}<label><span>Email</span><input required type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label><span>Пароль</span><input required minLength={8} type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder="Минимум 8 символов" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label><Button type="submit" loading={loading} className="auth-submit">{mode === "register" ? "Создать вишлист" : "Войти"}</Button><p className="auth-switch">{mode === "register" ? <>Уже есть аккаунт? <Link to={`/login?next=${encodeURIComponent(nextPath)}`}>Войти</Link></> : <>Впервые здесь? <Link to={`/register?next=${encodeURIComponent(nextPath)}`}>Создать аккаунт</Link></>}</p></form></div></div>
  );
}

const shellNav = [
  { to: "/app", icon: Home, label: "Обзор", end: true }, { to: "/app/wishes", icon: Heart, label: "Мои желания" },
  { to: "/app/ideas", icon: Sparkles, label: "Идеи" }, { to: "/app/friends", icon: Users, label: "Друзья" },
  { to: "/app/gifts", icon: Gift, label: "Хочу подарить" },
];

function AppShell({ children, onAddWish }) {
  const { user, unreadCount, refresh } = useSession();
  const navigate = useNavigate(); const location = useLocation(); const toast = useToast(); const [mobileOpen, setMobileOpen] = useState(false);
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
  return <div className="app-layout app-layout--dark"><aside ref={sidebarRef} id="app-sidebar" aria-label="Меню приложения" className={`sidebar ${mobileOpen ? "is-open" : ""}`}><div className="sidebar__head"><Logo /><button className="sidebar-close" aria-label="Закрыть меню" onClick={() => setMobileOpen(false)}><X /></button></div><Button icon={Plus} onClick={onAddWish} className="sidebar__add">Добавить желание</Button><nav className="sidebar__nav">{shellNav.map(({ to, icon: Icon, label, end }) => <NavLink key={to} to={to} end={end} onClick={() => setMobileOpen(false)}><Icon size={19} /><span>{label}</span></NavLink>)}</nav><div className="sidebar__bottom"><NavLink to="/app/notifications"><Bell size={19} /><span>Уведомления</span>{unreadCount > 0 && <i>{unreadCount}</i>}</NavLink><NavLink to="/app/settings"><Settings size={19} /><span>Настройки</span></NavLink><div className="sidebar__user"><Avatar user={user} size="sm" /><div><strong>{user.name}</strong><span>@{user.username}</span></div><button onClick={logout} aria-label="Выйти" title="Выйти"><LogOut size={18} /></button></div></div></aside><button className="mobile-overlay" aria-label="Закрыть меню" onClick={() => setMobileOpen(false)} /><main className="app-main"><header className="mobile-app-head"><button ref={mobileMenuButtonRef} onClick={() => setMobileOpen(true)} aria-label="Открыть меню" aria-expanded={mobileOpen} aria-controls="app-sidebar"><Menu /></button><Logo /><Link to="/app/notifications" aria-label="Уведомления"><Bell />{unreadCount > 0 && <i />}</Link></header>{children}</main><nav className="mobile-bottom-nav" aria-label="Основные разделы">{shellNav.slice(0, 5).map(({ to, icon: Icon, label, end }) => <NavLink key={to} to={to} end={end}><Icon /><span>{label === "Мои желания" ? "Желания" : label === "Хочу подарить" ? "Подарить" : label}</span></NavLink>)}</nav></div>;
}

function ProtectedApp() {
  const { user, loading } = useSession(); const [wishModal, setWishModal] = useState(false); const [version, setVersion] = useState(0);
  useEffect(() => {
    document.body.classList.add("app-dark");
    return () => document.body.classList.remove("app-dark");
  }, []);
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell onAddWish={() => setWishModal(true)}><Routes><Route index element={<Dashboard onAdd={() => setWishModal(true)} version={version} />} /><Route path="wishes" element={<WishesPage onAdd={() => setWishModal(true)} version={version} />} /><Route path="ideas" element={<IdeasPage appMode />} /><Route path="friends" element={<FriendsPage />} /><Route path="gifts" element={<GiftsPage />} /><Route path="notifications" element={<NotificationsPage />} /><Route path="settings" element={<SettingsPage />} /><Route path="*" element={<Navigate to="/app" replace />} /></Routes>{wishModal && <WishModal onClose={() => setWishModal(false)} onSaved={() => { setWishModal(false); setVersion((v) => v + 1); }} />}</AppShell>;
}

function PageTitle({ eyebrow, title, text, action }) { return <div className="app-page-title"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{text && <p>{text}</p>}</div>{action}</div>; }

function Dashboard({ onAdd, version }) {
  const { user } = useSession(); const { data, loading, error, reload } = useAsync(() => api.get("/dashboard"), [version]); const toast = useToast();
  if (loading) return <LoadingScreen compact />;
  if (error) return <EmptyState title="Не удалось загрузить обзор" text={error.message} action={<Button onClick={() => reload().catch(() => {})}>Повторить</Button>} />;
  const active = data.wishes.filter((wish) => wish.status === "active");
  const copyProfile = async () => { await navigator.clipboard.writeText(`${window.location.origin}${publicProfilePath(user.username)}`); toast("Ссылка на вишлист скопирована"); };
  return <div className="app-page dashboard"><PageTitle eyebrow={new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date())} title={`Привет, ${user.name.split(" ")[0]}!`} text="Что сегодня хочется добавить в жизнь?" action={<Button variant="outline" icon={Share2} onClick={copyProfile}>Поделиться</Button>} /><section className="dashboard-hero"><div><span>В вашем вишлисте</span><strong>{active.length}</strong><p>{active.length === 1 ? "активное желание" : "активных желаний"} в {data.lists.length} {data.lists.length === 1 ? "списке" : "списках"}</p><Button icon={Plus} onClick={onAdd}>Добавить мечту</Button></div><div className="dashboard-hero__collage">{active.slice(0, 3).map((wish, index) => <img key={wish.id} src={wish.imageUrl || `https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=500&q=80&sig=${index}`} alt="" />)}{active.length === 0 && <Gift size={80} />}</div></section><div className="dashboard-grid"><section className="panel panel--wide"><div className="panel__head"><div><h2>Последние желания</h2><span>Ваш список выглядит чудесно</span></div><Link to="/app/wishes">Все желания <ArrowRight size={16} /></Link></div>{active.length ? <div className="compact-wishes">{active.slice(0, 4).map((wish) => <Link to="/app/wishes" className="compact-wish" key={wish.id}><img src={wish.imageUrl || "/gift-placeholder.svg"} alt="" /><div><strong>{wish.title}</strong><span>{formatMoney(wish.price, wish.currency)}</span></div><Priority value={wish.priority} /></Link>)}</div> : <EmptyState title="Пока здесь тихо" text="Добавьте первую мечту — даже самую маленькую." action={<Button onClick={onAdd} icon={Plus}>Добавить</Button>} />}</section><section className="panel"><div className="panel__head"><div><h2>Скоро праздник</h2><span>Дни рождения друзей</span></div><CalendarDays size={19} /></div><div className="birthday-list">{data.birthdays.length ? data.birthdays.map((friend) => <Link to={publicProfilePath(friend.username)} key={friend.id}><Avatar user={friend} size="sm" /><div><strong>{friend.name}</strong><span>{formatDate(friend.birthday)}</span></div><ArrowRight size={16} /></Link>) : <p className="muted">Подпишитесь на друзей, чтобы видеть даты.</p>}</div><Link className="panel-link" to="/app/friends"><UserPlus size={16} /> Найти друзей</Link></section><section className="panel panel--wide dashboard-lists"><div className="panel__head"><div><h2>Ваши списки</h2><span>Разложите мечты по настроению</span></div><Link to="/app/wishes">Управлять <ArrowRight size={16} /></Link></div><div className="list-strip">{data.lists.map((list) => <article className={`mini-list mini-list--${list.color}`} key={list.id}><div><ListPlus size={18} /><span>{list.privacy === "private" ? <LockKeyhole size={13} /> : null}{list.wishCount} желаний</span></div><strong>{list.title}</strong><p>{list.description || "Ваш личный список"}</p></article>)}</div></section></div></div>;
}

function Priority({ value }) { return <span className="priority" title={`Важность: ${value} из 3`}>{[1, 2, 3].map((item) => <i key={item} className={item <= value ? "is-on" : ""} />)}</span>; }

function useWishActions({ wish, profile, lists = [], shareToken = "", onChanged, onDeleted }) {
  const toast = useToast();
  const { user } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const requireLogin = () => {
    if (user) return false;
    const next = `${location.pathname}${location.search}`;
    navigate(`/login?next=${encodeURIComponent(next)}`);
    return true;
  };
  const reserve = async () => {
    if (requireLogin()) return;
    setBusy(true);
    try {
      const result = await api.post(`/wishes/${wish.id}/reserve`, { shareToken: shareToken || wish.shareToken || "" });
      toast(result.reserved ? "Подарок забронирован — владелец не узнает кем" : "Бронь снята");
      await onChanged?.();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm("Удалить это желание?")) return;
    setBusy(true);
    try {
      await api.delete(`/wishes/${wish.id}`);
      toast("Желание удалено");
      await onChanged?.();
      onDeleted?.();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const fulfilled = async () => {
    setBusy(true);
    try {
      await api.post(`/wishes/${wish.id}/fulfilled`, {});
      toast(wish.status === "fulfilled" ? "Желание снова активно" : "Отмечено исполненным ✦");
      await onChanged?.();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const share = async () => {
    const linkedLists = lists.filter((list) => wish.listIds?.includes(list.id));
    const privateOnly = wish.privacy === "private" || (linkedLists.length > 0 && linkedLists.every((list) => list.privacy === "private"));
    if (privateOnly) {
      toast("Секретное желание видно только вам", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${wishSharePath({ wish, profile, lists, shareToken })}`);
      toast("Ссылка скопирована");
    } catch {
      toast("Не удалось скопировать ссылку", "error");
    }
  };
  const save = async () => {
    if (requireLogin()) return;
    setBusy(true);
    try {
      await api.post(`/wishes/${wish.id}/copy`, { shareToken: shareToken || wish.shareToken || "" });
      toast("Желание сохранено в ваш список");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return { busy, reserve, remove, fulfilled, share, save };
}

function WishCard({ wish, owner = false, onChanged, onOpen, onEdit, profile, lists = [], shareToken = "", variant = "" }) {
  const [menu, setMenu] = useState(false);
  const { busy, reserve, remove, fulfilled, share, save } = useWishActions({ wish, profile, lists, shareToken, onChanged });
  const reservationUnavailable = wish.reservationCount > 0 && !wish.allowMultiple && !wish.reservedByMe;
  return (
    <article className={`wish-card ${variant ? `wish-card--${variant}` : ""} ${wish.status === "fulfilled" ? "is-fulfilled" : ""}`}>
      {onOpen && <button type="button" className="wish-card__open" data-wish-id={wish.id} aria-label={`Открыть желание «${wish.title}»`} aria-haspopup="dialog" onClick={(event) => { setMenu(false); onOpen(event.currentTarget); }} />}
      <div className="wish-card__image">{wish.imageUrl ? <img src={wish.imageUrl} alt="" /> : <span><Gift size={36} /></span>}<Priority value={wish.priority} />{wish.status === "fulfilled" && <div className="fulfilled-badge"><Check /> Исполнено</div>}</div>
      <div className="wish-card__body">
        <div className="wish-card__top"><span>{formatMoney(wish.price, wish.currency)}</span><button type="button" aria-label={`Опции желания «${wish.title}»`} aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal /></button>{menu && <div className="card-menu">{!owner && <button type="button" onClick={reserve}><Gift /> {wish.reservedByMe ? "Снять бронь" : "Забронировать"}</button>}{!owner && <button type="button" onClick={save}><Archive /> Сохранить к себе</button>}<button type="button" onClick={share}><Share2 /> Поделиться</button>{wish.url && <a href={wish.url} target="_blank" rel="noreferrer"><ExternalLink /> Открыть магазин</a>}{owner && <>{onEdit && <button type="button" aria-haspopup="dialog" onClick={() => { setMenu(false); onEdit(); }}><Pencil /> Редактировать</button>}<button type="button" onClick={fulfilled}><PackageCheck /> {wish.status === "fulfilled" ? "Вернуть в активные" : "Желание исполнено"}</button><button type="button" className="danger" onClick={remove}><Trash2 /> Удалить</button></>}</div>}</div>
        <h3>{wish.title}</h3>
        <p>{wish.description || "Без дополнительного описания"}</p>
        {owner ? <div className="wish-card__owner-meta">{wish.privacy === "private" ? <span><LockKeyhole /> Только вам</span> : <span><Eye /> Виден друзьям</span>}{wish.reservationCount > 0 && <span><Gift /> Кто-то готовит подарок</span>}</div> : <Button variant={wish.reservedByMe ? "reserved" : "outline"} loading={busy} icon={wish.reservedByMe ? Check : Gift} onClick={reserve} disabled={wish.status !== "active" || reservationUnavailable}>{wish.reservedByMe ? "Забронировано вами" : reservationUnavailable ? "Уже забронировано" : "Забронировать"}</Button>}
      </div>
    </article>
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
  return <div className="app-page wishes-page"><PageTitle eyebrow="Личная коллекция" title="Мои желания" text={`${activeWishes.length} активных · ${data.wishes.filter((wish) => wish.status === "fulfilled").length} исполнено`} action={<div className="page-actions">{selectedList && <Button variant="outline" icon={Pencil} onClick={() => setListModal(selectedList)}>Настройки списка</Button>}<Button variant="outline" icon={Share2} onClick={share}>Поделиться</Button><Button icon={Plus} onClick={onAdd}>Добавить</Button></div>} /><div className="list-tabs"><button className={selected === "all" ? "active" : ""} onClick={() => setSelected("all")}><Heart size={16} /> Мои желания <span>{activeWishes.length}</span></button>{categoryLists.map((list) => <button className={selected === list.id ? "active" : ""} key={list.id} onClick={() => setSelected(list.id)}>{list.privacy === "private" && <LockKeyhole size={14} />}{list.title} <span>{list.wishCount}</span></button>)}<button className="list-tabs__add" onClick={() => setListModal({})}><Plus size={16} /> Новый список</button></div>{wishes.length ? <div className="wish-grid">{wishes.map((wish) => <WishCard key={wish.id} wish={wish} owner profile={user} lists={data.lists} onChanged={reload} onOpen={() => setSelectedWishId(wish.id)} onEdit={() => editWish(wish.id)} />)}</div> : <EmptyState icon={Heart} title="В этом списке пока пусто" text="Добавьте то, что действительно порадует." action={<Button icon={Plus} onClick={onAdd}>Добавить желание</Button>} />}{selectedWish && <WishDetailsModal wish={selectedWish} owner profile={user} lists={data.lists} onChanged={reload} onEdit={() => editWish(selectedWish.id)} onClose={() => setSelectedWishId(null)} />}{editingWish && <WishModal wish={editingWish} onClose={() => setEditingWishId(null)} onSaved={async () => { setEditingWishId(null); await reload(); }} />}{listModal && <ListModal list={listModal.id ? listModal : null} listsCount={data.lists.length} onClose={() => setListModal(null)} onSaved={async (saved) => { setListModal(null); await reload(); if (saved?.id) setSelected(saved.id); }} onDeleted={async () => { setListModal(null); setSelected("all"); await reload(); }} />}</div>;
}

function Modal({ children, onClose, wide = false, className = "", ariaLabel = "Диалог Rollapp", portal = true, backdropClassName = "" }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const focusableSelector = "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const focusDialog = window.requestAnimationFrame(() => {
      if (dialogRef.current?.contains(document.activeElement)) return;
      const target = dialogRef.current?.querySelector("[autofocus], [data-modal-initial-focus]") || dialogRef.current;
      target?.focus();
    });
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
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
    document.body.classList.add("modal-open");
    return () => {
      window.cancelAnimationFrame(focusDialog);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("modal-open");
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  const modal = <div className={`modal-backdrop ${backdropClassName}`} onMouseDown={(event) => event.target === event.currentTarget && onCloseRef.current()}><div ref={dialogRef} className={`modal ${wide ? "modal--wide" : ""} ${className}`} role="dialog" aria-modal="true" aria-label={ariaLabel} tabIndex={-1}>{children}<button type="button" className="modal__close" data-modal-initial-focus aria-label="Закрыть диалог" onClick={() => onCloseRef.current()}><X /></button></div></div>;
  return portal ? createPortal(modal, document.body) : modal;
}

function WishDetailsModal({ wish, owner = false, profile, shareToken = "", lists = [], onChanged, onEdit, onClose }) {
  const { busy, reserve, fulfilled, share } = useWishActions({ wish, profile, lists, shareToken, onChanged });
  const reservationUnavailable = wish.reservationCount > 0 && !wish.allowMultiple && !wish.reservedByMe;
  const linkedLists = lists.filter((list) => wish.listIds.includes(list.id));
  const linkedListNames = linkedLists.map((list) => list.title);
  const listLabel = linkedListNames.length > 1 ? `${linkedListNames[0]} +${linkedListNames.length - 1}` : linkedListNames[0] || "Без списка";
  const listTitleText = linkedListNames.join(", ") || "Без списка";
  return (
    <Modal portal onClose={onClose} className="modal--wish-detail" backdropClassName="modal-backdrop--wish-detail" ariaLabel={`Желание: ${wish.title}`}>
      <article className="wish-detail">
        <div className="wish-detail__media">
          {wish.imageUrl ? <img src={wish.imageUrl} alt={`Фото желания «${wish.title}»`} /> : <span className="wish-detail__placeholder"><Gift /></span>}
          <Priority value={wish.priority} />
          {wish.status === "fulfilled" && <span className="wish-detail__fulfilled"><Check /> Исполнено</span>}
        </div>
        <div className="wish-detail__side">
          <div className="wish-detail__toolbar">
            <div className={`wish-detail__list-control ${owner && onEdit ? "is-editable" : ""}`} title={listTitleText}>
              {owner && onEdit
                ? <button type="button" aria-label={`Изменить списки желания. Сейчас: ${listTitleText}`} aria-haspopup="dialog" onClick={onEdit}><span>{listLabel}</span><ChevronDown /></button>
                : <span><span>{listLabel}</span><ChevronDown /></span>}
            </div>
            <button className="wish-detail__share" type="button" aria-label="Поделиться желанием" title="Поделиться" onClick={share}><MoreHorizontal /></button>
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
            {owner && <div className="wish-detail__meta">
              <span><CalendarDays /> Добавлено {formatDate(wish.createdAt)}</span>
              {wish.privacy === "private" ? <span><LockKeyhole /> Только вам</span> : <span><Eye /> Видно друзьям</span>}
              {wish.allowMultiple && <span><Gift /> Можно подарить несколько</span>}
              {wish.reservationCount > 0 && <span><Gift /> Кто-то готовит подарок</span>}
            </div>}
          </div>
        </div>
      </article>
    </Modal>
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

function WishModal({ onClose, onSaved, wish = null }) {
  const editing = Boolean(wish?.id);
  const toast = useToast(); const { data, loading: listsLoading } = useAsync(() => api.get("/dashboard"), []); const [step, setStep] = useState(editing ? "details" : "link"); const [loading, setLoading] = useState(false); const [metadata, setMetadata] = useState({ status: "idle", message: "" }); const [form, setForm] = useState(() => wishFormFrom(wish));
  const autoTimerRef = useRef(null); const metadataRequestRef = useRef(0); const editedMetadataFieldsRef = useRef(new Set());
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
  const submit = async (event) => { event.preventDefault(); setLoading(true); try { const payload = { ...form, price: form.price === "" ? null : Number(form.price) }; const result = editing ? await api.patch(`/wishes/${wish.id}`, payload) : await api.post("/wishes", payload); toast(editing ? "Изменения сохранены" : "Желание добавлено ✦"); await onSaved?.(result.wish); } catch (error) { toast(error.message, "error"); } finally { setLoading(false); } };
  const toggleList = (id) => setForm((current) => ({
    ...current,
    listIds: current.listIds.includes(id) ? current.listIds.filter((item) => item !== id) : [...current.listIds, id],
  }));
  const metadataNotice = metadata.status !== "idle" && <div className={`metadata-status metadata-status--${metadata.status}`} role="status" aria-live="polite"><span className="metadata-status__icon">{["waiting", "loading"].includes(metadata.status) ? <LoaderCircle className="spin" /> : metadata.status === "success" ? <CheckCircle2 /> : <X />}</span><div><strong>{metadata.status === "waiting" ? "Готовим автозаполнение" : metadata.status === "loading" ? "Читаем карточку товара" : metadata.status === "success" ? "Готово" : "Не получилось автоматически"}</strong><span>{metadata.message}</span></div>{step === "details" && metadata.status === "error" && form.url && <button type="button" onClick={() => recognize(form.url, { advance: false })}>Повторить</button>}</div>;
  return <Modal onClose={onClose} wide><form className="modal-form wish-form" onSubmit={submit}><div className="modal-heading"><span className="modal-icon">{editing ? <Pencil /> : <Heart fill="currentColor" />}</span><div><span className="eyebrow">{editing ? "Редактирование" : "Новое желание"}</span><h2>{editing ? "Изменить желание" : step === "link" ? "Добавим мечту" : "Проверьте карточку"}</h2><p>{editing ? "Измените детали или перенесите желание в другие списки." : step === "link" ? "Вставьте ссылку — название, фото и цену подставим сами." : "Чем точнее детали, тем проще друзьям."}</p></div></div>{step === "link" ? <div className="link-step"><label className="link-input"><Link2 /><input autoFocus type="url" inputMode="url" placeholder="https://магазин.ru/то-самое" value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value.trim() }))} /></label>{metadataNotice}<Button type="button" onClick={continueFromLink} loading={metadata.status === "loading"}>{metadata.status === "error" ? "Попробовать снова" : "Продолжить"}</Button><button type="button" className="manual-link" onClick={fillManually}>У меня нет ссылки — заполнить вручную</button><div className="recognition-note"><WandSparkles /><div><strong>Автоматическое заполнение</strong><span>Начнём разбор через мгновение после вставки ссылки.</span></div></div></div> : <>{metadataNotice}<div className="wish-form__grid"><div className="image-preview"><div>{form.imageUrl ? <img src={form.imageUrl} alt="Предпросмотр" /> : <><Image size={35} /><span>Фото желания</span></>}</div><label><Image size={16} /> Ссылка на фото<input type="text" inputMode="url" value={form.imageUrl} onChange={(event) => updateMetadataField("imageUrl", event.target.value)} /></label></div><div className="wish-fields">{editing && <label><span>Ссылка на товар</span><input type="url" inputMode="url" value={form.url} placeholder="https://…" onChange={(event) => updateMetadataField("url", event.target.value.trim())} /></label>}<label><span>Название</span><input autoFocus required value={form.title} placeholder="Что вы хотите?" onChange={(event) => updateMetadataField("title", event.target.value)} /></label><label><span>Комментарий для друзей</span><textarea rows={3} value={form.description} placeholder="Размер, цвет, важные детали…" onChange={(event) => updateMetadataField("description", event.target.value)} /></label><div className="form-row form-row--price"><label><span>Цена</span><input type="number" min="0" value={form.price} placeholder="0" onChange={(event) => updateMetadataField("price", event.target.value)} /></label><label><span>Валюта</span><select value={form.currency} onChange={(event) => updateMetadataField("currency", event.target.value)}>{WISH_CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select></label><label><span>Важность</span><div className="priority-picker">{[1, 2, 3].map((item) => <button type="button" aria-label={`Важность ${item} из 3`} aria-pressed={form.priority === item} className={item <= form.priority ? "active" : ""} onClick={() => setForm({ ...form, priority: item })} key={item}><Star fill="currentColor" /></button>)}</div></label></div></div></div><fieldset className="list-choice"><legend>{editing ? "Списки желания" : "Добавить в списки"}</legend>{listsLoading ? <LoadingScreen compact /> : selectableLists.map((list) => <label key={list.id}><input type="checkbox" checked={form.listIds.includes(list.id)} onChange={() => toggleList(list.id)} /><span className={`list-dot list-dot--${list.color}`} /><span>{list.title}</span><small>{list.wishCount} желаний</small><Check /></label>)}</fieldset><p className="wish-form__list-hint">Список можно не выбирать — желание останется в «Моих желаниях».</p><div className="wish-settings"><label><input type="checkbox" checked={form.privacy === "private"} onChange={(event) => setForm({ ...form, privacy: event.target.checked ? "private" : "inherit" })} /><span><LockKeyhole /> Секретное желание<small>Видно только вам</small></span></label><label><input type="checkbox" checked={form.allowMultiple} onChange={(event) => setForm({ ...form, allowMultiple: event.target.checked })} /><span><Gift /> Можно подарить несколько<small>Например, сертификаты</small></span></label></div><div className="modal-actions">{editing ? <Button type="button" variant="ghost" onClick={onClose}>Отмена</Button> : <Button type="button" variant="ghost" onClick={() => setStep("link")} icon={ArrowLeft}>Назад</Button>}<Button type="submit" loading={loading} icon={editing ? Check : Heart}>{editing ? "Сохранить изменения" : "Добавить желание"}</Button></div></>}</form></Modal>;
}

function IdeasPage({ appMode = false }) {
  const { user } = useSession(); const toast = useToast(); const [search, setSearch] = useState(""); const [category, setCategory] = useState(""); const [selectedIdea, setSelectedIdea] = useState(null); const { data, loading } = useAsync(() => api.get(`/ideas?category=${encodeURIComponent(category)}&search=${encodeURIComponent(search)}`), [category, search]);
      const content = <><div className="ideas-hero"><span className="eyebrow"><WandSparkles size={15} /> Отобрано с любопытством</span><h1>Идеи, от которых<br /><em>что-то ёкает</em></h1><p>Не безликий каталог товаров, а поводы заметить: «Да, вот этого мне и хотелось».</p><label className="ideas-search"><Search /><input placeholder="Керамика, музыка, впечатления…" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></label></div>{loading ? <LoadingScreen compact /> : <><div className="category-row"><button className={!category ? "active" : ""} onClick={() => setCategory("")}>Всё <span>{data.categories.reduce((sum, item) => sum + item.count, 0)}</span></button>{data.categories.map((item) => <button className={category === item.name ? "active" : ""} onClick={() => setCategory(item.name)} key={item.name}>{item.name} <span>{item.count}</span></button>)}</div><div className="ideas-grid">{data.ideas.map((idea, index) => <article className={`idea-card idea-card--${index % 5}`} key={idea.id}><div className="idea-card__image"><img src={idea.imageUrl} alt="" /><span>{idea.badge}</span><button aria-label={`Сохранить идею «${idea.title}»`} onClick={() => user ? setSelectedIdea(idea) : toast("Войдите, чтобы сохранить идею", "error")}><Heart /></button></div><div className="idea-card__copy"><small>{idea.category}</small><h3>{idea.title}</h3><p>{idea.description}</p><strong>{formatMoney(idea.price, idea.currency)}</strong></div></article>)}</div></>}{selectedIdea && <SaveIdeaModal idea={selectedIdea} onClose={() => setSelectedIdea(null)} />}</>;
  if (appMode) return <div className="app-page ideas-page">{content}</div>;
  return <div className="public-ideas"><LandingHeader /><main>{content}</main><footer className="landing-footer"><Logo /><p>Списки желаний, которые приятно исполнять.</p><span>© 2026 Rollapp</span></footer></div>;
}

function SaveIdeaModal({ idea, onClose }) { const toast = useToast(); const { data, loading } = useAsync(() => api.get("/dashboard"), []); const [listId, setListId] = useState(""); const [busy, setBusy] = useState(false); useEffect(() => { if (data?.lists?.[0]) setListId(data.lists[0].id); }, [data]); const save = async () => { setBusy(true); try { await api.post(`/ideas/${idea.id}/save`, { listId }); toast("Идея сохранена в ваш список"); onClose(); } catch (error) { toast(error.message, "error"); } finally { setBusy(false); } }; return <Modal onClose={onClose}><div className="save-idea"><img src={idea.imageUrl} alt="" /><span className="eyebrow">Сохранить идею</span><h2>{idea.title}</h2><p>{idea.description}</p>{loading ? <LoadingScreen compact /> : <label><span>Выберите список</span><select value={listId} onChange={(event) => setListId(event.target.value)}>{data.lists.map((list) => <option value={list.id} key={list.id}>{list.title}</option>)}</select></label>}<div className="modal-actions"><Button variant="ghost" onClick={onClose}>Отмена</Button><Button icon={Heart} onClick={save} loading={busy}>Сохранить</Button></div></div></Modal>; }

function FriendsPage() { const [search, setSearch] = useState(""); const { data, loading, reload } = useAsync(() => api.get(`/people?search=${encodeURIComponent(search)}`), [search]); const toast = useToast(); const follow = async (person) => { try { const result = await api.post(`/profile/${person.username}/follow`, {}); toast(result.following ? `Вы подписались на ${person.name}` : "Подписка отменена"); reload(); } catch (error) { toast(error.message, "error"); } }; return <div className="app-page friends-page"><PageTitle eyebrow="Люди рядом" title="Друзья и их мечты" text="Подпишитесь, чтобы не пропускать важные даты и новые желания." /><label className="app-search"><Search /><input placeholder="Имя или @профиль" value={search} onChange={(event) => setSearch(event.target.value)} /></label>{loading ? <LoadingScreen compact /> : <div className="people-grid">{data.people.map((person) => <article className="person-card" key={person.id}><Link to={publicProfilePath(person.username)}><Avatar user={person} size="lg" /><span className="person-card__count"><Heart size={14} fill="currentColor" /> {person.wishCount}</span><h3>{person.name}</h3><small>@{person.username}</small><p>{person.bio || "Пока без описания"}</p></Link><Button variant={person.isFollowing ? "soft" : "outline"} icon={person.isFollowing ? Check : UserPlus} onClick={() => follow(person)}>{person.isFollowing ? "Вы подписаны" : "Подписаться"}</Button></article>)}</div>}</div>; }

function GiftsPage() { const { data, loading } = useAsync(() => api.get("/dashboard"), []); if (loading) return <LoadingScreen compact />; return <div className="app-page gifts-page"><PageTitle eyebrow="Секретный план" title="Хочу подарить" text="Здесь видны ваши брони. Владельцы желаний — ничего не узнают." />{data.reservations.length ? <div className="reservation-list">{data.reservations.map((item) => <article key={item.id}><img src={item.image_url || "/gift-placeholder.svg"} alt="" /><div><small>Подарок для <Link to={publicProfilePath(item.owner_username)}>{item.owner_name}</Link></small><h3>{item.title}</h3><span>{formatMoney(item.price, item.currency)}</span></div><Link className="button button--outline" to={publicProfilePath(item.owner_username)}><span>Открыть список</span><ArrowRight size={17} /></Link></article>)}</div> : <EmptyState icon={Gift} title="Вы пока ничего не забронировали" text="Загляните в вишлисты друзей и выберите подарок." action={<Link className="button button--primary" to="/app/friends"><span>Найти друзей</span></Link>} />}</div>; }

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
    document.body.classList.add("public-profile-dark");
    return () => document.body.classList.remove("public-profile-dark");
  }, []);

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
  if (error) return <div className="public-profile public-profile--dark public-profile--state"><div className="not-found"><Logo /><Gift /><h1>Такой список не нашёлся</h1><p>{error.message}</p><Link className="button button--primary" to="/"><span>На главную</span></Link></div></div>;

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
  const appTarget = user ? "/app" : "/register";
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

  return (
    <div className={`public-profile public-profile--dark ${data.isOwner && !shared ? "public-profile--list-layout" : shared ? "public-profile--shared-layout" : "public-profile--guest-layout"} ${data.isOwner ? "is-owner" : "is-guest"}`}>
      <header className={`profile-header ${profileCompact ? "is-compact" : ""}`}>
        <Logo />
        <div className="profile-header__compact" aria-hidden={!profileCompact}>
          <Avatar user={data.profile} size="sm" />
          <div><strong>{data.profile.name}</strong><span>@{data.profile.username}</span></div>
        </div>
        <nav className="profile-header__dock" aria-label="Основная навигация">
          <Link className={!data.isOwner ? "profile-header__ideas is-active" : "profile-header__ideas"} to="/ideas" aria-label="Идеи подарков" title="Идеи подарков"><Flame fill="currentColor" /></Link>
          <Link className={data.isOwner ? "is-active" : ""} to={appTarget} aria-label="Мои желания" title="Мои желания"><Heart fill="currentColor" /></Link>
          <Link to={friendsTarget} aria-label="Друзья" title="Друзья"><Users fill="currentColor" /></Link>
          <Link className="profile-header__search" to={friendsTarget} aria-label="Поиск" title="Поиск"><Search /></Link>
        </nav>
        <div className="profile-header__actions">
          {user ? <button className="profile-desktop-menu" type="button" aria-label={desktopMenuOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={desktopMenuOpen} onClick={() => setDesktopMenuOpen((value) => !value)}>{desktopMenuOpen ? <X /> : <Menu />}</button> : <Link className="button button--primary" to={`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`}><span>Вход</span></Link>}
          {user && <nav className={`profile-desktop-panel ${desktopMenuOpen ? "is-open" : ""}`} aria-label="Меню аккаунта" aria-hidden={!desktopMenuOpen}><Link to="/app" onClick={() => setDesktopMenuOpen(false)}><Heart /> Мои желания</Link><Link to="/app/settings" onClick={() => setDesktopMenuOpen(false)}><Settings /> Настройки</Link></nav>}
        </div>
        {!data.isOwner && !shared && <button className="profile-header__compact-follow" type="button" onClick={follow}>{data.isFollowing ? "Вы подписаны" : "Подписаться"}</button>}
        <button className="profile-mobile-menu" type="button" aria-label={mobileMenuOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={mobileMenuOpen} aria-controls="profile-mobile-navigation" onClick={() => setMobileMenuOpen((value) => !value)}>{mobileMenuOpen ? <X /> : <Menu />}</button>
        <button className={`profile-mobile-overlay ${mobileMenuOpen ? "is-open" : ""}`} type="button" aria-label="Закрыть меню" onClick={() => setMobileMenuOpen(false)} />
        <nav id="profile-mobile-navigation" className={`profile-mobile-panel ${mobileMenuOpen ? "is-open" : ""}`} aria-label="Меню профиля">
          <div className="profile-mobile-panel__head"><Logo /><button type="button" aria-label="Закрыть меню" onClick={() => setMobileMenuOpen(false)}><X /></button></div>
          <div className="profile-mobile-panel__promo"><div><strong>Rollapp — бесплатный сервис для создания вишлистов и списков желаний</strong><Link className="button button--primary" to={user ? "/app" : `/register?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`} onClick={() => setMobileMenuOpen(false)}><span>{user ? "Открыть мой вишлист" : "Создать вишлист"}</span></Link></div><img src="/art/gift-3d.png" alt="" /></div>
          <div className="profile-mobile-panel__about"><p>Rollapp — это бесплатный онлайн-сервис вишлистов. Создайте персональный список желаний, добавьте ссылки на товары из любых магазинов с ценами и поделитесь списком с друзьями или семьёй.</p><p>Друзья бронируют подарки через быстрое бронирование без долгой регистрации — система исключает повторы. Встроенный каталог содержит идеи для дня рождения, Нового года, свадьбы и других праздников: от электроники до впечатлений.</p><p>Вишлист работает в браузере и в приложениях для iOS и Android. Регистрация занимает секунды через электронную почту, а функция многократного бронирования идеально подходит для подарочных сертификатов.</p></div>
          <div className="profile-mobile-panel__ecosystem"><button type="button" onClick={() => toast("Поддержка Rollapp скоро откроется")}><MessageCircle fill="currentColor" /> Поддержка</button><button type="button" onClick={() => toast("Rollapp в Дзене скоро откроется")}><Globe /> Аккаунт в «Дзене»</button><button type="button" onClick={() => toast("Канал Rollapp в Telegram скоро откроется")}><Send fill="currentColor" /> Канал в «Телеграме»</button><button type="button" onClick={() => toast("Канал Rollapp в MAX скоро откроется")}><MessageCircle fill="currentColor" /> Канал в MAX</button><strong><Zap fill="currentColor" /> Для бизнеса</strong></div>
          <div className="profile-mobile-panel__stores"><button type="button" onClick={() => toast("Приложение Rollapp для iOS скоро появится")}><Apple fill="currentColor" /><span>App Store</span></button><button type="button" onClick={() => toast("Приложение Rollapp для Android скоро появится")}><i className="store-mark store-mark--google" aria-hidden="true" /><span>Google Play</span></button><button type="button" onClick={() => toast("Rollapp скоро появится в RuStore")}><i className="store-mark store-mark--rustore" aria-hidden="true" /><span>RuStore</span></button><button type="button" onClick={() => toast("Rollapp скоро появится в AppGallery")}><i className="store-mark store-mark--appgallery" aria-hidden="true" /><span>AppGallery</span></button></div>
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
            <Link to={user ? "/app/gifts" : "/login"}><Sparkles /><span>Хочу подарить</span></Link>
            <button className={selected === "fulfilled" ? "active" : ""} type="button" aria-pressed={selected === "fulfilled"} onClick={() => selectCollection("fulfilled")}><Check /><span>Исполнено</span></button>
          </nav>
          <nav className="profile-list-rail__ecosystem" aria-label="Сервисы Rollapp">
            <Link className="profile-list-rail__business" to="/register"><Zap fill="currentColor" /> Для бизнеса</Link>
            <button type="button" onClick={() => toast("Приложение Rollapp для iOS скоро появится")}><Apple fill="currentColor" /> Скачать на iOS</button>
            <button type="button" onClick={() => toast("Приложение Rollapp для Android скоро появится")}><Play fill="currentColor" /> Скачать для Android</button>
            <button type="button" onClick={() => toast("Rollapp скоро появится в RuStore")}><Radio fill="currentColor" /> Скачать из RuStore</button>
            <button type="button" onClick={() => toast("Rollapp скоро появится в AppGallery")}><Smartphone fill="currentColor" /> Скачать в AppGallery</button>
            <button type="button" onClick={() => toast("Расширение Rollapp для Chrome скоро появится")}><Globe fill="currentColor" /> Расширение для Chrome</button>
            <button className="profile-list-rail__channel" type="button" onClick={() => toast("Канал Rollapp в Telegram скоро откроется")}><Send fill="currentColor" /> Канал в «Телеграме»</button>
            <button type="button" onClick={() => toast("Канал Rollapp в MAX скоро откроется")}><MessageCircle fill="currentColor" /> Канал в MAX</button>
          </nav>
          <small>© 2026 Rollapp</small>
        </aside> : <aside className="profile-rail profile-guest-rail">
          <div className="profile-rail__intro">
            <p>Rollapp — бесплатный сервис для создания вишлистов и списков желаний</p>
            <Link className="button button--primary" to={appTarget}>{user ? "Открыть мой список" : "Создать вишлист"}</Link>
          </div>
          <nav className="profile-guest-rail__people" aria-label="Люди в Rollapp"><Link to={friendsTarget}><Users /> Подписки</Link><Link to={friendsTarget}><UserPlus /> Подписчики</Link><Link to={friendsTarget}><CircleUserRound /> Найти друзей</Link></nav>
          <nav className="profile-list-rail__ecosystem" aria-label="Сервисы Rollapp">
            <Link className="profile-list-rail__business" to="/register"><Zap fill="currentColor" /> Для бизнеса</Link>
            <button type="button" onClick={() => toast("Приложение Rollapp для iOS скоро появится")}><Apple fill="currentColor" /> Скачать на iOS</button>
            <button type="button" onClick={() => toast("Приложение Rollapp для Android скоро появится")}><Play fill="currentColor" /> Скачать для Android</button>
            <button type="button" onClick={() => toast("Rollapp скоро появится в RuStore")}><Radio fill="currentColor" /> Скачать из RuStore</button>
            <button type="button" onClick={() => toast("Rollapp скоро появится в AppGallery")}><Smartphone fill="currentColor" /> Скачать в AppGallery</button>
            <button type="button" onClick={() => toast("Расширение Rollapp для Chrome скоро появится")}><Globe fill="currentColor" /> Расширение для Chrome</button>
            <button className="profile-list-rail__channel" type="button" onClick={() => toast("Rollapp в Дзене скоро откроется")}><Globe /> Аккаунт в «Дзене»</button>
            <button type="button" onClick={() => toast("Канал Rollapp в Telegram скоро откроется")}><Send fill="currentColor" /> Канал в «Телеграме»</button>
            <button type="button" onClick={() => toast("Канал Rollapp в MAX скоро откроется")}><MessageCircle fill="currentColor" /> Канал в MAX</button>
            <button type="button" onClick={() => toast("Поддержка Rollapp скоро откроется")}><MessageCircle fill="currentColor" /> Поддержка</button>
          </nav>
          <div className="profile-guest-rail__legal"><span>© Rollapp</span><span>Россия</span><button type="button" onClick={() => toast("Политика конфиденциальности готовится к публикации")}>Конфиденциальность</button><button type="button" onClick={() => toast("Пользовательское соглашение готовится к публикации")}>Пользовательское соглашение</button></div>
        </aside>}

        <main>
          <Link className="public-profile__back" to={user ? "/app/friends" : "/"}><i aria-hidden="true"><ArrowLeft /></i><span>Назад</span></Link>

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

          {wishes.length ? <><div className="wish-grid">{wishes.slice(0, visibleLimit).map((wish) => <WishCard key={wish.id} variant="public" wish={wish} owner={data.isOwner} profile={data.profile} lists={lists} shareToken={shared ? params.token : ""} onChanged={reload} onOpen={(opener) => openWish(wish.id, opener)} onEdit={data.isOwner ? () => editWish(wish.id) : undefined} />)}</div>{visibleLimit < wishes.length && <div className="wish-load-more" ref={loadMoreRef}><LoaderCircle className="spin" /><span>Загружаем ещё желания…</span></div>}</> : <EmptyState icon={Heart} title="В этом списке пока пусто" text="Загляните чуть позже — новая мечта наверняка появится." />}
          {selectedWish && <WishDetailsModal wish={selectedWish} owner={data.isOwner} profile={data.profile} lists={lists} shareToken={shared ? params.token : ""} onChanged={reload} onEdit={data.isOwner ? () => editWish(selectedWish.id) : undefined} onClose={closeWish} />}
          {editingWish && <WishModal wish={editingWish} onClose={() => setEditingWishId(null)} onSaved={async () => { setEditingWishId(null); await reload(); }} />}
          {listModal && <ListModal list={listModal.id ? listModal : null} listsCount={lists.length} onClose={() => setListModal(null)} onSaved={async (saved) => { setListModal(null); await reload(); if (saved?.id) selectCollection(saved.id); }} onDeleted={async () => { setListModal(null); selectCollection("all"); await reload(); }} />}
          {wishModalOpen && <WishModal onClose={() => setWishModalOpen(false)} onSaved={() => { setWishModalOpen(false); reload(); }} />}
        </main>
      </div>

      <footer><Logo /><span>Создано с мечтами в Rollapp</span><Link to="/register">Собрать свой список <ArrowRight size={16} /></Link></footer>
    </div>
  );
}

function NotFound() { return <div className="not-found"><Logo /><Gift /><h1>Похоже, эта мечта потерялась</h1><p>Страница не существует или ссылка устарела.</p><Link className="button button--primary" to="/"><span>Вернуться на главную</span></Link></div>; }

function LegacyProfileRedirect() {
  const params = useParams();
  const location = useLocation();
  const suffix = String(params["*"] || "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const target = `${publicProfilePath(params.username)}${suffix ? `/${suffix}` : ""}${location.search}${location.hash}`;
  return <Navigate to={target} replace />;
}

export default function App() { return <ToastProvider><SessionProvider><Routes><Route path="/" element={<LandingPage />} /><Route path="/login" element={<AuthPage mode="login" />} /><Route path="/register" element={<AuthPage mode="register" />} /><Route path="/ideas" element={<IdeasPage />} /><Route path="/s/:token" element={<PublicProfile shared />} /><Route path="/s/:token/wishes/:wishId" element={<PublicProfile shared />} /><Route path="/app/*" element={<ProtectedApp />} /><Route path="/u/:username/*" element={<LegacyProfileRedirect />} /><Route path="/users/:username/*" element={<LegacyProfileRedirect />} /><Route path="/:username" element={<PublicProfile />} /><Route path="/:username/lists/:listId" element={<PublicProfile />} /><Route path="/:username/wishes/:wishId" element={<PublicProfile />} /><Route path="*" element={<NotFound />} /></Routes></SessionProvider></ToastProvider>; }
