import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Archive, CalendarDays, Car, Check, CheckCircle2, ChevronDown,
  CircleUserRound, Clapperboard, ExternalLink, Eye, EyeOff, Gift, GripVertical, Hand, Heart, Image, Link2, ListPlus,
  LoaderCircle, LockKeyhole, LogOut, Mail, MapPin, MoreHorizontal, PackageCheck, Pencil, Phone, Plus,
  PawPrint, RotateCcw, Search, Send, Share2, ShoppingBag, Sparkles, Star, Trash2, Upload, UserPlus,
  Ungroup, Users, UtensilsCrossed, X,
} from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { api } from "./api.js";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar as ShadcnAvatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button as ShadcnButton, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { safeNextPath, yandexAuthErrorDetails, yandexAuthStartPath } from "./lib/auth.js";
import { disbandWishGroupFromDashboard, filterWishGroups } from "./lib/wish-groups.js";
import { moveWishToTargetPosition, moveWishWithinSubset } from "./lib/wish-order.js";
import {
  isKinopoiskHost,
  isKinopoiskUrl,
  kinopoiskContentUrlError,
  wishPreviewImageUrl,
} from "../shared/kinopoisk.js";
import { retailerPreviewImageUrl } from "../shared/retailer-previews.js";
import { initializeTelegramWebApp } from "./telegram.js";

const SessionContext = createContext(null);
const ToastContext = createContext(null);
const ProfileEditorContext = createContext(null);
const previewBackfillRequests = new Map();
const APP_HOME = "/app/wishes";
const GROUP_INTENT_DELAY_MS = 250;

function requestPreviewBackfill(userId) {
  if (!userId) return null;
  if (!previewBackfillRequests.has(userId)) {
    const request = { refreshClaimed: false, promise: null };
    request.promise = api.post("/wishes/backfill-previews", {}).catch((error) => {
      if (previewBackfillRequests.get(userId) === request) previewBackfillRequests.delete(userId);
      throw error;
    });
    previewBackfillRequests.set(userId, request);
  }
  return previewBackfillRequests.get(userId);
}

function applyRetailerPreviewFallback(event, url) {
  const fallback = retailerPreviewImageUrl(url);
  const image = event.currentTarget;
  if (!fallback || image.getAttribute("src") === fallback) return;
  image.src = fallback;
}

const ACTIVE_SCROLL_LOCK_SURFACE_SELECTOR = [
  '[aria-modal="true"]:not([data-closed])',
  '[data-slot="dropdown-menu-content"][data-open]',
  '[data-slot="dropdown-menu-sub-content"][data-open]',
  '[data-slot="select-content"][data-open]',
  '.modal-backdrop',
].join(",");

const clearStaleDocumentScrollLock = () => {
  if (typeof document === "undefined" || document.querySelector(ACTIVE_SCROLL_LOCK_SURFACE_SELECTOR)) return;
  const root = document.documentElement;
  const body = document.body;
  // Base UI has no lock marker on macOS overlay scrollbars, so repair only
  // its known inline styles after every visible locking surface is gone.
  const hasStaleBaseUiInsetLock = root.hasAttribute("data-base-ui-scroll-locked") || (
    body.style.position === "relative"
    && body.style.height.includes("100dvh")
    && body.style.width.includes("100vw")
  );
  [root, body].forEach((element) => {
    ["overflow", "overflow-x", "overflow-y"].forEach((property) => {
      if (/^(hidden|clip)$/.test(element.style.getPropertyValue(property))) {
        element.style.removeProperty(property);
      }
    });
  });
  if (hasStaleBaseUiInsetLock) {
    root.removeAttribute("data-base-ui-scroll-locked");
    ["scrollbar-gutter", "scroll-behavior", "overflow", "overflow-x", "overflow-y"].forEach((property) => root.style.removeProperty(property));
    ["position", "height", "width", "box-sizing", "scroll-behavior", "overflow", "overflow-x", "overflow-y"].forEach((property) => body.style.removeProperty(property));
  }
};

const scheduleDocumentScrollUnlock = () => {
  if (typeof window === "undefined") return undefined;
  let settleFrame = 0;
  const releaseFrame = window.requestAnimationFrame(() => {
    settleFrame = window.requestAnimationFrame(clearStaleDocumentScrollLock);
  });
  return () => {
    window.cancelAnimationFrame(releaseFrame);
    window.cancelAnimationFrame(settleFrame);
  };
};

const formatMoney = (value, currency = "RUB") => value == null ? "" : new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
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
const YANDEX_MAPS_HOSTS = ["yandex.ru", "yandex.com", "yandex.kz", "yandex.by", "yandex.ua", "ya.ru"];
const isYandexMapsUrl = (value) => {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase().replace(/^(www\.|maps\.)/, "");
    if (!YANDEX_MAPS_HOSTS.includes(host)) return false;
    return parsed.pathname.startsWith("/maps");
  } catch { return false; }
};
const YOUTUBE_HOSTS = ["youtube.com", "youtu.be", "youtube-nocookie.com"];
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const isYouTubeUrl = (value) => {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, "");
    if (!YOUTUBE_HOSTS.includes(host)) return false;
    if (host === "youtu.be") {
      const id = parsed.pathname.split("/")[1] || "";
      return YOUTUBE_VIDEO_ID_PATTERN.test(id);
    }
    if (parsed.pathname === "/watch") {
      return YOUTUBE_VIDEO_ID_PATTERN.test(parsed.searchParams.get("v") || "");
    }
    return /^\/(shorts|embed|live|v)\/[A-Za-z0-9_-]{11}(?:[/?]|$)/.test(parsed.pathname);
  } catch { return false; }
};
const uploadedImageIdFromUrl = (value = "") => /^\/api\/media\/([0-9a-f-]{36})$/i.exec(value)?.[1] || "";
const wishFormFrom = (wish) => ({
  title: wish?.title || "",
  description: wish?.description || "",
  url: wish?.url || "",
  fundraisingUrl: wish?.fundraisingUrl || "",
  imageUrl: wish?.imageUrl || "",
  price: wish?.price == null ? "" : String(wish.price),
  currency: WISH_CURRENCIES.includes(wish?.currency) ? wish.currency : "RUB",
  priority: wish?.priority || 2,
  privacy: wish?.privacy || "inherit",
  allowMultiple: Boolean(wish?.allowMultiple),
  listIds: Array.isArray(wish?.listIds) ? [...wish.listIds] : [],
  eventDate: wish?.eventDate || "",
});
const formatEventDate = (value) => {
  const [year, month, day] = String(value || "").split("-");
  return year && month && day ? `${day}.${month}.${year}` : "";
};
const readPasswordResetToken = () => {
  if (typeof window === "undefined") return "";
  const fragment = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  return (new URLSearchParams(fragment).get("token") || "").trim();
};
const isGeneralList = (list) => list?.title === "Мои желания" && list?.description === "Всё, чему я буду рад";
const wishCountNoun = (count) => {
  const absolute = Math.abs(Number(count) || 0);
  const lastTwo = absolute % 100;
  const last = absolute % 10;
  if (last === 1 && lastTwo !== 11) return "желание";
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return "желания";
  return "желаний";
};
const attachWishesToDashboardList = (dashboard, listId, wishIds) => {
  const ids = new Set(wishIds);
  let addedActiveCount = 0;
  const wishes = dashboard.wishes.map((wish) => {
    if (!ids.has(wish.id) || wish.listIds?.includes(listId)) return wish;
    if (wish.status === "active") addedActiveCount += 1;
    return { ...wish, listIds: [...(wish.listIds || []), listId] };
  });
  if (!addedActiveCount && wishes.every((wish, index) => wish === dashboard.wishes[index])) return dashboard;
  const lists = addedActiveCount
    ? dashboard.lists.map((list) => list.id === listId
      ? { ...list, wishCount: Number(list.wishCount || 0) + addedActiveCount }
      : list)
    : dashboard.lists;
  return { ...dashboard, wishes, lists };
};
const listTileAccessibleName = (title, count, privateList = false) => `${title}, ${count} ${wishCountNoun(count)}${privateList ? ", приватный список" : ""}`;
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

const SPACES = [
  { id: "products", label: "Товары", icon: ShoppingBag },
  { id: "places", label: "Места", icon: MapPin },
  { id: "events", label: "События", icon: CalendarDays },
  { id: "media", label: "Медиа", icon: Clapperboard },
  { id: "food", label: "Еда", icon: UtensilsCrossed },
  { id: "transport", label: "Транспорт", icon: Car },
  { id: "pets", label: "Питомцы", icon: PawPrint },
];
const SPACE_IDS = SPACES.map((space) => space.id);
const listSpace = (list) => (SPACE_IDS.includes(list?.space) ? list.space : "products");
const wishBelongsToSpace = (wish, listsById, space) => {
  const categoryListIds = (wish?.listIds || []).filter((id) => {
    const list = listsById.get(id);
    return list && !isGeneralList(list);
  });
  if (SPACE_IDS.includes(wish?.space)) {
    return wish.space === space || categoryListIds.some((id) => listSpace(listsById.get(id)) === space);
  }
  if (categoryListIds.length === 0) return space === "products";
  return categoryListIds.some((id) => listSpace(listsById.get(id)) === space);
};
const wishSpaceId = (wish, lists = []) => {
  if (SPACE_IDS.includes(wish?.space)) return wish.space;
  const listsById = new Map(lists.map((list) => [list.id, list]));
  const spaceId = (wish?.listIds || [])
    .map((id) => listsById.get(id))
    .filter((list) => list && !isGeneralList(list))
    .map((list) => listSpace(list))
    .find((id) => SPACE_IDS.includes(id));
  return spaceId || "products";
};

const LIST_TILE_STYLE = {
  width: 130,
  minWidth: 130,
  height: 100,
  minHeight: 100,
  padding: 12,
  flex: "0 0 130px",
  borderRadius: 18,
  fontSize: 16,
  lineHeight: "19px",
};

function ListTileContent({ title, count, privateList = false }) {
  return <>
    <strong data-slot="list-tile-label" style={{ fontSize: 16, lineHeight: "19px" }}>{title}</strong>
    <div data-slot="list-tile-meta">
      {privateList && <LockKeyhole size={14} aria-hidden="true" />}
      <span data-slot="list-tile-count" style={{ fontSize: 24, lineHeight: "29px", fontWeight: 600 }}>{count}</span>
    </div>
  </>;
}

