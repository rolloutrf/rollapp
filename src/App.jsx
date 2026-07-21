import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Archive, ArrowLeft, ArrowRight, Bell, BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown,
  CircleUserRound, ExternalLink, Eye, Gift, Heart, Home, Image, Link2, ListPlus, LoaderCircle,
  LockKeyhole, LogOut, Menu, MoreHorizontal, PackageCheck, Pencil, Plus, Search, Settings, Share2,
  ShoppingBag, Sparkles, Star, Trash2, UserPlus, Users, WandSparkles, X,
} from "lucide-react";
import { api } from "./api.js";

const SessionContext = createContext(null);
const ToastContext = createContext(null);

const formatMoney = (value, currency = "RUB") => value == null ? "Цена не указана" : new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
const formatDate = (value, options = {}) => value ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", ...options }).format(new Date(value)) : "Без даты";
const initials = (name = "?") => name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const WISH_CURRENCIES = ["RUB", "USD", "EUR", "KZT", "BYN"];
const isProductUrl = (value) => { try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } };

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
            <article className="step-card step-card--blue"><span className="step-number">02</span><div className="step-visual step-visual--share"><div className="share-bubble"><Share2 size={22} /> rollapp · /u/alisa</div><div className="share-people"><span>МА</span><span>С</span><span>Л</span></div></div><h3>Поделитесь красиво</h3><p>Одна ссылка откроет друзьям ваши списки. Приватность настраивается отдельно.</p></article>
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
  const { user, refresh } = useSession();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  if (user) return <Navigate to="/app" replace />;

  const submit = async (event) => {
    event.preventDefault(); setLoading(true);
    try {
      await api.post(mode === "register" ? "/auth/register" : "/auth/login", form);
      await refresh(); navigate("/app"); toast(mode === "register" ? "Вишлист готов — добавьте первую мечту" : "С возвращением!");
    } catch (error) { toast(error.message, "error"); } finally { setLoading(false); }
  };
  const demo = async () => {
    setLoading(true); try { await api.post("/auth/demo", {}); await refresh(); navigate("/app"); toast("Вы вошли в демонстрационный профиль"); } catch (error) { toast(error.message, "error"); } finally { setLoading(false); }
  };

  return (
    <div className="auth-page"><div className="auth-art"><Logo /><div className="auth-art__copy"><span className="eyebrow eyebrow--light"><Heart size={15} fill="currentColor" /> Место для мечтаний</span><h1>{mode === "register" ? <>Пусть близкие<br />знают, <em>чем вас<br />порадовать.</em></> : <>Ваши желания<br /><em>ждут вас.</em></>}</h1><p>Красивый вишлист, приватные брони и ни одного случайного подарка.</p></div><div className="auth-polaroid"><img src="/art/gift.svg" alt="Подарки" /><span>Хороший сюрприз начинается здесь ✦</span></div></div><div className="auth-panel"><Link className="auth-back" to="/"><ArrowLeft size={17} /> На главную</Link><form className="auth-form" onSubmit={submit}><div><span className="eyebrow">{mode === "register" ? "Новый аккаунт" : "С возвращением"}</span><h2>{mode === "register" ? "Создать свой Rollapp" : "Войти в Rollapp"}</h2><p>{mode === "register" ? "Это бесплатно и займёт меньше минуты." : "Продолжите собирать и исполнять желания."}</p></div>{mode === "register" && <label><span>Как вас зовут</span><input required minLength={2} autoComplete="name" placeholder="Алиса Морозова" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>}<label><span>Email</span><input required type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label><span>Пароль</span><input required minLength={8} type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder="Минимум 8 символов" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label><Button type="submit" loading={loading} className="auth-submit">{mode === "register" ? "Создать вишлист" : "Войти"}</Button><div className="or"><span>или</span></div><Button type="button" variant="outline" onClick={demo} loading={loading}>Попробовать демо</Button><p className="auth-switch">{mode === "register" ? <>Уже есть аккаунт? <Link to="/login">Войти</Link></> : <>Впервые здесь? <Link to="/register">Создать аккаунт</Link></>}</p></form></div></div>
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
  const copyProfile = async () => { await navigator.clipboard.writeText(`${window.location.origin}/u/${user.username}`); toast("Ссылка на вишлист скопирована"); };
  return <div className="app-page dashboard"><PageTitle eyebrow={new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date())} title={`Привет, ${user.name.split(" ")[0]}!`} text="Что сегодня хочется добавить в жизнь?" action={<Button variant="outline" icon={Share2} onClick={copyProfile}>Поделиться</Button>} /><section className="dashboard-hero"><div><span>В вашем вишлисте</span><strong>{active.length}</strong><p>{active.length === 1 ? "активное желание" : "активных желаний"} в {data.lists.length} {data.lists.length === 1 ? "списке" : "списках"}</p><Button icon={Plus} onClick={onAdd}>Добавить мечту</Button></div><div className="dashboard-hero__collage">{active.slice(0, 3).map((wish, index) => <img key={wish.id} src={wish.imageUrl || `https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=500&q=80&sig=${index}`} alt="" />)}{active.length === 0 && <Gift size={80} />}</div></section><div className="dashboard-grid"><section className="panel panel--wide"><div className="panel__head"><div><h2>Последние желания</h2><span>Ваш список выглядит чудесно</span></div><Link to="/app/wishes">Все желания <ArrowRight size={16} /></Link></div>{active.length ? <div className="compact-wishes">{active.slice(0, 4).map((wish) => <Link to="/app/wishes" className="compact-wish" key={wish.id}><img src={wish.imageUrl || "/gift-placeholder.svg"} alt="" /><div><strong>{wish.title}</strong><span>{formatMoney(wish.price, wish.currency)}</span></div><Priority value={wish.priority} /></Link>)}</div> : <EmptyState title="Пока здесь тихо" text="Добавьте первую мечту — даже самую маленькую." action={<Button onClick={onAdd} icon={Plus}>Добавить</Button>} />}</section><section className="panel"><div className="panel__head"><div><h2>Скоро праздник</h2><span>Дни рождения друзей</span></div><CalendarDays size={19} /></div><div className="birthday-list">{data.birthdays.length ? data.birthdays.map((friend) => <Link to={`/u/${friend.username}`} key={friend.id}><Avatar user={friend} size="sm" /><div><strong>{friend.name}</strong><span>{formatDate(friend.birthday)}</span></div><ArrowRight size={16} /></Link>) : <p className="muted">Подпишитесь на друзей, чтобы видеть даты.</p>}</div><Link className="panel-link" to="/app/friends"><UserPlus size={16} /> Найти друзей</Link></section><section className="panel panel--wide dashboard-lists"><div className="panel__head"><div><h2>Ваши списки</h2><span>Разложите мечты по настроению</span></div><Link to="/app/wishes">Управлять <ArrowRight size={16} /></Link></div><div className="list-strip">{data.lists.map((list) => <article className={`mini-list mini-list--${list.color}`} key={list.id}><div><ListPlus size={18} /><span>{list.privacy === "private" ? <LockKeyhole size={13} /> : null}{list.wishCount} желаний</span></div><strong>{list.title}</strong><p>{list.description || "Ваш личный список"}</p></article>)}</div></section></div></div>;
}

function Priority({ value }) { return <span className="priority" title={`Важность: ${value} из 3`}>{[1, 2, 3].map((item) => <i key={item} className={item <= value ? "is-on" : ""} />)}</span>; }

function WishCard({ wish, owner = false, onChanged, profile, shareToken = "", variant = "" }) {
  const toast = useToast(); const [menu, setMenu] = useState(false); const [busy, setBusy] = useState(false);
  const reserve = async () => { setBusy(true); try { const result = await api.post(`/wishes/${wish.id}/reserve`, { shareToken: shareToken || wish.shareToken || "" }); toast(result.reserved ? "Подарок забронирован — владелец не узнает кем" : "Бронь снята"); onChanged?.(); } catch (error) { toast(error.message, "error"); } finally { setBusy(false); } };
  const remove = async () => { if (!window.confirm("Удалить это желание?")) return; try { await api.delete(`/wishes/${wish.id}`); toast("Желание удалено"); onChanged?.(); } catch (error) { toast(error.message, "error"); } };
  const fulfilled = async () => { try { await api.post(`/wishes/${wish.id}/fulfilled`, {}); toast(wish.status === "fulfilled" ? "Желание снова активно" : "Отмечено исполненным ✦"); onChanged?.(); } catch (error) { toast(error.message, "error"); } };
  const share = async () => { await navigator.clipboard.writeText(wish.url || `${window.location.origin}/u/${profile?.username || ""}`); toast("Ссылка скопирована"); };
  return <article className={`wish-card ${variant ? `wish-card--${variant}` : ""} ${wish.status === "fulfilled" ? "is-fulfilled" : ""}`}><div className="wish-card__image">{wish.imageUrl ? <img src={wish.imageUrl} alt="" /> : <span><Gift size={36} /></span>}<Priority value={wish.priority} />{wish.status === "fulfilled" && <div className="fulfilled-badge"><Check /> Исполнено</div>}</div><div className="wish-card__body"><div className="wish-card__top"><span>{formatMoney(wish.price, wish.currency)}</span><button type="button" aria-label={`Опции желания «${wish.title}»`} aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal /></button>{menu && <div className="card-menu"><button onClick={share}><Share2 /> Поделиться</button>{wish.url && <a href={wish.url} target="_blank" rel="noreferrer"><ExternalLink /> Открыть магазин</a>}{owner && <><button onClick={fulfilled}><PackageCheck /> {wish.status === "fulfilled" ? "Вернуть в активные" : "Желание исполнено"}</button><button className="danger" onClick={remove}><Trash2 /> Удалить</button></>}</div>}</div><h3>{wish.title}</h3><p>{wish.description || "Без дополнительного описания"}</p>{owner ? <div className="wish-card__owner-meta">{wish.privacy === "private" ? <span><LockKeyhole /> Только вам</span> : <span><Eye /> Виден друзьям</span>}{wish.reservationCount > 0 && <span><Gift /> Кто-то готовит подарок</span>}</div> : <Button variant={wish.reservedByMe ? "reserved" : "outline"} loading={busy} icon={wish.reservedByMe ? Check : Gift} onClick={reserve} disabled={wish.status !== "active"}>{wish.reservedByMe ? "Забронировано вами" : wish.reservationCount > 0 && !wish.allowMultiple ? "Уже забронировано" : "Забронировать"}</Button>}</div></article>;
}