function SpaceSwitcher({ value, onChange, className = "" }) {
  const current = SPACES.find((space) => space.id === value) || SPACES[0];
  return (
    <Select value={current.id} onValueChange={(next) => { if (next && next !== current.id) onChange(next); }}>
      <SelectTrigger className={`space-select ${className}`.trim()} aria-label="Категория списков" title="Категория списков">
        <SelectValue>{(selected) => {
          const space = SPACES.find((item) => item.id === selected) || current;
          const Icon = space.icon;
          return <><Icon aria-hidden="true" /><span className="space-select__label">{space.label}</span></>;
        }}</SelectValue>
      </SelectTrigger>
      <SelectContent className="space-select__content" alignItemWithTrigger={false}>
        {SPACES.map((space) => {
          const Icon = space.icon;
          return (
            <SelectItem key={space.id} value={space.id}>
              <Icon aria-hidden="true" />
              <span>{space.label}</span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function useAsync(load, dependencies = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const requestIdRef = useRef(0);
  const updateData = useCallback((updater) => {
    setState((current) => {
      if (current.data == null) return current;
      const data = typeof updater === "function" ? updater(current.data) : updater;
      return data === current.data ? current : { ...current, data };
    });
  }, []);
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
  return { ...state, reload, updateData };
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
        mobileOffset={{ bottom: "calc(12px + env(safe-area-inset-bottom))", left: 12, right: 12 }}
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

function Avatar({ user, size = "md", className = "", ...props }) {
  const avatarUrl = user?.avatarUrl || user?.avatar_url || "";
  const shadcnSize = size === "sm" ? "sm" : ["lg", "xl"].includes(size) ? "lg" : "default";
  const appSizeClass = { sm: "!size-9", md: "!size-12", lg: "!size-[78px]", xl: "!size-[var(--avatar-xl-size)]" }[size] || "";
  return (
    <ShadcnAvatar size={shadcnSize} className={`avatar avatar--${size} ${appSizeClass} ${className}`} {...props}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
      <AvatarFallback className="avatar--fallback">{initials(user?.name)}</AvatarFallback>
    </ShadcnAvatar>
  );
}

function Button({ children, className = "", variant = "primary", icon: Icon, loading, ...props }) {
  const shadcnVariant = { primary: "default", soft: "secondary", paper: "secondary", reserved: "secondary" }[variant] || variant;
  return <ShadcnButton variant={shadcnVariant} className={className} {...props} disabled={loading || props.disabled} aria-busy={loading || props["aria-busy"] || undefined}>{loading ? <Spinner data-icon="inline-start" /> : Icon ? <Icon data-icon="inline-start" aria-hidden="true" /> : null}{children}</ShadcnButton>;
}

function YandexIdButton({ href, className = "", accessibleName = "Войти с помощью Яндекс ID" }) {
  return (
    <a className={`yandex-id-button ${className}`} href={href} aria-label={accessibleName}>
      <svg className="yandex-id-button__mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="12" fill="#fc3f1d" />
        <path fill="#fff" d="M15.24 16.2h-1.68V8.04h-1.2c-1.637 0-2.52.818-2.52 2.045 0 1.39.597 2.047 1.843 2.87l1.017.676-2.903 4.57H7.92l2.676-3.913C9.08 13.18 8.16 12.11 8.16 10.016c0-2.24 1.554-3.696 4.306-3.696h2.774v9.88Z" />
      </svg>
      <span>Войти с Яндекс ID</span>
    </a>
  );
}

function EmptyState({ icon: Icon = Sparkles, title, text, action }) {
  return <Empty className="empty-state"><EmptyHeader><EmptyMedia className="empty-state__icon" variant="icon"><Icon size={28} /></EmptyMedia><EmptyTitle><h3>{title}</h3></EmptyTitle><EmptyDescription><p>{text}</p></EmptyDescription></EmptyHeader>{action && <EmptyContent>{action}</EmptyContent>}</Empty>;
}

function LoadingScreen({ compact = false }) {
  return <div className={compact ? "inline-loader" : "page-loader"} role="status" aria-live="polite" aria-atomic="true" aria-busy="true"><Spinner className="gift-loader" aria-hidden="true" /><span>Собираем желания…</span></div>;
}

function RootRoute() {
  const { user, loading } = useSession();
  if (loading) return <LoadingScreen />;
  const telegramLaunch = initializeTelegramWebApp();
  if (telegramLaunch.initData) return <Navigate to={`/login?next=${encodeURIComponent(APP_HOME)}`} replace />;
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
      <Field data-invalid={Boolean(flow.error)}>
        <FieldLabel htmlFor={`${fieldId}-phone`}>Номер телефона</FieldLabel>
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
        {flow.error && <FieldError id={phoneErrorId} className="phone-otp__error">{flow.error}</FieldError>}
      </Field>
      <ShadcnButton type="submit" className="auth-submit" disabled={flow.loading} aria-busy={flow.loading || undefined}>{flow.loading && <Spinner data-icon="inline-start" />}{requestLabel}</ShadcnButton>
    </>;
  }
  return <>
    <div className="phone-otp__summary" id={codeHintId}>
      <span><Phone aria-hidden="true" /><span>Код отправлен на <strong>{flow.phoneMasked}</strong></span></span>
      <ShadcnButton variant="ghost" type="button" disabled={flow.loading} onClick={flow.changePhone}>Изменить</ShadcnButton>
    </div>
    <Field data-invalid={Boolean(flow.error)}>
      <FieldLabel htmlFor={`${fieldId}-code`}>Код из SMS</FieldLabel>
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
      {flow.error && <FieldError id={phoneErrorId} className="phone-otp__error">{flow.error}</FieldError>}
    </Field>
    <ShadcnButton type="submit" className="auth-submit" disabled={flow.loading} aria-busy={flow.loading || undefined}>{flow.loading && <Spinner data-icon="inline-start" />}{verifyLabel}</ShadcnButton>
    <ShadcnButton variant="link" className="phone-otp__resend" type="button" disabled={flow.loading || !readyToResend} onClick={flow.requestCode}>
      {readyToResend ? "Отправить код снова" : `Отправить снова через ${formatCountdown(flow.retrySeconds)}`}
    </ShadcnButton>
    <span className="visually-hidden" aria-live="polite">{readyToResend ? "Код можно отправить снова" : ""}</span>
  </>;
}

function AuthRecoveryForm({ eyebrow, title, description, busy = false, onSubmit, noValidate = false, children }) {
  return (
    <div className="auth-page">
      <div className="auth-panel">
        <form className="auth-form" aria-busy={busy || undefined} noValidate={noValidate} onSubmit={onSubmit}>
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
      <p className="auth-switch"><a href="/login">Вернуться ко входу</a></p>
    </AuthRecoveryForm>
  );
}

function ResetPasswordPage() {
  const { refresh } = useSession();
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
      await refresh();
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
        <a className={buttonVariants({ className: "auth-submit" })} href="/login">Перейти ко входу</a>
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
        <p className="auth-switch"><a href="/login">Вернуться ко входу</a></p>
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

function AuthPage({ mode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refresh } = useSession();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [phoneEnabled, setPhoneEnabled] = useState(false);
  const [phoneConfigLoaded, setPhoneConfigLoaded] = useState(mode !== "login");
  const [yandexEnabled, setYandexEnabled] = useState(false);
  const [authMethod, setAuthMethod] = useState("email");
  const [telegramAuth, setTelegramAuth] = useState(() => {
    const launch = initializeTelegramWebApp();
    return {
      initData: launch.initData,
      status: launch.initData ? "checking" : "absent",
      profile: null,
      error: "",
    };
  });
  const authId = useId();
  const methodTouchedRef = useRef(false);
  const authQuery = new URLSearchParams(location.search);
  const nextPath = safeNextPath(authQuery.get("next"));
  const yandexError = yandexAuthErrorDetails(authQuery.get("auth_error"));
  const yandexLinked = authQuery.get("auth_success") === "YANDEX_LINKED";
  const shouldLinkYandex = Boolean(yandexError?.linkRequired);
  const yandexStartHref = yandexAuthStartPath(nextPath);
  const yandexLinkHref = yandexAuthStartPath(nextPath, { link: true });

  const finishAuthentication = async (message) => {
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
    requestPath: "/auth/phone/request",
    verifyPath: "/auth/phone/verify",
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
    let active = true;
    api.get("/auth/yandex/config")
      .then((config) => { if (active) setYandexEnabled(Boolean(config.enabled)); })
      .catch(() => { if (active) setYandexEnabled(false); });
    return () => { active = false; };
  }, []);

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

  if (user && !telegramAuth.initData) {
    if (!yandexError && !yandexLinked) return <Navigate to={nextPath} replace />;
    return (
      <div className="auth-page">
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
            <Link className={buttonVariants({ variant: "outline", className: "h-12 w-full" })} to={nextPath}>Вернуться в Rollapp</Link>
          </div>
        </div>
      </div>
    );
  }

  const submitCredentials = async (event) => {
    event.preventDefault(); setLoading(true);
    try {
      await api.post(mode === "register" ? "/auth/register" : "/auth/login", form);
      await finishAuthentication(mode === "register" ? "Вишлист готов — добавьте первую мечту" : "С возвращением!");
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
  const usingPhone = mode === "login" && phoneEnabled && authMethod === "phone";
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
    : mode === "register"
      ? "Это бесплатно и займёт меньше минуты."
      : "Продолжите собирать и исполнять желания.";

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <form className="auth-form" aria-busy={telegramChecking || !phoneConfigLoaded || (usingPhone ? phoneFlow.loading : loading)} onSubmit={connectingCurrentUser ? confirmTelegramLink : usingPhone ? phoneFlow.submit : submitCredentials}>
          <div>
            <span className="eyebrow">{telegramChecking ? "Telegram" : connectingCurrentUser ? "Один шаг" : usingPhone && phoneFlow.step === "otp" ? "Подтверждение" : mode === "register" ? "Новый аккаунт" : "С возвращением"}</span>
            <h1>{telegramChecking ? "Открываем Rollapp" : connectingCurrentUser ? "Подключить Telegram" : mode === "register" ? "Создать свой Rollapp" : usingPhone && phoneFlow.step === "otp" ? "Введите код" : "Войти в Rollapp"}</h1>
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
                    <small>{connectingCurrentUser ? `Подтвердите привязку к @${user.username}.` : mode === "register" ? "Создайте аккаунт — мы сразу привяжем его к Telegram." : "Войдите один раз — дальше бот будет открывать профиль без пароля."}</small>
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
              {showYandexButton && <><YandexIdButton href={yandexStartHref} /><div className="or" aria-hidden="true"><span>или</span></div></>}
          {connectingCurrentUser
            ? telegramAuth.status === "unlinked"
              ? <>
                <ShadcnButton type="submit" className="auth-submit" disabled={loading}>{loading && <Spinner data-icon="inline-start" />}Привязать к @{user.username}</ShadcnButton>
                <ShadcnButton variant="link" className="auth-method-switch" type="button" disabled={loading} onClick={() => navigate(nextPath)}>Не сейчас</ShadcnButton>
              </>
              : <ShadcnButton variant="link" className="auth-method-switch" type="button" onClick={() => navigate(nextPath)}>Вернуться в Rollapp</ShadcnButton>
            : mode === "login" && !phoneConfigLoaded
            ? <div className="auth-config-loading" role="status"><LoaderCircle className="spin" /><span>Проверяем способы входа…</span></div>
            : usingPhone
            ? <PhoneOtpFields flow={phoneFlow} verifyLabel={shouldLinkYandex ? "Подтвердить и привязать Yandex ID" : undefined} />
            : <>
              <FieldGroup className="gap-4">
                {mode === "register" && <Field><FieldLabel htmlFor={`${authId}-name`}>Как вас зовут</FieldLabel><Input id={`${authId}-name`} required minLength={2} autoComplete="name" placeholder="Алиса Морозова" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>}
                <Field><FieldLabel htmlFor={`${authId}-email`}>Email</FieldLabel><Input id={`${authId}-email`} required type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(event) => { if (mode === "login") methodTouchedRef.current = true; setForm({ ...form, email: event.target.value }); }} /></Field>
                <Field><FieldLabel htmlFor={`${authId}-password`}>Пароль</FieldLabel><Input id={`${authId}-password`} required minLength={8} type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder="Минимум 8 символов" value={form.password} onChange={(event) => { if (mode === "login") methodTouchedRef.current = true; setForm({ ...form, password: event.target.value }); }} /></Field>
              </FieldGroup>
              {mode === "login" && <Link className="auth-password-link" to="/forgot-password">Забыли пароль?</Link>}
              <ShadcnButton type="submit" className="auth-submit" disabled={loading} aria-busy={loading || undefined}>{loading && <Spinner data-icon="inline-start" />}{mode === "register" ? "Создать вишлист" : shouldLinkYandex ? "Войти и привязать Yandex ID" : "Войти"}</ShadcnButton>
            </>}
          {!connectingCurrentUser && mode === "login" && phoneConfigLoaded && phoneEnabled && (
            <ShadcnButton variant="link" className="auth-method-switch" type="button" disabled={phoneFlow.loading || loading} onClick={switchAuthMethod}>
              {usingPhone ? <Mail aria-hidden="true" /> : <Phone aria-hidden="true" />}
              <span>{usingPhone ? "Войти по email и паролю" : "Войти по номеру телефона"}</span>
            </ShadcnButton>
          )}
          {!connectingCurrentUser && <p className="auth-switch">{mode === "register" ? <>Уже есть аккаунт? <Link to={`/login?next=${encodeURIComponent(nextPath)}`}>Войти</Link></> : <>Впервые здесь? <Link to={`/register?next=${encodeURIComponent(nextPath)}`}>Создать аккаунт</Link></>}</p>}
            </>}
        </form>
      </div>
    </div>
  );
}

function AppFriendsLink({ active = false }) {
  return (
    <Link
      to="/app/friends/subscriptions"
      aria-current={active ? "page" : undefined}
      className={buttonVariants({ variant: active ? "secondary" : "ghost", className: "app-friends-link app-main__friends h-12 gap-2 rounded-xl px-4 active:translate-y-0" })}
      aria-label="Открыть раздел Друзья"
    >
      <Users aria-hidden="true" />
      <span>Друзья</span>
    </Link>
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
    <header className="friends-topbar" aria-label="Панель приложения">
      <Logo className="app-shell-logo" />
      <div className="friends-topbar__account">
        <AppProfileButton user={user} compact />
      </div>
    </header>
  );
}

function AppShell({ children, friendsContext = false, collectionChrome = false }) {
  const { user } = useSession();
  const location = useLocation();
  const friendsRoute = friendsContext || location.pathname.startsWith("/app/friends");
  const wishesRoute = location.pathname.startsWith("/app/wishes");
  return (
    <div className={`app-layout app-layout--dark ${friendsRoute ? "app-layout--friends" : ""}`}>
      <main className={`app-main ${!friendsRoute || collectionChrome ? "app-main--with-profile" : ""} ${wishesRoute || collectionChrome ? "app-main--wishes" : ""}`}>
        {!wishesRoute && !collectionChrome && <header className="mobile-app-head">
          {friendsRoute ? <><Logo className="app-shell-logo" /><AppProfileButton user={user} compact /></> : <><AppProfileButton user={user} compact /><Logo className="app-shell-logo" /></>}
        </header>}
        {friendsRoute && !collectionChrome && <FriendsTopbar user={user} />}
        {!friendsRoute && !wishesRoute && !collectionChrome && <nav className="app-main__profile" aria-label="Основные разделы"><AppFriendsLink /><AppProfileButton user={user} /><Logo className="app-shell-logo" /></nav>}
        {children}
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
          <Users aria-hidden="true" />
          Подписки
        </Link>
        <Link
          to="/app/friends/followers"
          className="wishes-page__friend-link"
        >
          <CircleUserRound aria-hidden="true" />
          Подписчики
        </Link>
      </nav>
      <div className="page-actions wishes-page__hero-actions" role="group" aria-label="Действия со списком желаний">
        {selectedList && <Button className="h-12 px-5 text-base max-[560px]:flex-1" variant="outline" shape="pill" onClick={() => onEditList(selectedList)}>Настройки списка</Button>}
        <Button className="h-12 min-w-[180px] px-6 text-base max-[560px]:min-w-0" shape="pill" onClick={onAdd}>Добавить</Button>
      </div>
    </section>
  );
}

function ProtectedApp() {
  const location = useLocation();
  const { user, loading } = useSession(); const [wishModal, setWishModal] = useState(false); const [wishModalSpace, setWishModalSpace] = useState("products"); const [version, setVersion] = useState(0);
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(safeNextPath(`${location.pathname}${location.search}`))}`} replace />;
  return <AppShell><Routes><Route index element={<Navigate to={APP_HOME} replace />} /><Route path="wishes" element={<WishesPage onAdd={(space) => { setWishModalSpace(SPACE_IDS.includes(space) ? space : "products"); setWishModal(true); }} version={version} />} /><Route path="ideas" element={<Navigate to={APP_HOME} replace />} /><Route path="friends" element={<Navigate to="/app/friends/subscriptions" replace />} /><Route path="friends/:section" element={<FriendsPage />} /><Route path="gifts" element={<Navigate to={APP_HOME} replace />} /><Route path="notifications" element={<Navigate to={APP_HOME} replace />} /><Route path="settings" element={<Navigate to={APP_HOME} replace />} /><Route path="*" element={<Navigate to={APP_HOME} replace />} /></Routes>{wishModal && <WishModal space={wishModalSpace} onClose={() => setWishModal(false)} onSaved={() => { setWishModal(false); setVersion((v) => v + 1); }} />}</AppShell>;
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
      toast(wish.likedByMe ? "Желание уже в вашем общем списке" : "Понравилось — желание добавлено в ваш общий список");
      await refreshAfterMutation();
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
        fundraisingUrl: wish.fundraisingUrl || "",
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

function WishCard({ wish, owner = false, onChanged, onOpen, onEdit, onCreateList, onRemoveFromGroup, groupBusy = false, profile, lists = [], shareToken = "", variant = "", draggable = false, dragGroupId = "", onPointerDown, isDropTarget = false, isDragging = false }) {
  const [menu, setMenu] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [removingFromGroup, setRemovingFromGroup] = useState(false);
  const [selectedListIds, setSelectedListIds] = useState(() => [...(wish.listIds || [])]);
  const { busy, remove, fulfilled, share, save, update, repeat } = useWishActions({ wish, profile, lists, shareToken, onChanged });
  const interactionBusy = busy || removingFromGroup || groupBusy;
  const categoryLists = lists.filter((list) => !isGeneralList(list));
  const visibleLists = categoryLists.filter((list) => listSpace(list) === wishSpaceId(wish, lists));
  const listSelectionChanged = selectedListIds.length !== (wish.listIds || []).length
    || selectedListIds.some((id) => !(wish.listIds || []).includes(id));
  const secretListMembership = lists.some((list) => list.privacy === "private" && wish.listIds?.includes(list.id));
  const secret = isWishSecret(wish, lists);
  const previewImageUrl = wishPreviewImageUrl(wish);

  useEffect(() => {
    if (!menu) setSelectedListIds([...(wish.listIds || [])]);
  }, [wish.id, wish.listIds, menu]);
  useEffect(() => {
    if (groupBusy) setMenu(false);
  }, [groupBusy]);

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

  const removeFromGroup = async () => {
    if (!onRemoveFromGroup || interactionBusy) return;
    setRemovingFromGroup(true);
    try {
      await onRemoveFromGroup();
    } finally {
      setRemovingFromGroup(false);
    }
  };

  return (
    <>
    <Card data-group-wish-id={wish.id} data-wish-group-id={dragGroupId || undefined} aria-busy={groupBusy || undefined} onPointerDown={onPointerDown} className={`wish-card gap-0 overflow-visible rounded-none border-0 bg-transparent py-0 shadow-none ring-0 ${variant ? `wish-card--${variant}` : ""} ${wish.status === "fulfilled" ? "is-fulfilled" : ""} ${draggable ? "is-draggable" : ""} ${isDropTarget ? "is-group-target" : ""} ${isDragging ? "is-dragging" : ""}`}>
      {onOpen && <ShadcnButton type="button" variant="ghost" className="wish-card__open absolute inset-0 z-[2] h-full w-full rounded-[inherit] border-0 bg-transparent p-0 hover:bg-transparent dark:hover:bg-transparent active:translate-y-0" data-wish-id={wish.id} aria-label={`Открыть желание «${wish.title}»`} aria-haspopup="dialog" onClick={(event) => { closeMenu(); onOpen(event.currentTarget); }} />}
      {draggable && <span className="wish-card__drag-handle" data-wish-drag-handle aria-hidden="true"><GripVertical /></span>}
      <div className="wish-card__image">{previewImageUrl ? <img src={previewImageUrl} alt="" draggable="false" referrerPolicy="no-referrer" onError={(event) => applyRetailerPreviewFallback(event, wish.url)} /> : <span><Gift size={36} /></span>}{wish.status === "fulfilled" && <Badge className="fulfilled-badge"><Check /> Исполнено</Badge>}</div>
      <div className="wish-card__body">
        <div className="wish-card__top">
          {(wish.price != null || wish.eventDate) && <span>{wish.price != null ? formatMoney(wish.price, wish.currency) : ""}{wish.price != null && wish.eventDate ? " · " : ""}{wish.eventDate ? formatEventDate(wish.eventDate) : ""}</span>}
          <DropdownMenu open={menu} onOpenChange={(open) => {
            setMenu(open);
            if (!open) setSelectedListIds([...(wish.listIds || [])]);
          }}>
            <DropdownMenuTrigger
              render={<ShadcnButton type="button" variant="ghost" size="icon" className="wish-card__menu-trigger size-9 active:translate-y-0" disabled={interactionBusy} />}
              aria-label={`Опции желания «${wish.title}»`}
              aria-controls={`wish-menu-${wish.id}`}
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              id={`wish-menu-${wish.id}`}
              align="end"
              sideOffset={8}
              className="wish-card-actions-menu w-70 rounded-2xl p-2 [&_[data-slot=dropdown-menu-item]]:min-h-12 [&_[data-slot=dropdown-menu-sub-trigger]]:min-h-12"
              aria-label={`Действия с желанием «${wish.title}»`}
            >
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
                    {(onCreateList || visibleLists.length > 0) && <DropdownMenuSeparator />}
                    <div className="max-h-[22.75rem] overflow-y-auto overscroll-contain">
                      {visibleLists.length ? visibleLists.map((list) => {
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
                      }) : <p className="px-2 py-6 text-center text-xs text-muted-foreground">В этом пространстве пока нет списков.</p>}
                    </div>
                    {listSelectionChanged && <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} closeOnClick={false} onClick={() => setSelectedListIds([...(wish.listIds || [])])}><RotateCcw /> Отменить изменения</DropdownMenuItem>
                      <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base font-medium" disabled={busy} closeOnClick={false} onClick={saveLists}>{busy ? <LoaderCircle className="spin" /> : <Check />} Сохранить списки</DropdownMenuItem>
                    </>}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>}
              {owner && onRemoveFromGroup && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={interactionBusy} onClick={removeFromGroup}>{removingFromGroup || groupBusy ? <LoaderCircle className="spin" /> : <Ungroup />} Убрать из группы</DropdownMenuItem>}
              {(!owner || wish.status !== "fulfilled") && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={share}><Share2 /> Поделиться</DropdownMenuItem>}
              {!owner && wish.url && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" render={<a href={wish.url} target="_blank" rel="noreferrer" />}><ExternalLink /> {isYandexMapsUrl(wish.url) ? "Открыть в Яндекс Картах" : "Открыть магазин"}</DropdownMenuItem>}
              {!owner && wish.fundraisingUrl && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" render={<a href={wish.fundraisingUrl} target="_blank" rel="noopener noreferrer" />}><ExternalLink /> Перейти к сбору</DropdownMenuItem>}
              {owner && <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" className="app-destructive-menu-item min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} aria-haspopup="dialog" onClick={() => setDeleteOpen(true)}><Trash2 /> Удалить</DropdownMenuItem>
              </>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <h3>{wish.title}</h3>
        <p>{wish.description || "Без дополнительного описания"}</p>
        {owner && <div className="wish-card__owner-meta">{secret ? <span><LockKeyhole /> Только вам</span> : <span><Eye /> Виден друзьям</span>}{wish.reservationCount > 0 && <span><Gift /> Кто-то готовит подарок</span>}</div>}
      </div>
    </Card>
    {deleteOpen && <WishDeleteAlert open wish={wish} busy={busy} onOpenChange={setDeleteOpen} onConfirm={async () => { if (await remove()) setDeleteOpen(false); }} />}
    </>
  );
}

function WishGroupTile({ group, wishes, onOpen, onRename, onDisband, isDropTarget }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(group.title);
  const [busy, setBusy] = useState(false);
  const [disbandOpen, setDisbandOpen] = useState(false);
  const renamingFromMenuRef = useRef(false);
  const beginEditing = () => {
    renamingFromMenuRef.current = true;
    setTitle(group.title);
    setEditing(true);
  };
  const finishEditing = () => {
    renamingFromMenuRef.current = false;
    setEditing(false);
  };
  const resolveMenuFinalFocus = () => {
    const skipReturnFocus = renamingFromMenuRef.current;
    renamingFromMenuRef.current = false;
    return !skipReturnFocus;
  };
  const saveTitle = async () => {
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === group.title) { setTitle(group.title); finishEditing(); return; }
    setBusy(true);
    const saved = await onRename(nextTitle);
    setBusy(false);
    if (saved) finishEditing();
  };
  const disband = async () => {
    setBusy(true);
    const disbanded = await onDisband();
    setBusy(false);
    if (disbanded) setDisbandOpen(false);
  };
  return <>
  <div data-group-id={group.id} className={`wish-group-tile ${isDropTarget ? "is-drop-target" : ""}`}>
    <ShadcnButton type="button" variant="ghost" className="wish-group-tile__open" onClick={onOpen} aria-label={`Открыть группу, ${wishes.length} ${wishCountNoun(wishes.length)}`}>
    <span className="wish-group-tile__preview">
      {wishes.slice(0, 4).map((wish) => {
        const previewImageUrl = wishPreviewImageUrl(wish);
        return <span key={wish.id}>{previewImageUrl ? <img src={previewImageUrl} alt="" referrerPolicy="no-referrer" onError={(event) => applyRetailerPreviewFallback(event, wish.url)} /> : <Gift />}</span>;
      })}
    </span>
    </ShadcnButton>
    <div className="wish-card__body wish-group-tile__meta">
      {editing ? <Input autoFocus value={title} disabled={busy} maxLength={60} aria-label="Название группы" onFocus={(event) => event.currentTarget.select()} onChange={(event) => setTitle(event.target.value)} onBlur={saveTitle} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.blur(); } if (event.key === "Escape") { event.preventDefault(); setTitle(group.title); finishEditing(); } }} /> : <h3><ShadcnButton type="button" variant="ghost" className="wish-group-tile__title justify-start" onClick={onOpen}>{group.title}</ShadcnButton></h3>}
      <div className="wish-card__top">
        <span>{wishes.length} {wishCountNoun(wishes.length)}</span>
        {!editing && <DropdownMenu><DropdownMenuTrigger render={<ShadcnButton type="button" variant="ghost" size="icon" className="wish-card__menu-trigger wish-group-tile__menu size-9 active:translate-y-0" />} aria-label={`Опции группы «${group.title}»`}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent finalFocus={resolveMenuFinalFocus} align="end" sideOffset={8} className="wish-group-actions-menu w-60 max-w-[calc(100vw-24px)] rounded-2xl p-2"><DropdownMenuItem className="min-h-12 gap-3 rounded-xl px-3 text-base whitespace-nowrap" disabled={busy} onClick={beginEditing}><Pencil />Переименовать</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" className="app-destructive-menu-item min-h-12 gap-3 rounded-xl px-3 text-base whitespace-nowrap" disabled={busy} aria-haspopup="dialog" onClick={() => setDisbandOpen(true)}><Ungroup />Расформировать</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
      </div>
    </div>
  </div>
  {disbandOpen && <AlertDialog open={disbandOpen} onOpenChange={(open) => { if (!busy) setDisbandOpen(open); }}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Расформировать группу «{group.title}»?</AlertDialogTitle><AlertDialogDescription>Желания останутся в списке и снова будут показаны отдельно.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} aria-busy={busy || undefined} onClick={disband}>{busy ? <Spinner data-icon="inline-start" /> : <Ungroup data-icon="inline-start" aria-hidden="true" />}Расформировать</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>}
  </>;
}

function WishGroupOpenHeader({ group, wishesCount, onClose, onRename, onDisband, mutationBusy = false }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(group.title);
  const [busy, setBusy] = useState(false);
  const interactionBusy = busy || mutationBusy;
  const [disbandOpen, setDisbandOpen] = useState(false);
  const renamingFromMenuRef = useRef(false);
  useEffect(() => { if (!editing) setTitle(group.title); }, [group.title, editing]);
  const beginEditing = () => {
    renamingFromMenuRef.current = true;
    setTitle(group.title);
    setEditing(true);
  };
  const finishEditing = () => {
    renamingFromMenuRef.current = false;
    setEditing(false);
  };
  const resolveMenuFinalFocus = () => {
    const skipReturnFocus = renamingFromMenuRef.current;
    renamingFromMenuRef.current = false;
    return !skipReturnFocus;
  };
  const saveTitle = async () => {
    if (mutationBusy) return;
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === group.title) { setTitle(group.title); finishEditing(); return; }
    setBusy(true);
    const saved = await onRename(nextTitle);
    setBusy(false);
    if (saved) finishEditing();
  };
  const disband = async () => {
    if (mutationBusy) return;
    setBusy(true);
    const disbanded = await onDisband();
    setBusy(false);
    if (disbanded) setDisbandOpen(false);
  };
  return <>
    <header>
      <div className="wish-group-open__identity"><span>{editing ? <Input autoFocus value={title} disabled={interactionBusy} maxLength={60} aria-label="Название группы" onFocus={(event) => event.currentTarget.select()} onChange={(event) => setTitle(event.target.value)} onBlur={saveTitle} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.blur(); } if (event.key === "Escape") { event.preventDefault(); setTitle(group.title); finishEditing(); } }} /> : <strong>{group.title}</strong>}<small>{wishesCount} {wishCountNoun(wishesCount)}</small></span></div>
      <div className="wish-group-open__actions">{!editing && <DropdownMenu><DropdownMenuTrigger render={<ShadcnButton type="button" variant="ghost" size="icon" disabled={interactionBusy} />} aria-label={`Опции группы «${group.title}»`}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent finalFocus={resolveMenuFinalFocus} align="end" sideOffset={8} className="wish-group-actions-menu w-60 max-w-[calc(100vw-24px)] rounded-2xl p-2"><DropdownMenuItem className="min-h-12 gap-3 rounded-xl px-3 text-base whitespace-nowrap" disabled={interactionBusy} onClick={beginEditing}><Pencil />Переименовать</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" className="app-destructive-menu-item min-h-12 gap-3 rounded-xl px-3 text-base whitespace-nowrap" disabled={interactionBusy} aria-haspopup="dialog" onClick={() => setDisbandOpen(true)}><Ungroup />Расформировать</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}<ShadcnButton variant="ghost" size="icon" onClick={onClose} aria-label="Закрыть группу"><X /></ShadcnButton></div>
    </header>
    {disbandOpen && <AlertDialog open={disbandOpen} onOpenChange={(open) => { if (!interactionBusy) setDisbandOpen(open); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Расформировать группу «{group.title}»?</AlertDialogTitle><AlertDialogDescription>Желания останутся в списке и снова будут показаны отдельно.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={interactionBusy}>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={interactionBusy} aria-busy={interactionBusy || undefined} onClick={disband}>{interactionBusy ? <Spinner data-icon="inline-start" /> : <Ungroup data-icon="inline-start" aria-hidden="true" />}Расформировать</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
  </>;
}


function WishesPage({ onAdd, version }) {
  const { user } = useSession();
  const toast = useToast();
  const { data, loading, reload, updateData } = useAsync(() => api.get("/dashboard"), [version]);
  const [selected, setSelected] = useState("all");
  const [selectedSpace, setSelectedSpace] = useState("products");
  const [selectedWishId, setSelectedWishId] = useState(null);
  const [editingWishId, setEditingWishId] = useState(null);
  const [listModal, setListModal] = useState(null);
  const [draggedWishId, setDraggedWishId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [orderedWishIds, setOrderedWishIds] = useState([]);
  const [openedGroupId, setOpenedGroupId] = useState(null);
  const [removingGroupId, setRemovingGroupId] = useState(null);
  const pointerDragRef = useRef(null);
  const pointerTimerRef = useRef(null);
  const pointerListenerCleanupRef = useRef(null);
  const pointerAutoScrollFrameRef = useRef(null);
  const pointerAutoScrollTimeRef = useRef(null);
  const groupTimerRef = useRef(null);
  const hoverTargetRef = useRef(null);
  const armedDropTargetRef = useRef(null);
  const lastReorderTargetRef = useRef(null);
  const orderedWishIdsRef = useRef([]);
  const dragInitialOrderRef = useRef([]);
  const flipPositionsRef = useRef(new Map());
  const pointerGhostRef = useRef(null);
  const pointerGhostSizeRef = useRef({ width: 0, height: 0 });
  const suppressOpenRef = useRef(false);
  const dragSessionRef = useRef(false);
  const dragSourceWishIdRef = useRef(null);
  const dragScopeRef = useRef(null);
  const orderDirtyRef = useRef(false);
  const pendingOrderRef = useRef(null);
  const orderPersistingRef = useRef(false);
  const deferredAuthoritativeOrderRef = useRef(null);
  const removingGroupIdRef = useRef(null);
  const wishOrderKey = (data?.wishes || []).map((wish) => wish.id).join("\0");
  useEffect(() => {
    if (selectedWishId || editingWishId || listModal || openedGroupId) return undefined;
    return scheduleDocumentScrollUnlock();
  }, [selectedWishId, editingWishId, listModal, openedGroupId]);
  useEffect(() => {
    if (data?.wishes) {
      const ids = data.wishes.map((wish) => wish.id);
      if (dragSessionRef.current || orderPersistingRef.current) {
        deferredAuthoritativeOrderRef.current = ids;
        return;
      }
      orderedWishIdsRef.current = ids;
      setOrderedWishIds(ids);
    }
  }, [wishOrderKey]);
  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    const request = requestPreviewBackfill(user.id);
    request.promise
      .then((result) => {
        if (cancelled || result.updated <= 0 || request.refreshClaimed) return;
        request.refreshClaimed = true;
        void reload({ background: true }).catch(() => { request.refreshClaimed = false; });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id, reload]);
  useEffect(() => () => {
    clearTimeout(pointerTimerRef.current);
    clearTimeout(groupTimerRef.current);
    cancelAnimationFrame(pointerAutoScrollFrameRef.current);
    pointerListenerCleanupRef.current?.();
    pointerGhostRef.current?.remove();
  }, []);
  useLayoutEffect(() => {
    if (!flipPositionsRef.current.size) return;
    const cards = document.querySelectorAll(".wishes-page > .wish-grid [data-group-wish-id], .wish-group-open > .wish-grid [data-group-wish-id]");
    cards.forEach((card) => {
      const previous = flipPositionsRef.current.get(card.dataset.groupWishId);
      if (!previous || card.dataset.groupWishId === draggedWishId) return;
      const next = card.getBoundingClientRect();
      const deltaX = previous.left - next.left;
      const deltaY = previous.top - next.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
      card.animate(
        [{ transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` }, { transform: "translate3d(0, 0, 0)" }],
        { duration: 330, easing: "cubic-bezier(.2,.82,.2,1)" },
      );
    });
    flipPositionsRef.current = new Map();
  }, [orderedWishIds, draggedWishId]);
  const orderIndex = new Map(orderedWishIds.map((id, index) => [id, index]));
  const dashboardWishes = data?.wishes || [];
  const dashboardLists = data?.lists || [];
  const visibleWishes = [...dashboardWishes]
    .sort((a, b) => (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  const listsById = new Map(dashboardLists.map((list) => [list.id, list]));
  const categoryLists = dashboardLists.filter((list) => !isGeneralList(list) && listSpace(list) === selectedSpace);
  const generalList = dashboardLists.find(isGeneralList) || null;
  const groupingListId = selected === "all" ? generalList?.id : selected;
  const spaceWishes = visibleWishes.filter((wish) => wishBelongsToSpace(wish, listsById, selectedSpace));
  const wishCountForList = (listId) => spaceWishes.filter((wish) => wish.listIds.includes(listId)).length;
  const wishes = selected === "all" ? spaceWishes : spaceWishes.filter((wish) => wish.listIds.includes(selected));
  const groups = filterWishGroups({
    groups: data?.groups,
    listId: groupingListId,
    selectedSpace,
    scopeBySpace: selected === "all",
    visibleWishIds: new Set(wishes.map((wish) => wish.id)),
  });
  const groupedWishIds = new Set(groups.flatMap((group) => group.wishIds));
  const ungroupedWishes = wishes.filter((wish) => !groupedWishIds.has(wish.id));
  const openedGroup = groups.find((group) => group.id === openedGroupId) || null;
  const openedGroupWishes = openedGroup ? wishes.filter((wish) => openedGroup.wishIds.includes(wish.id)) : [];
  const selectedList = categoryLists.find((list) => list.id === selected) || null;
  const selectedWish = selectedWishId ? dashboardWishes.find((wish) => wish.id === selectedWishId) : null;
  const editingWish = editingWishId ? dashboardWishes.find((wish) => wish.id === editingWishId) : null;
  useEffect(() => {
    if (!openedGroupId) return undefined;
    if (!openedGroup) {
      setOpenedGroupId(null);
      return undefined;
    }
    const closeOnEscape = (event) => { if (event.key === "Escape") setOpenedGroupId(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [openedGroupId, openedGroup?.id]);
  if (loading) return <LoadingScreen compact />;
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
  const selectSpace = (space) => {
    setSelectedSpace(space);
    setSelected("all");
    setOpenedGroupId(null);
  };
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
  const clearGroupIntent = () => {
    clearTimeout(groupTimerRef.current);
    groupTimerRef.current = null;
    hoverTargetRef.current = null;
    armedDropTargetRef.current = null;
    setDropTarget(null);
  };
  const captureGridPositions = () => {
    const positions = new Map();
    document.querySelectorAll(".wishes-page > .wish-grid [data-group-wish-id], .wish-group-open > .wish-grid [data-group-wish-id]").forEach((card) => {
      positions.set(card.dataset.groupWishId, card.getBoundingClientRect());
    });
    flipPositionsRef.current = positions;
  };
  const removePointerGhost = () => {
    pointerGhostRef.current?.remove();
    pointerGhostRef.current = null;
    pointerGhostSizeRef.current = { width: 0, height: 0 };
  };
  const createPointerGhost = (source, clientX, clientY) => {
    removePointerGhost();
    const rect = source.getBoundingClientRect();
    const ghost = source.cloneNode(true);
    ghost.removeAttribute("draggable");
    ghost.classList.add("wish-card--drag-preview");
    ghost.style.setProperty("--drag-width", `${rect.width}px`);
    ghost.style.setProperty("--drag-x", `${clientX - rect.width / 2}px`);
    ghost.style.setProperty("--drag-y", `${clientY - rect.height / 2}px`);
    document.body.appendChild(ghost);
    pointerGhostRef.current = ghost;
    pointerGhostSizeRef.current = { width: rect.width, height: rect.height };
  };
  const movePointerGhost = (clientX, clientY) => {
    const ghost = pointerGhostRef.current;
    if (!ghost) return;
    const { width, height } = pointerGhostSizeRef.current;
    ghost.style.setProperty("--drag-x", `${clientX - width / 2}px`);
    ghost.style.setProperty("--drag-y", `${clientY - height / 2}px`);
  };
  const persistOrder = (ids) => {
    pendingOrderRef.current = ids;
    if (orderPersistingRef.current) return;
    orderPersistingRef.current = true;
    void (async () => {
      let restoreAuthoritativeOrder = false;
      while (pendingOrderRef.current) {
        const nextOrder = pendingOrderRef.current;
        pendingOrderRef.current = null;
        try {
          await api.patch("/wishes/reorder", { wishIds: nextOrder });
          restoreAuthoritativeOrder = false;
        } catch (error) {
          toast(error.message, "error");
          restoreAuthoritativeOrder = true;
          const fresh = await api.get("/dashboard").catch(() => null);
          if (fresh?.wishes) {
            deferredAuthoritativeOrderRef.current = fresh.wishes.map((wish) => wish.id);
          }
        }
      }
      orderPersistingRef.current = false;
      if (restoreAuthoritativeOrder && !dragSessionRef.current && Array.isArray(deferredAuthoritativeOrderRef.current)) {
        orderedWishIdsRef.current = [...deferredAuthoritativeOrderRef.current];
        setOrderedWishIds(orderedWishIdsRef.current);
        deferredAuthoritativeOrderRef.current = null;
      } else if (!restoreAuthoritativeOrder) {
        deferredAuthoritativeOrderRef.current = null;
      }
    })();
  };
  const reorderWish = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId || lastReorderTargetRef.current === targetId) return;
    const dragScope = dragScopeRef.current;
    const next = dragScope?.wishIds
      ? moveWishWithinSubset(orderedWishIdsRef.current, dragScope.wishIds, sourceId, targetId)
      : moveWishToTargetPosition(orderedWishIdsRef.current, sourceId, targetId);
    if (next === orderedWishIdsRef.current) return;
    lastReorderTargetRef.current = targetId;
    orderDirtyRef.current = true;
    orderedWishIdsRef.current = next;
    captureGridPositions();
    setOrderedWishIds(next);
  };
  const armGroupIntent = (target) => {
    if (hoverTargetRef.current === target) return;
    clearTimeout(groupTimerRef.current);
    hoverTargetRef.current = target;
    armedDropTargetRef.current = null;
    setDropTarget(null);
    groupTimerRef.current = setTimeout(() => {
      groupTimerRef.current = null;
      if (!dragSessionRef.current || hoverTargetRef.current !== target) return;
      armedDropTargetRef.current = target;
      setDropTarget(target);
      navigator.vibrate?.(12);
    }, GROUP_INTENT_DELAY_MS);
  };
  const beginDragSession = (wishId, group = null) => {
    const sourceStatus = dashboardWishes.find((wish) => wish.id === wishId)?.status;
    const sameStatusWishIds = new Set(dashboardWishes
      .filter((wish) => wish.status === sourceStatus)
      .map((wish) => wish.id));
    dragSessionRef.current = true; orderDirtyRef.current = false;
    dragSourceWishIdRef.current = wishId;
    dragScopeRef.current = group
      ? { kind: "group", groupId: group.id, wishIds: new Set((group.wishIds || []).filter((id) => sameStatusWishIds.has(id))) }
      : { kind: "list", groupId: null, wishIds: sameStatusWishIds };
    dragInitialOrderRef.current = [...orderedWishIdsRef.current];
    setDraggedWishId(wishId); lastReorderTargetRef.current = null;
  };
  const finishDrag = ({ persist = true, restore = false } = {}) => {
    const activeSession = dragSessionRef.current;
    const shouldRestoreOrder = activeSession && restore && orderDirtyRef.current && dragInitialOrderRef.current.length > 0;
    const orderToPersist = [...orderedWishIdsRef.current];
    const shouldPersistOrder = activeSession && persist && !restore && orderDirtyRef.current;
    const deferredAuthoritativeOrder = deferredAuthoritativeOrderRef.current;
    const shouldApplyDeferredOrder = activeSession && !shouldPersistOrder && Array.isArray(deferredAuthoritativeOrder);
    if (shouldApplyDeferredOrder) {
      captureGridPositions();
      orderedWishIdsRef.current = [...deferredAuthoritativeOrder];
      setOrderedWishIds(orderedWishIdsRef.current);
      deferredAuthoritativeOrderRef.current = null;
    } else if (shouldRestoreOrder) {
      captureGridPositions();
      orderedWishIdsRef.current = [...dragInitialOrderRef.current];
      setOrderedWishIds(orderedWishIdsRef.current);
    }
    dragSessionRef.current = false; orderDirtyRef.current = false;
    dragSourceWishIdRef.current = null;
    dragScopeRef.current = null;
    dragInitialOrderRef.current = [];
    stopPointerAutoScroll(); clearGroupIntent(); removePointerGhost(); setDraggedWishId(null); lastReorderTargetRef.current = null;
    if (shouldPersistOrder) {
      deferredAuthoritativeOrderRef.current = null;
      void persistOrder(orderToPersist);
    }
  };
  const createGroup = async (sourceWishId, targetWishId) => {
    finishDrag({ persist: false, restore: true });
    if (!sourceWishId || sourceWishId === targetWishId || !groupingListId) return;
    try {
      const { group } = await api.post(`/lists/${groupingListId}/groups`, { wishIds: [sourceWishId, targetWishId], space: selectedSpace });
      updateData((current) => {
        const linked = attachWishesToDashboardList(current, groupingListId, group.wishIds);
        return {
          ...linked,
          groups: [...(linked.groups || []).filter((item) => item.id !== group.id), group],
        };
      });
      toast("Группа создана");
      void reload({ background: true }).catch(() => {});
    } catch (error) { toast(error.message, "error"); }
  };
  const addToGroup = async (sourceWishId, groupId) => {
    finishDrag({ persist: false, restore: true });
    if (!sourceWishId || !groupingListId) return;
    try {
      await api.post(`/lists/${groupingListId}/groups/${groupId}/wishes`, { wishId: sourceWishId });
      updateData((current) => {
        const linked = attachWishesToDashboardList(current, groupingListId, [sourceWishId]);
        return {
          ...linked,
          groups: (linked.groups || []).map((group) => group.id === groupId
            ? { ...group, wishIds: [...new Set([...(group.wishIds || []), sourceWishId])] }
            : group),
        };
      });
      toast("Добавлено в группу");
      void reload({ background: true }).catch(() => {});
    } catch (error) { toast(error.message, "error"); }
  };
  const restoreFocusAfterGroupRemoval = (groupId, wishId) => {
    requestAnimationFrame(() => {
      const closeButton = document.querySelector('.wish-group-open [aria-label="Закрыть группу"]');
      if (closeButton) {
        closeButton.focus();
        return;
      }
      const extractedCard = [...document.querySelectorAll(".wishes-page > .wish-grid [data-group-wish-id]")]
        .find((card) => card.dataset.groupWishId === wishId);
      const extractedCardButton = extractedCard?.querySelector(".wish-card__open");
      if (extractedCardButton) {
        extractedCardButton.focus();
        return;
      }
      const groupTile = [...document.querySelectorAll(".wishes-page > .wish-grid [data-group-id]")]
        .find((tile) => tile.dataset.groupId === groupId);
      groupTile?.querySelector(".wish-group-tile__open")?.focus();
    });
  };
  const removeWishFromGroup = async (wishId, group) => {
    if (removingGroupIdRef.current) return false;
    removingGroupIdRef.current = group.id;
    setRemovingGroupId(group.id);
    try {
      const result = await api.delete(`/lists/${encodeURIComponent(group.listId)}/groups/${encodeURIComponent(group.id)}/wishes/${encodeURIComponent(wishId)}`);
      updateData((current) => ({
        ...current,
        groups: (current.groups || []).flatMap((currentGroup) => {
          if (currentGroup.id !== group.id) return [currentGroup];
          if (result.dissolved) return [];
          return [{
            ...currentGroup,
            ...(result.group || {}),
            wishIds: result.group?.wishIds || (currentGroup.wishIds || []).filter((id) => id !== wishId),
          }];
        }),
      }));
      if (result.dissolved && openedGroupId === group.id) setOpenedGroupId(null);
      restoreFocusAfterGroupRemoval(group.id, wishId);
      toast(result.dissolved ? "Желание убрано, группа расформирована" : "Желание убрано из группы");
      void reload({ background: true }).catch(() => {});
      return true;
    } catch (error) {
      restoreFocusAfterGroupRemoval(group.id, wishId);
      toast(error.message || "Не удалось убрать желание из группы", "error");
      return false;
    } finally {
      if (removingGroupIdRef.current === group.id) {
        removingGroupIdRef.current = null;
        setRemovingGroupId(null);
      }
    }
  };
  const renameGroup = async (groupId, listId, title) => {
    try {
      const result = await api.patch(`/lists/${listId}/groups/${groupId}`, { title });
      const savedTitle = result.group?.title || title;
      updateData((current) => ({
        ...current,
        groups: (current.groups || []).map((group) => group.id === groupId ? { ...group, title: savedTitle } : group),
      }));
      toast("Группа переименована");
      return true;
    }
    catch (error) { toast(error.message, "error"); return false; }
  };
  const disbandGroup = async (groupId, listId) => {
    try {
      await api.delete(`/lists/${listId}/groups/${groupId}`);
      updateData((current) => disbandWishGroupFromDashboard(current, groupId));
      if (openedGroupId === groupId) setOpenedGroupId(null);
      toast("Группа расформирована");
      void reload({ background: true }).catch(() => {});
      return true;
    } catch (error) {
      toast(error.message || "Не удалось расформировать группу", "error");
      return false;
    }
  };
  const stopPointerAutoScroll = () => {
    if (pointerAutoScrollFrameRef.current !== null) cancelAnimationFrame(pointerAutoScrollFrameRef.current);
    pointerAutoScrollFrameRef.current = null;
    pointerAutoScrollTimeRef.current = null;
  };
  const clearPointerListeners = () => {
    stopPointerAutoScroll();
    pointerListenerCleanupRef.current?.();
    pointerListenerCleanupRef.current = null;
  };
  const releasePointerCapture = (drag) => {
    if (!drag) return;
    const captureTarget = drag.captureTarget || drag.source;
    try {
      if (captureTarget.hasPointerCapture?.(drag.pointerId)) captureTarget.releasePointerCapture?.(drag.pointerId);
    } catch {}
  };
  const listenForPointerDrag = () => {
    const move = (event) => movePointerDrag(event);
    const end = (event) => endPointerDrag(event);
    const cancel = (event) => cancelPointerDrag(event);
    const visibility = (event) => { if (document.hidden) cancelPointerDrag(event); };
    window.addEventListener("pointermove", move, { capture: true, passive: false });
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", visibility);
    pointerListenerCleanupRef.current = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
    };
  };
  const activatePointerDrag = (drag) => {
    if (!drag || pointerDragRef.current !== drag || drag.active) return;
    try { drag.captureTarget.setPointerCapture?.(drag.pointerId); } catch {}
    drag.active = true;
    suppressOpenRef.current = true;
    beginDragSession(drag.wishId, drag.group);
    createPointerGhost(drag.source, drag.startX, drag.startY);
    startPointerAutoScroll(drag);
    navigator.vibrate?.(18);
  };
  const beginPointerDrag = (event, wishId, group = null) => {
    const pointerType = event.pointerType || "mouse";
    if (!event.isPrimary || event.button !== 0) return;
    if (!event.target.closest?.(".wish-card__open, [data-wish-drag-handle]")) return;
    if (pointerDragRef.current) return;
    const drag = { wishId, group, pointerId: event.pointerId, pointerType, startX: event.clientX, startY: event.clientY, clientX: event.clientX, clientY: event.clientY, active: false, source: event.currentTarget, captureTarget: event.currentTarget.closest(".wish-grid") || event.currentTarget };
    pointerDragRef.current = drag;
    clearTimeout(pointerTimerRef.current);
    clearPointerListeners();
    listenForPointerDrag();
    if (event.target.closest?.("[data-wish-drag-handle]")) {
      event.preventDefault();
      activatePointerDrag(drag);
      return;
    }
    if (pointerType === "mouse") return;
    pointerTimerRef.current = setTimeout(() => {
      activatePointerDrag(drag);
    }, 260);
  };
  const updatePointerDragPosition = (drag, clientX, clientY) => {
    movePointerGhost(clientX, clientY);
    const element = document.elementFromPoint(clientX, clientY);
    const wishCard = element?.closest?.("[data-group-wish-id]");
    const groupId = element?.closest?.("[data-group-id]")?.dataset.groupId;
    const wishId = wishCard?.dataset.groupWishId;
    const targetGroupId = wishCard?.dataset.wishGroupId || null;
    const dragGroupId = drag.group?.id || null;
    const validReorderTarget = wishId
      && wishId !== drag.wishId
      && dragScopeRef.current?.wishIds?.has(wishId)
      && (dragGroupId ? targetGroupId === dragGroupId : !targetGroupId);
    const validGroupTarget = wishId
      && wishId !== drag.wishId
      && !dragGroupId
      && !targetGroupId;
    const target = dragGroupId
      ? validReorderTarget ? `wish:${wishId}` : null
      : groupId
        ? `group:${groupId}`
        : groupingListId
          ? validGroupTarget ? `wish:${wishId}` : null
          : validReorderTarget ? `wish:${wishId}` : null;
    if (target && target !== drag.hoverTarget) {
      drag.hoverTarget = target;
      // Group only after a short dwell; otherwise use the same reorder gesture everywhere.
      if (dragGroupId || !groupingListId) {
        if (wishId) reorderWish(drag.wishId, wishId);
        clearGroupIntent();
      } else {
        armGroupIntent(target);
      }
    } else if (!target) {
      drag.hoverTarget = null;
      lastReorderTargetRef.current = null;
      clearGroupIntent();
    }
  };
  const startPointerAutoScroll = (drag) => {
    if (pointerAutoScrollFrameRef.current !== null) return;
    const tick = (timestamp) => {
      pointerAutoScrollFrameRef.current = null;
      if (pointerDragRef.current !== drag || !drag.active) return;
      const scrollContainer = drag.source.closest(".wish-group-open") || document.scrollingElement;
      if (!scrollContainer) return;
      const containerRect = scrollContainer === document.scrollingElement
        ? { top: 0, right: window.innerWidth, bottom: window.innerHeight, left: 0 }
        : scrollContainer.getBoundingClientRect();
      if (drag.clientX < containerRect.left || drag.clientX > containerRect.right) {
        pointerAutoScrollTimeRef.current = null;
        return;
      }
      const edgeSize = Math.min(88, Math.max(40, (containerRect.bottom - containerRect.top) / 4));
      const distanceFromTopEdge = containerRect.top + edgeSize - drag.clientY;
      const distanceFromBottomEdge = drag.clientY - (containerRect.bottom - edgeSize);
      let direction = 0;
      let penetration = 0;
      if (distanceFromTopEdge > 0) {
        direction = -1;
        penetration = Math.min(1, distanceFromTopEdge / edgeSize);
      } else if (distanceFromBottomEdge > 0) {
        direction = 1;
        penetration = Math.min(1, distanceFromBottomEdge / edgeSize);
      }
      if (!direction) {
        pointerAutoScrollTimeRef.current = null;
        return;
      }
      const elapsed = pointerAutoScrollTimeRef.current === null
        ? 16
        : Math.min(32, Math.max(0, timestamp - pointerAutoScrollTimeRef.current));
      pointerAutoScrollTimeRef.current = timestamp;
      const pixelsPerSecond = 120 + 780 * penetration * penetration;
      const scrollDelta = direction * pixelsPerSecond * (elapsed / 1000);
      const previousScrollTop = scrollContainer.scrollTop;
      const nextScrollTop = Math.max(
        0,
        Math.min(scrollContainer.scrollHeight - scrollContainer.clientHeight, previousScrollTop + scrollDelta),
      );
      if (nextScrollTop === previousScrollTop) {
        pointerAutoScrollTimeRef.current = null;
        return;
      }
      scrollContainer.scrollTo({ top: nextScrollTop, behavior: "instant" });
      if (scrollContainer.scrollTop === previousScrollTop) {
        pointerAutoScrollTimeRef.current = null;
        return;
      }
      updatePointerDragPosition(drag, drag.clientX, drag.clientY);
      pointerAutoScrollFrameRef.current = requestAnimationFrame(tick);
    };
    pointerAutoScrollFrameRef.current = requestAnimationFrame(tick);
  };
  const movePointerDrag = (event) => {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 9) {
      if (drag.pointerType === "mouse") activatePointerDrag(drag);
      else { clearTimeout(pointerTimerRef.current); pointerDragRef.current = null; releasePointerCapture(drag); clearPointerListeners(); return; }
    }
    if (!drag.active) return;
    event.preventDefault();
    drag.clientX = event.clientX;
    drag.clientY = event.clientY;
    updatePointerDragPosition(drag, event.clientX, event.clientY);
    startPointerAutoScroll(drag);
  };
  const endPointerDrag = (event) => {
    const drag = pointerDragRef.current;
    if (!drag || (event.pointerId != null && event.pointerId !== drag.pointerId)) return;
    clearTimeout(pointerTimerRef.current);
    clearPointerListeners();
    pointerDragRef.current = null;
    releasePointerCapture(drag);
    if (!drag.active) return;
    event.preventDefault();
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const wishCard = element?.closest?.("[data-group-wish-id]");
    const groupId = element?.closest?.("[data-group-id]")?.dataset.groupId;
    const wishId = wishCard?.dataset.groupWishId;
    const targetGroupId = wishCard?.dataset.wishGroupId || null;
    const dragGroupId = drag.group?.id || null;
    if (dragGroupId && targetGroupId === dragGroupId && wishId && (wishId !== drag.wishId || orderDirtyRef.current)) finishDrag();
    else if (dragGroupId) finishDrag({ persist: false, restore: true });
    else if (groupId && armedDropTargetRef.current === `group:${groupId}`) addToGroup(drag.wishId, groupId);
    else if (wishId && wishId !== drag.wishId && armedDropTargetRef.current === `wish:${wishId}`) createGroup(drag.wishId, wishId);
    else if (wishId && wishId !== drag.wishId) {
      reorderWish(drag.wishId, wishId);
      finishDrag();
    }
    else if (wishId === drag.wishId && orderDirtyRef.current) finishDrag();
    else finishDrag({ persist: false, restore: true });
    setTimeout(() => { suppressOpenRef.current = false; }, 0);
  };
  const cancelPointerDrag = (event) => {
    const drag = pointerDragRef.current;
    if (!drag || (event.pointerId != null && event.pointerId !== drag.pointerId)) return;
    clearTimeout(pointerTimerRef.current);
    clearPointerListeners();
    pointerDragRef.current = null;
    releasePointerCapture(drag);
    if (!drag.active) return;
    event.preventDefault();
    finishDrag({ persist: false, restore: true });
    setTimeout(() => { suppressOpenRef.current = false; }, 0);
  };
  const renderWish = (wish, group = null) => {
    const dragEnabled = !group || !removingGroupId;
    return <WishCard key={wish.id} wish={wish} owner profile={user} lists={data.lists} draggable={dragEnabled} dragGroupId={group?.id} groupBusy={Boolean(group && removingGroupId)} isDragging={draggedWishId === wish.id} isDropTarget={!group && dropTarget === `wish:${wish.id}`} onPointerDown={(event) => { if (!group || !removingGroupId) beginPointerDrag(event, wish.id, group); }} onRemoveFromGroup={group ? () => removeWishFromGroup(wish.id, group) : undefined} onChanged={() => reload({ background: true })} onOpen={() => {
    if (suppressOpenRef.current) return;
    setSelectedWishId(wish.id);
  }} onEdit={() => editWish(wish.id)} onCreateList={() => setListModal({ attachWishId: wish.id })} />;
  };
  return <div className="app-page wishes-page"><header className="wishes-page__topbar"><Logo className="app-shell-logo" /><SpaceSwitcher value={selectedSpace} onChange={selectSpace} /><ShadcnButton className="wishes-page__topbar-share !size-12 rounded-full" variant="outline" size="icon" type="button" aria-label="Поделиться" title="Поделиться" onClick={share}><Share2 aria-hidden="true" /></ShadcnButton></header><WishesProfileHero user={user} selectedList={selectedList} onEditList={setListModal} onAdd={() => onAdd(selectedSpace)} />{categoryLists.length > 0 && <div className="list-tabs"><div className="list-tabs__track"><ToggleGroup className="contents" value={[selected]} onValueChange={(values) => { if (values[0]) { setSelected(values[0]); setOpenedGroupId(null); } }} aria-label="Списки желаний"><ToggleGroupItem style={LIST_TILE_STYLE} value="all" aria-label={listTileAccessibleName("Мои желания", spaceWishes.length)}><ListTileContent title="Мои желания" count={spaceWishes.length} /></ToggleGroupItem>{categoryLists.map((list) => { const listWishCount = wishCountForList(list.id); return <ToggleGroupItem style={LIST_TILE_STYLE} value={list.id} key={list.id} aria-label={listTileAccessibleName(list.title, listWishCount, list.privacy === "private")}><ListTileContent title={list.title} count={listWishCount} privateList={list.privacy === "private"} /></ToggleGroupItem>; })}</ToggleGroup><ShadcnButton variant="ghost" size="icon" className="list-tabs__add" aria-label="Новый список" title="Новый список" onClick={() => setListModal({})}><Plus size={16} /></ShadcnButton></div></div>}
{openedGroup && <section className="wish-group-open" role="dialog" aria-modal="true" aria-label={`Группа «${openedGroup.title}»`}><WishGroupOpenHeader group={openedGroup} wishesCount={openedGroupWishes.length} mutationBusy={Boolean(removingGroupId)} onClose={() => setOpenedGroupId(null)} onRename={(title) => renameGroup(openedGroup.id, openedGroup.listId, title)} onDisband={() => disbandGroup(openedGroup.id, openedGroup.listId)} /><div className="wish-grid" onLostPointerCapture={cancelPointerDrag}>{openedGroupWishes.map((wish) => renderWish(wish, openedGroup))}</div></section>}
{wishes.length ? <div className="wish-grid" onLostPointerCapture={cancelPointerDrag}>{groups.map((group) => <WishGroupTile key={group.id} group={group} wishes={wishes.filter((wish) => group.wishIds.includes(wish.id))} onOpen={() => setOpenedGroupId(group.id)} onRename={(title) => renameGroup(group.id, group.listId, title)} onDisband={() => disbandGroup(group.id, group.listId)} isDropTarget={dropTarget === `group:${group.id}`} />)}{ungroupedWishes.map((wish) => renderWish(wish))}</div> : <EmptyState icon={Heart} title="В этом списке пока пусто" text="Добавьте то, что действительно порадует." />}{selectedWish && <WishDetailsModal wish={selectedWish} owner profile={user} lists={data.lists} wishes={data.wishes} onChanged={() => reload({ background: true })} onEdit={() => editWish(selectedWish.id)} onCreateList={() => { setSelectedWishId(null); setListModal({ attachWishId: selectedWish.id }); }} onClose={() => setSelectedWishId(null)} />}{editingWish && <WishModal wish={editingWish} space={selectedSpace} onClose={() => setEditingWishId(null)} onSaved={async () => { setEditingWishId(null); await reload(); }} onDeleted={async () => { setEditingWishId(null); await reload(); }} />}{listModal && <ListModal list={listModal.id ? listModal : null} listsCount={data.lists.length} space={selectedSpace} onClose={() => setListModal(null)} onSaved={saveList} onDeleted={async () => { setListModal(null); setSelected("all"); await reload(); }} />}</div>;
}