function WishesPage({ onAdd, version }) {
  const { user } = useSession(); const toast = useToast(); const { data, loading, reload } = useAsync(() => api.get("/dashboard"), [version]); const [selected, setSelected] = useState("all"); const [listModal, setListModal] = useState(false);
  if (loading) return <LoadingScreen compact />;
  const wishes = selected === "all" ? data.wishes : data.wishes.filter((wish) => wish.listIds.includes(selected));
  const share = async () => { const url = selected === "all" ? `${window.location.origin}/u/${user.username}` : `${window.location.origin}/s/${data.lists.find((list) => list.id === selected)?.shareToken}`; await navigator.clipboard.writeText(url); toast("Ссылка на список скопирована"); };
  return <div className="app-page wishes-page"><PageTitle eyebrow="Личная коллекция" title="Мои желания" text={`${data.wishes.filter((wish) => wish.status === "active").length} активных · ${data.wishes.filter((wish) => wish.status === "fulfilled").length} исполнено`} action={<div className="page-actions"><Button variant="outline" icon={Share2} onClick={share}>Поделиться</Button><Button icon={Plus} onClick={onAdd}>Добавить</Button></div>} /><div className="list-tabs"><button className={selected === "all" ? "active" : ""} onClick={() => setSelected("all")}><Heart size={16} /> Все <span>{data.wishes.length}</span></button>{data.lists.map((list) => <button className={selected === list.id ? "active" : ""} key={list.id} onClick={() => setSelected(list.id)}>{list.privacy === "private" && <LockKeyhole size={14} />}{list.title} <span>{list.wishCount}</span></button>)}<button className="list-tabs__add" onClick={() => setListModal(true)}><Plus size={16} /> Новый список</button></div>{wishes.length ? <div className="wish-grid">{wishes.map((wish) => <WishCard key={wish.id} wish={wish} owner profile={user} onChanged={reload} />)}</div> : <EmptyState icon={Heart} title="В этом списке пока пусто" text="Добавьте то, что действительно порадует." action={<Button icon={Plus} onClick={onAdd}>Добавить желание</Button>} />}{listModal && <ListModal onClose={() => setListModal(false)} onSaved={() => { setListModal(false); reload(); }} />}</div>;
}

function Modal({ children, onClose, wide = false, className = "" }) { useEffect(() => { const close = (event) => event.key === "Escape" && onClose(); document.addEventListener("keydown", close); document.body.classList.add("modal-open"); return () => { document.removeEventListener("keydown", close); document.body.classList.remove("modal-open"); }; }, [onClose]); return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className={`modal ${wide ? "modal--wide" : ""} ${className}`} role="dialog" aria-modal="true" aria-label="Диалог Rollapp">{children}<button className="modal__close" aria-label="Закрыть диалог" onClick={onClose}><X /></button></div></div>; }

function ListModal({ onClose, onSaved }) {
  const toast = useToast(); const [loading, setLoading] = useState(false); const [form, setForm] = useState({ title: "", description: "", privacy: "public", occasionDate: "", color: "coral" });
  const submit = async (event) => { event.preventDefault(); setLoading(true); try { await api.post("/lists", { ...form, occasionDate: form.occasionDate || null }); toast("Новый список создан"); onSaved(); } catch (error) { toast(error.message, "error"); } finally { setLoading(false); } };
  return <Modal onClose={onClose} className="modal--list"><form className="modal-form" onSubmit={submit}><div className="modal-heading"><span className="modal-icon"><ListPlus /></span><div><span className="eyebrow">Новая глава</span><h2>Создать список</h2><p>Для отдельного события, настроения или большой мечты.</p></div></div><label><span>Название</span><input autoFocus required placeholder="Например, Новоселье" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label><span>Описание</span><textarea rows={3} placeholder="Расскажите друзьям о списке" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><div className="form-row"><label><span>Дата события</span><input type="date" value={form.occasionDate} onChange={(event) => setForm({ ...form, occasionDate: event.target.value })} /></label><label><span>Кто увидит</span><select value={form.privacy} onChange={(event) => setForm({ ...form, privacy: event.target.value })}><option value="public">Все</option><option value="followers">Подписчики</option><option value="link">Только по ссылке</option><option value="private">Только я</option></select></label></div><fieldset className="color-picker"><legend>Цвет обложки</legend>{["coral", "blue", "lime", "sun", "ink"].map((color) => <button type="button" aria-label={`Цвет ${color}`} aria-pressed={form.color === color} className={`${color} ${form.color === color ? "active" : ""}`} onClick={() => setForm({ ...form, color })} key={color}>{form.color === color && <Check />}</button>)}</fieldset><div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Отмена</Button><Button type="submit" loading={loading}>Создать список</Button></div></form></Modal>;
}

function WishModal({ onClose, onSaved }) {
  const toast = useToast(); const { data, loading: listsLoading } = useAsync(() => api.get("/dashboard"), []); const [step, setStep] = useState("link"); const [loading, setLoading] = useState(false); const [metadata, setMetadata] = useState({ status: "idle", message: "" }); const [form, setForm] = useState({ title: "", description: "", url: "", imageUrl: "", price: "", currency: "RUB", priority: 2, privacy: "inherit", allowMultiple: false, listIds: [] });
  const autoTimerRef = useRef(null); const metadataRequestRef = useRef(0); const editedMetadataFieldsRef = useRef(new Set());
  useEffect(() => { if (data?.lists?.[0] && form.listIds.length === 0) setForm((current) => ({ ...current, listIds: [data.lists[0].id] })); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
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
    window.clearTimeout(autoTimerRef.current);
    metadataRequestRef.current += 1;
    const url = form.url.trim();
    if (!url || !isProductUrl(url)) { setMetadata({ status: "idle", message: "" }); return undefined; }
    setMetadata({ status: "waiting", message: "Ссылка принята — через мгновение заполним карточку." });
    autoTimerRef.current = window.setTimeout(() => { recognize(url); }, 600);
    return () => window.clearTimeout(autoTimerRef.current);
  }, [form.url]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { window.clearTimeout(autoTimerRef.current); metadataRequestRef.current += 1; }, []);
  const updateMetadataField = (field, value) => { editedMetadataFieldsRef.current.add(field); setForm((current) => ({ ...current, [field]: value })); };
  const continueFromLink = () => { if (!form.url.trim()) { setStep("details"); return; } if (metadata.status === "success") { setStep("details"); return; } recognize(); };
  const fillManually = () => { window.clearTimeout(autoTimerRef.current); metadataRequestRef.current += 1; setMetadata((current) => current.status === "error" ? current : { status: "idle", message: "" }); setStep("details"); };
  const submit = async (event) => { event.preventDefault(); setLoading(true); try { await api.post("/wishes", { ...form, price: form.price === "" ? null : Number(form.price) }); toast("Желание добавлено ✦"); onSaved(); } catch (error) { toast(error.message, "error"); } finally { setLoading(false); } };
  const toggleList = (id) => setForm((current) => ({ ...current, listIds: current.listIds.includes(id) ? current.listIds.filter((item) => item !== id) : [...current.listIds, id] }));
  const metadataNotice = metadata.status !== "idle" && <div className={`metadata-status metadata-status--${metadata.status}`} role="status" aria-live="polite"><span className="metadata-status__icon">{["waiting", "loading"].includes(metadata.status) ? <LoaderCircle className="spin" /> : metadata.status === "success" ? <CheckCircle2 /> : <X />}</span><div><strong>{metadata.status === "waiting" ? "Готовим автозаполнение" : metadata.status === "loading" ? "Читаем карточку товара" : metadata.status === "success" ? "Готово" : "Не получилось автоматически"}</strong><span>{metadata.message}</span></div>{step === "details" && metadata.status === "error" && form.url && <button type="button" onClick={() => recognize(form.url, { advance: false })}>Повторить</button>}</div>;
  return <Modal onClose={onClose} wide><form className="modal-form wish-form" onSubmit={submit}><div className="modal-heading"><span className="modal-icon"><Heart fill="currentColor" /></span><div><span className="eyebrow">Новое желание</span><h2>{step === "link" ? "Добавим мечту" : "Проверьте карточку"}</h2><p>{step === "link" ? "Вставьте ссылку — название, фото и цену подставим сами." : "Чем точнее детали, тем проще друзьям."}</p></div></div>{step === "link" ? <div className="link-step"><label className="link-input"><Link2 /><input autoFocus type="url" inputMode="url" placeholder="https://магазин.ru/то-самое" value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value.trim() }))} /></label>{metadataNotice}<Button type="button" onClick={continueFromLink} loading={metadata.status === "loading"}>{metadata.status === "error" ? "Попробовать снова" : "Продолжить"}</Button><button type="button" className="manual-link" onClick={fillManually}>У меня нет ссылки — заполнить вручную</button><div className="recognition-note"><WandSparkles /><div><strong>Автоматическое заполнение</strong><span>Начнём разбор через мгновение после вставки ссылки.</span></div></div></div> : <>{metadataNotice}<div className="wish-form__grid"><div className="image-preview"><div>{form.imageUrl ? <img src={form.imageUrl} alt="Предпросмотр" /> : <><Image size={35} /><span>Фото желания</span></>}</div><label><Image size={16} /> Ссылка на фото<input type="url" value={form.imageUrl} onChange={(event) => updateMetadataField("imageUrl", event.target.value)} /></label></div><div className="wish-fields"><label><span>Название</span><input autoFocus required value={form.title} placeholder="Что вы хотите?" onChange={(event) => updateMetadataField("title", event.target.value)} /></label><label><span>Комментарий для друзей</span><textarea rows={3} value={form.description} placeholder="Размер, цвет, важные детали…" onChange={(event) => updateMetadataField("description", event.target.value)} /></label><div className="form-row form-row--price"><label><span>Цена</span><input type="number" min="0" value={form.price} placeholder="0" onChange={(event) => updateMetadataField("price", event.target.value)} /></label><label><span>Валюта</span><select value={form.currency} onChange={(event) => updateMetadataField("currency", event.target.value)}>{WISH_CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select></label><label><span>Важность</span><div className="priority-picker">{[1, 2, 3].map((item) => <button type="button" aria-label={`Важность ${item} из 3`} aria-pressed={form.priority === item} className={item <= form.priority ? "active" : ""} onClick={() => setForm({ ...form, priority: item })} key={item}><Star fill="currentColor" /></button>)}</div></label></div></div></div><fieldset className="list-choice"><legend>Добавить в списки</legend>{listsLoading ? <LoadingScreen compact /> : data.lists.map((list) => <label key={list.id}><input type="checkbox" checked={form.listIds.includes(list.id)} onChange={() => toggleList(list.id)} /><span className={`list-dot list-dot--${list.color}`} /><span>{list.title}</span><small>{list.wishCount} желаний</small><Check /></label>)}</fieldset><div className="wish-settings"><label><input type="checkbox" checked={form.privacy === "private"} onChange={(event) => setForm({ ...form, privacy: event.target.checked ? "private" : "inherit" })} /><span><LockKeyhole /> Секретное желание<small>Видно только вам</small></span></label><label><input type="checkbox" checked={form.allowMultiple} onChange={(event) => setForm({ ...form, allowMultiple: event.target.checked })} /><span><Gift /> Можно подарить несколько<small>Например, сертификаты</small></span></label></div><div className="modal-actions"><Button type="button" variant="ghost" onClick={() => setStep("link")} icon={ArrowLeft}>Назад</Button><Button type="submit" loading={loading} icon={Heart}>Добавить желание</Button></div></>}</form></Modal>;
}