function WishDeleteAlert({ open = true, wish, busy = false, onOpenChange, onConfirm }) {
  return <AlertDialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !busy) onOpenChange?.(false); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Удалить «{wish.title}»?</AlertDialogTitle>
        <AlertDialogDescription>Желание исчезнет из всех списков. Отменить это действие не получится.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={busy} aria-busy={busy || undefined} onClick={onConfirm}>{busy ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}Удалить</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

function WishDetailsModal({ wish, owner = false, profile, shareToken = "", lists = [], onChanged, onEdit, onCreateList, onClose }) {
  const isMobile = useIsMobile();
  const categoryLists = useMemo(() => lists.filter((list) => !isGeneralList(list)), [lists]);
  const visibleLists = useMemo(() => categoryLists.filter((list) => listSpace(list) === wishSpaceId(wish, lists)), [categoryLists, wish, lists]);
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
  const previewImageUrl = wishPreviewImageUrl(wish);

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
      {visibleLists.length ? visibleLists.map((list) => {
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
          <Checkbox
            checked={selected}
            readOnly
            tabIndex={-1}
            role="presentation"
            aria-hidden="true"
            className="pointer-events-none ml-auto"
          />
        </DropdownMenuCheckboxItem>;
      }) : <p className="card-menu__lists-empty">В этом пространстве пока нет списков.</p>}
    </div>
  </>;

  return (
    <>
      <Drawer open showSwipeHandle swipeDirection={isMobile ? "down" : "right"} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DrawerContent className="wish-details-dialog">
          <DrawerClose
            render={<ShadcnButton variant="ghost" className="absolute top-2 right-2 z-10" size="icon-sm" />}
          >
            <X />
            <span className="sr-only">Закрыть</span>
          </DrawerClose>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 [&>*]:shrink-0">
          <Card data-slot="wish-media" className="mx-auto w-full max-w-md relative overflow-hidden p-0">
            {previewImageUrl
              ? <img className="block h-auto w-full" src={previewImageUrl} alt={`Фото желания «${wish.title}»`} referrerPolicy="no-referrer" onError={(event) => applyRetailerPreviewFallback(event, wish.url)} />
              : <span className="grid aspect-[4/3] w-full place-items-center text-muted-foreground"><Gift /></span>}
            {wish.status === "fulfilled" && <Badge variant="secondary" className="absolute right-2 bottom-2"><Check /> Исполнено</Badge>}
          </Card>

          <DrawerHeader className="mx-auto w-full max-w-md p-0 text-left!">
            <DrawerTitle><span className="sr-only">Желание: </span>{wish.title}</DrawerTitle>
            {(wish.price != null || wish.eventDate) && <div data-slot="wish-price-row" className="w-full">
              {wish.price != null && <strong data-slot="wish-price" className="whitespace-nowrap tabular-nums text-3xl leading-none font-semibold sm:text-4xl">{formatMoney(wish.price, wish.currency)}</strong>}
              {wish.eventDate && <span data-slot="wish-event-date" className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarDays className="size-4" aria-hidden="true" />{formatEventDate(wish.eventDate)}</span>}
            </div>}
            <DrawerDescription>{wish.description || "Автор пока не добавил описание — иногда желание говорит само за себя."}</DrawerDescription>
          </DrawerHeader>

          <div data-slot="wish-toolbar" className="mx-auto flex w-full max-w-md min-w-0 items-center gap-2">
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
                    className="max-h-[calc(100dvh-12px)] max-w-(--available-width) rounded-2xl p-2 [&_[data-slot=dropdown-menu-item]]:min-h-12"
                    align="start"
                    sideOffset={4}
                    aria-label={`Списки желания «${wish.title}»`}
                  >
                    {renderListPickerBody()}
                  </DropdownMenuContent>
                </DropdownMenu>
              : <Badge variant="secondary" className="max-w-full truncate">{listLabel}</Badge>}

          </div>

          {wish.url && <a href={wish.url} target="_blank" rel="noreferrer" className={buttonVariants({ className: "wish-buy-action mx-auto h-12 w-full max-w-md" })}>{isYandexMapsUrl(wish.url) ? "Открыть в Яндекс Картах" : "Где купить"} <ExternalLink data-icon="inline-end" aria-hidden="true" /></a>}
          {wish.fundraisingUrl && <a href={wish.fundraisingUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ className: "wish-buy-action mx-auto h-12 w-full max-w-md" })}>Перейти к сбору <ExternalLink data-icon="inline-end" aria-hidden="true" /></a>}

          <div
            data-slot="wish-actions"
            className="mx-auto flex w-full max-w-md min-w-0 flex-nowrap items-center gap-2"
            role="group"
            aria-label="Действия с желанием"
          >
            {!owner && <ShadcnButton className="h-12 min-w-0 flex-1" disabled={busy || wish.status !== "active" || reservationUnavailable} aria-busy={busy || undefined} onClick={reserve}>{busy ? <Spinner /> : <Gift />}{wish.reservedByMe ? "Забронировано вами" : reservationUnavailable ? "Уже забронировано" : "Забронировать"}</ShadcnButton>}
            {!owner && <ShadcnButton className="size-12 shrink-0" variant={wish.likedByMe ? "default" : "outline"} size="icon" disabled={busy || wish.likedByMe} aria-label={wish.likedByMe ? "Желание уже в вашем общем списке" : "Лайкнуть и добавить в общий список"} title={wish.likedByMe ? "Уже в вашем списке" : "Добавить к себе"} onClick={save}><Heart fill={wish.likedByMe ? "currentColor" : "none"} /></ShadcnButton>}
            {owner && <ShadcnButton className="h-12 min-w-0 flex-1" variant="outline" disabled={busy} aria-busy={busy || undefined} onClick={fulfilled}>{busy ? <Spinner /> : <PackageCheck />}{wish.status === "fulfilled" ? "Вернуть в активные" : "Отметить исполненным"}</ShadcnButton>}
            <DropdownMenu open={menuOpen} onOpenChange={(open) => {
              setMenuOpen(open);
              if (open) setListsOpen(false);
            }}>
              <DropdownMenuTrigger
                render={<ShadcnButton variant="outline" size="icon" className="size-12 shrink-0" />}
                aria-label={`Опции желания «${wish.title}»`}
                title="Опции желания"
              ><MoreHorizontal /></DropdownMenuTrigger>
              <DropdownMenuContent
                id={`wish-detail-menu-${wish.id}`}
                className="max-h-[calc(100dvh-12px)] w-64 max-w-[calc(100vw-12px)] rounded-2xl p-2 [&_[data-slot=dropdown-menu-item]]:min-h-12 [&_[data-slot=dropdown-menu-sub-trigger]]:min-h-12"
                align="end"
                sideOffset={4}
                aria-label={`Действия с желанием «${wish.title}»`}
              >
                <DropdownMenuGroup>
                  {!owner && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy || wish.status !== "active" || reservationUnavailable} onClick={reserve}><Gift /> {wish.reservedByMe ? "Снять бронь" : "Забронировать"}</DropdownMenuItem>}
                  {!owner && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy || wish.likedByMe} onClick={save}><Heart fill={wish.likedByMe ? "currentColor" : "none"} /> {wish.likedByMe ? "Уже в вашем списке" : "Лайкнуть и добавить к себе"}</DropdownMenuItem>}
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
                      <DropdownMenuSubTrigger className="card-menu__submenu-trigger min-h-12 gap-2 px-3 py-2 text-base" disabled={busy}><ListPlus /> <span>Добавить в список</span></DropdownMenuSubTrigger>
                      <DropdownMenuSubContent
                        id={`wish-detail-action-lists-${wish.id}`}
                        className="max-h-[calc(100dvh-12px)] w-64 max-w-[calc(100vw-12px)] rounded-2xl p-2 [&_[data-slot=dropdown-menu-item]]:min-h-12"
                        sideOffset={4}
                        aria-label={`Списки желания «${wish.title}»`}
                      >
                        {renderListPickerBody()}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>}
                  {(!owner || wish.status !== "fulfilled") && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={share}><Share2 /> Поделиться</DropdownMenuItem>}
                  {!owner && wish.url && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" render={<a href={wish.url} target="_blank" rel="noreferrer" />}><ExternalLink /> {isYandexMapsUrl(wish.url) ? "Открыть в Яндекс Картах" : "Открыть магазин"}</DropdownMenuItem>}
                  {!owner && wish.fundraisingUrl && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" render={<a href={wish.fundraisingUrl} target="_blank" rel="noopener noreferrer" />}><ExternalLink /> Перейти к сбору</DropdownMenuItem>}
                  {owner && <DropdownMenuItem variant="destructive" className="app-destructive-menu-item min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} aria-haspopup="dialog" onClick={() => setDeleteOpen(true)}><Trash2 /> Удалить</DropdownMenuItem>}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {!owner && <Alert className="mx-auto w-full max-w-md"><Hand /><AlertDescription>Если вы решили исполнить это желание, обязательно забронируйте его, чтобы никто другой не подарил то же самое.</AlertDescription></Alert>}
          </div>
        </DrawerContent>
      </Drawer>
      {deleteOpen && <WishDeleteAlert open wish={wish} busy={busy} onOpenChange={setDeleteOpen} onConfirm={async () => { if (await remove()) setDeleteOpen(false); }} />}
    </>
  );
}

function ListModal({ list = null, listsCount = 0, space = "products", onClose, onSaved, onDeleted, returnFocusRef }) {
  const isMobile = useIsMobile();
  const editing = Boolean(list?.id);
  const toast = useToast();
  const titleId = useId();
  const descriptionId = useId();
  const secretListId = useId();
  const secretListDescriptionId = useId();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState(() => ({
    title: list?.title || "",
    description: list?.description || "",
    privacy: list?.privacy || "public",
    space: SPACE_IDS.includes(list?.space) ? list.space : (SPACE_IDS.includes(space) ? space : "products"),
  }));
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
  return <>
    <Drawer open swipeDirection={isMobile ? "down" : "right"} onOpenChange={(open) => { if (!open && !loading && !deleting) onClose(); }}>
      <DrawerContent finalFocus={returnFocusRef}>
        <DrawerClose
          render={<ShadcnButton variant="ghost" className="absolute top-2 right-2 z-10" size="icon-sm" />}
        >
          <X />
          <span className="sr-only">Закрыть</span>
        </DrawerClose>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <DrawerHeader className="text-left!">
            <DrawerTitle>{editing ? "Изменить список" : "Создать список"}</DrawerTitle>
            <DrawerDescription>{editing ? "Измените название, описание и приватность списка." : "Задайте название, описание и приватность нового списка."}</DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={titleId}>Название</FieldLabel>
              <Input id={titleId} autoFocus required placeholder="Например, Новоселье" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor={descriptionId}>Описание</FieldLabel>
              <Textarea id={descriptionId} rows={3} placeholder="Расскажите друзьям о списке" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </Field>
            <Field orientation="horizontal" className="items-center">
              <div className="min-w-0 flex-1">
                <FieldLabel className="cursor-pointer" htmlFor={secretListId}>Секретный список</FieldLabel>
                <FieldDescription id={secretListDescriptionId}>Все желания в этом списке будут видны только вам.</FieldDescription>
              </div>
              <Switch id={secretListId} type="button" aria-describedby={secretListDescriptionId} checked={form.privacy === "private"} disabled={loading} onCheckedChange={(checked) => setForm((current) => ({ ...current, privacy: checked ? "private" : "public" }))} />
            </Field>
            {editing && <div className="flex items-center justify-between gap-4 border-t pt-4"><div className="min-w-0"><strong className="block text-sm font-medium">Удалить список</strong><span className="text-sm text-muted-foreground">Желания останутся в общем списке.</span></div><ShadcnButton type="button" variant="destructive" disabled={deleting || listsCount <= 1} aria-busy={deleting || undefined} onClick={() => setDeleteOpen(true)}>{deleting ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}Удалить</ShadcnButton></div>}
          </FieldGroup>
          </div>
          <DrawerFooter className="border-t bg-muted/50 pt-4 sm:flex-row sm:justify-end">
            <ShadcnButton type="submit" disabled={loading || deleting} aria-busy={loading || undefined}>{loading && <Spinner data-icon="inline-start" />}{editing ? "Сохранить изменения" : "Создать список"}</ShadcnButton>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
    {deleteOpen && <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Удалить «{list.title}»?</AlertDialogTitle><AlertDialogDescription>Желания из этого списка останутся в вашем общем списке. Отменить удаление списка не получится.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={deleting} aria-busy={deleting || undefined} onClick={remove}>{deleting ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}Удалить</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
  </>;
}

function WishModal({ onClose, onSaved, onDeleted, wish = null, space = "products" }) {
  const isMobile = useIsMobile();
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
  const restoreDeleteFocusRef = useRef(false);
  const selectableLists = data?.lists?.filter((list) => !isGeneralList(list)) || [];
  const effectiveSpace = (() => {
    if (editing) {
      if (SPACE_IDS.includes(wish?.space)) return wish.space;
      if (data?.lists) {
        const listsById = new Map(data.lists.map((list) => [list.id, list]));
        const wishSpace = (wish.listIds || [])
          .map((id) => listsById.get(id))
          .filter((list) => list && !isGeneralList(list))
          .map((list) => listSpace(list))
          .find((spaceId) => SPACE_IDS.includes(spaceId));
        return wishSpace || "products";
      }
    }
    return SPACE_IDS.includes(space) ? space : "products";
  })();
  const visibleLists = selectableLists.filter((list) => listSpace(list) === effectiveSpace);
  const isPlaces = effectiveSpace === "places";
  const isMedia = effectiveSpace === "media";
  const isFood = effectiveSpace === "food";
  const isYouTube = isMedia && isYouTubeUrl(form.url.trim());
  const isKinopoiskSite = isMedia && isKinopoiskHost(form.url.trim());
  const isKinopoisk = isMedia && isKinopoiskUrl(form.url.trim());
  const formPreviewImageUrl = wishPreviewImageUrl({ imageUrl: form.imageUrl, url: form.url });
  const showEventDate = effectiveSpace === "events"
    || Boolean(wish?.eventDate)
    || form.listIds.some((id) => {
      const list = selectableLists.find((item) => item.id === id);
      return list ? listSpace(list) === "events" : false;
    });
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
    if (isPlaces && !isYandexMapsUrl(url)) { setMetadata({ status: "error", message: "Вставьте ссылку на место из Яндекс Карт" }); return false; }
    const kinopoiskUrlError = isMedia ? kinopoiskContentUrlError(url) : "";
    if (kinopoiskUrlError) {
      setMetadata({ status: "error", message: kinopoiskUrlError, retryable: false });
      return false;
    }
    const requestId = ++metadataRequestRef.current;
    setMetadata({ status: "loading", message: isPlaces ? "Ищем название и адрес места в Яндекс Картах…" : isYouTube ? "Читаем видео на YouTube…" : isKinopoisk ? "Загружаем постер с Кинопоиска…" : isMedia ? "Ищем название и обложку…" : "Ищем название, фотографию и цену на странице магазина…" });
    try {
      const meta = await api.post("/metadata", { url });
      if (requestId !== metadataRequestRef.current) return false;
      const usesFallbackPreview = meta.previewFallback === true;
      const values = {
        title: typeof meta.title === "string" ? meta.title.trim() : "",
        description: typeof meta.description === "string" ? meta.description.trim() : "",
        imageUrl: !usesFallbackPreview && typeof meta.imageUrl === "string" ? meta.imageUrl.trim() : "",
        price: meta.price == null || meta.price === "" ? "" : String(meta.price),
        currency: typeof meta.currency === "string" && WISH_CURRENCIES.includes(meta.currency.toUpperCase()) ? meta.currency.toUpperCase() : "",
      };
      const foundFields = ["title", "description", "imageUrl", "price"].filter((field) => values[field] !== "");
      if (foundFields.length === 0 && !usesFallbackPreview) {
        setMetadata({ status: "error", message: isPlaces ? "Не удалось прочитать страницу Яндекс Карт. Заполните карточку вручную." : isYouTube ? "Не удалось прочитать видео на YouTube. Заполните карточку вручную." : isKinopoisk ? "Не удалось получить постер Кинопоиска. Добавьте изображение вручную." : isMedia ? "Не удалось получить данные и обложку. Добавьте их вручную." : "Магазин не отдал данные товара. Можно повторить попытку или заполнить карточку вручную." });
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
      setMetadata({ status: "success", message: usesFallbackPreview ? "Магазин не отдал фото товара — показываем превью сервиса. Название и цену можно заполнить вручную." : isPlaces ? "Название и адрес подставили — проверьте карточку" : isYouTube ? "Название и превью видео уже в карточке — осталось всё проверить." : isKinopoisk ? "Постер Кинопоиска уже в карточке — осталось всё проверить." : appliedFields.length === 0 ? "Данные страницы найдены, а ваши ручные правки оставлены без изменений." : isMedia && values.imageUrl ? "Название и обложка уже в карточке — осталось всё проверить." : isFood && complete ? "Название, фото и цена уже в карточке. Цена зависит от адреса и магазина — проверьте её перед сохранением." : complete ? "Название, фото и цена уже в карточке — осталось всё проверить." : "Подставили всё, что удалось найти на странице. Проверьте карточку." });
      return true;
    } catch (error) {
      if (requestId !== metadataRequestRef.current) return false;
      setMetadata({ status: "error", message: error.message || (isPlaces ? "Не удалось прочитать страницу Яндекс Карт. Заполните карточку вручную." : isYouTube ? "Не удалось прочитать видео на YouTube. Заполните карточку вручную." : isKinopoisk ? "Не удалось получить постер Кинопоиска." : isMedia ? "Не удалось получить обложку по ссылке." : "Не удалось прочитать страницу магазина.") });
      return false;
    }
  };
  useEffect(() => {
    if (editing) return undefined;
    window.clearTimeout(autoTimerRef.current);
    metadataRequestRef.current += 1;
    const url = form.url.trim();
    if (!url || !isProductUrl(url)) { setMetadata({ status: "idle", message: "" }); return undefined; }
    if (isPlaces && !isYandexMapsUrl(url)) { setMetadata({ status: "error", message: "Вставьте ссылку на место из Яндекс Карт" }); return undefined; }
    const kinopoiskUrlError = isMedia ? kinopoiskContentUrlError(url) : "";
    if (kinopoiskUrlError) {
      setMetadata({ status: "error", message: kinopoiskUrlError, retryable: false });
      return undefined;
    }
    setMetadata({ status: "waiting", message: "Ссылка принята — через мгновение заполним карточку." });
    autoTimerRef.current = window.setTimeout(() => { recognize(url); }, 600);
    return () => window.clearTimeout(autoTimerRef.current);
  }, [form.url, editing, isPlaces]); // eslint-disable-line react-hooks/exhaustive-deps
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
      const payload = { ...form, price: form.price === "" ? null : Number(form.price), eventDate: form.eventDate || null };
      if (!editing) payload.space = effectiveSpace;
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
  const metadataNotice = metadata.status !== "idle" && <div className={`metadata-status metadata-status--${metadata.status}`} role="status" aria-live="polite"><span className="metadata-status__icon">{["waiting", "loading"].includes(metadata.status) ? <LoaderCircle className="spin" /> : metadata.status === "success" ? <CheckCircle2 /> : <X />}</span><div><strong>{metadata.status === "waiting" ? "Готовим автозаполнение" : metadata.status === "loading" ? (isPlaces ? "Читаем место в Яндекс Картах" : isYouTube ? "Читаем видео на YouTube" : isKinopoisk ? "Загружаем постер Кинопоиска" : isMedia ? "Загружаем обложку" : "Читаем карточку товара") : metadata.status === "success" ? "Готово" : "Не получилось автоматически"}</strong><span>{metadata.message}</span></div>{metadata.status === "error" && metadata.retryable !== false && form.url && <ShadcnButton variant="ghost" type="button" onClick={() => recognize(form.url)}>Повторить</ShadcnButton>}</div>;
  const requestClose = () => {
    if (loading || deleting || imageUploading) return;
    cleanupUploadedImages();
    onClose();
  };
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !listCreatorOpen && !deleteConfirm) requestClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      scheduleDocumentScrollUnlock();
    };
  }, [loading, deleting, imageUploading, listCreatorOpen, deleteConfirm]);
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
        if (deleteConfirm) return;
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
    return <WishDeleteAlert open wish={wish} busy={deleting} onOpenChange={cancelDelete} onConfirm={remove} />;
  }

  const fieldId = (name) => `wish-editor-${name}-${wish?.id || "new"}`;
  return <>
    <section id={fieldId("dialog-content")} data-slot="wish-editor-content" className="wish-editor-screen" role="dialog" aria-modal="true" aria-labelledby={fieldId("dialog-title")} aria-describedby={fieldId("dialog-description")}>
        <ShadcnButton type="button" variant="ghost" className="wish-editor-screen__close" size="icon-sm" onClick={requestClose}>
          <X />
          <span className="sr-only">Закрыть</span>
        </ShadcnButton>
        <form className={`wish-editor mx-auto flex w-full max-w-lg flex-col max-[820px]:max-w-none ${editing ? "wish-editor--edit" : "wish-editor--create"}`} onSubmit={submit}>
          <h2 id={fieldId("dialog-title")} className="sr-only">{editing ? `Редактирование желания «${wish.title}»` : "Создание желания"}</h2>
          <p id={fieldId("dialog-description")} className="sr-only">{editing ? "Обновите информацию, изображение и списки желания." : "Добавьте изображение и заполните основную информацию о желании."}</p>

          <div className="wish-editor-screen__content px-4 max-[820px]:px-0" aria-label="Поля желания">
            <div className="wish-editor__layout m-0 flex h-auto w-full flex-col gap-4 overflow-visible p-0 pr-3 max-[820px]:pr-0">
          <section className="wish-editor__media h-auto w-full gap-2" aria-label="Фотография желания">
            <div
              className={`wish-editor__image aspect-[4/3] h-auto min-h-0 rounded-lg ${formPreviewImageUrl ? "has-image" : "is-empty"} ${imageDropActive ? "is-dragging" : ""}`}
              aria-busy={imageUploading || undefined}
              onDragEnter={(event) => { event.preventDefault(); if (!imageUploading) setImageDropActive(true); }}
              onDragOver={(event) => { event.preventDefault(); if (!imageUploading) setImageDropActive(true); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setImageDropActive(false); }}
              onDrop={(event) => {
                event.preventDefault();
                setImageDropActive(false);
                uploadImage(event.dataTransfer.files?.[0]);
              }}
            >
              {formPreviewImageUrl
                ? <img src={formPreviewImageUrl} alt={`Фото желания «${form.title || wish?.title || "Новое желание"}»`} referrerPolicy="no-referrer" onError={(event) => applyRetailerPreviewFallback(event, form.url)} />
                : <Empty className="wish-editor__image-empty h-full gap-3 rounded-[inherit] border bg-muted/30 p-4 transition-colors max-[380px]:gap-2 max-[380px]:p-3">
                  <EmptyHeader className="gap-1">
                    <EmptyMedia className="mb-1" variant="icon"><Image aria-hidden="true" /></EmptyMedia>
                    <EmptyTitle>{imageUploading ? "Загружаем изображение…" : "Добавить изображение"}</EmptyTitle>
                    <EmptyDescription id={fieldId("image-help")}>JPG, PNG или WEBP · до 8 МБ</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <ShadcnButton
                      type="button"
                      variant="outline"
                      disabled={imageUploading}
                      aria-busy={imageUploading || undefined}
                      aria-describedby={`${fieldId("image-help")}${imageError ? ` ${fieldId("image-error")}` : ""}`}
                      onClick={() => imageFileRef.current?.click()}
                    >
                      {imageUploading ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" aria-hidden="true" />}
                      {imageUploading ? "Загрузка…" : "Выбрать файл"}
                    </ShadcnButton>
                  </EmptyContent>
                </Empty>}
              <Input
                ref={imageFileRef}
                className="sr-only !size-px"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Загрузить фотографию желания"
                aria-invalid={Boolean(imageError) || undefined}
                aria-describedby={`${fieldId("image-help")}${imageError ? ` ${fieldId("image-error")}` : ""}`}
                onChange={(event) => uploadImage(event.target.files?.[0])}
              />
              {formPreviewImageUrl && <ShadcnButton type="button" variant="secondary" className="wish-editor__image-change" disabled={imageUploading} onClick={() => imageFileRef.current?.click()}><Upload /> Сменить фото</ShadcnButton>}
            </div>
            {imageError && <FieldError id={fieldId("image-error")}>{imageError}</FieldError>}
          </section>

          <section className="wish-editor__panel w-full overflow-visible p-0">
            <div className="wish-editor__scroll flex h-auto w-full flex-col gap-4 overflow-visible p-0 [scrollbar-gutter:auto]">
              <Field className="wish-editor__field">
                <FieldLabel htmlFor={fieldId("title")}>Название</FieldLabel>
                <Input id={fieldId("title")} autoFocus={editing} required value={form.title} placeholder="Название желания" onChange={(event) => updateMetadataField("title", event.target.value)} />
              </Field>

              <Field className="wish-editor__field wish-editor__field--link grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto] items-center gap-2">
                <FieldLabel className="col-start-1 row-start-1" htmlFor={fieldId("url")}>{isPlaces ? "Ссылка из Яндекс Карт" : isFood ? "Ссылка на продукт" : "Ссылка"}</FieldLabel>
                <Input className="col-span-2 row-start-2" id={fieldId("url")} autoFocus={!editing} type="url" inputMode="url" value={form.url} placeholder={isPlaces ? "https://yandex.ru/maps/…" : isFood ? "https://lenta.com/product/…" : "https://…"} onChange={(event) => updateMetadataField("url", event.target.value)} />
                <ShadcnButton className="wish-editor__link-action col-start-2 row-start-1 justify-self-end" type="button" variant="ghost" disabled={!form.url.trim() || metadata.status === "loading"} onClick={() => recognize(form.url)}>
                  {metadata.status === "loading" ? <LoaderCircle className="spin" /> : <Sparkles />}
                  <span>{metadata.status === "loading" ? "Заполняем…" : "Заполнить по ссылке"}</span>
                </ShadcnButton>
                {isPlaces && <p className="wish-editor__link-hint col-span-2 row-start-3 m-0 flex items-center gap-1.5"><MapPin size={14} aria-hidden="true" /> Ссылка на место из Яндекс Карт — подставим название и адрес</p>}
                {isMedia && <p className="wish-editor__link-hint col-span-2 row-start-3 m-0 flex items-center gap-1.5"><Clapperboard size={14} aria-hidden="true" /> {isKinopoisk ? "Ссылка на фильм или сериал с Кинопоиска — подставим постер" : isKinopoiskSite ? "Нужна ссылка на карточку фильма или сериала, а не на поиск Кинопоиска" : isYouTube ? "Ссылка на видео с YouTube — подставим название и превью" : "Ссылка на книгу с Bookmate, Альпины или МИФа — подставим название и обложку"}</p>}
                {isFood && <p className="wish-editor__link-hint col-span-2 row-start-3 m-0 flex items-center gap-1.5"><UtensilsCrossed size={14} aria-hidden="true" /> Лента, Яндекс Лавка или Самокат — подставим название, фото и цену для выбранного магазином региона</p>}
              </Field>

              {metadataNotice}

              {effectiveSpace === "products" && <Field className="wish-editor__field">
                <FieldLabel htmlFor={fieldId("fundraisingUrl")}>Ссылка на сбор</FieldLabel>
                <Input id={fieldId("fundraisingUrl")} type="url" inputMode="url" pattern="https?://.*" value={form.fundraisingUrl} placeholder="https://…" onChange={(event) => setForm((current) => ({ ...current, fundraisingUrl: event.target.value }))} />
              </Field>}

              <Field className="wish-editor__field wish-editor__field--description">
                <FieldLabel className="sr-only" htmlFor={fieldId("description")}>Описание желания</FieldLabel>
                <Textarea className="resize-none" id={fieldId("description")} rows={3} value={form.description} placeholder="Опишите желание" onChange={(event) => updateMetadataField("description", event.target.value)} />
              </Field>

              <Field className="wish-editor__field wish-editor__field--price grid grid-cols-[minmax(0,1fr)_84px] grid-rows-[auto_auto] items-center gap-2">
                <FieldLabel className="col-span-2 row-start-1" htmlFor={fieldId("price")}>Цена</FieldLabel>
                <Input className="col-start-1 row-start-2" id={fieldId("price")} type="number" min="0" value={form.price} placeholder="0" onChange={(event) => updateMetadataField("price", event.target.value)} />
                <Select value={form.currency} onValueChange={(currency) => updateMetadataField("currency", currency)}>
                  <SelectTrigger className="wish-editor__currency col-start-2 row-start-2 w-full" aria-label="Валюта">
                    <SelectValue>{(currency) => WISH_CURRENCY_SYMBOLS[currency] || ""}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="end">
                    {WISH_CURRENCIES.map((currency) => <SelectItem value={currency} key={currency} aria-label={`${WISH_CURRENCY_SYMBOLS[currency]} ${currency}`}>{WISH_CURRENCY_SYMBOLS[currency]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>

              {showEventDate && <Field className="wish-editor__field wish-editor__field--date">
                <FieldLabel htmlFor={fieldId("eventDate")}>Дата события</FieldLabel>
                <Input id={fieldId("eventDate")} type="date" value={form.eventDate} onChange={(event) => setForm((current) => ({ ...current, eventDate: event.target.value }))} />
              </Field>}

              <div className="wish-editor__settings flex flex-col gap-2" role="group" aria-label="Настройки желания">
                <Field orientation="horizontal" className="wish-editor__switch-row min-h-12 gap-3 px-0">
                  <EyeOff aria-hidden="true" />
                  <FieldLabel className="min-w-0 flex-1 cursor-pointer font-normal" htmlFor={fieldId("private")}>Секретное желание</FieldLabel>
                  <Switch id={fieldId("private")} checked={form.privacy === "private"} onCheckedChange={(checked) => setForm({ ...form, privacy: checked ? "private" : "inherit" })} />
                </Field>
                <Field orientation="horizontal" className="wish-editor__switch-row min-h-12 gap-3 px-0">
                  <LockKeyhole aria-hidden="true" />
                  <FieldLabel className="min-w-0 flex-1 cursor-pointer font-normal" htmlFor={fieldId("multiple")}>Многократное бронирование</FieldLabel>
                  <Switch id={fieldId("multiple")} checked={form.allowMultiple} onCheckedChange={(checked) => setForm({ ...form, allowMultiple: checked })} />
                </Field>
              </div>

              <fieldset className="wish-editor__lists">
                <legend className="visually-hidden">Списки желания</legend>
                <div className="wish-editor__lists-head">
                  <strong>Списки</strong>
                  <ShadcnButton ref={listCreatorTriggerRef} type="button" variant="ghost" disabled={loading || deleting} onClick={() => { if (!mutationRef.current) setListCreatorOpen(true); }}><ListPlus /> Новый список</ShadcnButton>
                </div>
                {listsLoading ? <LoadingScreen compact /> : <div className="wish-editor__list-rows">
                  {visibleLists.length ? visibleLists.map((list) => {
                    const selected = form.listIds.includes(list.id);
                    const listSwitchId = fieldId(`list-${list.id}`);
                    return <Field orientation="horizontal" className={`wish-editor__list-row min-h-12 gap-3 rounded-lg py-1.5 ${selected ? "is-selected" : ""}`} key={list.id}>
                      <FieldLabel className="wish-editor__list-title min-w-0 flex-1 cursor-pointer" htmlFor={listSwitchId}>{list.title}</FieldLabel>
                      <Switch
                        id={listSwitchId}
                        className="wish-editor__list-switch"
                        checked={selected}
                        onCheckedChange={(checked) => setListSelected(list.id, checked)}
                      />
                    </Field>;
                  }) : <p className="px-2 py-6 text-center text-xs text-muted-foreground">В этом пространстве пока нет списков.</p>}
                </div>}
              </fieldset>
            </div>
          </section>
            </div>
          </div>

          <footer className="wish-editor-screen__footer border-t sm:flex-row">
            {editing && <ShadcnButton ref={deleteTriggerRef} type="button" variant="destructive" className="wish-editor__delete static mr-auto h-12 w-auto rounded-lg px-4" aria-label="Удалить желание" disabled={loading || deleting || imageUploading} onClick={() => { if (!mutationRef.current && !loading && !deleting) setDeleteConfirm(true); }}><Trash2 /> Удалить</ShadcnButton>}
            <ShadcnButton className="wish-editor__submit h-12 px-4" shape="pill" type="submit" disabled={loading || deleting || imageUploading} aria-busy={loading || undefined} aria-label={editing ? "Обновить" : "Загадать желание"}>
              {loading && <Spinner />}{editing ? "Обновить" : "Загадать желание"}
            </ShadcnButton>
          </footer>
        </form>
    </section>
      {listCreatorOpen && <ListModal
        listsCount={data?.lists?.length || 0}
        space={effectiveSpace}
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
                    <Avatar user={person} size="md" aria-hidden="true" />
                    <span className="friend-row__identity">
                      <strong>{person.name}</strong>
                      <small>@{person.username} · {person.wishCount} {person.wishCount === 1 ? "желание" : "желаний"}</small>
                    </span>
                  </Link>
                  {person.isFollowing && person.isFollower && <span className="friend-row__mutual" title="Взаимная подписка" aria-label="Взаимная подписка"><Star fill="currentColor" /></span>}
                  <div className="friend-row__actions">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<ShadcnButton type="button" variant="ghost" size="icon" className="friend-row__more size-12 active:translate-y-0 max-[820px]:size-11" />}
                        aria-label={`Действия для ${person.name}`}
                      ><MoreHorizontal /></DropdownMenuTrigger>
                      <DropdownMenuContent className="friend-row__menu static w-[210px]" align="end" sideOffset={8}>
                        <DropdownMenuItem className="min-h-12 gap-2 px-3" render={<Link to={publicProfilePath(person.username)} />}><CircleUserRound />Открыть профиль</DropdownMenuItem>
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
              {section !== "search" && <Link to="/app/friends/search" className={buttonVariants({ className: "h-12" })}>Найти друзей</Link>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ProfileSettingsModal({ user, onClose, onSaved, finalFocus }) {
  const isMobile = useIsMobile();
  const location = useLocation();
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
  const [yandexEnabled, setYandexEnabled] = useState(false);
  const contentRef = useRef(null);
  const imageFileRef = useRef(null);
  const uploadedImageIdsRef = useRef(new Set());
  const changed = Object.keys(initialForm).some((key) => form[key] !== initialForm[key]);
  const yandexLinkNext = safeNextPath(`${location.pathname}${location.search}`);
  const yandexLinkHref = yandexAuthStartPath(yandexLinkNext, { link: true });
  const yandexLinkBlocked = changed || loading || imageUploading || loggingOut;
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
  useEffect(() => {
    let active = true;
    api.get("/auth/yandex/config")
      .then((config) => { if (active) setYandexEnabled(Boolean(config.enabled)); })
      .catch(() => { if (active) setYandexEnabled(false); });
    return () => { active = false; };
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
  return <Drawer open showSwipeHandle swipeDirection={isMobile ? "down" : "right"} onOpenChange={(open) => { if (!open) close(); }}>
    <DrawerContent
      ref={contentRef}
      className="profile-settings-dialog"
      initialFocus={() => window.innerWidth <= 820 ? true : contentRef.current?.querySelector("#settings-profile-name") || true}
      finalFocus={finalFocus}
    >
      <DrawerClose
        render={<ShadcnButton variant="ghost" className="absolute top-2 right-2 z-10 size-12" size="icon-sm" />}
      >
        <X />
        <span className="sr-only">Закрыть</span>
      </DrawerClose>
      <DrawerHeader className="mx-auto h-14 w-full max-w-md p-0">
        <DrawerTitle className="sr-only">Изменить профиль</DrawerTitle>
        <DrawerDescription className="sr-only">Редактирование данных профиля.</DrawerDescription>
      </DrawerHeader>
      <ScrollArea className="mx-auto min-h-0 w-full max-w-md flex-1">
        <form id="profile-editor-form" className="flex flex-col gap-4 px-4 pt-4 pb-1" onSubmit={submit}>
          <Card className="flex flex-row items-center gap-3 p-3">
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
            <div className="grid gap-4">
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
          {(yandexEnabled || user.hasYandex) && (
            <Card className="grid gap-3 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <strong className="block text-sm font-medium">Yandex ID</strong>
                  <p className="text-sm text-muted-foreground">{user.hasYandex ? "Подключён к аккаунту — можно входить без пароля." : "Подключите быстрый и безопасный вход через Яндекс."}</p>
                </div>
                {user.hasYandex && <Badge variant="secondary">Подключён</Badge>}
              </div>
              {!user.hasYandex && yandexEnabled && (yandexLinkBlocked
                ? <p className="text-sm text-muted-foreground">Сохраните или отмените изменения профиля перед подключением.</p>
                : <YandexIdButton href={yandexLinkHref} accessibleName="Войти с Яндекс ID и подключить его к аккаунту" />)}
            </Card>
          )}
          <div className="border-t pt-4">
            <ShadcnButton
              type="button"
              variant="destructive"
              className="h-12 gap-2 px-4"
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
      <DrawerFooter className="mx-auto mt-0 mb-0 w-full max-w-md rounded-none border-0 bg-transparent px-4 sm:flex-row">
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
      </DrawerFooter>
    </DrawerContent>
  </Drawer>;
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
  const [selectedSpace, setSelectedSpace] = useState("products");
  const [selectedWishId, setSelectedWishId] = useState(params.wishId || null);
  const [editingWishId, setEditingWishId] = useState(null);
  const [listModal, setListModal] = useState(null);
  const [wishModalOpen, setWishModalOpen] = useState(false);
  const [wishModalSpace, setWishModalSpace] = useState("products");
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
        action={<Link to={returnPath} className={buttonVariants()}>{returnLabel}</Link>}
      />
    </div>;
    if (user) return <AppShell friendsContext={friendsContext} collectionChrome>{page}</AppShell>;
    return <div className="app-layout app-layout--dark public-collection-shell"><main className="app-main app-main--with-profile app-main--wishes">{page}</main></div>;
  };

  if (loading || sessionLoading) return <LoadingScreen />;
  if (error && !data) return renderCollectionState({ title: "Такой список не нашёлся", text: error.message });

  const lists = shared ? [data.list] : data.lists;
  const visibleWishes = data.isOwner
    ? data.wishes
    : data.wishes.filter((wish) => wish.status === "active");
  const routeList = lists.find((list) => list.id === selected);
  const selectedList = routeList && !isGeneralList(routeList) ? routeList : null;
  const selectedValue = selectedList?.id || "all";
  const activeSpace = selectedList ? listSpace(selectedList) : selectedSpace;
  const navigationLists = shared ? lists : lists.filter((list) => !isGeneralList(list) && listSpace(list) === activeSpace);
  const listsById = new Map(lists.map((list) => [list.id, list]));
  const spaceWishes = shared ? visibleWishes : visibleWishes.filter((wish) => wishBelongsToSpace(wish, listsById, activeSpace));
  const wishes = shared
    ? visibleWishes
    : selectedValue === "all"
      ? spaceWishes
      : spaceWishes.filter((wish) => wish.listIds.includes(selectedValue));
  const selectedWish = selectedWishId ? visibleWishes.find((wish) => wish.id === selectedWishId) : null;
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
  const wishCountForList = (listId) => visibleWishes.filter((wish) => wish.listIds.includes(listId)).length;
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

  const selectSpace = (space) => {
    setSelectedSpace(space);
    selectCollection("all");
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
      <Link to="/app/friends/subscriptions" className="wishes-page__friend-link"><Users aria-hidden="true" />Подписки</Link>
      <Link to="/app/friends/followers" className="wishes-page__friend-link"><CircleUserRound aria-hidden="true" />Подписчики</Link>
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
      {!shared && <SpaceSwitcher value={activeSpace} onChange={selectSpace} />}
      <ShadcnButton className="wishes-page__topbar-share !size-12 rounded-full" variant="outline" size="icon" type="button" aria-label="Поделиться" title="Поделиться" onClick={share}><Share2 aria-hidden="true" /></ShadcnButton>
    </header>

    <section className={`wishes-page__hero public-collection-page__hero ${profileVisitor ? "friend-profile-page__hero" : ""}`} data-friend-profile={profileVisitor && !shared ? "" : undefined} aria-labelledby="public-profile-name">
      {identity}
      {relationshipBlock}
      <div className={`page-actions wishes-page__hero-actions ${profileVisitor ? "friend-profile-page__actions" : ""}`} role="group" aria-label={data.isOwner ? "Действия со списком желаний" : "Действия с профилем"}>
        {ownerCollection ? <>
          {selectedList && <Button className="h-12 px-5 text-base max-[560px]:flex-1" variant="outline" shape="pill" onClick={() => setListModal(selectedList)}>Настройки списка</Button>}
          <Button className="h-12 min-w-[180px] px-6 text-base max-[560px]:min-w-0" shape="pill" onClick={() => { setWishModalSpace(activeSpace); setWishModalOpen(true); }}>Добавить</Button>
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

    {(shared || navigationLists.length > 0) && <div className={`list-tabs public-collection-tabs ${profileVisitor ? "friend-profile-tabs" : ""}`} aria-label="Списки желаний">
      <div className="list-tabs__track">
        <ToggleGroup className="contents" value={[selectedValue]} onValueChange={(values) => { if (values[0]) selectCollection(values[0]); }} aria-label="Списки желаний">
          <ToggleGroupItem style={LIST_TILE_STYLE} value="all" aria-label={listTileAccessibleName(shared ? data.list.title : ownerCollection ? "Мои желания" : "Все желания", spaceWishes.length)}><ListTileContent title={shared ? data.list.title : ownerCollection ? "Мои желания" : "Все желания"} count={spaceWishes.length} /></ToggleGroupItem>
          {!shared && navigationLists.map((list) => <ToggleGroupItem style={LIST_TILE_STYLE} value={list.id} key={list.id} aria-label={listTileAccessibleName(list.title, wishCountForList(list.id), ownerCollection && list.privacy === "private")}><ListTileContent title={list.title} count={wishCountForList(list.id)} privateList={ownerCollection && list.privacy === "private"} /></ToggleGroupItem>)}
        </ToggleGroup>
        {ownerCollection && <ShadcnButton variant="ghost" size="icon" className="list-tabs__add" aria-label="Новый список" title="Новый список" onClick={() => setListModal({})}><Plus size={16} /><span className="visually-hidden">Новый список</span></ShadcnButton>}
      </div>
    </div>}

    {wishes.length
      ? <><div className="wish-grid">{wishes.slice(0, visibleLimit).map((wish) => <WishCard key={wish.id} wish={wish} owner={data.isOwner} profile={data.profile} lists={lists} shareToken={shared ? params.token : ""} onChanged={() => reload({ background: true })} onOpen={(opener) => openWish(wish.id, opener)} onEdit={ownerCollection ? () => editWish(wish.id) : undefined} onCreateList={ownerCollection ? () => setListModal({ attachWishId: wish.id }) : undefined} />)}</div>{visibleLimit < wishes.length && <div className="wish-load-more" ref={loadMoreRef}><LoaderCircle className="spin" /><span>Загружаем ещё желания…</span></div>}</>
      : <EmptyState icon={Heart} title="В этом списке пока пусто" text={ownerCollection ? "Добавьте то, что действительно порадует." : "Загляните чуть позже — новая мечта наверняка появится."} />}
    {selectedWish && <WishDetailsModal wish={selectedWish} owner={data.isOwner} profile={data.profile} lists={lists} wishes={data.wishes} shareToken={shared ? params.token : ""} onChanged={() => reload({ background: true })} onEdit={ownerCollection ? () => editWish(selectedWish.id) : undefined} onCreateList={ownerCollection ? () => createListForWish(selectedWish.id) : undefined} onClose={closeWish} />}
    {editingWish && <WishModal wish={editingWish} space={activeSpace} onClose={() => setEditingWishId(null)} onSaved={async () => { setEditingWishId(null); await reload(); }} onDeleted={async () => { setEditingWishId(null); await reload(); }} />}
    {listModal && <ListModal list={listModal.id ? listModal : null} listsCount={lists.length} space={activeSpace} onClose={() => setListModal(null)} onSaved={saveProfileList} onDeleted={async () => { setListModal(null); selectCollection("all"); await reload(); }} />}
    {wishModalOpen && <WishModal space={wishModalSpace} onClose={() => setWishModalOpen(false)} onSaved={() => { setWishModalOpen(false); reload(); }} />}
  </div>;

  if (user) return <AppShell friendsContext={!data.isOwner && !shared} collectionChrome>{collectionPage}</AppShell>;
  return <div className="app-layout app-layout--dark public-collection-shell"><main className="app-main app-main--with-profile app-main--wishes">{collectionPage}</main></div>;
}

function NotFound() { return <div className="not-found"><Logo /><Gift /><h1>Похоже, эта мечта потерялась</h1><p>Страница не существует или ссылка устарела.</p><Link to={APP_HOME} className={buttonVariants()}>В приложение</Link></div>; }

function LegacyProfileRedirect() {
  const params = useParams();
  const location = useLocation();
  const suffix = String(params["*"] || "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const target = `${publicProfilePath(params.username)}${suffix ? `/${suffix}` : ""}${location.search}${location.hash}`;
  return <Navigate to={target} replace />;
}

export default function App() { return <ToastProvider><SessionProvider><ProfileEditorProvider><Routes><Route path="/" element={<RootRoute />} /><Route path="/login" element={<AuthPage mode="login" />} /><Route path="/register" element={<AuthPage mode="register" />} /><Route path="/forgot-password" element={<ForgotPasswordPage />} /><Route path="/reset-password" element={<ResetPasswordPage />} /><Route path="/ideas" element={<Navigate to={APP_HOME} replace />} /><Route path="/s/:token" element={<PublicProfile shared />} /><Route path="/s/:token/wishes/:wishId" element={<PublicProfile shared />} /><Route path="/app/*" element={<ProtectedApp />} /><Route path="/u/:username/*" element={<LegacyProfileRedirect />} /><Route path="/users/:username/*" element={<LegacyProfileRedirect />} /><Route path="/:username" element={<PublicProfile />} /><Route path="/:username/lists/:listId" element={<PublicProfile />} /><Route path="/:username/wishes/:wishId" element={<PublicProfile />} /><Route path="*" element={<NotFound />} /></Routes></ProfileEditorProvider></SessionProvider></ToastProvider>; }