function IdeasPage({ appMode = false }) {
  const { user } = useSession(); const toast = useToast(); const [search, setSearch] = useState(""); const [category, setCategory] = useState(""); const [selectedIdea, setSelectedIdea] = useState(null); const { data, loading } = useAsync(() => api.get(`/ideas?category=${encodeURIComponent(category)}&search=${encodeURIComponent(search)}`), [category, search]);
      const content = <><div className="ideas-hero"><span className="eyebrow"><WandSparkles size={15} /> Отобрано с любопытством</span><h1>Идеи, от которых<br /><em>что-то ёкает</em></h1><p>Не безликий каталог товаров, а поводы заметить: «Да, вот этого мне и хотелось».</p><label className="ideas-search"><Search /><input placeholder="Керамика, музыка, впечатления…" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></label></div>{loading ? <LoadingScreen compact /> : <><div className="category-row"><button className={!category ? "active" : ""} onClick={() => setCategory("")}>Всё <span>{data.categories.reduce((sum, item) => sum + item.count, 0)}</span></button>{data.categories.map((item) => <button className={category === item.name ? "active" : ""} onClick={() => setCategory(item.name)} key={item.name}>{item.name} <span>{item.count}</span></button>)}</div><div className="ideas-grid">{data.ideas.map((idea, index) => <article className={`idea-card idea-card--${index % 5}`} key={idea.id}><div className="idea-card__image"><img src={idea.imageUrl} alt="" /><span>{idea.badge}</span><button aria-label={`Сохранить идею «${idea.title}»`} onClick={() => user ? setSelectedIdea(idea) : toast("Войдите, чтобы сохранить идею", "error")}><Heart /></button></div><div className="idea-card__copy"><small>{idea.category}</small><h3>{idea.title}</h3><p>{idea.description}</p><strong>{formatMoney(idea.price, idea.currency)}</strong></div></article>)}</div></>}{selectedIdea && <SaveIdeaModal idea={selectedIdea} onClose={() => setSelectedIdea(null)} />}</>;
  if (appMode) return <div className="app-page ideas-page">{content}</div>;
  return <div className="public-ideas"><LandingHeader /><main>{content}</main><footer className="landing-footer"><Logo /><p>Списки желаний, которые приятно исполнять.</p><span>© 2026 Rollapp</span></footer></div>;
}

function SaveIdeaModal({ idea, onClose }) { const toast = useToast(); const { data, loading } = useAsync(() => api.get("/dashboard"), []); const [listId, setListId] = useState(""); const [busy, setBusy] = useState(false); useEffect(() => { if (data?.lists?.[0]) setListId(data.lists[0].id); }, [data]); const save = async () => { setBusy(true); try { await api.post(`/ideas/${idea.id}/save`, { listId }); toast("Идея сохранена в ваш список"); onClose(); } catch (error) { toast(error.message, "error"); } finally { setBusy(false); } }; return <Modal onClose={onClose}><div className="save-idea"><img src={idea.imageUrl} alt="" /><span className="eyebrow">Сохранить идею</span><h2>{idea.title}</h2><p>{idea.description}</p>{loading ? <LoadingScreen compact /> : <label><span>Выберите список</span><select value={listId} onChange={(event) => setListId(event.target.value)}>{data.lists.map((list) => <option value={list.id} key={list.id}>{list.title}</option>)}</select></label>}<div className="modal-actions"><Button variant="ghost" onClick={onClose}>Отмена</Button><Button icon={Heart} onClick={save} loading={busy}>Сохранить</Button></div></div></Modal>; }

function FriendsPage() { const [search, setSearch] = useState(""); const { data, loading, reload } = useAsync(() => api.get(`/people?search=${encodeURIComponent(search)}`), [search]); const toast = useToast(); const follow = async (person) => { try { const result = await api.post(`/profile/${person.username}/follow`, {}); toast(result.following ? `Вы подписались на ${person.name}` : "Подписка отменена"); reload(); } catch (error) { toast(error.message, "error"); } }; return <div className="app-page friends-page"><PageTitle eyebrow="Люди рядом" title="Друзья и их мечты" text="Подпишитесь, чтобы не пропускать важные даты и новые желания." /><label className="app-search"><Search /><input placeholder="Имя или @профиль" value={search} onChange={(event) => setSearch(event.target.value)} /></label>{loading ? <LoadingScreen compact /> : <div className="people-grid">{data.people.map((person) => <article className="person-card" key={person.id}><Link to={`/u/${person.username}`}><Avatar user={person} size="lg" /><span className="person-card__count"><Heart size={14} fill="currentColor" /> {person.wishCount}</span><h3>{person.name}</h3><small>@{person.username}</small><p>{person.bio || "Пока без описания"}</p></Link><Button variant={person.isFollowing ? "soft" : "outline"} icon={person.isFollowing ? Check : UserPlus} onClick={() => follow(person)}>{person.isFollowing ? "Вы подписаны" : "Подписаться"}</Button></article>)}</div>}</div>; }

function GiftsPage() { const { data, loading } = useAsync(() => api.get("/dashboard"), []); if (loading) return <LoadingScreen compact />; return <div className="app-page gifts-page"><PageTitle eyebrow="Секретный план" title="Хочу подарить" text="Здесь видны ваши брони. Владельцы желаний — ничего не узнают." />{data.reservations.length ? <div className="reservation-list">{data.reservations.map((item) => <article key={item.id}><img src={item.image_url || "/gift-placeholder.svg"} alt="" /><div><small>Подарок для <Link to={`/u/${item.owner_username}`}>{item.owner_name}</Link></small><h3>{item.title}</h3><span>{formatMoney(item.price, item.currency)}</span></div><Link className="button button--outline" to={`/u/${item.owner_username}`}><span>Открыть список</span><ArrowRight size={17} /></Link></article>)}</div> : <EmptyState icon={Gift} title="Вы пока ничего не забронировали" text="Загляните в вишлисты друзей и выберите подарок." action={<Link className="button button--primary" to="/app/friends"><span>Найти друзей</span></Link>} />}</div>; }

function NotificationsPage() { const { refresh } = useSession(); const { data, loading } = useAsync(() => api.get("/notifications"), []); useEffect(() => { api.post("/notifications/read", {}).then(() => refresh()); }, [refresh]); if (loading) return <LoadingScreen compact />; const icons = { reservation: Gift, follow: UserPlus, welcome: Sparkles }; return <div className="app-page notifications-page"><PageTitle eyebrow="В курсе важного" title="Уведомления" text="Сюрпризы останутся скрыты, а важные события — нет." />{data.notifications.length ? <div className="notification-list">{data.notifications.map((item) => { const Icon = icons[item.type] || Bell; return <Link to={item.href || "#"} key={item.id} className={!item.readAt ? "is-unread" : ""}><span><Icon /></span><div><strong>{item.title}</strong><p>{item.body}</p><small>{formatDate(item.createdAt, { hour: "2-digit", minute: "2-digit" })}</small></div><ArrowRight /></Link>; })}</div> : <EmptyState icon={Bell} title="Пока тихо" text="Здесь появятся новые подписки и важные события." />}</div>; }

function SettingsPage() { const { user, refresh } = useSession(); const toast = useToast(); const [form, setForm] = useState({ name: user.name, username: user.username, bio: user.bio || "", birthday: user.birthday ? String(user.birthday).slice(0, 10) : "", avatarUrl: user.avatarUrl || "" }); const [loading, setLoading] = useState(false); const submit = async (event) => { event.preventDefault(); setLoading(true); try { await api.patch("/me", { ...form, birthday: form.birthday || null }); await refresh(); toast("Профиль обновлён"); } catch (error) { toast(error.message, "error"); } finally { setLoading(false); } }; return <div className="app-page settings-page"><PageTitle eyebrow="Личное пространство" title="Настройки профиля" text="Эту информацию увидят друзья рядом с вашим вишлистом." /><form className="settings-form panel" onSubmit={submit}><div className="avatar-editor"><Avatar user={{ ...user, avatarUrl: form.avatarUrl }} size="xl" /><div><strong>Фото профиля</strong><span>Укажите публичную ссылку на изображение</span></div></div><label><span>Ссылка на фото</span><input type="url" value={form.avatarUrl} placeholder="https://…" onChange={(event) => setForm({ ...form, avatarUrl: event.target.value })} /></label><div className="form-row"><label><span>Имя</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label><span>Адрес профиля</span><div className="input-prefix"><span>{window.location.host}/u/</span><input required pattern="[a-z0-9-]{3,32}" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase() })} /></div></label></div><label><span>О себе</span><textarea rows={4} maxLength={300} value={form.bio} placeholder="Что вам нравится?" onChange={(event) => setForm({ ...form, bio: event.target.value })} /></label><label className="short-field"><span>День рождения</span><input type="date" value={form.birthday} onChange={(event) => setForm({ ...form, birthday: event.target.value })} /></label><div className="settings-save"><Button type="submit" loading={loading}>Сохранить изменения</Button></div></form></div>; }

function PublicProfile({ shared = false }) {
  const params = useParams();
  const { user } = useSession();
  const toast = useToast();
  const endpoint = shared ? "/shared/" + params.token : "/profile/" + params.username;
  const { data, loading, error, reload } = useAsync(() => api.get(endpoint), [endpoint]);
  const [selected, setSelected] = useState("all");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileCompact, setProfileCompact] = useState(false);

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
    const updateHeader = () => setProfileCompact(window.scrollY > 220);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, []);

  if (loading) return <div className="public-profile public-profile--dark public-profile--state"><LoadingScreen /></div>;
  if (error) return <div className="public-profile public-profile--dark public-profile--state"><div className="not-found"><Logo /><Gift /><h1>Такой список не нашёлся</h1><p>{error.message}</p><Link className="button button--primary" to="/"><span>На главную</span></Link></div></div>;

  const lists = shared ? [data.list] : data.lists;
  const selectedList = selected === "all" ? null : lists.find((list) => list.id === selected);
  const wishes = shared ? data.wishes : selected === "all" ? data.wishes : data.wishes.filter((wish) => wish.listIds.includes(selected));
  const sectionTitle = shared ? data.list.title : selectedList?.title || "Все желания";
  const appTarget = user ? "/app" : "/register";
  const friendsTarget = user ? "/app/friends" : "/login";

  const follow = async () => {
    if (!user) return window.location.assign("/login");
    try {
      const result = await api.post("/profile/" + data.profile.username + "/follow", {});
      toast(result.following ? "Вы подписались" : "Подписка отменена");
      reload();
    } catch (followError) {
      toast(followError.message, "error");
    }
  };

  const share = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast("Ссылка скопирована");
  };

  return (
    <div className="public-profile public-profile--dark">
      <header className={`profile-header ${profileCompact ? "is-compact" : ""}`}>
        <Logo />
        <div className="profile-header__compact" aria-hidden={!profileCompact}>
          <Avatar user={data.profile} size="sm" />
          <div><strong>{data.profile.name}</strong><span>@{data.profile.username}</span></div>
        </div>
        <nav className="profile-header__dock" aria-label="Основная навигация">
          <Link to="/" aria-label="Главная" title="Главная"><Home /></Link>
          <Link to="/ideas" aria-label="Идеи подарков" title="Идеи подарков"><Sparkles /></Link>
          <Link to={appTarget} aria-label="Мои желания" title="Мои желания"><Heart /></Link>
          <Link to={friendsTarget} aria-label="Друзья" title="Друзья"><Users /></Link>
        </nav>
        <div className="profile-header__actions">
          {user ? <Link className="button button--soft" to="/app"><span>Мой вишлист</span></Link> : <><Link className="text-link" to="/login">Войти</Link><Link className="button button--primary" to="/register"><span>Создать свой</span></Link></>}
        </div>
        {!data.isOwner && !shared && <button className="profile-header__compact-follow" type="button" onClick={follow}>{data.isFollowing ? "Вы подписаны" : "Подписаться"}</button>}
        <button className="profile-mobile-menu" type="button" aria-label={mobileMenuOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={mobileMenuOpen} aria-controls="profile-mobile-navigation" onClick={() => setMobileMenuOpen((value) => !value)}>{mobileMenuOpen ? <X /> : <Menu />}</button>
        <button className={`profile-mobile-overlay ${mobileMenuOpen ? "is-open" : ""}`} type="button" aria-label="Закрыть меню" onClick={() => setMobileMenuOpen(false)} />
        <nav id="profile-mobile-navigation" className={`profile-mobile-panel ${mobileMenuOpen ? "is-open" : ""}`} aria-label="Меню профиля">
          <Link to="/" onClick={() => setMobileMenuOpen(false)}><Home /> Главная</Link>
          <Link to="/ideas" onClick={() => setMobileMenuOpen(false)}><Sparkles /> Идеи подарков</Link>
          <Link to={appTarget} onClick={() => setMobileMenuOpen(false)}><Heart /> Мои желания</Link>
          <Link to={friendsTarget} onClick={() => setMobileMenuOpen(false)}><Users /> Друзья</Link>
          {user ? <Link className="button button--primary" to="/app" onClick={() => setMobileMenuOpen(false)}><span>Открыть Rollapp</span></Link> : <><Link className="button button--primary" to="/register" onClick={() => setMobileMenuOpen(false)}><span>Создать свой список</span></Link><Link className="profile-mobile-login" to="/login" onClick={() => setMobileMenuOpen(false)}>Войти</Link></>}
        </nav>
      </header>

      <div className="public-profile__layout">
        <aside className="profile-rail">
          <div className="profile-rail__intro">
            <span className="eyebrow">Rollapp</span>
            <p>Списки желаний, которые приятно исполнять.</p>
            <Link className="button button--primary" to={appTarget}><Heart />{user ? "Открыть мой список" : "Создать вишлист"}</Link>
          </div>
          <nav aria-label="Разделы Rollapp">
            <Link to="/ideas"><Sparkles /> Идеи подарков</Link>
            <Link to={friendsTarget}><Users /> Найти друзей</Link>
            <Link to={appTarget}><Gift /> Мои желания</Link>
          </nav>
          <div className="profile-rail__note"><LockKeyhole /><p>Брони остаются тайными: владелец списка не узнает, кто готовит подарок.</p></div>
          <small>© 2026 Rollapp</small>
        </aside>

        <main>
          <Link className="public-profile__back" to={user ? "/app/friends" : "/"}><ArrowLeft /> Назад</Link>

          <section className="profile-cover">
            <div className="profile-cover__pattern" />
            <Avatar user={data.profile} size="xl" />
            <div className="profile-cover__copy">
              <span className="profile-handle">@{data.profile.username}</span>
              <h1>{data.profile.name}</h1>
              <p>{data.profile.bio || "Здесь живут желания, которым пора сбыться."}</p>
            </div>
            {!data.isOwner && !shared && <div className="profile-cover__actions"><Button icon={data.isFollowing ? Check : UserPlus} variant={data.isFollowing ? "soft" : "primary"} onClick={follow}>{data.isFollowing ? "Вы подписаны" : "Подписаться"}</Button></div>}
            <div className="profile-stats">
              {data.profile.birthday && <span><CalendarDays /> {formatDate(data.profile.birthday)}</span>}
              {!shared && <><span><Users /> {data.followersCount} подписчиков</span><span><Heart /> {data.wishes.length} желаний</span></>}
              {shared && <span><Heart /> {data.wishes.length} желаний</span>}
            </div>
          </section>

          {!shared && <div className="public-list-tabs" aria-label="Списки желаний">
            <button className={selected === "all" ? "active" : ""} aria-pressed={selected === "all"} onClick={() => setSelected("all")}><strong>Все желания</strong><span>{data.wishes.length}</span></button>
            {lists.map((list) => <button className={selected === list.id ? "active" : ""} aria-pressed={selected === list.id} onClick={() => setSelected(list.id)} key={list.id}><strong>{list.title}</strong><span>{list.wishCount}</span></button>)}
          </div>}

          {shared && <div className={"shared-list-head shared-list-head--" + data.list.color}><ListPlus /><div><span>Отдельный список</span><h2>{data.list.title}</h2><p>{data.list.description}</p></div></div>}

          <div className="public-wishes-head">
            <h2>{sectionTitle} <span>{wishes.length}</span></h2>
            <Button variant="soft" icon={Share2} onClick={share}>Поделиться</Button>
          </div>

          {wishes.length ? <div className="wish-grid">{wishes.map((wish) => <WishCard key={wish.id} variant="public" wish={wish} owner={data.isOwner} profile={data.profile} onChanged={reload} />)}</div> : <EmptyState icon={Heart} title="В этом списке пока пусто" text="Загляните чуть позже — новая мечта наверняка появится." />}
        </main>
      </div>

      <footer><Logo /><span>Создано с мечтами в Rollapp</span><Link to="/register">Собрать свой список <ArrowRight size={16} /></Link></footer>
    </div>
  );
}

function NotFound() { return <div className="not-found"><Logo /><Gift /><h1>Похоже, эта мечта потерялась</h1><p>Страница не существует или ссылка устарела.</p><Link className="button button--primary" to="/"><span>Вернуться на главную</span></Link></div>; }

export default function App() { return <ToastProvider><SessionProvider><Routes><Route path="/" element={<LandingPage />} /><Route path="/login" element={<AuthPage mode="login" />} /><Route path="/register" element={<AuthPage mode="register" />} /><Route path="/ideas" element={<IdeasPage />} /><Route path="/u/:username" element={<PublicProfile />} /><Route path="/s/:token" element={<PublicProfile shared />} /><Route path="/app/*" element={<ProtectedApp />} /><Route path="*" element={<NotFound />} /></Routes></SessionProvider></ToastProvider>; }
