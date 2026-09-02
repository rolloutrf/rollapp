import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Archive, ArrowLeft, ArrowRight, BriefcaseBusiness, Building2, CalendarDays, Car, Check, CheckCircle2, ChevronDown,
  CircleUserRound, Clapperboard, ContactRound, ExternalLink, Eye, EyeOff, Fingerprint, FolderInput, Gift, GraduationCap, GripVertical, Hand, Heart, HeartPulse, Image, Link2, ListPlus,
  LayoutGrid, LoaderCircle, LockKeyhole, LogOut, Mail, MapPin, MoreHorizontal, NotebookText, PackageCheck, Pencil, Phone, Plus,
  Quote, RotateCcw, Search, Send, Share2, ShoppingBag, Sparkles, Star, Trash2, Upload, UserPlus,
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
import { AboutMe } from "@/components/about-me";
import { Badge } from "@/components/ui/badge";
import { Button as ShadcnButton, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CoachingSessions } from "@/components/coaching-sessions";
import { Conferences } from "@/components/conferences";
import { Courses } from "@/components/courses";
import { DevelopmentPlan } from "@/components/development-plan";
import { Domain } from "@/components/domain";
import { CvResume } from "@/components/cv-resume";
import { FourQuestions } from "@/components/four-questions";
import { GallupProfile } from "@/components/gallup-profile";
import {
  IdentityReportControls, IdentityReportEmpty,
  IdentityReportStatus, useIdentityReport,
} from "@/components/identity-report-manager";
import { EditableLifeStrategy } from "@/components/editable-life-strategy";
import { LabResults } from "@/components/lab-results";
import { Medications } from "@/components/medications";
import { Mission } from "@/components/mission";
import { MarketplaceOffers } from "@/components/marketplace-offers";
import { PerformanceReview } from "@/components/performance-review";
import { Theses } from "@/components/theses";
import { Values } from "@/components/values";
import { Workouts } from "@/components/workouts";
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
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { safeNextPath, yandexAuthErrorDetails, yandexAuthStartPath } from "./lib/auth.js";
import {
  isGeneralList, listDisplayTitle, resolveVisibleListSelection, shouldShowListNavigation,
  shouldShowUnsortedList, UNSORTED_LIST_TITLE,
} from "./lib/list-navigation.js";
import { canAccessPrivateSpheres, serviceSwitcherItemsForUser } from "./lib/service-navigation.js";
import { SphereSharingProvider, sphereScopeFromLocation, useSphereSharing } from "./lib/sphere-sharing.jsx";
import { SPHERE_SECTIONS, SPHERE_SECTION_LABELS, sphereSectionPath } from "../shared/sphere-sharing.js";
import { disbandWishGroupFromDashboard, filterWishGroups, moveWishGroupInDashboard } from "./lib/wish-groups.js";
import { filterWishesWithoutList, initialWishListIds } from "./lib/wish-lists.js";
import { GROUP_INTENT_DELAY_MS } from "./lib/card-order.js";
import {
  moveWishToTargetPosition,
  moveWishWithinSubset,
  reorderScopeWishIds,
  resolveWishHoverMode,
  wishRectOverlapRatio,
} from "./lib/wish-order.js";
import {
  isKinopoiskHost,
  isKinopoiskUrl,
  kinopoiskContentUrlError,
  wishPreviewImageUrl,
} from "../shared/kinopoisk.js";
import { retailerPreview, retailerPreviewImageUrl } from "../shared/retailer-previews.js";
import { isVideoUrl, isVkVideoUrl, isYouTubeUrl } from "../shared/video-links.js";
import { requestRetailerBrowserMetadata } from "./lib/retailer-browser-import.js";
import { initializeTelegramWebApp } from "./telegram.js";

const SessionContext = createContext(null);
const ToastContext = createContext(null);
const ProfileEditorContext = createContext(null);
const previewBackfillRequests = new Map();
const APP_HOME = "/app/wishes";

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
const uploadedImageIdFromUrl = (value = "") => /^\/api\/media\/([0-9a-f-]{36})$/i.exec(value)?.[1] || "";
const wishFormFrom = (wish, initialListId = "") => ({
  title: wish?.title || "",
  description: wish?.description || "",
  url: wish?.url || "",
  fundraisingUrl: wish?.fundraisingUrl || "",
  vehicleMake: wish?.vehicleMake || "",
  vehicleModel: wish?.vehicleModel || "",
  imageUrl: wish?.imageUrl || "",
  price: wish?.price == null ? "" : String(wish.price),
  currency: WISH_CURRENCIES.includes(wish?.currency) ? wish.currency : "RUB",
  priority: wish?.priority || 2,
  privacy: wish?.privacy || "inherit",
  allowMultiple: Boolean(wish?.allowMultiple),
  listIds: initialWishListIds(wish, initialListId),
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
const wishCountNoun = (count) => {
  const absolute = Math.abs(Number(count) || 0);
  const lastTwo = absolute % 100;
  const last = absolute % 10;
  if (last === 1 && lastTwo !== 11) return "желание";
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return "желания";
  return "желаний";
};
const participantCountLabel = (count) => {
  const absolute = Math.abs(Number(count) || 0);
  const lastTwo = absolute % 100;
  const last = absolute % 10;
  if (last === 1 && lastTwo !== 11) return `${absolute} участник`;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${absolute} участника`;
  return `${absolute} участников`;
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
const placeSnippetAddress = (description = "") => String(description)
  .split(/\s+[•·]\s+/u, 1)[0]
  .trim();

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
  const appSizeClass = { sm: "!size-9", md: "!size-12", lg: "!size-[var(--avatar-lg-size)]", xl: "!size-[var(--avatar-xl-size)]" }[size] || "";
  return (
    <ShadcnAvatar size={shadcnSize} className={`avatar avatar--${size} ${appSizeClass} ${className}`} {...props}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
      <AvatarFallback className="avatar--fallback">{initials(user?.name)}</AvatarFallback>
    </ShadcnAvatar>
  );
}

const SPHERE_SERVICES = [
  { id: "identity", label: "Идентичность", path: "/app/spheres/identity", icon: Fingerprint, color: "#5967f2" },
  { id: "career", label: "Карьера", path: "/app/spheres/career", icon: BriefcaseBusiness, color: "#ff7557" },
  { id: "education", label: "Образование", path: "/app/spheres/education", icon: GraduationCap, color: "#f3c64e" },
  { id: "health", label: "Здоровье", path: "/app/spheres/health", icon: HeartPulse, color: "#43bd83" },
  { id: "contacts", label: "Контакты", path: "/app/spheres/contacts", icon: ContactRound, color: "#9b72e8" },
];

const SERVICE_SWITCHER_ITEMS = [
  { id: "wishlist", label: "Вишлист", path: APP_HOME, icon: Gift, color: "#f05f4f" },
  ...SPHERE_SERVICES,
];

function activeServiceFromPath(pathname) {
  if (pathname.startsWith("/app/business")) return "business-access";
  if (pathname.startsWith("/app/wishes")) return "wishlist";
  if (pathname.startsWith("/s/")) return "wishlist";
  if (pathname.startsWith("/app/friends")) return "contacts";
  const sphereId = pathname.match(/^\/app\/spheres\/([^/]+)/)?.[1];
  if (SPHERE_SERVICES.some((sphere) => sphere.id === sphereId)) return sphereId;
  const reserved = ["/", "/login", "/register", "/forgot-password", "/reset-password", "/ideas"];
  if (!reserved.includes(pathname) && !pathname.startsWith("/app/")) return "wishlist";
  return null;
}

function SphereSwitcher() {
  const location = useLocation();
  const { pathname } = location;
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [incomingShares, setIncomingShares] = useState([]);
  const activeService = activeServiceFromPath(pathname);
  const sharedOwner = new URLSearchParams(location.search).get("owner");
  const visibleServices = [
    ...serviceSwitcherItemsForUser(SERVICE_SWITCHER_ITEMS, user),
    ...(user?.accountType === "business"
      ? [{ id: "business-access", label: "Клиенты", path: "/app/business/access", icon: Building2, color: "#8b7cf6" }]
      : []),
  ];
  useEffect(() => {
    if (!user) {
      setIncomingShares([]);
      return undefined;
    }
    let current = true;
    api.get("/sphere-shares/incoming").then(({ shares }) => {
      if (current) setIncomingShares(shares || []);
    }).catch(() => {
      if (current) setIncomingShares([]);
    });
    return () => { current = false; };
  }, [user?.id, open]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<ShadcnButton className="sphere-switcher__trigger !size-12 rounded-full" variant="outline" size="icon" type="button" />}
        aria-label="Открыть переключатель сфер"
        title="Сферы"
      >
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" focusable="false">
          <rect x="3.25" y="3.25" width="6.5" height="6.5" rx="2.25" />
          <rect x="14.25" y="3.25" width="6.5" height="6.5" rx="2.25" />
          <rect x="3.25" y="14.25" width="6.5" height="6.5" rx="2.25" />
          <rect x="14.25" y="14.25" width="6.5" height="6.5" rx="2.25" />
        </svg>
      </PopoverTrigger>
      <PopoverContent
        className="sphere-switcher__panel !w-[min(28rem,calc(100vw-2rem))] !gap-3 !rounded-3xl !p-4 max-[560px]:!rounded-2xl"
        align="start"
        sideOffset={10}
      >
        <PopoverHeader className="sphere-switcher__header">
          <PopoverTitle className="sphere-switcher__title">Сферы</PopoverTitle>
          <PopoverDescription>Выберите раздел Rollapp</PopoverDescription>
        </PopoverHeader>
        <nav className="sphere-switcher__grid" aria-label="Сервисы и сферы Rollapp">
          {visibleServices.map(({ id, label, path, icon: Icon }) => {
            const active = id === activeService && !sharedOwner;
            return (
              <Link
                key={id}
                to={path}
                className={buttonVariants({
                  variant: active ? "secondary" : "ghost",
                  className: "sphere-switcher__item !h-auto !min-h-20 !whitespace-normal !rounded-xl !px-1 !py-1",
                })}
                data-active={active ? "true" : undefined}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <span className="sphere-switcher__icon">
                  <Icon aria-hidden="true" />
                </span>
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        {incomingShares.length > 0 && <>
          <div className="sphere-switcher__shared-heading">
            <strong>Доступно мне</strong>
            <span>Разделы других людей</span>
          </div>
          <nav className="sphere-switcher__grid sphere-switcher__grid--shared" aria-label="Разделы, доступные для чтения">
            {incomingShares.map((share) => {
              const path = sphereSectionPath({ ownerUsername: share.owner.username, sphere: share.sphere, section: share.section });
              const active = `${location.pathname}${location.search}` === path;
              return (
                <Link
                  key={`${share.owner.id}:${share.sphere}:${share.section}`}
                  to={path}
                  className={buttonVariants({
                    variant: active ? "secondary" : "ghost",
                    className: "sphere-switcher__item sphere-switcher__shared-item !h-auto !min-h-32 !whitespace-normal !rounded-xl !px-2 !py-3",
                  })}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <Avatar user={share.owner} size="sm" className="!size-12" />
                  <span>{SPHERE_SECTION_LABELS[share.section] || share.section}</span>
                  <small>{share.owner.name}</small>
                </Link>
              );
            })}
          </nav>
        </>}
      </PopoverContent>
    </Popover>
  );
}

function AppBrand() {
  return <div className="app-brand"><Logo className="app-shell-logo" /><SphereSwitcher /></div>;
}

function useGlobalShareHandler() {
  const handlerRef = useRef(null);
  useEffect(() => {
    const handleShare = (event) => {
      if (!handlerRef.current) return;
      event.detail.handled = true;
      void handlerRef.current();
    };
    window.addEventListener("rollapp:share-request", handleShare);
    return () => window.removeEventListener("rollapp:share-request", handleShare);
  }, []);
  return handlerRef;
}

function GlobalAppChrome() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useSession();
  const requestedService = serviceChromeFromPath(location.pathname);
  const sharedOwner = new URLSearchParams(location.search).get("owner");
  const service = requestedService?.id === "wishlist" || canAccessPrivateSpheres(user) || sharedOwner
    ? requestedService
    : null;
  const requestedTab = new URLSearchParams(location.search).get("tab");
  const serviceOptions = service?.tabs || [];
  const options = sharedOwner
    ? serviceOptions.filter((option) => option.id === requestedTab || (!requestedTab && option === serviceOptions[0]))
    : serviceOptions;
  const current = options.find((option) => option.id === requestedTab) || options[0] || null;
  const selectTab = (tabId) => {
    if (!tabId || tabId === current?.id) return;
    const search = new URLSearchParams(location.search);
    search.set("tab", tabId);
    navigate({ pathname: location.pathname, search: `?${search.toString()}`, hash: location.hash }, { replace: true });
  };
  const share = async () => {
    const detail = { handled: false };
    window.dispatchEvent(new CustomEvent("rollapp:share-request", { detail }));
    if (detail.handled) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("Ссылка скопирована");
    } catch {
      toast("Не удалось скопировать ссылку", "error");
    }
  };
  return (
    <header className="global-app-chrome" aria-label="Панель приложения">
      <AppBrand />
      {current && (
        <Select value={current.id} onValueChange={selectTab}>
          <SelectTrigger className="space-select global-service-select" aria-label={`Раздел сервиса ${service.label}`} title={`Разделы: ${service.label}`}>
            <SelectValue>{(selected) => {
              const option = options.find((item) => item.id === selected) || current;
              const Icon = option.icon || service.icon;
              return <>{Icon && <Icon aria-hidden="true" />}<span className="space-select__label">{option.label}</span></>;
            }}</SelectValue>
          </SelectTrigger>
          <SelectContent className="space-select__content global-service-select__content w-max min-w-(--anchor-width) max-w-(--available-width)" alignItemWithTrigger={false}>
            {options.map((option) => {
              const Icon = option.icon || service.icon;
              return <SelectItem key={option.id} value={option.id}>{Icon && <Icon aria-hidden="true" />}<span>{option.label}</span></SelectItem>;
            })}
          </SelectContent>
        </Select>
      )}
      {service && <ShadcnButton className="global-app-chrome__share !size-12 rounded-full" variant="outline" size="icon" type="button" aria-label="Поделиться" title="Поделиться" onClick={share}><Share2 aria-hidden="true" /></ShadcnButton>}
    </header>
  );
}

function AppBrandSpacer() {
  return <span className="app-brand-spacer" aria-hidden="true" />;
}

const IDENTITY_TABS = [
  {
    id: "four-questions",
    label: "4 вопроса",
    description: "Каков этот мир, кто я, каково моё место и чего я хочу.",
  },
  {
    id: "values",
    label: "Ценности",
    description: "Личные принципы и критерии, на которые вы опираетесь в решениях.",
    layout: "full-width",
  },
  {
    id: "gallup",
    label: "Gallup",
    description: "Результаты и заметки по вашим сильным сторонам CliftonStrengths.",
  },
  {
    id: "hogan",
    label: "Hogan",
    description: "Результаты оценки личности, возможных рисков и внутренних ценностей.",
  },
  {
    id: "mission",
    label: "Миссия",
    description: "Формулировка личной миссии и ориентиров для принятия решений.",
  },
  {
    id: "life-strategy",
    label: "Жизненная стратегия",
    description: "Цели, приоритеты и план движения по ключевым жизненным горизонтам.",
  },
  {
    id: "theses",
    label: "Тезисы",
    description: "Ключевые мысли, гипотезы и формулировки, к которым важно возвращаться.",
  },
];

const CAREER_TABS = [
  {
    id: "about",
    label: "О себе",
    description: "Профессиональный профиль, принципы работы и взгляд на финтех-продукты.",
  },
  {
    id: "domain",
    label: "Домен",
    description: "Профессиональная область, её границы, ключевые игроки и направления влияния.",
  },
  {
    id: "cv",
    label: "CV",
    description: "Опыт, достижения и актуальная версия профессионального резюме.",
  },
  {
    id: "performance",
    label: "Перфоманс",
    description: "Цели, результаты и обратная связь по вашей текущей профессиональной роли.",
    layout: "full-width",
  },
  {
    id: "development-plan",
    label: "ИПР",
    description: "Индивидуальный план развития: навыки, действия и контрольные точки.",
  },
];

const EDUCATION_TABS = [
  {
    id: "courses",
    label: "Курсы",
    description: "Пройденные и запланированные программы обучения, материалы и результаты.",
  },
  {
    id: "conferences",
    label: "Конференции",
    description: "Профессиональные конференции, выступления и полезные контакты с мероприятий.",
  },
  {
    id: "coaching",
    label: "Коучинг",
    description: "Цели, сессии и договорённости в рамках индивидуальной работы с коучем.",
  },
];

const HEALTH_TABS = [
  {
    id: "lab-results",
    label: "Анализы",
    description: "Результаты обследований, динамика показателей и рекомендации специалистов.",
  },
  {
    id: "sport",
    label: "Спорт",
    description: "Тренировочные планы, активность, достижения и восстановление.",
  },
  {
    id: "medications",
    label: "Препараты",
    description: "Назначенные препараты, схемы приёма и важные напоминания.",
  },
];

const CONTACT_TABS = [
  { id: "contacts", label: "Контакты", icon: ContactRound },
];

const SERVICE_TABS = {
  wishlist: SPACES,
  identity: IDENTITY_TABS,
  career: CAREER_TABS,
  education: EDUCATION_TABS,
  health: HEALTH_TABS,
  contacts: CONTACT_TABS,
};

const HOGAN_PROFILES = [
  {
    id: "hpi",
    code: "HPI",
    title: "Сильные стороны",
    description: "Повседневный рабочий стиль и то, какое первое впечатление вы создаёте.",
    scores: [
      ["Адаптация", 5, "Спокойствие, стабильность и устойчивость настроения."],
      ["Амбициозность", 84, "Инициатива, лидерство, стремление к статусу и достижениям."],
      ["Общительность", 2, "Социальная уверенность, заметность и потребность во внимании."],
      ["Межличностная восприимчивость", 1, "Такт, дипломатичность и ориентация на длительные отношения."],
      ["Организованность", 10, "Самоконтроль, ответственность и следование правилам и процедурам."],
      ["Любознательность", 16, "Открытость идеям, воображение и способность видеть перспективу."],
      ["Подход к обучению", 4, "Интерес к формальному обучению и удовольствие от получения новых знаний."],
    ],
  },
  {
    id: "mvpi",
    code: "MVPI",
    title: "Ценности и мотиваторы",
    description: "Что придаёт работе смысл, поддерживает вовлечённость и влияет на решения.",
    scores: [
      ["Признание", 57, "Желание быть заметным, получать внимание и признание."],
      ["Власть", 89, "Конкуренция, успех, влияние и возможность добиваться результата."],
      ["Жажда наслаждений", 1, "Разнообразие, развлечения и удовольствие как часть рабочей среды."],
      ["Альтруизм", 1, "Стремление помогать, заботиться и улучшать жизнь других."],
      ["Причастность", 2, "Потребность в частом социальном контакте и совместной деятельности."],
      ["Традиционализм", 97, "Опора на консервативные ценности, правила и проверенные принципы."],
      ["Безопасность", 59, "Стабильность, порядок, предсказуемость и понятная система."],
      ["Коммерция", 81, "Прибыль, финансовый результат и деловая эффективность."],
      ["Эстетика", 2, "Творческое самовыражение, дизайн и качество визуальной среды."],
      ["Научный подход", 20, "Новые идеи, технологии, данные и аналитическое решение проблем."],
    ],
  },
  {
    id: "hds",
    code: "HDS",
    title: "Риски под нагрузкой",
    description: "Поведенческие тенденции, которые могут усиливаться в стрессе или неопределённости.",
    scores: [
      ["Эмоциональный", 97, "Сильный первоначальный энтузиазм, который может сменяться разочарованием."],
      ["Скептичный", 90, "Проницательность и настороженность, иногда переходящие в цинизм и чувствительность к критике."],
      ["Осторожный", 29, "Опасение критики и ошибок, способное замедлять решения."],
      ["Сам в себе", 98, "Сдержанность и дистанция, из-за которых интерес к чувствам других может быть незаметен."],
      ["Сам по себе", 95, "Независимость, раздражение на давление и склонность игнорировать настойчивые просьбы."],
      ["Самоуверенный", 91, "Очень высокая уверенность в собственной компетентности и значимости."],
      ["Увлекающийся", 51, "Обаяние, смелость и готовность рисковать, иногда с элементом манипулятивности."],
      ["Театральный", 26, "Драматичность, демонстративность и стремление быть в центре внимания."],
      ["С богатым воображением", 55, "Необычные идеи и нестандартные способы мыслить и действовать."],
      ["Прилежный", 89, "Перфекционизм, высокие стандарты, педантичность и требовательность."],
      ["Исполненный сознания долга", 20, "Стремление угодить авторитету и трудность действовать независимо."],
    ],
  },
];

const HOGAN_REPORT_STATS = [
  {
    value: "3",
    label: "опросника",
    detail: "HPI · MVPI · HDS",
  },
  {
    value: "28",
    label: "шкал",
    detail: "в едином профиле",
  },
];

const HOGAN_METHODS = [
  {
    code: "HPI",
    title: "Повседневная репутация",
    text: "Описывает сильные стороны, рабочее поведение и первое впечатление, которое обычно складывается у окружающих.",
  },
  {
    code: "MVPI",
    title: "Внутренние мотиваторы",
    text: "Показывает ключевые ценности, предпочтительную среду и то, что поддерживает интерес к работе и решениям.",
  },
  {
    code: "HDS",
    title: "Поведение под нагрузкой",
    text: "Отражает тенденции, которые могут становиться заметнее при стрессе, усталости и неопределённости.",
  },
];

const HOGAN_REPORT_USES = [
  "Оценить, как рабочий стиль влияет на отношения с коллегами и клиентами.",
  "Проверить, насколько ценности человека совпадают с культурой организации и роли.",
  "Распознать привычные реакции, которые под давлением могут мешать результату.",
];

const HOGAN_CHANGE_STEPS = [
  ["Что", "Какое конкретное поведение нужно изменить?"],
  ["Готовность", "Готовы ли вы взять ответственность за изменение?"],
  ["Как", "Какой новый способ действий вы будете практиковать?"],
];

const HOGAN_NARRATIVE_SECTIONS = [
  {
    id: "strengths",
    code: "HPI",
    eyebrow: "Повседневный стиль",
    title: "Сильные стороны",
    lead: "Высокая самостоятельность и ориентация на результат сочетаются с прямым, сдержанным стилем общения и предпочтением практических решений.",
    themes: [
      {
        title: "Обратная связь и стремления",
        points: [
          "Энергичный, трудолюбивый и амбициозный стиль: важно достигать результата, брать инициативу, руководить людьми и проектами.",
          "Лучше всего потенциал раскрывается там, где можно влиять на итог, принимать решения и работать достаточно самостоятельно.",
          "В новом окружении впечатление скорее вежливое, но формальное: комфортнее короткая деловая коммуникация, самостоятельная работа и личное пространство.",
        ],
      },
      {
        title: "Межличностные качества",
        points: [
          "Независимость и уверенность помогают не избегать конфликта, поднимать сложные вопросы и работать с неэффективностью.",
          "Есть готовность занимать непопулярную позицию, устанавливать правила и требовать выполнения обязательств.",
          "Гибкость и спонтанность позволяют быстро менять направление, вести несколько задач и спокойно относиться к прерываниям.",
          "Нестандартные процедуры и разумный риск особенно уместны в динамичной среде, хотя прямота может восприниматься как жёсткость.",
        ],
      },
      {
        title: "Работа и обучение",
        points: [
          "Открытость к обратной связи сочетается с самокритичностью, вниманием к ошибкам и настойчивостью в защите профессиональной репутации.",
          "В решениях преобладает практичность: абстрактные теории и разнообразие ради разнообразия мотивируют слабее, чем прикладная польза.",
          "Формальное обучение не является самоцелью; эффективнее практические форматы, реальная задача и немедленное применение знаний.",
        ],
      },
    ],
  },
  {
    id: "motives",
    code: "MVPI",
    eyebrow: "Рабочая среда",
    title: "Ценности и мотиваторы",
    lead: "Главные источники энергии — достижение, влияние, коммерческий результат и работа в понятной системе правил.",
    themes: [
      {
        title: "Статус и достижения",
        points: [
          "Деловой результат ставится выше церемоний: особенно раздражает пустая трата времени и денег.",
          "Карьерное продвижение и реализация потенциала важны; собственная эффективность оценивается через достигнутые результаты.",
          "Нет потребности постоянно демонстрировать успех, но содержательное признание и похвала воспринимаются положительно.",
        ],
      },
      {
        title: "Социальная среда и правила",
        points: [
          "Общество людей ценно, однако остаётся сильная потребность в уединении, самостоятельной работе и избирательном круге близких контактов.",
          "В деловой коммуникации потребности задачи часто важнее эмоций; встречи должны иметь строгую повестку и практический итог.",
          "Предпочтительны понятные процедуры, справедливость и оправданный риск, а не эксперимент ради самого эксперимента.",
        ],
      },
      {
        title: "Коммерческий интерес",
        points: [
          "Выражен интерес к финансам, прибыльности и экономической стороне решений; новые предложения оцениваются через деловую пользу.",
          "Деньги используются осмотрительно, а риск должен быть рассчитан и соотнесён с безопасностью и устойчивостью результата.",
        ],
      },
      {
        title: "Стиль решений",
        points: [
          "Функциональность и экономичность важнее эстетики и символического эффекта.",
          "Решения чаще опираются на опыт, интуицию и общую картину, чем на длительный теоретический или исследовательский анализ.",
        ],
      },
    ],
  },
  {
    id: "risks",
    code: "HDS",
    eyebrow: "Стресс и неопределённость",
    title: "Риски под нагрузкой",
    lead: "Когда давление растёт, сильная автономность может превращаться в дистанцию, жёсткий контроль и снижение доверия к людям.",
    themes: [
      {
        title: "Отношения",
        points: [
          "Напор и энтузиазм могут сменяться разочарованием после чужой ошибки — вплоть до резкой критики, ухода из контакта или отказа от проекта.",
          "Проницательность помогает замечать риски, но ощущение несправедливости может усиливать подозрительность, резкость и обиду.",
          "Сдержанность иногда выглядит как невнимание к обратной связи; проблемы могут замалчиваться, а компетентность коллег — ставиться под сомнение.",
          "Нелюбовь к давлению извне способна замедлять процесс и создавать впечатление упрямства или невосприимчивости к коучингу.",
        ],
      },
      {
        title: "Личные цели",
        points: [
          "Очень высокая уверенность, энергия и ориентация на успех поддерживают смелые цели и устойчивость.",
          "Обратная сторона — требовательность, эгоцентричность, трудность признавать ошибки и разделять результат с командой.",
          "Прямой и непубличный стиль не требует сцены и эффектной самопрезентации; радикальные идеи оцениваются прежде всего по пользе.",
        ],
      },
      {
        title: "Отношение к руководству и команде",
        points: [
          "Вежливость, трудолюбие и высокие стандарты качества делают результат предсказуемым, но тот же темп может ожидаться от всех вокруг.",
          "Стремление сделать всё самостоятельно и безупречно повышает нагрузку, усложняет делегирование и делает критерии качества труднодостижимыми.",
          "Правила и процедуры воспринимаются серьёзно, однако независимость остаётся высокой, а длительная командная работа может утомлять.",
        ],
      },
    ],
  },
];

const HOGAN_INSIGHTS = [
  {
    id: "strengths",
    eyebrow: "Рабочий стиль",
    title: "Самостоятельный драйв",
    text: "Ориентация на результат, готовность брать руководство и предъявлять высокие требования к качеству — особенно в самостоятельной работе и динамичной среде.",
  },
  {
    id: "motives",
    eyebrow: "Мотиваторы",
    title: "Влияние и результат",
    text: "Карьерный успех, возможность влиять и финансовый итог сочетаются с опорой на проверенные правила, порядок и справедливость.",
  },
  {
    id: "risks",
    eyebrow: "Под нагрузкой",
    title: "Контроль вместо диалога",
    text: "В стрессе могут усиливаться замкнутость, жёсткость к ошибкам и недоверие — из-за этого обратную связь и вовлечённость команды легче потерять.",
  },
  {
    id: "decisions",
    eyebrow: "Решения",
    title: "Практичность и скорость",
    text: "Опора на опыт, интуицию и общую картину помогает действовать быстро. Обратная сторона — риск пропустить детали и отложить стратегическую работу.",
  },
];

const HOGAN_DEVELOPMENT_ACTIONS = [
  "Замечать момент, когда уверенность превращается в защитную реакцию, и не принимать обратную связь лично.",
  "Обсуждать карьерные амбиции с руководителем, сохраняя уважение к темпу и целям коллег.",
  "После важных встреч фиксировать договорённости и проверять общее понимание.",
  "Делегировать и оставлять коллегам пространство для другого темпа и подхода.",
  "Если цель — лидерская роль, каждый день поддерживать короткий личный контакт с командой.",
  "Перед прямой реакцией на ошибку делать паузу и выбирать дипломатичную формулировку.",
  "Вести короткий ежедневный список задач и отдельно контролировать обещания.",
  "Проверять факты и завершать рутинную часть работы до принятия окончательного решения.",
  "Резервировать время для стратегии, миссии и долгосрочного видения, включая роль технологий и инноваций.",
  "Выбирать прикладные форматы обучения: практика, аудио, видео и разбор реальных кейсов.",
];

const HOGAN_STRESS_CHECKLIST = [
  "Опирайтесь на базовые сильные стороны: решительность, независимость и устойчивость.",
  "После встречи отдельно убедитесь, что все одинаково поняли решение: молчаливое согласие ещё не означает готовность действовать.",
  "Прямота и самостоятельность могут перекрывать обратную связь — регулярно запрашивайте её у руководителя, коуча или доверенного коллеги.",
  "Фокус на текущем проекте не должен вытеснять вовлечение людей и развитие команды.",
  "Даже если под давлением хочется работать одному, сохраняйте ежедневную коммуникацию с ключевыми участниками.",
];

function serviceChromeFromPath(pathname) {
  let serviceId = activeServiceFromPath(pathname);
  if (!serviceId && (pathname === "/app" || pathname.startsWith("/s/"))) serviceId = "wishlist";
  if (!serviceId && !["/", "/login", "/register", "/forgot-password", "/reset-password", "/ideas"].includes(pathname) && !pathname.startsWith("/app/")) {
    serviceId = "wishlist";
  }
  if (!serviceId) return null;
  const service = serviceId === "wishlist"
    ? SERVICE_SWITCHER_ITEMS[0]
    : SPHERE_SERVICES.find((item) => item.id === serviceId);
  return service ? { ...service, tabs: SERVICE_TABS[serviceId] || [] } : null;
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
    <div className="auth-page rollapp-body">
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
  const [form, setForm] = useState({ name: "", email: "", password: "", accountType: "personal" });
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

  const finishAuthentication = async (message, destination = nextPath) => {
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
    navigate(destination);
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
            <Link className={buttonVariants({ variant: "outline", className: "h-12 w-full" })} to={nextPath}>Вернуться в Rollapp</Link>
          </div>
        </div>
      </div>
    );
  }

  const submitCredentials = async (event) => {
    event.preventDefault(); setLoading(true);
    try {
      const result = await api.post(mode === "register" ? "/auth/register" : "/auth/login", form);
      const destination = mode === "register"
        && result.user?.accountType === "business"
        && !authQuery.get("next")
        ? "/app/business/access"
        : nextPath;
      await finishAuthentication(
        mode === "register"
          ? result.user?.accountType === "business"
            ? "Бизнес-аккаунт готов"
            : "Вишлист готов — добавьте первую мечту"
          : "С возвращением!",
        destination,
      );
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
    <div className="auth-page rollapp-body">
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
                {mode === "register" && (
                  <Field>
                    <FieldLabel>Тип аккаунта</FieldLabel>
                    <RadioGroup className="auth-account-types" value={form.accountType} onValueChange={(accountType) => setForm({ ...form, accountType })} aria-label="Тип аккаунта">
                      <label className="auth-account-type" data-active={form.accountType === "personal" ? "true" : undefined}>
                        <RadioGroupItem value="personal" />
                        <span><strong>Личный</strong><small>Вишлист и личные сферы</small></span>
                      </label>
                      <label className="auth-account-type" data-active={form.accountType === "business" ? "true" : undefined}>
                        <RadioGroupItem value="business" />
                        <span><strong>Бизнес</strong><small>Запросы на доступ к пространствам клиентов</small></span>
                      </label>
                    </RadioGroup>
                    <FieldDescription>Бизнес получает доступ только после подтверждения владельца сферы.</FieldDescription>
                  </Field>
                )}
                {mode === "register" && <Field><FieldLabel htmlFor={`${authId}-name`}>Как вас зовут</FieldLabel><Input id={`${authId}-name`} required minLength={2} autoComplete="name" placeholder="Алиса Морозова" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>}
                <Field><FieldLabel htmlFor={`${authId}-email`}>Email</FieldLabel><Input id={`${authId}-email`} required type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(event) => { if (mode === "login") methodTouchedRef.current = true; setForm({ ...form, email: event.target.value }); }} /></Field>
                <Field><FieldLabel htmlFor={`${authId}-password`}>Пароль</FieldLabel><Input id={`${authId}-password`} required minLength={8} type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder="Минимум 8 символов" value={form.password} onChange={(event) => { if (mode === "login") methodTouchedRef.current = true; setForm({ ...form, password: event.target.value }); }} /></Field>
              </FieldGroup>
              {mode === "login" && <Link className="auth-password-link" to="/forgot-password">Забыли пароль?</Link>}
              <ShadcnButton type="submit" className="auth-submit" disabled={loading} aria-busy={loading || undefined}>{loading && <Spinner data-icon="inline-start" />}{mode === "register" ? form.accountType === "business" ? "Создать бизнес-аккаунт" : "Создать вишлист" : shouldLinkYandex ? "Войти и привязать Yandex ID" : "Войти"}</ShadcnButton>
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
      <AppBrandSpacer />
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
  const catalogRoute = location.pathname === "/app/wishes/catalog";
  const businessRoute = location.pathname.startsWith("/app/business");
  const sphereScope = sphereScopeFromLocation(location.pathname, location.search, SERVICE_TABS);
  return (
    <SphereSharingProvider currentUser={user} scope={sphereScope} search={location.search}>
      <div className={`app-layout app-layout--dark ${friendsRoute ? "app-layout--friends" : ""}`}>
        <main className={`app-main ${!friendsRoute || collectionChrome ? "app-main--with-profile" : ""} ${wishesRoute || collectionChrome ? "app-main--wishes" : ""}`}>
          {!collectionChrome && <div className="app-shell-chrome-spacer" aria-hidden="true" />}
          {!collectionChrome && !catalogRoute && !businessRoute && <PersistentProfileHero user={user} />}
          <SphereAccessRequestBanner />
          {children}
        </main>
      </div>
    </SphereSharingProvider>
  );
}

function SpherePage({ sphereId }) {
  const sphere = SPHERE_SERVICES.find((item) => item.id === sphereId);
  const Icon = sphere?.icon || Sparkles;
  if (!sphere) return <Navigate to={APP_HOME} replace />;
  return (
    <div className="app-page sphere-page typeset typeset-rollapp">
      <div className="sphere-page__content">
        <span className="sphere-page__icon" style={{ "--sphere-color": sphere.color }}><Icon aria-hidden="true" /></span>
        <p className="sphere-page__eyebrow">Сферы</p>
        <h1>{sphere.label}</h1>
        <p>Раздел уже доступен в переключателе. Содержимое этой сферы появится здесь.</p>
      </div>
    </div>
  );
}

function HoganScoreChart({ profile }) {
  return (
    <section className={`hogan-chart hogan-chart--${profile.id}`} aria-labelledby={`hogan-chart-${profile.id}`}>
      <header className="hogan-chart__header">
        <span className="hogan-chart__code" aria-hidden="true">{profile.code}</span>
        <div data-typeset-group>
          <h3 id={`hogan-chart-${profile.id}`}>{profile.title}</h3>
          <p>{profile.description}</p>
        </div>
      </header>
      <div className="hogan-chart__scale" aria-hidden="true">
        <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
      </div>
      <ol className="hogan-chart__rows" data-not-typeset>
        {profile.scores.map(([label, score]) => (
          <li key={label} className="hogan-chart__row">
            <div className="hogan-chart__label"><span>{label}</span><strong>{score}</strong></div>
            <div
              className="hogan-chart__meter"
              role="meter"
              aria-label={`${label}: ${score} из 100`}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={score}
            >
              <span className="hogan-chart__fill" style={{ "--hogan-score": `${score}%` }} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function HoganNarrativeSection({ section }) {
  return (
    <section className={`hogan-narrative hogan-narrative--${section.id}`} aria-labelledby={`hogan-narrative-${section.id}`}>
      <header className="hogan-narrative__header">
        <span className="hogan-narrative__code" aria-hidden="true">{section.code}</span>
        <div>
          <span>{section.eyebrow}</span>
          <h3 id={`hogan-narrative-${section.id}`}>{section.title}</h3>
          <p>{section.lead}</p>
        </div>
      </header>
      <div className="hogan-narrative__themes">
        {section.themes.map((theme) => (
          <article key={theme.title} className="hogan-theme">
            <h4>{theme.title}</h4>
            <ul>
              {theme.points.map((point) => <li key={point}>{point}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function HoganScaleGuide({ profiles = HOGAN_PROFILES }) {
  return (
    <section className="hogan-report__scale-guide" aria-labelledby="hogan-scale-guide-title">
      <div className="hogan-report__section-heading">
        <span>Справочник</span>
        <h3 id="hogan-scale-guide-title">Что означает каждая шкала</h3>
        <p>Короткие определения помогают читать процентили в контексте, а не воспринимать отдельный балл как оценку личности.</p>
      </div>
      <div className="hogan-scale-guide">
        {profiles.map((profile) => (
          <section key={profile.id} className={`hogan-scale-group hogan-scale-group--${profile.id}`} aria-labelledby={`hogan-scale-group-${profile.id}`}>
            <header>
              <span aria-hidden="true">{profile.code}</span>
              <h4 id={`hogan-scale-group-${profile.id}`}>{profile.title}</h4>
            </header>
            <dl data-not-typeset>
              {profile.scores.map(([label, score, definition]) => (
                <div key={label}>
                  <dt><span>{label}</span><strong>{score}</strong></dt>
                  <dd>{definition}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </section>
  );
}

function DefaultHoganReport() {
  return (
    <article className="hogan-report typeset-document" aria-labelledby="hogan-report-title">
      <header className="hogan-report__hero">
        <div className="hogan-report__hero-copy">
          <span className="hogan-report__eyebrow">Leadership Forecast™</span>
          <h2 id="hogan-report-title">Профиль Hogan</h2>
          <p>Сводная карта сильных сторон, внутренних мотиваторов и поведенческих рисков на основе HPI, MVPI и HDS.</p>
          <div className="hogan-report__meta">
            <span>Михаил Колосков</span>
            <span aria-hidden="true">·</span>
            <time dateTime="2025-07-29">29 июля 2025</time>
            <span aria-hidden="true">·</span>
            <span>нормы Russian2023</span>
          </div>
        </div>
        <div className="hogan-report__stats" aria-label="Состав профиля">
          {HOGAN_REPORT_STATS.map((stat) => (
            <div key={stat.label} className="hogan-report__stat">
              <strong>{stat.value}</strong>
              <span>{stat.label}<small>{stat.detail}</small></span>
            </div>
          ))}
        </div>
      </header>

      <section className="hogan-report__summary" aria-labelledby="hogan-summary-title">
        <div className="hogan-report__section-heading">
          <span>Синтез двух отчётов</span>
          <h3 id="hogan-summary-title">Главное в профиле</h3>
        </div>
        <div className="hogan-insights">
          {HOGAN_INSIGHTS.map((insight) => (
            <article key={insight.id} className={`hogan-insight hogan-insight--${insight.id}`}>
              <span>{insight.eyebrow}</span>
              <h4>{insight.title}</h4>
              <p>{insight.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="hogan-report__methodology" aria-labelledby="hogan-methodology-title">
        <div className="hogan-report__section-heading">
          <span>Как читать профиль</span>
          <h3 id="hogan-methodology-title">Три ракурса одной репутации</h3>
          <p>Отчёт объединяет повседневный стиль, внутренние мотиваторы и реакции под нагрузкой. Вместе они дают более точную картину, чем любой показатель по отдельности.</p>
        </div>
        <div className="hogan-methods">
          {HOGAN_METHODS.map((method) => (
            <article key={method.code} className={`hogan-method hogan-method--${method.code.toLowerCase()}`}>
              <span aria-hidden="true">{method.code}</span>
              <h4>{method.title}</h4>
              <p>{method.text}</p>
            </article>
          ))}
        </div>
        <div className="hogan-report__reading-note">
          <div>
            <h4>Интерпретируйте целиком</h4>
            <p>Высокие и низкие результаты имеют и преимущества, и ограничения. Несовпадение повседневной и «тёмной» стороны закономерно: под стрессом знакомое качество может проявляться иначе. Выводы полезно соотносить с карьерными целями, реальным поведением и обратной связью.</p>
          </div>
          <div>
            <h4>Для чего использовать</h4>
            <ul>
              {HOGAN_REPORT_USES.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div className="hogan-report__change-model">
            <h4>Изменение начинается с трёх ответов</h4>
            <ol data-not-typeset>
              {HOGAN_CHANGE_STEPS.map(([label, text]) => (
                <li key={label}><span>{label}</span><p>{text}</p></li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="hogan-report__scores" aria-labelledby="hogan-scores-title">
        <div className="hogan-report__section-heading">
          <span>Процентили · 0–100</span>
          <h3 id="hogan-scores-title">Все шкалы</h3>
          <p>Положение относительно нормативной выборки. Высокий или низкий балл сам по себе не означает «хорошо» или «плохо».</p>
        </div>
        <div className="hogan-charts">
          {HOGAN_PROFILES.map((profile) => <HoganScoreChart key={profile.id} profile={profile} />)}
        </div>
      </section>

      <section className="hogan-report__interpretation" aria-labelledby="hogan-interpretation-title">
        <div className="hogan-report__section-heading">
          <span>Подробная интерпретация</span>
          <h3 id="hogan-interpretation-title">Как профиль проявляется в работе</h3>
          <p>Ниже содержание отчётов собрано в тематические блоки: без страниц, повторов и мелкого текста.</p>
        </div>
        <div className="hogan-narratives">
          {HOGAN_NARRATIVE_SECTIONS.map((section) => <HoganNarrativeSection key={section.id} section={section} />)}
        </div>
      </section>

      <section className="hogan-report__development" aria-labelledby="hogan-development-title">
        <div className="hogan-report__development-copy">
          <span>Фокус развития</span>
          <h3 id="hogan-development-title">Сохранить напор, добавить контакт</h3>
          <p>Рекомендации отчёта сводятся к тому, чтобы не снижать самостоятельность и решительность, но сделать коммуникацию, делегирование и контроль деталей более осознанными.</p>
        </div>
        <ul data-not-typeset>
          {HOGAN_DEVELOPMENT_ACTIONS.map((action) => (
            <li key={action}><CheckCircle2 aria-hidden="true" /><span>{action}</span></li>
          ))}
        </ul>
        <section className="hogan-report__stress-check" aria-labelledby="hogan-stress-check-title">
          <span>Под нагрузкой</span>
          <h4 id="hogan-stress-check-title">Пять контрольных вопросов к поведению</h4>
          <ol data-not-typeset>
            {HOGAN_STRESS_CHECKLIST.map((item) => <li key={item}>{item}</li>)}
          </ol>
        </section>
      </section>

      <p className="hogan-report__note">HDS описывает возможное поведение под нагрузкой, а не клиническую оценку. Интерпретировать профиль полезнее вместе с карьерным контекстом и обратной связью от людей.</p>

      <HoganScaleGuide />
    </article>
  );
}

function GeneratedHoganReport({ report }) {
  const profiles = (report.profiles || []).map((profile) => {
    const referenceProfile = HOGAN_PROFILES.find((item) => item.id === profile.id);
    const definitions = new Map((referenceProfile?.scores || []).map(([label, , definition]) => [label.toLocaleLowerCase("ru-RU"), definition]));
    return {
      ...profile,
      title: referenceProfile?.title || profile.title,
      description: referenceProfile?.description || profile.description,
      scores: profile.scores.map(([label, score, definition]) => [
        label,
        score,
        definitions.get(label.toLocaleLowerCase("ru-RU")) || definition,
      ]),
    };
  });
  const scaleCount = profiles.reduce((count, profile) => count + profile.scores.length, 0);
  const comparableScores = profiles.flatMap((profile) => {
    const referenceProfile = HOGAN_PROFILES.find((item) => item.id === profile.id);
    const referenceScores = new Map((referenceProfile?.scores || []).map(([label, score]) => [label.toLocaleLowerCase("ru-RU"), score]));
    return profile.scores
      .filter(([label]) => referenceScores.has(label.toLocaleLowerCase("ru-RU")))
      .map(([label, score]) => score === referenceScores.get(label.toLocaleLowerCase("ru-RU")));
  });
  const usesCuratedInterpretation = comparableScores.length >= 10
    && comparableScores.filter(Boolean).length / comparableScores.length >= 0.8;
  const generatedInsights = profiles.map((profile, index) => {
    const sortedScores = [...profile.scores].sort((a, b) => b[1] - a[1]);
    const leading = sortedScores.slice(0, 2);
    const trailing = [...sortedScores].reverse().slice(0, 2);
    const insightIds = ["strengths", "motives", "risks"];
    return {
      id: insightIds[index] || "decisions",
      eyebrow: profile.code,
      title: leading.map(([label]) => label).join(" и "),
      text: `Наиболее выражены ${leading.map(([label, score]) => `${label.toLocaleLowerCase("ru-RU")} (${score})`).join(" и ")}. Контраст профиля создают ${trailing.map(([label, score]) => `${label.toLocaleLowerCase("ru-RU")} (${score})`).join(" и ")}.`,
    };
  });
  const generatedNarratives = profiles.map((profile, index) => {
    const sortedScores = [...profile.scores].sort((a, b) => b[1] - a[1]);
    const narrativeIds = ["strengths", "motives", "risks"];
    return {
      id: narrativeIds[index] || profile.id,
      code: profile.code,
      eyebrow: "Автоматическая интерпретация",
      title: profile.title,
      lead: profile.description,
      themes: [
        {
          title: "Наиболее выражено",
          points: sortedScores.slice(0, 3).map(([label, score, definition]) => `${label} — ${score}-й процентиль. ${definition}`),
        },
        {
          title: "В нижней части профиля",
          points: [...sortedScores].reverse().slice(0, 3).map(([label, score, definition]) => `${label} — ${score}-й процентиль. ${definition}`),
        },
      ],
    };
  });
  const insights = usesCuratedInterpretation ? HOGAN_INSIGHTS : generatedInsights;
  const narratives = usesCuratedInterpretation ? HOGAN_NARRATIVE_SECTIONS : generatedNarratives;
  const dateLabel = report.date
    ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${report.date}T12:00:00Z`))
    : "Дата не указана";
  return (
    <article className="hogan-report hogan-report--generated typeset-document" aria-labelledby="hogan-generated-title">
      <header className="hogan-report__hero">
        <div className="hogan-report__hero-copy">
          <span className="hogan-report__eyebrow">Leadership Forecast™ · создано из PDF</span>
          <h2 id="hogan-generated-title">{report.title}</h2>
          <p>Содержание загруженных отчётов очищено от разрывов страниц и собрано в единую адаптивную страницу.</p>
          <div className="hogan-report__meta">
            {report.person ? <span>{report.person}</span> : null}
            {report.person ? <span aria-hidden="true">·</span> : null}
            <time dateTime={report.date || undefined}>{dateLabel}</time>
          </div>
        </div>
        <div className="hogan-report__stats" aria-label="Состав профиля">
          <div className="hogan-report__stat">
            <strong>{profiles.length}</strong>
            <span>опросника<small>{profiles.map((profile) => profile.code).join(" · ") || "из PDF"}</small></span>
          </div>
          <div className="hogan-report__stat">
            <strong>{scaleCount}</strong>
            <span>шкал<small>в едином профиле</small></span>
          </div>
        </div>
      </header>

      {insights.length ? (
        <section className="hogan-report__summary" aria-labelledby="hogan-generated-summary-title">
          <div className="hogan-report__section-heading">
            <span>Синтез загруженных отчётов</span>
            <h3 id="hogan-generated-summary-title">Главное в профиле</h3>
          </div>
          <div className="hogan-insights">
            {insights.map((insight) => (
              <article key={insight.id} className={`hogan-insight hogan-insight--${insight.id}`}>
                <span>{insight.eyebrow}</span>
                <h4>{insight.title}</h4>
                <p>{insight.text}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="hogan-report__methodology" aria-labelledby="hogan-generated-methodology-title">
        <div className="hogan-report__section-heading">
          <span>Как читать профиль</span>
          <h3 id="hogan-generated-methodology-title">Три ракурса одной репутации</h3>
          <p>Отчёт объединяет повседневный стиль, внутренние мотиваторы и реакции под нагрузкой. Вместе они дают более точную картину, чем любой показатель по отдельности.</p>
        </div>
        <div className="hogan-methods">
          {HOGAN_METHODS.map((method) => (
            <article key={method.code} className={`hogan-method hogan-method--${method.code.toLowerCase()}`}>
              <span aria-hidden="true">{method.code}</span>
              <h4>{method.title}</h4>
              <p>{method.text}</p>
            </article>
          ))}
        </div>
        <div className="hogan-report__reading-note">
          <div>
            <h4>Интерпретируйте целиком</h4>
            <p>Высокие и низкие результаты имеют и преимущества, и ограничения. Несовпадение повседневной и «тёмной» стороны закономерно: под стрессом знакомое качество может проявляться иначе.</p>
          </div>
          <div>
            <h4>Для чего использовать</h4>
            <ul>
              {HOGAN_REPORT_USES.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div className="hogan-report__change-model">
            <h4>Изменение начинается с трёх ответов</h4>
            <ol data-not-typeset>
              {HOGAN_CHANGE_STEPS.map(([label, text]) => (
                <li key={label}><span>{label}</span><p>{text}</p></li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {profiles.length ? (
        <section className="hogan-report__scores" aria-labelledby="hogan-generated-scores-title">
          <div className="hogan-report__section-heading">
            <span>Процентили · 0–100</span>
            <h3 id="hogan-generated-scores-title">Шкалы из загруженных отчётов</h3>
            <p>Значения автоматически извлечены из PDF. Сверьте их с оригиналами, доступными выше.</p>
          </div>
          <div className="hogan-charts">
            {profiles.map((profile) => <HoganScoreChart key={profile.id} profile={profile} />)}
          </div>
        </section>
      ) : (
        <p className="hogan-report__note">Текст PDF распознан, но процентили не найдены. Исходный документ доступен в блоке управления отчётом.</p>
      )}

      {narratives.length ? (
        <section className="hogan-report__interpretation" aria-labelledby="hogan-generated-interpretation-title">
          <div className="hogan-report__section-heading">
            <span>Подробная интерпретация</span>
            <h3 id="hogan-generated-interpretation-title">Как профиль проявляется в работе</h3>
            <p>Содержание отчёта собрано в тематические блоки: без страниц, повторов и мелкого текста.</p>
          </div>
          <div className="hogan-narratives">
            {narratives.map((section) => <HoganNarrativeSection key={section.id} section={section} />)}
          </div>
        </section>
      ) : null}

      {usesCuratedInterpretation ? (
        <section className="hogan-report__development" aria-labelledby="hogan-generated-development-title">
          <div className="hogan-report__development-copy">
            <span>Фокус развития</span>
            <h3 id="hogan-generated-development-title">Сохранить напор, добавить контакт</h3>
            <p>Рекомендации отчёта сводятся к тому, чтобы не снижать самостоятельность и решительность, но сделать коммуникацию, делегирование и контроль деталей более осознанными.</p>
          </div>
          <ul data-not-typeset>
            {HOGAN_DEVELOPMENT_ACTIONS.map((action) => (
              <li key={action}><CheckCircle2 aria-hidden="true" /><span>{action}</span></li>
            ))}
          </ul>
          <section className="hogan-report__stress-check" aria-labelledby="hogan-generated-stress-check-title">
            <span>Под нагрузкой</span>
            <h4 id="hogan-generated-stress-check-title">Пять контрольных вопросов к поведению</h4>
            <ol data-not-typeset>
              {HOGAN_STRESS_CHECKLIST.map((item) => <li key={item}>{item}</li>)}
            </ol>
          </section>
        </section>
      ) : null}

      <p className="hogan-report__note">Исходные PDF доступны выше. HDS описывает возможное поведение под нагрузкой, а не клиническую оценку.</p>

      {profiles.length ? <HoganScaleGuide profiles={profiles} /> : null}
    </article>
  );
}

function HoganReport() {
  const { state, setState, error, load } = useIdentityReport("hogan");
  if (state.mode === "loading" || state.mode === "error") {
    return <IdentityReportStatus mode={state.mode} error={error} onRetry={load} />;
  }
  return (
    <div className="identity-report-workspace">
      <IdentityReportControls section="hogan" label="Hogan" state={state} setState={setState} load={load} />
      {state.mode === "empty"
        ? <IdentityReportEmpty label="Hogan" />
        : state.mode === "generated"
          ? <GeneratedHoganReport report={state.report} />
          : <DefaultHoganReport />}
    </div>
  );
}

function TabbedSpherePage({ sphereId, tabs }) {
  const sphere = SPHERE_SERVICES.find((item) => item.id === sphereId);
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const access = useSphereSharing();
  const globalShareRef = useGlobalShareHandler();
  if (!sphere || !tabs?.length) return <Navigate to={APP_HOME} replace />;
  const requestedTab = new URLSearchParams(location.search).get("tab");
  const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab : tabs[0].id;
  const activeTabConfig = tabs.find((tab) => tab.id === activeTab);
  const selectTab = (tabId) => {
    const search = new URLSearchParams(location.search);
    search.set("tab", tabId);
    navigate({ pathname: location.pathname, search: `?${search.toString()}`, hash: location.hash }, { replace: true });
  };
  globalShareRef.current = async () => {
    const ownerUsername = access.owner?.username;
    const path = sphereSectionPath({ ownerUsername, sphere: sphereId, section: activeTab });
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      toast(access.isOwner ? "Ссылка на раздел скопирована. Открыть её смогут выбранные люди." : "Ссылка на раздел скопирована");
    } catch {
      toast("Не удалось скопировать ссылку", "error");
    }
  };
  return (
    <div data-read-only={access.readOnly ? "true" : undefined} className={`app-page sphere-page sphere-page--tabbed typeset typeset-rollapp${activeTabConfig?.layout === "full-width" ? " sphere-page--full-width" : ""}`}>
      <div className="sphere-page__content tabbed-sphere">
        <Tabs value={activeTab} onValueChange={selectTab} className="sphere-tabs">
          {[activeTabConfig].map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="sphere-tabs__content">
              {sphere.id === "identity" && tab.id === "four-questions"
                ? <FourQuestions />
                : sphere.id === "identity" && tab.id === "theses"
                  ? <Theses />
                : sphere.id === "identity" && tab.id === "gallup"
                  ? <GallupProfile />
                  : sphere.id === "identity" && tab.id === "hogan"
                    ? <HoganReport />
                    : sphere.id === "identity" && tab.id === "values"
                      ? <Values />
                      : sphere.id === "identity" && tab.id === "mission"
                        ? <Mission />
                        : sphere.id === "identity" && tab.id === "life-strategy"
                          ? <EditableLifeStrategy />
                        : sphere.id === "education" && tab.id === "courses"
                          ? <Courses />
                          : sphere.id === "education" && tab.id === "conferences"
                            ? <Conferences />
                            : sphere.id === "education" && tab.id === "coaching"
                              ? <CoachingSessions />
                              : sphere.id === "health" && tab.id === "lab-results"
                                ? <LabResults />
                                : sphere.id === "health" && tab.id === "sport"
                                  ? <Workouts />
                                  : sphere.id === "health" && tab.id === "medications"
                                    ? <Medications />
                                : sphere.id === "career" && tab.id === "cv"
                                  ? <CvResume />
                          : sphere.id === "career" && tab.id === "about"
                            ? <AboutMe />
                          : sphere.id === "career" && tab.id === "performance"
                              ? <PerformanceReview />
                          : sphere.id === "career" && tab.id === "development-plan"
                            ? <DevelopmentPlan />
                          : sphere.id === "career" && tab.id === "domain"
                            ? <Domain />
                    : sphere.id === "health"
                      ? <Empty className="min-h-64 border" aria-labelledby={`${sphere.id}-tab-${tab.id}`}>
                        <EmptyHeader>
                          <EmptyMedia variant="icon"><HeartPulse aria-hidden="true" /></EmptyMedia>
                          <EmptyTitle><h2 id={`${sphere.id}-tab-${tab.id}`} className="m-0! text-lg! leading-7! font-semibold!">{tab.label}</h2></EmptyTitle>
                          <EmptyDescription>{tab.description}</EmptyDescription>
                        </EmptyHeader>
                        <EmptyContent><Badge variant="secondary">Скоро</Badge></EmptyContent>
                      </Empty>
                      : <section aria-labelledby={`${sphere.id}-tab-${tab.id}`}>
                  <h2 id={`${sphere.id}-tab-${tab.id}`}>{tab.label}</h2>
                  <p>{tab.description}</p>
                  <span className="sphere-tabs__placeholder">Содержимое раздела появится здесь.</span>
                </section>}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

const CONTACT_CATEGORY_LABELS = {
  Analytics: "Аналитика",
  "Business Development": "BizDev",
  CEO: "CEO",
  Coach: "Коучинг",
  Design: "Дизайн",
  Development: "Разработка",
  Editor: "Редактура",
  Founder: "Основатели",
  Government: "Госсектор",
  HR: "HR",
  Investor: "Инвестиции",
  Management: "Управление",
  Marketing: "Маркетинг",
  Product: "Продукт",
  Project: "Проекты",
  PR: "PR",
  Strategy: "Стратегия",
  Tracker: "Трекинг",
};
const CONTACT_ACCENTS = ["#9b72e8", "#5b8def", "#43bd83", "#e66a8f", "#f2a65a", "#49a7a1", "#7d83ea"];
const CONTACT_SOCIAL_PLATFORMS = {
  facebook: { label: "Facebook", mark: "f" },
  linkedin: { label: "LinkedIn", mark: "in" },
  telegram: { label: "Telegram", mark: "TG" },
  instagram: { label: "Instagram", mark: "IG" },
  x: { label: "X", mark: "X" },
  vk: { label: "VK", mark: "VK" },
  website: { label: "Сайт", mark: "↗" },
};
const contactSocialPlatform = (link = {}) => {
  const label = String(link.label || "").trim().toLowerCase();
  let host = "";
  try { host = new URL(link.url).hostname.toLowerCase().replace(/^www\./u, ""); } catch { /* Use the label below. */ }
  if (/facebook|\bfb\b/u.test(label) || /(^|\.)facebook\.com$|(^|\.)fb\.com$/u.test(host)) return "facebook";
  if (/linkedin/u.test(label) || /(^|\.)linkedin\.com$/u.test(host)) return "linkedin";
  if (/telegram|\btg\b/u.test(label) || /(^|\.)(t\.me|telegram\.me|telegram\.org)$/u.test(host)) return "telegram";
  if (/instagram|insta/u.test(label) || /(^|\.)instagram\.com$/u.test(host)) return "instagram";
  if (/^x$|twitter/u.test(label) || /(^|\.)(x\.com|twitter\.com)$/u.test(host)) return "x";
  if (/^vk$|вконтакте|vkontakte/u.test(label) || /(^|\.)(vk\.com|vkontakte\.ru)$/u.test(host)) return "vk";
  return "website";
};
function ContactSocialLink({ link, contactName }) {
  const platform = contactSocialPlatform(link);
  const details = CONTACT_SOCIAL_PLATFORMS[platform];
  const label = platform === "website" && link.label?.trim() ? link.label.trim() : details.label;
  return (
    <a
      className={`contact-social-link contact-social-link--${platform}`}
      href={link.url}
      target="_blank"
      rel="noreferrer"
      aria-label={`${label}: ${contactName}`}
      title={label}
    >
      <span className="contact-social-link__mark" aria-hidden="true">{details.mark}</span>
      <span className="contact-social-link__label">{label}</span>
    </a>
  );
}
const contactCountNoun = (count) => {
  const lastTwo = Math.abs(count) % 100;
  const last = Math.abs(count) % 10;
  if (last === 1 && lastTwo !== 11) return "контакт";
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return "контакта";
  return "контактов";
};
const ALL_CONTACT_COMPANIES = "__rollapp_all_contact_companies__";
const ALL_CONTACT_CATEGORIES = "__rollapp_all_contact_categories__";
const contactAccent = (company = "") => CONTACT_ACCENTS[[...company].reduce((sum, character) => sum + character.codePointAt(0), 0) % CONTACT_ACCENTS.length];
const contactFormFrom = (contact) => ({
  name: contact?.name || "",
  company: contact?.company || "",
  role: contact?.role || "",
  category: contact?.category || "",
  status: contact?.status || "",
  avatarUrl: contact?.avatarSourceUrl || "",
  links: (contact?.links || []).map((link) => ({ label: link.label || "", url: link.url || "" })),
  notes: contact?.notes || "",
});

function ContactAutoLinkText({ text }) {
  const parts = String(text || "").split(/(https?:\/\/[^\s)<>]+)/giu);
  return parts.map((part, index) => /^https?:\/\//iu.test(part)
    ? <a key={`${part}-${index}`} href={part.replace(/[.,;:]+$/u, "")} target="_blank" rel="noreferrer">{part}</a>
    : part);
}

function ContactNotes({ notes }) {
  if (!notes) return <p className="contact-detail__no-notes">В исходной заметке только основные данные контакта.</p>;
  return notes.split(/\n{2,}/u).map((block, index) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    const heading = trimmed.match(/^#{1,3}\s+(.+?)(?:\n([\s\S]*))?$/u);
    return (
      <div className="contact-detail__note-block" key={`${trimmed.slice(0, 24)}-${index}`}>
        {heading ? <><h3>{heading[1]}</h3>{heading[2] && <p><ContactAutoLinkText text={heading[2]} /></p>}</> : <p><ContactAutoLinkText text={trimmed} /></p>}
      </div>
    );
  });
}

function ContactEditForm({ contact = null, favoriteSaving = false, onFavoriteToggle, onCancel, onSaved, onDeleted }) {
  const toast = useToast();
  const creating = !contact?.id;
  const [form, setForm] = useState(() => contactFormFrom(contact));
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [avatarResolving, setAvatarResolving] = useState(false);
  const [avatarCleared, setAvatarCleared] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarStatus, setAvatarStatus] = useState("");
  const [saveError, setSaveError] = useState("");
  const avatarFileRef = useRef(null);
  const uploadedImageIdsRef = useRef(new Set());
  const autoResolveKeyRef = useRef("");
  const initialAvatarSourceUrl = contact?.avatarSourceUrl || "";
  const previewAvatarUrl = form.avatarUrl || (avatarCleared ? "" : contact?.avatarUrl || "");
  const busy = saving || deleting || imageUploading || avatarResolving;
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const setLink = (index, field, value) => setForm((current) => ({
    ...current,
    links: current.links.map((link, linkIndex) => linkIndex === index ? { ...link, [field]: value } : link),
  }));
  const removeLink = (index) => setForm((current) => ({
    ...current,
    links: current.links.filter((_, linkIndex) => linkIndex !== index),
  }));
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
  const applyAvatarResult = async (result, message) => {
    const previousId = uploadedImageIdFromUrl(form.avatarUrl);
    if (result.id) uploadedImageIdsRef.current.add(result.id);
    setForm((current) => ({ ...current, avatarUrl: result.imageUrl }));
    setAvatarCleared(false);
    setAvatarError("");
    setAvatarStatus(message);
    if (previousId && uploadedImageIdsRef.current.has(previousId) && previousId !== result.id) {
      uploadedImageIdsRef.current.delete(previousId);
      await api.delete(`/uploads/images/${encodeURIComponent(previousId)}`).catch(() => {});
    }
  };
  const uploadAvatar = async (file) => {
    if (!file || busy) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setAvatarError("Подойдёт изображение JPG, PNG или WEBP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setAvatarError("Изображение должно быть не больше 8 МБ.");
      return;
    }
    setImageUploading(true);
    setAvatarError("");
    setAvatarStatus("");
    try {
      const result = await api.uploadImage(file);
      await applyAvatarResult(result, "Фото загружено вручную");
    } catch (error) {
      setAvatarError(error.message || "Не удалось загрузить фото.");
    } finally {
      setImageUploading(false);
      if (avatarFileRef.current) avatarFileRef.current.value = "";
    }
  };
  const normalizedSocialLinks = () => form.links
    .map((link) => {
      const url = link.url.trim();
      const platform = contactSocialPlatform({ ...link, url });
      const fallbackLabel = CONTACT_SOCIAL_PLATFORMS[platform]?.label || "Соцсеть";
      return { label: link.label.trim() || fallbackLabel, url };
    })
    .filter((link) => link.url && contactSocialPlatform(link) !== "website");
  const resolveAvatar = async ({ automatic = false } = {}) => {
    if (busy) return;
    const links = normalizedSocialLinks();
    if (!links.length) {
      if (!automatic) setAvatarError("Сначала добавьте ссылку на соцсеть.");
      return;
    }
    const resolveKey = links.map((link) => link.url).join("\n");
    if (automatic && autoResolveKeyRef.current === resolveKey) return;
    autoResolveKeyRef.current = resolveKey;
    setAvatarResolving(true);
    setAvatarError("");
    setAvatarStatus(automatic ? "Пробуем получить фото из соцсети…" : "Получаем фото из соцсетей…");
    try {
      const result = await api.resolveContactAvatar(links);
      await applyAvatarResult(result, `Фото получено из ${result.source || "соцсети"}`);
    } catch (error) {
      setAvatarStatus("");
      setAvatarError(error.message || "Не удалось получить публичное фото из соцсети.");
    } finally {
      setAvatarResolving(false);
    }
  };
  const removeAvatar = async () => {
    if (busy || !form.avatarUrl) return;
    const previousId = uploadedImageIdFromUrl(form.avatarUrl);
    setForm((current) => ({ ...current, avatarUrl: "" }));
    setAvatarCleared(true);
    setAvatarError("");
    setAvatarStatus("Фото будет удалено после сохранения");
    if (previousId && uploadedImageIdsRef.current.has(previousId)) {
      uploadedImageIdsRef.current.delete(previousId);
      await api.delete(`/uploads/images/${encodeURIComponent(previousId)}`).catch(() => {});
    }
  };
  const cancel = async () => {
    if (busy) return;
    await cleanupUploadedImages();
    onCancel();
  };
  const save = async (event) => {
    event.preventDefault();
    if (busy) return;
    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        ...form,
        links: form.links.map((link) => ({ label: link.label.trim(), url: link.url.trim() })),
      };
      const result = creating
        ? await api.post("/contacts", payload)
        : await api.patch(`/contacts/${encodeURIComponent(contact.id)}`, payload);
      const savedUploadId = uploadedImageIdFromUrl(result.contact?.avatarSourceUrl);
      if (savedUploadId) uploadedImageIdsRef.current.delete(savedUploadId);
      await cleanupUploadedImages(result.contact?.avatarSourceUrl || "");
      const initialAvatarId = uploadedImageIdFromUrl(initialAvatarSourceUrl);
      if (initialAvatarId && initialAvatarId !== savedUploadId) {
        await api.delete(`/uploads/images/${encodeURIComponent(initialAvatarId)}`).catch(() => {});
      }
      toast(creating ? "Контакт добавлен" : "Контакт обновлён", "success");
      onSaved(result.contact);
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
  };
  const removeContact = async () => {
    if (creating || deleting) return;
    setDeleting(true);
    setSaveError("");
    try {
      await cleanupUploadedImages();
      await api.delete(`/contacts/${encodeURIComponent(contact.id)}`);
      toast("Контакт удалён", "success");
      onDeleted?.(contact);
    } catch (error) {
      setSaveError(error.message);
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };
  const knownCategories = Object.keys(CONTACT_CATEGORY_LABELS);
  const hasCustomCategory = form.category && !knownCategories.includes(form.category);

  return (
    <form className="contact-detail__edit-form" onSubmit={save}>
      <div className="contact-detail__edit-heading">
        <div className="contact-detail__avatar-editor">
          <ShadcnButton
            type="button"
            variant="ghost"
            size="icon"
            className="contact-detail__avatar-button"
            aria-label={previewAvatarUrl ? "Сменить фото контакта" : "Добавить фото контакта"}
            disabled={busy}
            onClick={() => avatarFileRef.current?.click()}
          >
            <Avatar user={{ name: form.name || contact?.name, avatarUrl: previewAvatarUrl }} size="xl" className="contact-detail__avatar" aria-hidden="true" />
            <span className="contact-detail__avatar-button-icon" aria-hidden="true">
              {imageUploading ? <Spinner /> : <Upload />}
            </span>
          </ShadcnButton>
          <Input
            ref={avatarFileRef}
            className="sr-only !size-px"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Загрузить фото контакта"
            onChange={(event) => uploadAvatar(event.target.files?.[0])}
          />
        </div>
        <div><span>{creating ? "Добавление контакта" : "Редактирование контакта"}</span><strong>{creating ? (form.name.trim() || "Новый контакт") : contact.name}</strong></div>
        {!creating && <ShadcnButton
          type="button"
          variant="outline"
          size="icon"
          className="contact-detail__favorite size-11 rounded-full"
          data-favorite={contact.favorite ? "true" : "false"}
          aria-pressed={Boolean(contact.favorite)}
          aria-label={contact.favorite ? `Убрать ${contact.name} из избранного` : `Добавить ${contact.name} в избранное`}
          title={contact.favorite ? "Убрать из избранного" : "Добавить в избранное"}
          disabled={favoriteSaving}
          onClick={onFavoriteToggle}
        >
          {favoriteSaving ? <Spinner /> : <Star fill={contact.favorite ? "currentColor" : "none"} aria-hidden="true" />}
        </ShadcnButton>}
      </div>
      <div className="contact-detail__avatar-controls">
        <ShadcnButton type="button" variant="outline" disabled={busy} onClick={() => avatarFileRef.current?.click()}>
          {imageUploading ? <Spinner /> : <Upload />}{previewAvatarUrl ? "Сменить фото" : "Загрузить фото"}
        </ShadcnButton>
        <ShadcnButton type="button" variant="outline" disabled={busy || !normalizedSocialLinks().length} onClick={() => resolveAvatar()}>
          {avatarResolving ? <Spinner /> : <Sparkles />}Из соцсетей
        </ShadcnButton>
        {form.avatarUrl && <ShadcnButton type="button" variant="ghost" disabled={busy} onClick={removeAvatar}><Trash2 />Удалить</ShadcnButton>}
      </div>
      {(avatarStatus || avatarError) && <p className={`contact-detail__avatar-message${avatarError ? " is-error" : ""}`} role={avatarError ? "alert" : "status"}>{avatarError || avatarStatus}</p>}
      <div className="contact-detail__edit-fields">
        <label className="contact-detail__edit-field contact-detail__edit-field--wide">
          <span>Имя</span>
          <Input value={form.name} maxLength={120} required autoFocus onChange={(event) => setField("name", event.target.value)} />
        </label>
        <label className="contact-detail__edit-field">
          <span>Компания</span>
          <Input value={form.company} maxLength={160} placeholder="Не указана" onChange={(event) => setField("company", event.target.value)} />
        </label>
        <label className="contact-detail__edit-field">
          <span>Направление</span>
          <NativeSelect value={form.category} onChange={(event) => setField("category", event.target.value)}>
            <NativeSelectOption value="">Без направления</NativeSelectOption>
            {hasCustomCategory && <NativeSelectOption value={form.category}>{form.category}</NativeSelectOption>}
            {knownCategories.map((value) => <NativeSelectOption key={value} value={value}>{CONTACT_CATEGORY_LABELS[value]}</NativeSelectOption>)}
          </NativeSelect>
        </label>
        <label className="contact-detail__edit-field contact-detail__edit-field--wide">
          <span>Должность или роль</span>
          <Input value={form.role} maxLength={240} placeholder="Не указана" onChange={(event) => setField("role", event.target.value)} />
        </label>
        <label className="contact-detail__edit-field contact-detail__edit-field--wide">
          <span>Статус</span>
          <Input value={form.status} maxLength={80} placeholder="Например, в работе" onChange={(event) => setField("status", event.target.value)} />
        </label>
      </div>
      <section className="contact-detail__edit-section" aria-labelledby="contact-edit-links-title">
        <h2 id="contact-edit-links-title"><Link2 aria-hidden="true" />Ссылки</h2>
        <div className="contact-detail__edit-links">
          {form.links.map((link, index) => (
            <div className="contact-detail__edit-link" key={index}>
              <Input aria-label={`Название ссылки ${index + 1}`} value={link.label} maxLength={40} required placeholder="Facebook" onChange={(event) => setLink(index, "label", event.target.value)} />
              <Input aria-label={`Адрес ссылки ${index + 1}`} type="url" value={link.url} maxLength={2000} required placeholder="https://…" onChange={(event) => setLink(index, "url", event.target.value)} onBlur={() => { if (!form.avatarUrl) resolveAvatar({ automatic: true }); }} />
              <ShadcnButton type="button" variant="ghost" size="icon" aria-label={`Удалить ссылку ${link.label || index + 1}`} onClick={() => removeLink(index)}><Trash2 /></ShadcnButton>
            </div>
          ))}
          {!form.links.length && <p>Ссылок пока нет.</p>}
        </div>
        {form.links.length < 12 && <ShadcnButton type="button" variant="ghost" className="contact-detail__add-link" onClick={() => setForm((current) => ({ ...current, links: [...current.links, { label: "", url: "" }] }))}><Plus />Добавить ссылку</ShadcnButton>}
      </section>
      <label className="contact-detail__edit-field contact-detail__edit-notes">
        <span><NotebookText aria-hidden="true" />Заметки</span>
        <Textarea value={form.notes} maxLength={50000} rows={8} placeholder="Добавьте контекст, договорённости или историю общения" onChange={(event) => setField("notes", event.target.value)} />
      </label>
      {saveError && <p className="contact-detail__edit-error" role="alert">{saveError}</p>}
      <div className="contact-detail__edit-actions">
        {!creating && <ShadcnButton type="button" variant="ghost" className="contact-detail__delete" disabled={busy} onClick={() => setDeleteOpen(true)}><Trash2 />Удалить</ShadcnButton>}
        <ShadcnButton type="button" variant="ghost" disabled={busy} onClick={cancel}>Отмена</ShadcnButton>
        <ShadcnButton type="submit" disabled={busy}>{saving ? <><Spinner />Сохраняем</> : <><Check />{creating ? "Добавить контакт" : "Сохранить"}</>}</ShadcnButton>
      </div>
      {!creating && <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить контакт «{contact.name}»?</AlertDialogTitle>
            <AlertDialogDescription>Контакт исчезнет из вашего списка. Отменить это действие не получится.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} aria-busy={deleting || undefined} onClick={removeContact}>
              {deleting ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}Удалить контакт
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </form>
  );
}

function ContactReadView({ contact }) {
  const socialLinks = (contact.links || []).filter((link) => link?.url);
  return (
    <article className="contact-detail__edit-form" aria-label={`Контакт ${contact.name}`}>
      <div className="contact-detail__edit-heading">
        <Avatar user={contact} size="xl" className="contact-detail__avatar" aria-hidden="true" />
        <div><span>{contact.company || "Контакт"}</span><strong>{contact.name}</strong></div>
      </div>
      <div className="contact-detail__edit-fields">
        {contact.role && <div className="contact-detail__edit-field contact-detail__edit-field--wide"><span>Должность или роль</span><strong>{contact.role}</strong></div>}
        {contact.status && <div className="contact-detail__edit-field contact-detail__edit-field--wide"><span>Статус</span><strong>{contact.status}</strong></div>}
      </div>
      {socialLinks.length > 0 && <section className="contact-detail__edit-section" aria-labelledby="contact-read-links-title">
        <h2 id="contact-read-links-title"><Link2 aria-hidden="true" />Ссылки</h2>
        <div className="contact-card__social-links">{socialLinks.map((link, index) => <ContactSocialLink key={`${link.url}-${index}`} link={link} contactName={contact.name} />)}</div>
      </section>}
      <section className="contact-detail__edit-section typeset typeset-rollapp" aria-labelledby="contact-read-notes-title">
        <h2 id="contact-read-notes-title"><NotebookText aria-hidden="true" />Заметки</h2>
        <ContactNotes notes={contact.notes} />
      </section>
    </article>
  );
}

function ContactDetailDrawer({ contactId, onClose, onUpdated, onDeleted, readOnly = false }) {
  const isMobile = useIsMobile();
  const toast = useToast();
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const { data, loading, error, reload, updateData } = useAsync(() => api.get(`/contacts/${encodeURIComponent(contactId)}`), [contactId]);
  const contact = data?.contact;
  const accent = contactAccent(contact?.company);
  const toggleFavorite = async () => {
    if (!contact || favoriteSaving) return;
    const favorite = !contact.favorite;
    setFavoriteSaving(true);
    try {
      await api.patch(`/contacts/${encodeURIComponent(contact.id)}/favorite`, { favorite });
      const updatedContact = { ...contact, favorite };
      updateData((current) => ({ ...current, contact: updatedContact }));
      onUpdated?.(updatedContact);
      toast(favorite ? "Контакт добавлен в избранное" : "Контакт удалён из избранного", "success");
    } catch (favoriteError) {
      toast(favoriteError.message, "error");
    } finally {
      setFavoriteSaving(false);
    }
  };
  return (
    <Drawer open showSwipeHandle={isMobile} swipeDirection={isMobile ? "down" : "right"} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerContent className="contact-detail-drawer rollapp-body" style={{ "--contact-accent": accent }}>
        <DrawerClose
          render={<ShadcnButton type="button" variant="ghost" size="icon" className="contact-detail__close size-12 rounded-full" />}
          aria-label="Закрыть карточку контакта"
        ><X /></DrawerClose>
        {loading ? <LoadingScreen compact /> : error ? (
          <div className="contacts-sphere__empty" role="alert">
            <strong>Не удалось открыть контакт</strong>
            <span>{error.message}</span>
            <Button variant="outline" onClick={() => reload().catch(() => {})}>Попробовать снова</Button>
          </div>
        ) : contact ? (
          <ScrollArea className="contact-detail__scroll">
            {readOnly ? <ContactReadView contact={contact} /> : <ContactEditForm
              contact={contact}
              favoriteSaving={favoriteSaving}
              onFavoriteToggle={toggleFavorite}
              onCancel={onClose}
              onSaved={(savedContact) => {
                updateData((current) => ({ ...current, contact: savedContact }));
                onUpdated?.(savedContact);
              }}
              onDeleted={onDeleted}
            />}
          </ScrollArea>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

function ContactCreateDrawer({ onClose, onCreated }) {
  const isMobile = useIsMobile();
  return (
    <Drawer open showSwipeHandle={isMobile} swipeDirection={isMobile ? "down" : "right"} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerContent className="contact-detail-drawer rollapp-body" style={{ "--contact-accent": contactAccent("") }}>
        <DrawerClose
          render={<ShadcnButton type="button" variant="ghost" size="icon" className="contact-detail__close size-12 rounded-full" />}
          aria-label="Закрыть добавление контакта"
        ><X /></DrawerClose>
        <ScrollArea className="contact-detail__scroll">
          <ContactEditForm onCancel={onClose} onSaved={onCreated} />
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}

function ContactsProfileControls({ onAdd }) {
  return (
    <section className="wishes-page__profile-controls" aria-label="Управление контактами">
      <div className="page-actions wishes-page__hero-actions" role="group" aria-label="Действия с контактами">
        <Button className="h-12 min-w-[180px] px-6 text-base max-[560px]:min-w-0" shape="pill" onClick={onAdd}>Добавить</Button>
      </div>
    </section>
  );
}

function ContactsSpherePage() {
  const toast = useToast();
  const access = useSphereSharing();
  const globalShareRef = useGlobalShareHandler();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [company, setCompany] = useState("");
  const [category, setCategory] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [favoriteSavingIds, setFavoriteSavingIds] = useState(() => new Set());
  const [page, setPage] = useState(1);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [creatingContact, setCreatingContact] = useState(false);
  const [contactsVersion, setContactsVersion] = useState(0);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [search]);
  const query = new URLSearchParams({ page: String(page), pageSize: "48" });
  if (debouncedSearch) query.set("search", debouncedSearch);
  if (company) query.set("company", company);
  if (category) query.set("category", category);
  if (favoriteOnly) query.set("favorite", "true");
  const { data, loading, error, reload, updateData } = useAsync(() => api.get(`/contacts?${query.toString()}`), [debouncedSearch, company, category, favoriteOnly, page, contactsVersion]);
  const contacts = data?.contacts || [];
  const companies = data?.facets?.companies || [];
  const categories = data?.facets?.categories || [];
  const hasFilters = Boolean(search || company || category || favoriteOnly);
  const clearFilters = () => { setSearch(""); setDebouncedSearch(""); setCompany(""); setCategory(""); setFavoriteOnly(false); setPage(1); };
  const start = data?.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const end = data?.total ? Math.min(data.total, start + contacts.length - 1) : 0;
  globalShareRef.current = async () => {
    const path = sphereSectionPath({ ownerUsername: access.owner?.username, sphere: "contacts", section: "contacts" });
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      toast(access.isOwner ? "Ссылка на раздел скопирована. Открыть её смогут выбранные люди." : "Ссылка на раздел скопирована");
    } catch {
      toast("Не удалось скопировать ссылку", "error");
    }
  };
  const toggleFavorite = async (contact) => {
    if (favoriteSavingIds.has(contact.id)) return;
    const favorite = !contact.favorite;
    setFavoriteSavingIds((current) => new Set(current).add(contact.id));
    try {
      await api.patch(`/contacts/${encodeURIComponent(contact.id)}/favorite`, { favorite });
      updateData((current) => {
        if (!current) return current;
        const nextContacts = current.contacts
          .map((item) => item.id === contact.id ? { ...item, favorite } : item)
          .filter((item) => !favoriteOnly || item.favorite);
        return {
          ...current,
          contacts: nextContacts,
          total: favoriteOnly && !favorite ? Math.max(0, current.total - 1) : current.total,
          favoriteTotal: Math.max(0, Number(current.favoriteTotal || 0) + (favorite ? 1 : -1)),
        };
      });
      toast(favorite ? "Контакт добавлен в избранное" : "Контакт удалён из избранного", "success");
      await reload({ background: true });
    } catch (favoriteError) {
      toast(favoriteError.message, "error");
      await reload({ background: true }).catch(() => {});
    } finally {
      setFavoriteSavingIds((current) => {
        const next = new Set(current);
        next.delete(contact.id);
        return next;
      });
    }
  };

  return (
    <div data-read-only={access.readOnly ? "true" : undefined} className="app-page sphere-page sphere-page--contacts typeset typeset-rollapp">
      {!access.readOnly && <ContactsProfileControls onAdd={() => setCreatingContact(true)} />}
      <section className="contacts-sphere not-typeset" aria-label="Контакты">
        <div className="contacts-sphere__toolbar">
          <InputGroup className="contacts-sphere__search">
            <InputGroupAddon align="inline-start"><Search aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput type="search" aria-label="Поиск по контактам" placeholder="Имя, роль, компания или заметка" value={search} onChange={(event) => setSearch(event.target.value)} />
            {search && <InputGroupAddon align="inline-end"><InputGroupButton type="button" size="icon-sm" className="contacts-sphere__search-clear rounded-full" aria-label="Очистить поиск" onClick={() => setSearch("")}><X /></InputGroupButton></InputGroupAddon>}
          </InputGroup>
          <div className="contacts-sphere__filters" aria-label="Фильтры контактов">
            <Select value={company || ALL_CONTACT_COMPANIES} onValueChange={(value) => { setCompany(value === ALL_CONTACT_COMPANIES ? "" : value); setPage(1); }}>
              <SelectTrigger className="contacts-sphere__select" aria-label="Компания">
                <SelectValue>{(value) => value === ALL_CONTACT_COMPANIES ? "Все компании" : value}</SelectValue>
              </SelectTrigger>
              <SelectContent className="contacts-sphere__select-content" align="start" alignItemWithTrigger={false}>
                <SelectItem value={ALL_CONTACT_COMPANIES}>Все компании</SelectItem>
                {companies.map((item) => <SelectItem key={item.company} value={item.company}>{item.company} · {item.count}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={category || ALL_CONTACT_CATEGORIES} onValueChange={(value) => { setCategory(value === ALL_CONTACT_CATEGORIES ? "" : value); setPage(1); }}>
              <SelectTrigger className="contacts-sphere__select" aria-label="Категория">
                <SelectValue>{(value) => value === ALL_CONTACT_CATEGORIES ? "Все направления" : (CONTACT_CATEGORY_LABELS[value] || value)}</SelectValue>
              </SelectTrigger>
              <SelectContent className="contacts-sphere__select-content" align="start" alignItemWithTrigger={false}>
                <SelectItem value={ALL_CONTACT_CATEGORIES}>Все направления</SelectItem>
                {categories.map((item) => <SelectItem key={item.category} value={item.category}>{CONTACT_CATEGORY_LABELS[item.category] || item.category} · {item.count}</SelectItem>)}
              </SelectContent>
            </Select>
            <ShadcnButton
              type="button"
              variant="outline"
              className="contacts-sphere__favorite-filter h-[50px] rounded-[15px] px-4"
              data-favorite={favoriteOnly ? "true" : "false"}
              aria-pressed={favoriteOnly}
              onClick={() => { setFavoriteOnly((value) => !value); setPage(1); }}
            >
              <Star fill={favoriteOnly ? "currentColor" : "none"} aria-hidden="true" />
              Избранные{data?.favoriteTotal ? ` · ${data.favoriteTotal}` : ""}
            </ShadcnButton>
            {hasFilters && <ShadcnButton type="button" variant="ghost" className="contacts-sphere__reset h-11 rounded-full px-4" onClick={clearFilters}>Сбросить</ShadcnButton>}
          </div>
        </div>
        {!loading && !error && (
          <div className="contacts-sphere__result-meta" aria-live="polite">
            <strong>{data?.total || 0} {contactCountNoun(data?.total || 0)}</strong>
            {data?.total > data.pageSize && <span>Показаны {start}–{end}</span>}
          </div>
        )}
        {loading ? <LoadingScreen compact /> : error ? (
          <div className="contacts-sphere__empty" role="alert">
            <strong>Не удалось загрузить контакты</strong>
            <span>{error.message}</span>
            <Button variant="outline" onClick={() => reload().catch(() => {})}>Попробовать снова</Button>
          </div>
        ) : contacts.length ? (
          <>
            <ul className="contacts-grid">
              {contacts.map((contact) => {
                const accent = contactAccent(contact.company);
                const socialLinks = (contact.links || []).filter((link) => link?.url);
                return (
                  <li className="contact-card" style={{ "--contact-accent": accent }} key={contact.id}>
                    <ShadcnButton
                      type="button"
                      variant="ghost"
                      className="contact-card__open"
                      aria-label={`Открыть контакт ${contact.name}`}
                      onClick={() => setSelectedContactId(contact.id)}
                    />
                    <div className="contact-card__body h-auto w-full min-w-0 shrink flex-col items-stretch justify-start gap-0 overflow-hidden rounded-none bg-transparent p-2 text-left whitespace-normal">
                      <div className="contact-card__top w-full min-w-0">
                        <div className="contact-card__avatar-wrap">
                          <Avatar user={contact} size="lg" className="contact-card__avatar" aria-hidden="true" />
                          {!access.readOnly && <ShadcnButton
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="contact-card__favorite rounded-full"
                            data-favorite={contact.favorite ? "true" : "false"}
                            aria-pressed={Boolean(contact.favorite)}
                            aria-label={contact.favorite ? `Убрать ${contact.name} из избранного` : `Добавить ${contact.name} в избранное`}
                            title={contact.favorite ? "Убрать из избранного" : "Добавить в избранное"}
                            disabled={favoriteSavingIds.has(contact.id)}
                            onClick={() => toggleFavorite(contact)}
                          >
                            {favoriteSavingIds.has(contact.id) ? <Spinner /> : <Star fill={contact.favorite ? "currentColor" : "none"} aria-hidden="true" />}
                          </ShadcnButton>}
                        </div>
                        {contact.category && <span className="contact-card__category-slot"><span className="contact-card__category">{CONTACT_CATEGORY_LABELS[contact.category] || contact.category}</span></span>}
                      </div>
                      <div className="contact-card__identity w-full min-w-0">
                        <div className="contact-card__name-row w-full min-w-0">
                          <strong>{contact.name}</strong>
                        </div>
                        <span className="contact-card__company"><Building2 aria-hidden="true" /><span className="contact-card__company-text">{contact.company}</span></span>
                      </div>
                      <div className="contact-card__bio w-full min-w-0">
                        <span className="contact-card__bio-text">{contact.role || (contact.hasNotes ? "Есть заметки" : "Роль не указана")}</span>
                      </div>
                    </div>
                    {(contact.hasNotes || socialLinks.length > 0) && (
                      <footer className="contact-card__footer">
                        {contact.hasNotes && <ShadcnButton type="button" variant="ghost" className="contact-card__details h-9 rounded-full px-1" onClick={() => setSelectedContactId(contact.id)}><NotebookText aria-hidden="true" />Заметки</ShadcnButton>}
                        {socialLinks.length > 0 && (
                          <span className="contact-card__social-links" aria-label={`Ссылки ${contact.name}`}>
                            {socialLinks.map((link, index) => <ContactSocialLink key={`${link.url}-${index}`} link={link} contactName={contact.name} />)}
                          </span>
                        )}
                      </footer>
                    )}
                  </li>
                );
              })}
            </ul>
            {data.total > data.pageSize && (
              <nav className="contacts-pagination" aria-label="Страницы контактов">
                <ShadcnButton type="button" variant="outline" className="h-12 rounded-full px-5" disabled={page <= 1} onClick={() => { setPage((value) => Math.max(1, value - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}><ArrowLeft />Назад</ShadcnButton>
                <span>{data.page} / {Math.ceil(data.total / data.pageSize)}</span>
                <ShadcnButton type="button" variant="outline" className="h-12 rounded-full px-5" disabled={!data.hasMore} onClick={() => { setPage((value) => value + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Дальше<ArrowRight /></ShadcnButton>
              </nav>
            )}
          </>
        ) : (
          <div className="contacts-sphere__empty">
            <span className="contacts-sphere__empty-icon"><ContactRound aria-hidden="true" /></span>
            <strong>{favoriteOnly ? "В избранном пока нет контактов" : "Контакты не найдены"}</strong>
            <span>{favoriteOnly ? "Нажмите на звезду в карточке контакта, чтобы добавить его сюда." : "Попробуйте изменить запрос или сбросить фильтры."}</span>
            {hasFilters && <Button variant="outline" onClick={clearFilters}>Сбросить фильтры</Button>}
          </div>
        )}
      </section>
      {selectedContactId && <ContactDetailDrawer
        readOnly={access.readOnly}
        contactId={selectedContactId}
        onClose={() => setSelectedContactId("")}
        onUpdated={() => reload({ background: true }).catch(() => {})}
        onDeleted={() => {
          setSelectedContactId("");
          setContactsVersion((value) => value + 1);
        }}
      />}
      {!access.readOnly && creatingContact && <ContactCreateDrawer
        onClose={() => setCreatingContact(false)}
        onCreated={(contact) => {
          setCreatingContact(false);
          clearFilters();
          setSelectedContactId(contact.id);
          setContactsVersion((value) => value + 1);
        }}
      />}
    </div>
  );
}

function SphereAccessRequestBanner() {
  const access = useSphereSharing();
  const toast = useToast();
  const [savingId, setSavingId] = useState("");
  if (!access.active || !access.isOwner || access.requests.length === 0) return null;

  const respond = async (request, decision) => {
    if (savingId) return;
    setSavingId(request.id);
    try {
      await api.post(`/sphere-access-requests/${request.id}/respond`, { decision });
      await access.reload();
      toast(decision === "approved"
        ? `Доступ для ${request.requester.name} открыт`
        : `Запрос от ${request.requester.name} отклонён`, "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setSavingId("");
    }
  };

  return (
    <section className="sphere-access-requests rollapp-body" aria-label="Запросы доступа к пространству">
      {access.requests.map((request) => (
        <Card key={request.id} className="sphere-access-request">
          <div className="sphere-access-request__person">
            <Avatar user={request.requester} size="sm" className="!size-11" />
            <span>
              <strong>{request.requester.name}</strong>
              <small>Бизнес-аккаунт · @{request.requester.username}</small>
            </span>
          </div>
          <div className="sphere-access-request__copy">
            <strong>Запрашивает доступ к «{SPHERE_SECTION_LABELS[access.section] || access.section}»</strong>
            {request.message && <p>{request.message}</p>}
          </div>
          <div className="sphere-access-request__actions">
            <ShadcnButton type="button" variant="outline" disabled={Boolean(savingId)} onClick={() => respond(request, "declined")}>Отклонить</ShadcnButton>
            <ShadcnButton type="button" disabled={Boolean(savingId)} onClick={() => respond(request, "approved")}>
              {savingId === request.id && <Spinner data-icon="inline-start" />}
              Открыть доступ
            </ShadcnButton>
          </div>
        </Card>
      ))}
    </section>
  );
}

const BUSINESS_REQUEST_STATUS = {
  pending: { label: "Ожидает ответа", variant: "secondary" },
  approved: { label: "Доступ открыт", variant: "default" },
  declined: { label: "Отклонён", variant: "destructive" },
  cancelled: { label: "Отменён", variant: "outline" },
};

function BusinessAccessPage() {
  const { user } = useSession();
  const isMobile = useIsMobile();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [people, setPeople] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [sphere, setSphere] = useState("identity");
  const [section, setSection] = useState(SPHERE_SECTIONS.identity[0]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState("");

  const loadRequests = useCallback(async () => {
    if (user?.accountType !== "business") return;
    setLoadingRequests(true);
    try {
      const result = await api.get("/business-access/requests");
      setRequests(result.requests || []);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setLoadingRequests(false);
    }
  }, [toast, user?.accountType]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 180);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (user?.accountType !== "business") return undefined;
    let current = true;
    const query = new URLSearchParams();
    if (debouncedSearch) query.set("search", debouncedSearch);
    setLoadingPeople(true);
    api.get(`/business-access/users${query.size ? `?${query.toString()}` : ""}`).then((result) => {
      if (current) setPeople(result.people || []);
    }).catch((error) => {
      if (current) toast(error.message, "error");
    }).finally(() => {
      if (current) setLoadingPeople(false);
    });
    return () => { current = false; };
  }, [debouncedSearch, toast, user?.accountType]);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  if (user?.accountType !== "business") return <Navigate to={APP_HOME} replace />;

  const selectSphere = (nextSphere) => {
    setSphere(nextSphere);
    setSection(SPHERE_SECTIONS[nextSphere][0]);
  };
  const openRequest = (person) => {
    setSelectedPerson(person);
    setSphere("identity");
    setSection(SPHERE_SECTIONS.identity[0]);
    setMessage("");
  };
  const sendRequest = async (event) => {
    event.preventDefault();
    if (!selectedPerson || saving) return;
    setSaving(true);
    try {
      await api.post("/business-access/requests", {
        ownerId: selectedPerson.id,
        sphere,
        section,
        message,
      });
      setSelectedPerson(null);
      await loadRequests();
      toast("Запрос отправлен владельцу пространства", "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setSaving(false);
    }
  };
  const cancelRequest = async (request) => {
    if (cancellingId) return;
    setCancellingId(request.id);
    try {
      await api.delete(`/business-access/requests/${request.id}`);
      await loadRequests();
      toast("Запрос отменён", "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setCancellingId("");
    }
  };

  return (
    <div className="app-page business-access-page rollapp-body">
      <header className="business-access-page__header">
        <span className="eyebrow"><Building2 aria-hidden="true" />Бизнес-аккаунт</span>
        <h1>Доступ к пространствам клиентов</h1>
        <p>Найдите пользователя и запросите конкретный раздел. Доступ только для чтения откроется после его подтверждения.</p>
      </header>

      <section className="business-access-page__section" aria-labelledby="business-people-title">
        <div className="business-access-page__section-heading">
          <div><h2 id="business-people-title">Пользователи</h2><p>В запросе всегда указано одно конкретное пространство.</p></div>
          <InputGroup className="business-access-page__search">
            <InputGroupAddon align="inline-start"><Search aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput type="search" aria-label="Найти пользователя" placeholder="Имя или username" value={search} onChange={(event) => setSearch(event.target.value)} />
          </InputGroup>
        </div>
        {loadingPeople ? <div className="business-access-page__status"><Spinner /><span>Загружаем пользователей…</span></div> : people.length ? (
          <div className="business-access-page__people">
            {people.map((person) => (
              <Card key={person.id} className="business-access-person">
                <Avatar user={person} size="md" />
                <span><strong>{person.name}</strong><small>@{person.username}</small></span>
                <ShadcnButton type="button" variant="outline" onClick={() => openRequest(person)}>Запросить доступ</ShadcnButton>
              </Card>
            ))}
          </div>
        ) : <div className="business-access-page__status"><Users aria-hidden="true" /><span>Пользователи не найдены</span></div>}
      </section>

      <section className="business-access-page__section" aria-labelledby="business-requests-title">
        <div className="business-access-page__section-heading"><div><h2 id="business-requests-title">Мои запросы</h2><p>Одобренные пространства появятся в переключателе сфер.</p></div></div>
        {loadingRequests ? <div className="business-access-page__status"><Spinner /><span>Загружаем запросы…</span></div> : requests.length ? (
          <div className="business-access-page__requests">
            {requests.map((request) => {
              const status = BUSINESS_REQUEST_STATUS[request.status] || BUSINESS_REQUEST_STATUS.pending;
              return (
                <Card key={request.id} className="business-access-request">
                  <div className="business-access-request__owner"><Avatar user={request.owner} size="sm" className="!size-11" /><span><strong>{request.owner.name}</strong><small>@{request.owner.username}</small></span></div>
                  <div className="business-access-request__scope"><strong>{SPHERE_SERVICES.find((item) => item.id === request.sphere)?.label || request.sphere}</strong><span>{SPHERE_SECTION_LABELS[request.section] || request.section}</span></div>
                  <Badge variant={status.variant}>{status.label}</Badge>
                  <div className="business-access-request__action">
                    {request.status === "approved" ? (
                      <ShadcnButton render={<Link to={sphereSectionPath({ ownerUsername: request.owner.username, sphere: request.sphere, section: request.section })} />} variant="outline">Открыть</ShadcnButton>
                    ) : request.status === "pending" ? (
                      <ShadcnButton type="button" variant="ghost" disabled={Boolean(cancellingId)} onClick={() => cancelRequest(request)}>{cancellingId === request.id && <Spinner data-icon="inline-start" />}Отменить</ShadcnButton>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : <div className="business-access-page__status"><Send aria-hidden="true" /><span>Вы ещё не отправляли запросы</span></div>}
      </section>

      <Drawer open={Boolean(selectedPerson)} showSwipeHandle swipeDirection={isMobile ? "down" : "right"} onOpenChange={(open) => !open && !saving && setSelectedPerson(null)}>
        <DrawerContent className="rollapp-body" style={isMobile ? undefined : { "--drawer-content-width": "min(34rem, calc(100vw - 2rem))" }}>
          <DrawerClose render={<ShadcnButton className="absolute top-2 right-2 z-10 size-12" variant="ghost" size="icon" type="button" disabled={saving} />} aria-label="Закрыть запрос доступа"><X aria-hidden="true" /></DrawerClose>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>Запросить доступ</DrawerTitle>
            <DrawerDescription>{selectedPerson ? `${selectedPerson.name} увидит запрос и сам решит, открыть ли пространство.` : ""}</DrawerDescription>
          </DrawerHeader>
          <form className="business-access-form" onSubmit={sendRequest}>
            <div className="business-access-form__person"><Avatar user={selectedPerson} size="md" /><span><strong>{selectedPerson?.name}</strong><small>@{selectedPerson?.username}</small></span></div>
            <FieldGroup className="gap-4">
              <Field><FieldLabel>Сфера</FieldLabel><Select value={sphere} onValueChange={selectSphere} disabled={saving}><SelectTrigger className="w-full"><SelectValue>{() => SPHERE_SERVICES.find((item) => item.id === sphere)?.label || sphere}</SelectValue></SelectTrigger><SelectContent className="w-(--anchor-width)" alignItemWithTrigger={false}>{SPHERE_SERVICES.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></Field>
              <Field><FieldLabel>Пространство</FieldLabel><Select value={section} onValueChange={setSection} disabled={saving}><SelectTrigger className="w-full"><SelectValue>{() => SPHERE_SECTION_LABELS[section] || section}</SelectValue></SelectTrigger><SelectContent className="w-(--anchor-width)" alignItemWithTrigger={false}>{SPHERE_SECTIONS[sphere].map((item) => <SelectItem key={item} value={item}>{SPHERE_SECTION_LABELS[item] || item}</SelectItem>)}</SelectContent></Select></Field>
              <Field><FieldLabel htmlFor="business-access-message">Сообщение <span className="muted">необязательно</span></FieldLabel><Textarea id="business-access-message" maxLength={500} rows={4} placeholder="Объясните, зачем вам нужен доступ" value={message} onChange={(event) => setMessage(event.target.value)} /></Field>
            </FieldGroup>
            <DrawerFooter className="border-t px-0 pt-4"><ShadcnButton type="submit" className="min-h-12 text-base" disabled={saving}>{saving && <Spinner data-icon="inline-start" />}Отправить запрос</ShadcnButton></DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function SphereSharePicker({ open, onOpenChange }) {
  const isMobile = useIsMobile();
  const toast = useToast();
  const access = useSphereSharing();
  const sectionOptions = SERVICE_TABS[access.sphere] || [];
  const [selectedSection, setSelectedSection] = useState(access.section);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 180);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (open) setSelectedSection(access.section);
  }, [access.section, access.sphere, open]);

  useEffect(() => {
    if (!open || !access.isOwner || !selectedSection) return undefined;
    let current = true;
    const query = new URLSearchParams({ sphere: access.sphere, section: selectedSection });
    if (debouncedSearch) query.set("search", debouncedSearch);
    setPeople([]);
    setLoading(true);
    setError("");
    api.get(`/sphere-shares/candidates?${query.toString()}`).then((result) => {
      if (current) setPeople(result.people || []);
    }).catch((loadError) => {
      if (current) setError(loadError.message);
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [access.isOwner, access.sphere, debouncedSearch, open, selectedSection]);

  const toggle = async (person) => {
    if (savingId) return;
    const granted = !person.granted;
    setSavingId(person.id);
    setError("");
    try {
      await api.post("/sphere-shares", {
        viewerId: person.id,
        sphere: access.sphere,
        section: selectedSection,
        granted,
      });
      setPeople((current) => current.map((item) => item.id === person.id ? { ...item, granted } : item));
      if (selectedSection === access.section) await access.reload();
      const selectedLabel = SPHERE_SECTION_LABELS[selectedSection] || selectedSection;
      toast(granted
        ? `Доступ к «${selectedLabel}» для ${person.name} открыт`
        : `Доступ к «${selectedLabel}» для ${person.name} закрыт`, "success");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingId("");
    }
  };

  const label = SPHERE_SECTION_LABELS[selectedSection] || selectedSection;
  return (
    <Drawer open={open} showSwipeHandle swipeDirection={isMobile ? "down" : "right"} onOpenChange={(nextOpen) => !savingId && onOpenChange(nextOpen)}>
      <DrawerContent
        className="rollapp-body"
        style={isMobile ? undefined : { "--drawer-content-width": "min(32rem, calc(100vw - 2rem))" }}
      >
        <DrawerClose
          render={<ShadcnButton className="absolute top-2 right-2 z-10 size-12" variant="ghost" size="icon" type="button" disabled={Boolean(savingId)} />}
          aria-label="Закрыть выбор пользователей"
        >
          <X aria-hidden="true" />
        </DrawerClose>
        <DrawerHeader className="pr-16 text-left!">
          <DrawerTitle>Доступ к пространствам</DrawerTitle>
          <DrawerDescription>Права на каждое пространство внутри сферы выдаются отдельно и только для чтения.</DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="sphere-share-picker__scope">
            <span>Пространство</span>
            <Select value={selectedSection} onValueChange={setSelectedSection} disabled={Boolean(savingId)}>
              <SelectTrigger className="w-full" aria-label="Пространство для настройки доступа">
                <SelectValue>{() => label}</SelectValue>
              </SelectTrigger>
              <SelectContent className="w-(--anchor-width)" alignItemWithTrigger={false}>
                {sectionOptions.map((section) => (
                  <SelectItem key={section.id} value={section.id}>{section.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <InputGroup className="sphere-share-picker__search">
            <InputGroupAddon align="inline-start"><Search aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput autoFocus type="search" aria-label="Найти пользователя" placeholder="Имя или username" value={search} onChange={(event) => setSearch(event.target.value)} />
          </InputGroup>
          {error && <Alert variant="destructive"><AlertTitle>Не удалось изменить доступ</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          {loading ? <div className="sphere-share-picker__status"><Spinner /><span>Загружаем людей…</span></div> : people.length ? (
            <ul className="sphere-share-picker__list" aria-label={`Пользователи с доступом к пространству «${label}»`}>
              {people.map((person) => (
                <li key={person.id}>
                  <ShadcnButton
                    type="button"
                    variant="ghost"
                    className="sphere-share-picker__person"
                    disabled={Boolean(savingId)}
                    aria-pressed={person.granted}
                    onClick={() => toggle(person)}
                  >
                    <Avatar user={person} size="sm" className="!size-11" />
                    <span><strong>{person.name}</strong><small>@{person.username}</small></span>
                    {person.accountType === "business" && (
                      <Badge variant="secondary" className="sphere-share-picker__account-type">
                        <BriefcaseBusiness aria-hidden="true" />
                        Бизнес
                      </Badge>
                    )}
                    {savingId === person.id ? <Spinner /> : <Checkbox checked={person.granted} tabIndex={-1} aria-hidden="true" />}
                  </ShadcnButton>
                </li>
              ))}
            </ul>
          ) : <div className="sphere-share-picker__status"><Users /><span>Люди не найдены</span></div>}
        </div>
        <DrawerFooter className="border-t pt-4">
          <DrawerClose render={<ShadcnButton className="min-h-12 text-base" type="button" />}>Готово</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function PersistentProfileHero({ user }) {
  const { openProfileEditor } = useProfileEditor();
  const access = useSphereSharing();
  const [sharePickerOpen, setSharePickerOpen] = useState(false);
  const profile = access.active ? (access.owner || user) : user;
  const editable = !access.active || access.isOwner;
  return (
    <section className="wishes-page__hero persistent-profile-hero" data-persistent-profile aria-labelledby="persistent-profile-name">
      <div className={`wishes-page__identity ${editable ? "" : "wishes-page__identity--readonly"}`}>
        <div className="sphere-share-avatars">
          {editable ? (
            <ShadcnButton type="button" variant="ghost" className="persistent-profile-hero__avatar-button h-auto min-h-0 rounded-full p-0 active:translate-y-0" aria-label={`Редактировать профиль ${profile.name}`} title="Редактировать профиль" onClick={openProfileEditor}>
              <Avatar user={profile} size="xl" className="wishes-page__hero-avatar" />
            </ShadcnButton>
          ) : <Avatar user={profile} size="xl" className="wishes-page__hero-avatar" />}
          {access.active && access.isOwner && (
            <div className="sphere-share-avatars__people" aria-label="Доступ к разделу">
              {access.people.slice(0, 3).map((person) => <Avatar key={person.id} user={person} size="sm" className="sphere-share-avatars__person !size-12" title={person.name} />)}
              <ShadcnButton
                type="button"
                variant="outline"
                size="icon"
                className="sphere-share-avatars__add !size-12 rounded-full"
                aria-label={`Открыть доступ к разделу «${SPHERE_SECTION_LABELS[access.section] || access.section}»`}
                title="Открыть доступ"
                onClick={() => setSharePickerOpen(true)}
              >
                <Plus aria-hidden="true" />
              </ShadcnButton>
            </div>
          )}
        </div>
        <span className="wishes-page__hero-copy">
          <h1 id="persistent-profile-name">{profile.name}</h1>
        </span>
        {access.readOnly && <Badge variant="secondary" className="sphere-share-readonly-badge"><Eye aria-hidden="true" />Только чтение</Badge>}
      </div>
      {access.active && access.isOwner && <SphereSharePicker open={sharePickerOpen} onOpenChange={setSharePickerOpen} />}
    </section>
  );
}

function WishesProfileControls({ selectedList, selectedSpace, onEditList, onAdd }) {
  return (
    <section className="wishes-page__profile-controls" aria-label="Управление Вишлистом">
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
        <ShadcnButton
          render={<Link to={`/app/wishes/catalog?tab=${encodeURIComponent(selectedSpace)}`} />}
          className="!size-12 shrink-0 rounded-full"
          variant="outline"
          size="icon"
          aria-label="Открыть каталог"
          title="Каталог"
        >
          <LayoutGrid aria-hidden="true" />
        </ShadcnButton>
      </div>
    </section>
  );
}

function PrivateSphereRoute({ children }) {
  const { user } = useSession();
  const access = useSphereSharing();
  if (access.loading) return <LoadingScreen compact />;
  if (access.active && access.error) {
    return (
      <div className="app-page sphere-access-error rollapp-body">
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><LockKeyhole aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>Нет доступа к разделу</EmptyTitle>
            <EmptyDescription>{access.error.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button render={<Link to={APP_HOME} />}>Вернуться в Rollapp</Button></EmptyContent>
        </Empty>
      </div>
    );
  }
  if (!canAccessPrivateSpheres(user) && !access.readOnly) return <Navigate to={APP_HOME} replace />;
  return children;
}

function ProtectedApp() {
  const location = useLocation();
  const { user, loading } = useSession(); const [wishModal, setWishModal] = useState(false); const [wishModalSpace, setWishModalSpace] = useState("products"); const [wishModalListId, setWishModalListId] = useState(""); const [version, setVersion] = useState(0);
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(safeNextPath(`${location.pathname}${location.search}`))}`} replace />;
  return <AppShell><Routes><Route index element={<Navigate to={APP_HOME} replace />} /><Route path="wishes" element={<WishesPage onAdd={(space, listId) => { setWishModalSpace(SPACE_IDS.includes(space) ? space : "products"); setWishModalListId(listId || ""); setWishModal(true); }} version={version} />} /><Route path="wishes/catalog" element={<WishCatalogPage />} /><Route path="business/access" element={<BusinessAccessPage />} /><Route path="ideas" element={<Navigate to={APP_HOME} replace />} /><Route path="friends" element={<Navigate to="/app/friends/subscriptions" replace />} /><Route path="friends/:section" element={<FriendsPage />} /><Route path="spheres/identity" element={<PrivateSphereRoute><TabbedSpherePage sphereId="identity" tabs={IDENTITY_TABS} /></PrivateSphereRoute>} /><Route path="spheres/career" element={<PrivateSphereRoute><TabbedSpherePage sphereId="career" tabs={CAREER_TABS} /></PrivateSphereRoute>} /><Route path="spheres/education" element={<PrivateSphereRoute><TabbedSpherePage sphereId="education" tabs={EDUCATION_TABS} /></PrivateSphereRoute>} /><Route path="spheres/health" element={<PrivateSphereRoute><TabbedSpherePage sphereId="health" tabs={HEALTH_TABS} /></PrivateSphereRoute>} /><Route path="spheres/contacts" element={<PrivateSphereRoute><ContactsSpherePage /></PrivateSphereRoute>} /><Route path="gifts" element={<Navigate to={APP_HOME} replace />} /><Route path="notifications" element={<Navigate to={APP_HOME} replace />} /><Route path="settings" element={<Navigate to={APP_HOME} replace />} /><Route path="*" element={<Navigate to={APP_HOME} replace />} /></Routes>{wishModal && <WishModal space={wishModalSpace} initialListId={wishModalListId} onClose={() => setWishModal(false)} onSaved={() => { setWishModal(false); setVersion((v) => v + 1); }} />}</AppShell>;
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
        vehicleMake: wish.vehicleMake || "",
        vehicleModel: wish.vehicleModel || "",
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
  const listMutationRef = useRef(false);
  const { busy, remove, fulfilled, share, save, update, repeat } = useWishActions({ wish, profile, lists, shareToken, onChanged });
  const interactionBusy = busy || removingFromGroup || groupBusy;
  const categoryLists = lists.filter((list) => !isGeneralList(list));
  const cardSpace = wishSpaceId(wish, lists);
  const visibleLists = categoryLists.filter((list) => listSpace(list) === cardSpace);
  const placeAddress = cardSpace === "places" ? placeSnippetAddress(wish.description) : "";
  const secretListMembership = lists.some((list) => list.privacy === "private" && wish.listIds?.includes(list.id));
  const secret = isWishSecret(wish, lists);
  const previewImageUrl = wishPreviewImageUrl(wish);
  const videoPreview = isVideoUrl(wish.url);

  useEffect(() => {
    if (!listMutationRef.current) setSelectedListIds([...(wish.listIds || [])]);
  }, [wish.id, wish.listIds]);
  useEffect(() => {
    if (groupBusy) setMenu(false);
  }, [groupBusy]);

  const closeMenu = () => {
    setMenu(false);
  };

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
      selected ? `Желание убрано из списка «${listDisplayTitle(list)}»` : `Желание добавлено в список «${listDisplayTitle(list)}»`,
    );
    setSelectedListIds(updatedWish ? [...(updatedWish.listIds || [])] : previousIds);
    listMutationRef.current = false;
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
    <Card data-group-wish-id={wish.id} data-wish-group-id={dragGroupId || undefined} aria-busy={groupBusy || undefined} onPointerDown={onPointerDown} className={`wish-card gap-0 overflow-visible rounded-none border-0 bg-transparent py-0 shadow-none ring-0 ${variant ? `wish-card--${variant}` : ""} ${cardSpace === "places" ? "wish-card--place" : ""} ${videoPreview ? "wish-card--video" : ""} ${wish.status === "fulfilled" ? "is-fulfilled" : ""} ${draggable ? "is-draggable" : ""} ${isDropTarget ? "is-group-target" : ""} ${isDragging ? "is-dragging" : ""}`}>
      {onOpen && <ShadcnButton type="button" variant="ghost" className="wish-card__open absolute inset-0 z-[2] h-full w-full rounded-[inherit] border-0 bg-transparent p-0 hover:bg-transparent dark:hover:bg-transparent active:translate-y-0" data-wish-id={wish.id} aria-label={`Открыть желание «${wish.title}»`} aria-haspopup="dialog" onClick={(event) => { closeMenu(); onOpen(event.currentTarget); }} />}
      {draggable && <span className="wish-card__drag-handle" data-wish-drag-handle aria-hidden="true"><GripVertical /></span>}
      <div className="wish-card__image">{previewImageUrl ? <img src={previewImageUrl} alt="" draggable="false" referrerPolicy="no-referrer" onError={(event) => applyRetailerPreviewFallback(event, wish.url)} /> : <span><Gift size={36} /></span>}{wish.status === "fulfilled" && <Badge className="fulfilled-badge"><Check /> Исполнено</Badge>}</div>
      <div className="wish-card__body">
        <div className="wish-card__top">
          {(wish.price != null || wish.eventDate) && <span>{wish.price != null ? formatMoney(wish.price, wish.currency) : ""}{wish.price != null && wish.eventDate ? " · " : ""}{wish.eventDate ? formatEventDate(wish.eventDate) : ""}</span>}
          <DropdownMenu open={menu} onOpenChange={setMenu}>
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
              </>}
              {owner && <DropdownMenuSub>
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
                        onCheckedChange={() => toggleList(list)}
                      >
                        <span className="wish-card-list-icon grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground" aria-hidden="true"><ListPlus /></span>
                        <span className="min-w-0 flex-1 truncate">
                          {listDisplayTitle(list)}
                          {list.privacy !== "public" && <small className="ml-1 inline-flex align-middle text-muted-foreground" aria-hidden="true">
                            {list.privacy === "private" ? <LockKeyhole /> : list.privacy === "link" ? <Link2 /> : <Users />}
                          </small>}
                        </span>
                      </DropdownMenuCheckboxItem>;
                    }) : <p className="px-2 py-6 text-center text-xs text-muted-foreground">В этом пространстве пока нет списков.</p>}
                  </div>
                </DropdownMenuSubContent>
              </DropdownMenuSub>}
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
        {placeAddress
          ? <p className="wish-card__place-address">{placeAddress}</p>
          : <p>{wish.description || "Без дополнительного описания"}</p>}
        {owner && <div className="wish-card__owner-meta">{secret ? <span><LockKeyhole /> Только вам</span> : <span><Eye /> Виден друзьям</span>}{wish.reservationCount > 0 && <span><Gift /> Кто-то готовит подарок</span>}</div>}
      </div>
    </Card>
    {deleteOpen && <WishDeleteAlert open wish={wish} busy={busy} onOpenChange={setDeleteOpen} onConfirm={async () => { if (await remove()) setDeleteOpen(false); }} />}
    </>
  );
}

function WishGroupMoveSubmenu({ lists, busy, onMove }) {
  return <DropdownMenuSub>
    <DropdownMenuSubTrigger className="min-h-12 gap-3 rounded-xl px-3 text-base whitespace-nowrap" disabled={busy || lists.length === 0}><FolderInput />Переместить в список</DropdownMenuSubTrigger>
    <DropdownMenuSubContent className="w-64 max-w-[calc(100vw-24px)] rounded-2xl p-2">
      {lists.map((list) => <DropdownMenuItem key={list.id} className="min-h-12 rounded-xl px-3 text-base" disabled={busy} onClick={() => onMove(list)}>{listDisplayTitle(list)}</DropdownMenuItem>)}
    </DropdownMenuSubContent>
  </DropdownMenuSub>;
}

function WishGroupTile({ group, wishes, moveTargets = [], onOpen, onRename, onMove, onDisband, isDropTarget }) {
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
  const move = async (targetList) => {
    setBusy(true);
    await onMove(targetList);
    setBusy(false);
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
        {!editing && <DropdownMenu><DropdownMenuTrigger render={<ShadcnButton type="button" variant="ghost" size="icon" className="wish-card__menu-trigger wish-group-tile__menu size-9 active:translate-y-0" />} aria-label={`Опции группы «${group.title}»`}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent finalFocus={resolveMenuFinalFocus} align="end" sideOffset={8} className="wish-group-actions-menu w-72 max-w-[calc(100vw-24px)] rounded-2xl p-2"><DropdownMenuItem className="min-h-12 gap-3 rounded-xl px-3 text-base whitespace-nowrap" disabled={busy} onClick={beginEditing}><Pencil />Переименовать</DropdownMenuItem><WishGroupMoveSubmenu lists={moveTargets} busy={busy} onMove={move} /><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" className="app-destructive-menu-item min-h-12 gap-3 rounded-xl px-3 text-base whitespace-nowrap" disabled={busy} aria-haspopup="dialog" onClick={() => setDisbandOpen(true)}><Ungroup />Расформировать</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
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

function WishGroupOpenHeader({ onClose }) {
  return (
    <header>
      <ShadcnButton className="wish-group-open__close !size-12 rounded-full" variant="outline" size="icon" type="button" onClick={onClose} aria-label="Закрыть группу" title="Закрыть группу"><X aria-hidden="true" /></ShadcnButton>
    </header>
  );
}

const CATALOG_PAGE_SIZE = 48;

function CatalogOwnerStack({ owners = [], ownerCount = owners.length }) {
  const visibleOwners = owners.slice(0, 5);
  return (
    <div className="catalog-owner-stack" aria-label={`Добавили: ${participantCountLabel(ownerCount)}`}>
      <div className="catalog-owner-stack__avatars">
        {visibleOwners.map((owner, index) => (
          <Link
            key={owner.id}
            to={publicProfilePath(owner.username)}
            className="catalog-owner-stack__avatar"
            style={{ "--catalog-avatar-index": index }}
            aria-label={owner.name}
            title={owner.name}
          >
            <Avatar user={owner} size="sm" className="!size-9" />
          </Link>
        ))}
        {ownerCount > visibleOwners.length && <span className="catalog-owner-stack__more">+{ownerCount - visibleOwners.length}</span>}
      </div>
      <span>{ownerCount === 1 ? "Добавил 1 участник" : `Добавили ${participantCountLabel(ownerCount)}`}</span>
    </div>
  );
}

function CatalogSourceAttribution({ source }) {
  if (!source) return null;
  const content = (
    <>
      <span className="catalog-source-attribution__logo">
        {source.logoUrl ? <img src={source.logoUrl} alt="" loading="lazy" /> : source.label.slice(0, 1)}
      </span>
      <span>Каталог {source.label}</span>
    </>
  );
  return source.homeUrl ? (
    <a className="catalog-source-attribution" href={source.homeUrl} target="_blank" rel="noreferrer">{content}</a>
  ) : <div className="catalog-source-attribution">{content}</div>;
}

function CatalogWishCard({ item }) {
  const space = SPACES.find((entry) => entry.id === item.space) || SPACES[0];
  const SpaceIcon = space.icon;
  const previewImageUrl = wishPreviewImageUrl(item);
  const eventDate = item.eventDate ? formatEventDate(String(item.eventDate).slice(0, 10)) : "";
  return (
    <article className="catalog-wish-card">
      <div className="catalog-wish-card__image">
        {previewImageUrl ? (
          <img src={previewImageUrl} alt="" loading="lazy" onError={(event) => applyRetailerPreviewFallback(event, item.url)} />
        ) : <span><SpaceIcon aria-hidden="true" /></span>}
        {item.ownerCount > 1 && <Badge className="catalog-wish-card__people-badge" variant="secondary">{participantCountLabel(item.ownerCount)}</Badge>}
      </div>
      <div className="catalog-wish-card__body">
        <div className="catalog-wish-card__heading">
          <h2>{item.title}</h2>
          {item.url && (
            <ShadcnButton
              render={<a href={item.url} target="_blank" rel="noreferrer" />}
              className="catalog-wish-card__source !size-10 rounded-full"
              variant="ghost"
              size="icon"
              aria-label={`Открыть «${item.title}»`}
              title="Открыть исходную ссылку"
            >
              <ExternalLink aria-hidden="true" />
            </ShadcnButton>
          )}
        </div>
        {(item.price != null || eventDate) && (
          <p className="catalog-wish-card__meta">
            {item.price != null ? formatMoney(item.price, item.currency) : ""}
            {item.price != null && eventDate ? " · " : ""}
            {eventDate}
          </p>
        )}
        {item.source
          ? <CatalogSourceAttribution source={item.source} />
          : <CatalogOwnerStack owners={item.owners} ownerCount={item.ownerCount} />}
      </div>
    </article>
  );
}

function WishCatalogPage() {
  const location = useLocation();
  const requestedSpace = new URLSearchParams(location.search).get("tab");
  const selectedSpace = SPACE_IDS.includes(requestedSpace) ? requestedSpace : "products";
  const space = SPACES.find((entry) => entry.id === selectedSpace) || SPACES[0];
  const requestIdRef = useRef(0);
  const [catalog, setCatalog] = useState({ items: [], total: 0, loading: true, loadingMore: false, error: null });

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setCatalog({ items: [], total: 0, loading: true, loadingMore: false, error: null });
    api.get(`/catalog?space=${encodeURIComponent(selectedSpace)}&limit=${CATALOG_PAGE_SIZE}&offset=0`)
      .then((result) => {
        if (requestId !== requestIdRef.current) return;
        setCatalog({ items: result.items || [], total: Number(result.total) || 0, loading: false, loadingMore: false, error: null });
      })
      .catch((error) => {
        if (requestId !== requestIdRef.current) return;
        setCatalog({ items: [], total: 0, loading: false, loadingMore: false, error });
      });
    return () => { requestIdRef.current += 1; };
  }, [selectedSpace]);

  const loadMore = async () => {
    if (catalog.loadingMore || catalog.items.length >= catalog.total) return;
    const requestId = requestIdRef.current;
    setCatalog((current) => ({ ...current, loadingMore: true, error: null }));
    try {
      const result = await api.get(`/catalog?space=${encodeURIComponent(selectedSpace)}&limit=${CATALOG_PAGE_SIZE}&offset=${catalog.items.length}`);
      if (requestId !== requestIdRef.current) return;
      setCatalog((current) => ({
        ...current,
        items: [...current.items, ...(result.items || [])],
        total: Number(result.total) || current.total,
        loadingMore: false,
      }));
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setCatalog((current) => ({ ...current, loadingMore: false, error }));
    }
  };

  return (
    <div className="app-page wish-catalog-page">
      <header className="wish-catalog-page__header">
        <div>
          <p className="wish-catalog-page__eyebrow">Общий каталог</p>
          <h1>{space.label}</h1>
          <p>Публичные позиции участников Rollapp и внешних каталогов. Одинаковые позиции собраны вместе.</p>
        </div>
        <ShadcnButton render={<Link to={`/app/wishes?tab=${encodeURIComponent(selectedSpace)}`} />} variant="outline">
          <ArrowLeft data-icon="inline-start" aria-hidden="true" />
          В мой вишлист
        </ShadcnButton>
      </header>

      {catalog.loading ? <LoadingScreen compact /> : catalog.items.length ? (
        <>
          <div className="wish-catalog-page__summary">{catalog.total} позиций</div>
          <div className="catalog-wish-grid">
            {catalog.items.map((item) => <CatalogWishCard key={item.id} item={item} />)}
          </div>
          {catalog.items.length < catalog.total && (
            <div className="wish-catalog-page__more">
              <ShadcnButton type="button" variant="outline" disabled={catalog.loadingMore} onClick={loadMore}>
                {catalog.loadingMore && <Spinner data-icon="inline-start" />}
                Показать ещё
              </ShadcnButton>
            </div>
          )}
        </>
      ) : (
        <EmptyState icon={LayoutGrid} title={`В разделе «${space.label}» пока пусто`} text="Здесь появятся публичные позиции участников и внешних каталогов." />
      )}
      {catalog.error && !catalog.loading && <Alert variant="destructive" className="wish-catalog-page__error"><AlertTitle>Не удалось загрузить каталог</AlertTitle><AlertDescription>{catalog.error.message}</AlertDescription></Alert>}
    </div>
  );
}


function GiftSuggestionPeople({ suggestion }) {
  if (!suggestion?.participants?.length) return null;
  return <div className="flex flex-wrap gap-2" aria-label={`Участники: ${suggestion.participants.map((person) => person.name || person.username).join(", ")}`}>
    {suggestion.participants.map((person) => <Link
      key={person.id}
      to={publicProfilePath(person.username)}
      className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border border-border bg-muted/50 py-1 pr-3 pl-1 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      title={`Открыть профиль ${person.name || person.username}`}
    >
      <Avatar user={person} size="sm" className="!size-8" />
      <span className="truncate text-sm font-medium">{person.name || person.username}</span>
    </Link>)}
    {suggestion.participantCount > suggestion.participants.length && <span className="inline-flex min-h-10 items-center rounded-full bg-muted px-3 text-sm text-muted-foreground">+{suggestion.participantCount - suggestion.participants.length}</span>}
  </div>;
}

function GiftSuggestionsPanel({ items = [], onOpenWish }) {
  if (!items.length) return null;
  return <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 rounded-3xl border border-border bg-card p-4 sm:p-5" aria-labelledby="gift-suggestions-title">
    <div className="flex flex-col gap-1">
      <h2 id="gift-suggestions-title" className="text-xl font-semibold">Кому это ещё подарить</h2>
      <p className="text-sm text-muted-foreground">Ваши исполненные желания сейчас есть в публичных вишлистах других участников.</p>
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((item) => <Card key={item.wishId} className="gap-3 p-3">
        <ShadcnButton type="button" variant="ghost" className="h-auto min-w-0 justify-start gap-3 rounded-xl px-0 py-0 text-left hover:bg-transparent" onClick={() => onOpenWish(item.wishId)}>
          <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted text-muted-foreground">
            {item.imageUrl ? <img className="size-full object-cover" src={item.imageUrl} alt="" loading="lazy" /> : <Gift className="size-5" aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            <strong className="block truncate font-semibold">{item.title}</strong>
            <span className="block text-sm text-muted-foreground">Есть у {participantCountLabel(item.participantCount)}</span>
          </span>
        </ShadcnButton>
        <GiftSuggestionPeople suggestion={item} />
      </Card>)}
    </div>
  </section>;
}

function WishesPage({ onAdd, version }) {
  const { user } = useSession();
  const location = useLocation();
  const toast = useToast();
  const globalShareRef = useGlobalShareHandler();
  const { data, loading, reload, updateData } = useAsync(() => api.get("/dashboard"), [version]);
  const { data: giftSuggestionData, reload: reloadGiftSuggestions } = useAsync(() => api.get("/gift-suggestions"), [version]);
  const [selected, setSelected] = useState("all");
  const [selectedSpace, setSelectedSpace] = useState(() => {
    const tab = new URLSearchParams(location.search).get("tab");
    return SPACE_IDS.includes(tab) ? tab : "products";
  });
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
  useEffect(() => {
    const tab = new URLSearchParams(location.search).get("tab");
    const nextSpace = SPACE_IDS.includes(tab) ? tab : "products";
    if (nextSpace === selectedSpace) return;
    setSelectedSpace(nextSpace);
    setSelected("all");
    setOpenedGroupId(null);
  }, [location.search, selectedSpace]);
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
  const allCategoryLists = dashboardLists.filter((list) => !isGeneralList(list));
  const categoryLists = allCategoryLists.filter((list) => listSpace(list) === selectedSpace);
  const generalList = dashboardLists.find(isGeneralList) || null;
  const spaceWishes = visibleWishes.filter((wish) => wishBelongsToSpace(wish, listsById, selectedSpace));
  const unlistedWishes = filterWishesWithoutList(spaceWishes, allCategoryLists);
  const selectedValue = resolveVisibleListSelection(
    selected,
    categoryLists,
    shouldShowUnsortedList(unlistedWishes.length),
  );
  const groupingListId = selectedValue === "all" ? generalList?.id : selectedValue;
  const wishCountForList = (listId) => spaceWishes.filter((wish) => wish.listIds.includes(listId)).length;
  const wishes = selectedValue === "all" ? unlistedWishes : spaceWishes.filter((wish) => wish.listIds.includes(selectedValue));
  const groups = filterWishGroups({
    groups: data?.groups,
    listId: groupingListId,
    selectedSpace,
    scopeBySpace: selectedValue === "all",
    visibleWishIds: new Set(wishes.map((wish) => wish.id)),
  });
  const groupedWishIds = new Set(groups.flatMap((group) => group.wishIds));
  const ungroupedWishes = wishes.filter((wish) => !groupedWishIds.has(wish.id));
  const openedGroup = groups.find((group) => group.id === openedGroupId) || null;
  const openedGroupWishes = openedGroup ? wishes.filter((wish) => openedGroup.wishIds.includes(wish.id)) : [];
  const selectedList = categoryLists.find((list) => list.id === selectedValue) || null;
  const groupMoveTargets = [
    ...(generalList && groupingListId !== generalList.id ? [{ ...generalList, title: UNSORTED_LIST_TITLE }] : []),
    ...categoryLists.filter((list) => list.id !== groupingListId),
  ];
  const selectedWish = selectedWishId ? dashboardWishes.find((wish) => wish.id === selectedWishId) : null;
  const editingWish = editingWishId ? dashboardWishes.find((wish) => wish.id === editingWishId) : null;
  const giftSuggestions = (giftSuggestionData?.items || []).filter((item) => item.space === selectedSpace);
  const selectedWishSuggestion = selectedWishId
    ? (giftSuggestionData?.items || []).find((item) => item.wishId === selectedWishId)
    : null;
  useEffect(() => {
    if (selected !== selectedValue) {
      setSelected(selectedValue);
      setOpenedGroupId(null);
    }
  }, [selected, selectedValue]);
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
    if (selectedValue === "secret" || selectedList?.privacy === "private") {
      toast("Приватный список виден только вам", "error");
      return;
    }
    const url = selectedValue === "all"
      ? `${window.location.origin}${publicProfilePath(user.username)}`
      : selectedList?.privacy === "link"
        ? `${window.location.origin}/s/${selectedList.shareToken}`
        : `${window.location.origin}${publicListPath(user.username, selectedList?.id)}`;
    await navigator.clipboard.writeText(url);
    toast("Ссылка на список скопирована");
  };
  globalShareRef.current = share;
  const editWish = (id) => { setSelectedWishId(null); setEditingWishId(id); };
  const refreshWishes = () => Promise.all([
    reload({ background: true }),
    reloadGiftSuggestions({ background: true }),
  ]);
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
    const scopeWishIds = reorderScopeWishIds(
      group ? wishes : ungroupedWishes,
      group ? group.wishIds : null,
    );
    dragSessionRef.current = true; orderDirtyRef.current = false;
    dragSourceWishIdRef.current = wishId;
    dragScopeRef.current = group
      ? { kind: "group", groupId: group.id, wishIds: scopeWishIds }
      : { kind: "list", groupId: null, wishIds: scopeWishIds };
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
  const moveGroup = async (group, targetList) => {
    try {
      const result = await api.post(`/lists/${encodeURIComponent(group.listId)}/groups/${encodeURIComponent(group.id)}/move`, { targetListId: targetList.id });
      updateData((current) => moveWishGroupInDashboard(current, result));
      if (openedGroupId === group.id) setOpenedGroupId(null);
      toast(`Группа перемещена в «${listDisplayTitle(targetList)}»`);
      void reload({ background: true }).catch(() => {});
      return true;
    } catch (error) {
      toast(error.message || "Не удалось переместить группу", "error");
      return false;
    }
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
    const groupId = element?.closest?.("[data-group-id]")?.dataset.groupId;
    const pointerWishCard = element?.closest?.("[data-group-wish-id]");
    const dragGroupId = drag.group?.id || null;
    let wishCard = pointerWishCard;
    let overlapGroupTarget = false;
    if (!groupId && !dragGroupId && groupingListId && (!pointerWishCard || pointerWishCard.dataset.groupWishId === drag.wishId)) {
      const draggedImageRect = pointerGhostRef.current?.querySelector(".wish-card__image")?.getBoundingClientRect();
      if (draggedImageRect) {
        let bestOverlap = 0.36;
        document.querySelectorAll(".wishes-page > .wish-grid [data-group-wish-id]").forEach((candidate) => {
          if (candidate.dataset.groupWishId === drag.wishId || candidate.dataset.wishGroupId) return;
          const candidateImageRect = candidate.querySelector(".wish-card__image")?.getBoundingClientRect();
          const overlap = wishRectOverlapRatio(draggedImageRect, candidateImageRect);
          if (overlap < bestOverlap) return;
          bestOverlap = overlap;
          wishCard = candidate;
          overlapGroupTarget = true;
        });
      }
    }
    const wishId = wishCard?.dataset.groupWishId;
    const targetGroupId = wishCard?.dataset.wishGroupId || null;
    const validReorderTarget = wishId
      && wishId !== drag.wishId
      && dragScopeRef.current?.wishIds?.has(wishId)
      && (dragGroupId ? targetGroupId === dragGroupId : !targetGroupId);
    const validGroupTarget = wishId
      && wishId !== drag.wishId
      && !dragGroupId
      && !targetGroupId;
    const groupingEnabled = Boolean(groupingListId && validGroupTarget);
    let hoverMode = null;
    if (groupId || overlapGroupTarget) hoverMode = "group";
    else if (validReorderTarget) {
      hoverMode = resolveWishHoverMode({
        groupingEnabled,
        rect: wishCard.querySelector(".wish-card__image")?.getBoundingClientRect() || wishCard.getBoundingClientRect(),
        clientX,
        clientY,
      });
    } else if (groupingEnabled) hoverMode = "group";
    const target = dragGroupId
      ? validReorderTarget ? `wish:${wishId}` : null
      : groupId
        ? `group:${groupId}`
        : groupingListId
          ? validGroupTarget ? `wish:${wishId}` : null
          : validReorderTarget ? `wish:${wishId}` : null;
    const interactionTarget = target && hoverMode ? `${hoverMode}:${target}` : null;
    if (interactionTarget && interactionTarget !== drag.hoverTarget) {
      drag.hoverTarget = interactionTarget;
      // The card edge reorders immediately. Its center remains stable long enough
      // to arm grouping, so live sorting cannot move the intended group target away.
      if (hoverMode === "reorder" && validReorderTarget) reorderWish(drag.wishId, wishId);
      if (hoverMode !== "group" || dragGroupId || !groupingListId) {
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
    const hoverGroupTarget = drag.hoverTarget?.startsWith("group:")
      ? drag.hoverTarget.slice("group:".length)
      : armedDropTargetRef.current;
    const hoveredGroupId = hoverGroupTarget?.startsWith("group:") ? hoverGroupTarget.slice("group:".length) : null;
    const hoveredWishId = hoverGroupTarget?.startsWith("wish:") ? hoverGroupTarget.slice("wish:".length) : null;
    if (dragGroupId && targetGroupId === dragGroupId && wishId && (wishId !== drag.wishId || orderDirtyRef.current)) finishDrag();
    else if (dragGroupId) finishDrag({ persist: false, restore: true });
    else if (hoveredGroupId) addToGroup(drag.wishId, hoveredGroupId);
    else if (hoveredWishId && hoveredWishId !== drag.wishId) createGroup(drag.wishId, hoveredWishId);
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
    return <WishCard key={wish.id} wish={wish} owner profile={user} lists={data.lists} draggable={dragEnabled} dragGroupId={group?.id} groupBusy={Boolean(group && removingGroupId)} isDragging={draggedWishId === wish.id} isDropTarget={!group && dropTarget === `wish:${wish.id}`} onPointerDown={(event) => { if (!group || !removingGroupId) beginPointerDrag(event, wish.id, group); }} onRemoveFromGroup={group ? () => removeWishFromGroup(wish.id, group) : undefined} onChanged={refreshWishes} onOpen={() => {
    if (suppressOpenRef.current) return;
    setSelectedWishId(wish.id);
  }} onEdit={() => editWish(wish.id)} onCreateList={() => setListModal({ attachWishId: wish.id })} />;
  };
  return <div className="app-page wishes-page"><WishesProfileControls selectedList={selectedList} selectedSpace={selectedSpace} onEditList={setListModal} onAdd={() => onAdd(selectedSpace, selectedList?.id)} />{shouldShowListNavigation({ canCreateList: true, listCount: categoryLists.length }) && <div className="list-tabs"><div className="list-tabs__track"><ToggleGroup className="contents" value={[selectedValue]} onValueChange={(values) => { if (values[0]) { setSelected(values[0]); setOpenedGroupId(null); } }} aria-label="Списки желаний">{shouldShowUnsortedList(unlistedWishes.length) && <ToggleGroupItem style={LIST_TILE_STYLE} value="all" aria-label={listTileAccessibleName(UNSORTED_LIST_TITLE, unlistedWishes.length)}><ListTileContent title={UNSORTED_LIST_TITLE} count={unlistedWishes.length} /></ToggleGroupItem>}{categoryLists.map((list) => { const listWishCount = wishCountForList(list.id); return <ToggleGroupItem style={LIST_TILE_STYLE} value={list.id} key={list.id} aria-label={listTileAccessibleName(list.title, listWishCount, list.privacy === "private")}><ListTileContent title={list.title} count={listWishCount} privateList={list.privacy === "private"} /></ToggleGroupItem>; })}</ToggleGroup><ShadcnButton variant="ghost" size="icon" className="list-tabs__add" aria-label="Новый список" title="Новый список" onClick={() => setListModal({})}><Plus size={16} /></ShadcnButton></div></div>}
<GiftSuggestionsPanel items={giftSuggestions} onOpenWish={setSelectedWishId} />
{openedGroup && <section className="wish-group-open" role="dialog" aria-modal="true" aria-label={`Группа «${openedGroup.title}»`}><WishGroupOpenHeader onClose={() => setOpenedGroupId(null)} /><div className="wish-grid" onLostPointerCapture={cancelPointerDrag}>{openedGroupWishes.map((wish) => renderWish(wish, openedGroup))}</div></section>}
{wishes.length ? <div className="wish-grid" onLostPointerCapture={cancelPointerDrag}>{groups.map((group) => <WishGroupTile key={group.id} group={group} wishes={wishes.filter((wish) => group.wishIds.includes(wish.id))} moveTargets={groupMoveTargets} onOpen={() => setOpenedGroupId(group.id)} onRename={(title) => renameGroup(group.id, group.listId, title)} onMove={(targetList) => moveGroup(group, targetList)} onDisband={() => disbandGroup(group.id, group.listId)} isDropTarget={dropTarget === `group:${group.id}`} />)}{ungroupedWishes.map((wish) => renderWish(wish))}</div> : <EmptyState icon={Heart} title="В этом списке пока пусто" text="Добавьте то, что действительно порадует." />}{selectedWish && <WishDetailsModal wish={selectedWish} owner profile={user} lists={data.lists} wishes={data.wishes} giftSuggestion={selectedWishSuggestion} onChanged={refreshWishes} onEdit={() => editWish(selectedWish.id)} onCreateList={() => { setSelectedWishId(null); setListModal({ attachWishId: selectedWish.id }); }} onClose={() => setSelectedWishId(null)} />}{editingWish && <WishModal wish={editingWish} space={selectedSpace} onClose={() => setEditingWishId(null)} onSaved={async () => { setEditingWishId(null); await reload(); }} onDeleted={async () => { setEditingWishId(null); await reload(); }} />}{listModal && <ListModal list={listModal.id ? listModal : null} listsCount={data.lists.length} space={selectedSpace} onClose={() => setListModal(null)} onSaved={saveList} onDeleted={async () => { setListModal(null); setSelected("all"); await reload(); }} />}</div>;
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

const EMPTY_MEDIA_NOTE = Object.freeze({
  summary: "",
  keyIdeas: "",
  quotes: "",
  applications: "",
});

const mediaNoteHasContent = (note) => Object.keys(EMPTY_MEDIA_NOTE)
  .some((key) => String(note?.[key] || "").trim());

function MediaNotesPanel({ wish }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(EMPTY_MEDIA_NOTE);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [savedAt, setSavedAt] = useState(null);
  const formRef = useRef(form);
  const saveRequestRef = useRef(0);

  useEffect(() => {
    setOpen(false);
    setLoaded(false);
    setLoading(false);
    setForm(EMPTY_MEDIA_NOTE);
    formRef.current = EMPTY_MEDIA_NOTE;
    setDirty(false);
    setSaving(false);
    setLoadError("");
    setSavedAt(null);
    saveRequestRef.current += 1;
  }, [wish.id]);

  const loadNote = useCallback(async () => {
    if (loaded || loading) return;
    setLoading(true);
    setLoadError("");
    try {
      const result = await api.get(`/wishes/${wish.id}/media-note`);
      const note = { ...EMPTY_MEDIA_NOTE, ...result.note };
      setForm(note);
      formRef.current = note;
      setSavedAt(result.note?.updatedAt || null);
      setLoaded(true);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }, [loaded, loading, wish.id]);

  const saveNote = useCallback(async (candidate = formRef.current, { announce = false } = {}) => {
    if (!loaded) return false;
    const requestId = saveRequestRef.current + 1;
    saveRequestRef.current = requestId;
    setSaving(true);
    try {
      const result = await api.patch(`/wishes/${wish.id}/media-note`, candidate);
      if (requestId !== saveRequestRef.current) return false;
      setSavedAt(result.note?.updatedAt || new Date().toISOString());
      const unchanged = Object.keys(EMPTY_MEDIA_NOTE).every((key) => formRef.current[key] === candidate[key]);
      if (unchanged) setDirty(false);
      if (announce) toast("Конспект сохранён");
      return true;
    } catch (error) {
      if (requestId === saveRequestRef.current) toast(error.message, "error");
      return false;
    } finally {
      if (requestId === saveRequestRef.current) setSaving(false);
    }
  }, [loaded, toast, wish.id]);

  useEffect(() => {
    if (!loaded || !dirty) return undefined;
    const timeoutId = window.setTimeout(() => saveNote(), 800);
    return () => window.clearTimeout(timeoutId);
  }, [dirty, form, loaded, saveNote]);

  const toggleOpen = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) loadNote();
  };
  const updateField = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      formRef.current = next;
      return next;
    });
    setDirty(true);
  };
  const hasContent = mediaNoteHasContent(form);
  const saveStatus = saving
    ? "Сохраняем…"
    : dirty
      ? "Есть изменения"
      : savedAt
        ? "Сохранено"
        : hasContent
          ? "Есть записи"
          : "Личный конспект";

  return <section className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border bg-card" aria-label="Конспект медиа-айтема">
    <ShadcnButton type="button" variant="ghost" className="h-auto min-h-16 w-full justify-start gap-3 rounded-none px-4 py-3 text-left" aria-expanded={open} onClick={toggleOpen}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><NotebookText className="size-5" /></span>
      <span className="min-w-0 flex-1">
        <strong className="block text-base font-semibold">Конспект</strong>
        <small className="block truncate text-sm text-muted-foreground">{saveStatus}</small>
      </span>
      <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
    </ShadcnButton>
    {open && <div className="grid gap-4 border-t p-4">
      {loading && <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-muted-foreground"><Spinner /> Загружаем конспект…</div>}
      {!loading && loadError && <Alert variant="destructive"><AlertTitle>Не удалось открыть конспект</AlertTitle><AlertDescription className="grid gap-3">{loadError}<ShadcnButton variant="outline" size="sm" onClick={loadNote}>Повторить</ShadcnButton></AlertDescription></Alert>}
      {!loading && loaded && <>
        <label className="grid gap-2 text-sm font-medium">
          <span className="flex items-center gap-2"><NotebookText className="size-4 text-muted-foreground" />Краткое резюме</span>
          <Textarea rows={4} maxLength={12000} value={form.summary} placeholder="О чём материал и какой главный вывод" onChange={(event) => updateField("summary", event.target.value)} onBlur={() => dirty && saveNote()} />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          <span className="flex items-center gap-2"><Sparkles className="size-4 text-muted-foreground" />Ключевые идеи</span>
          <Textarea rows={5} maxLength={40000} value={form.keyIdeas} placeholder="Одна важная мысль с новой строки" onChange={(event) => updateField("keyIdeas", event.target.value)} onBlur={() => dirty && saveNote()} />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          <span className="flex items-center gap-2"><Quote className="size-4 text-muted-foreground" />Цитаты и фрагменты</span>
          <Textarea rows={5} maxLength={40000} value={form.quotes} placeholder="Цитата, страница, глава или таймкод" onChange={(event) => updateField("quotes", event.target.value)} onBlur={() => dirty && saveNote()} />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          <span className="flex items-center gap-2"><Check className="size-4 text-muted-foreground" />Как применить</span>
          <Textarea rows={4} maxLength={40000} value={form.applications} placeholder="Что попробую сделать после изучения материала" onChange={(event) => updateField("applications", event.target.value)} onBlur={() => dirty && saveNote()} />
        </label>
        <div className="flex items-center justify-between gap-3">
          <small className="text-muted-foreground">Конспект виден только вам</small>
          <ShadcnButton size="sm" disabled={!dirty || saving} aria-busy={saving || undefined} onClick={() => saveNote(formRef.current, { announce: true })}>{saving ? <Spinner /> : <Check />}Сохранить</ShadcnButton>
        </div>
      </>}
    </div>}
  </section>;
}

function WishDetailsModal({ wish, owner = false, profile, shareToken = "", lists = [], giftSuggestion = null, onChanged, onEdit, onCreateList, onClose }) {
  const isMobile = useIsMobile();
  const resolvedSpace = wishSpaceId(wish, lists);
  const offerWish = useMemo(
    () => wish.space === resolvedSpace ? wish : { ...wish, space: resolvedSpace },
    [resolvedSpace, wish],
  );
  const categoryLists = useMemo(() => lists.filter((list) => !isGeneralList(list)), [lists]);
  const visibleLists = useMemo(() => categoryLists.filter((list) => listSpace(list) === resolvedSpace), [categoryLists, resolvedSpace]);
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
  const linkedListNames = linkedLists.map(listDisplayTitle);
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
      selected ? `Желание убрано из списка «${listDisplayTitle(list)}»` : `Желание добавлено в список «${listDisplayTitle(list)}»`,
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
            {listDisplayTitle(list)}
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
            {(wish.vehicleMake || wish.vehicleModel) && <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Car className="size-4" aria-hidden="true" />{[wish.vehicleMake, wish.vehicleModel].filter(Boolean).join(" ")}</span>}
            {(wish.price != null || wish.eventDate) && <div data-slot="wish-price-row" className="w-full">
              {wish.price != null && <strong data-slot="wish-price" className="whitespace-nowrap tabular-nums text-3xl leading-none font-semibold sm:text-4xl">{formatMoney(wish.price, wish.currency)}</strong>}
              {wish.eventDate && <span data-slot="wish-event-date" className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarDays className="size-4" aria-hidden="true" />{formatEventDate(wish.eventDate)}</span>}
            </div>}
            <DrawerDescription>{wish.description || "Автор пока не добавил описание — иногда желание говорит само за себя."}</DrawerDescription>
          </DrawerHeader>

          {owner && resolvedSpace === "media" && <MediaNotesPanel wish={wish} />}

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

          {owner && wish.status === "fulfilled" && giftSuggestion && <Card className="mx-auto w-full max-w-md gap-3 p-4">
            <div className="flex flex-col gap-1">
              <h3 className="font-semibold">Кому это ещё подарить</h3>
              <p className="text-sm text-muted-foreground">Это желание сейчас есть у {participantCountLabel(giftSuggestion.participantCount)}.</p>
            </div>
            <GiftSuggestionPeople suggestion={giftSuggestion} />
          </Card>}

          {["products", "food", "transport"].includes(resolvedSpace) && <MarketplaceOffers wish={offerWish} owner={owner} formatPrice={formatMoney} />}

          {wish.url && !["products", "food"].includes(resolvedSpace) && <a href={wish.url} target="_blank" rel="noreferrer" className={buttonVariants({ className: "wish-buy-action mx-auto h-12 w-full max-w-md" })}>{isYandexMapsUrl(wish.url) ? "Открыть в Яндекс Картах" : "Где купить"} <ExternalLink data-icon="inline-end" aria-hidden="true" /></a>}
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

function WishModal({ onClose, onSaved, onDeleted, wish = null, space = "products", initialListId = "" }) {
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
  const [vehicleCatalog, setVehicleCatalog] = useState({ status: "idle", makes: [], models: [], modelsStatus: "idle" });
  const [form, setForm] = useState(() => wishFormFrom(wish, initialListId));
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
  const isTransport = effectiveSpace === "transport";
  const browserRetailer = (() => {
    const retailer = retailerPreview(form.url.trim());
    return ["samokat", "lavka", "lenta"].includes(retailer?.id) ? retailer : null;
  })();
  const isYouTube = isMedia && isYouTubeUrl(form.url.trim());
  const isVkVideo = isMedia && isVkVideoUrl(form.url.trim());
  const isVideo = isYouTube || isVkVideo;
  const videoProviderLabel = isVkVideo ? "VK Видео" : "YouTube";
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
  useEffect(() => {
    if (!isTransport) {
      setVehicleCatalog({ status: "idle", makes: [], models: [], modelsStatus: "idle" });
      return undefined;
    }
    let active = true;
    setVehicleCatalog((current) => ({ ...current, status: "loading" }));
    api.get("/vehicle-catalog/makes").then(({ makes }) => {
      if (!active) return;
      setVehicleCatalog((current) => ({
        ...current,
        status: "ready",
        makes: Array.isArray(makes) ? makes : [],
      }));
    }).catch(() => {
      if (!active) return;
      setVehicleCatalog({ status: "unavailable", makes: [], models: [], modelsStatus: "idle" });
    });
    return () => { active = false; };
  }, [isTransport]);
  useEffect(() => {
    if (!isTransport || vehicleCatalog.status !== "ready") return undefined;
    const make = form.vehicleMake.trim();
    const knownMake = vehicleCatalog.makes.find((value) => value.localeCompare(make, "ru", { sensitivity: "accent" }) === 0);
    if (!knownMake) {
      setVehicleCatalog((current) => current.models.length || current.modelsStatus !== "idle"
        ? { ...current, models: [], modelsStatus: "idle" }
        : current);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setVehicleCatalog((current) => ({ ...current, modelsStatus: "loading", models: [] }));
      api.get(`/vehicle-catalog/models?make=${encodeURIComponent(knownMake)}`).then(({ models }) => {
        if (!active) return;
        setVehicleCatalog((current) => ({
          ...current,
          modelsStatus: "ready",
          models: Array.isArray(models) ? models : [],
        }));
      }).catch(() => {
        if (!active) return;
        setVehicleCatalog((current) => ({ ...current, modelsStatus: "unavailable", models: [] }));
      });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [form.vehicleMake, isTransport, vehicleCatalog.makes, vehicleCatalog.status]);
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
    const retailer = retailerPreview(url);
    const usesBrowserHelper = ["samokat", "lavka", "lenta"].includes(retailer?.id);
    setMetadata({ status: "loading", message: isPlaces ? "Ищем название и адрес места в Яндекс Картах…" : isVideo ? `Читаем видео в ${videoProviderLabel}…` : isKinopoisk ? "Загружаем постер с Кинопоиска…" : isMedia ? "Ищем название и обложку…" : isTransport ? "Читаем объявление и определяем марку с моделью…" : usesBrowserHelper ? "Открываем товар в обычном браузере и автоматически забираем фото…" : "Ищем название, фотографию и цену на странице магазина…" });
    try {
      let helperError = null;
      let meta = null;
      if (usesBrowserHelper) {
        try {
          meta = await requestRetailerBrowserMetadata(retailer.id, url);
        } catch (error) {
          helperError = error;
        }
      }
      if (!meta) {
        try {
          meta = await api.post("/metadata", { url });
        } catch (error) {
          if (!isTransport) throw error;
          helperError = error;
          meta = {};
        }
      }
      if (requestId !== metadataRequestRef.current) return false;
      const usesFallbackPreview = meta.previewFallback === true;
      let matchedVehicle = { make: "", model: "" };
      if (isTransport) {
        try {
          const matched = await api.post("/vehicle-catalog/match", {
            title: typeof meta.title === "string" ? meta.title : "",
            description: typeof meta.description === "string" ? meta.description : "",
            url,
          });
          if (requestId !== metadataRequestRef.current) return false;
          matchedVehicle = matched?.vehicle || matchedVehicle;
        } catch {
          // Карточка объявления остаётся доступной для ручного заполнения,
          // если production-справочник автомобилей временно недоступен.
        }
      }
      const values = {
        title: typeof meta.title === "string" ? meta.title.trim() : "",
        description: typeof meta.description === "string" ? meta.description.trim() : "",
        imageUrl: !usesFallbackPreview && typeof meta.imageUrl === "string" ? meta.imageUrl.trim() : "",
        price: meta.price == null || meta.price === "" ? "" : String(meta.price),
        currency: typeof meta.currency === "string" && WISH_CURRENCIES.includes(meta.currency.toUpperCase()) ? meta.currency.toUpperCase() : "",
        vehicleMake: typeof matchedVehicle.make === "string" ? matchedVehicle.make.trim() : "",
        vehicleModel: typeof matchedVehicle.model === "string" ? matchedVehicle.model.trim() : "",
      };
      const foundFields = ["title", "description", "imageUrl", "price", "vehicleMake", "vehicleModel"].filter((field) => values[field] !== "");
      if (foundFields.length === 0 && !usesFallbackPreview) {
        setMetadata({ status: "error", message: isPlaces ? "Не удалось прочитать страницу Яндекс Карт. Заполните карточку вручную." : isVideo ? `Не удалось прочитать видео в ${videoProviderLabel}. Заполните карточку вручную.` : isKinopoisk ? "Не удалось получить постер Кинопоиска. Добавьте изображение вручную." : isMedia ? "Не удалось получить данные и обложку. Добавьте их вручную." : isTransport ? "Не удалось определить автомобиль по объявлению. Марку и модель можно выбрать вручную." : "Магазин не отдал данные товара. Можно повторить попытку или заполнить карточку вручную." });
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
      setMetadata({ status: "success", message: usesFallbackPreview ? (usesBrowserHelper ? (helperError?.code === "helper_unavailable" ? `Нужно один раз подключить помощник Rollapp — после этого фото из «${retailer.label}» будут загружаться автоматически.` : helperError?.message || `${retailer.label} не отдал фото товара.`) : "Магазин не отдал фото товара — показываем превью сервиса. Название и цену можно заполнить вручную.") : isPlaces ? "Название и адрес подставили — проверьте карточку" : isVideo ? `Название и превью видео из ${videoProviderLabel} уже в карточке — осталось всё проверить.` : isKinopoisk ? "Постер Кинопоиска уже в карточке — осталось всё проверить." : appliedFields.length === 0 ? "Данные страницы найдены, а ваши ручные правки оставлены без изменений." : isMedia && values.imageUrl ? "Название и обложка уже в карточке — осталось всё проверить." : isTransport && values.vehicleMake ? `Объявление прочитано: ${[values.vehicleMake, values.vehicleModel].filter(Boolean).join(" ")}. Проверьте марку и модель.` : isTransport ? "Объявление прочитано. Марку и модель можно выбрать вручную." : isFood && complete ? "Название, фото и цена уже в карточке. Цена зависит от адреса и магазина — проверьте её перед сохранением." : complete ? "Название, фото и цена уже в карточке — осталось всё проверить." : "Подставили всё, что удалось найти на странице. Проверьте карточку." });
      return true;
    } catch (error) {
      if (requestId !== metadataRequestRef.current) return false;
      setMetadata({ status: "error", message: error.message || (isPlaces ? "Не удалось прочитать страницу Яндекс Карт. Заполните карточку вручную." : isVideo ? `Не удалось прочитать видео в ${videoProviderLabel}. Заполните карточку вручную.` : isKinopoisk ? "Не удалось получить постер Кинопоиска." : isMedia ? "Не удалось получить обложку по ссылке." : "Не удалось прочитать страницу магазина.") });
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
  const metadataNotice = metadata.status !== "idle" && <div className={`metadata-status metadata-status--${metadata.status}`} role="status" aria-live="polite"><span className="metadata-status__icon">{["waiting", "loading"].includes(metadata.status) ? <LoaderCircle className="spin" /> : metadata.status === "success" ? <CheckCircle2 /> : <X />}</span><div><strong>{metadata.status === "waiting" ? "Готовим автозаполнение" : metadata.status === "loading" ? (isPlaces ? "Читаем место в Яндекс Картах" : isVideo ? `Читаем видео в ${videoProviderLabel}` : isKinopoisk ? "Загружаем постер Кинопоиска" : isMedia ? "Загружаем обложку" : isTransport ? "Читаем объявление автомобиля" : "Читаем карточку товара") : metadata.status === "success" ? "Готово" : "Не получилось автоматически"}</strong><span>{metadata.message}</span></div>{metadata.status === "error" && metadata.retryable !== false && form.url && <ShadcnButton variant="ghost" type="button" onClick={() => recognize(form.url)}>Повторить</ShadcnButton>}</div>;
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
  const editorContent = <section
    id={fieldId("dialog-content")}
    data-slot="wish-editor-content"
    className={`wish-editor-screen ${editing ? "" : "wish-editor-screen--drawer"}`}
    role={editing ? "dialog" : undefined}
    aria-modal={editing ? "true" : undefined}
    aria-labelledby={fieldId("dialog-title")}
    aria-describedby={fieldId("dialog-description")}
  >
        <ShadcnButton type="button" variant="ghost" className="wish-editor-screen__close" size="icon-sm" onClick={requestClose}>
          <X />
          <span className="sr-only">Закрыть</span>
        </ShadcnButton>
        <form
          className={`wish-editor mx-auto flex w-full max-w-lg flex-col max-[820px]:max-w-none ${editing ? "wish-editor--edit" : "wish-editor--create"}`}
          onSubmit={submit}
          onPaste={(event) => {
            const imageItem = [...(event.clipboardData?.items || [])]
              .find((item) => item.kind === "file" && item.type.startsWith("image/"));
            const imageFile = imageItem?.getAsFile();
            if (!imageFile) return;
            event.preventDefault();
            uploadImage(imageFile);
          }}
        >
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
            {browserRetailer && <p className="text-sm leading-relaxed text-muted-foreground">Фото из «{browserRetailer.label}» загружается автоматически через помощник обычного браузера.</p>}
          </section>

          <section className="wish-editor__panel w-full overflow-visible p-0">
            <div className="wish-editor__scroll flex h-auto w-full flex-col gap-4 overflow-visible p-0 [scrollbar-gutter:auto]">
              <Field className="wish-editor__field">
                <FieldLabel htmlFor={fieldId("title")}>Название</FieldLabel>
                <Input id={fieldId("title")} autoFocus={editing} required value={form.title} placeholder="Название желания" onChange={(event) => updateMetadataField("title", event.target.value)} />
              </Field>

              {isTransport && <div className="grid grid-cols-2 gap-4 max-[480px]:grid-cols-1">
                <Field className="wish-editor__field">
                  <FieldLabel htmlFor={fieldId("vehicleMake")}>Марка</FieldLabel>
                  {vehicleCatalog.status === "unavailable" ? <Input
                    id={fieldId("vehicleMake")}
                    value={form.vehicleMake}
                    placeholder="Например, BMW"
                    autoComplete="off"
                    onChange={(event) => {
                      editedMetadataFieldsRef.current.add("vehicleMake");
                      editedMetadataFieldsRef.current.add("vehicleModel");
                      setForm((current) => ({ ...current, vehicleMake: event.target.value, vehicleModel: "" }));
                    }}
                  /> : <Select
                    value={form.vehicleMake}
                    disabled={vehicleCatalog.status !== "ready"}
                    onValueChange={(value) => {
                      editedMetadataFieldsRef.current.add("vehicleMake");
                      editedMetadataFieldsRef.current.add("vehicleModel");
                      setForm((current) => ({ ...current, vehicleMake: value, vehicleModel: "" }));
                    }}
                  >
                    <SelectTrigger id={fieldId("vehicleMake")} className="w-full" aria-label="Марка автомобиля">
                      <SelectValue>{(value) => value || (vehicleCatalog.status === "loading" ? "Загружаем марки…" : "Выберите марку")}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="w-(--anchor-width)" align="start" alignItemWithTrigger={false}>
                      {form.vehicleMake && !vehicleCatalog.makes.includes(form.vehicleMake) && <SelectItem value={form.vehicleMake}>{form.vehicleMake}</SelectItem>}
                      {vehicleCatalog.makes.map((make) => <SelectItem value={make} key={make}>{make}</SelectItem>)}
                    </SelectContent>
                  </Select>}
                </Field>
                <Field className="wish-editor__field">
                  <FieldLabel htmlFor={fieldId("vehicleModel")}>Модель</FieldLabel>
                  {vehicleCatalog.status === "unavailable" || vehicleCatalog.modelsStatus === "unavailable" ? <Input
                    id={fieldId("vehicleModel")}
                    value={form.vehicleModel}
                    placeholder="Например, X5"
                    autoComplete="off"
                    onChange={(event) => updateMetadataField("vehicleModel", event.target.value)}
                  /> : <Select
                    value={form.vehicleModel}
                    disabled={vehicleCatalog.status !== "ready" || !form.vehicleMake || vehicleCatalog.modelsStatus !== "ready"}
                    onValueChange={(value) => updateMetadataField("vehicleModel", value)}
                  >
                    <SelectTrigger id={fieldId("vehicleModel")} className="w-full" aria-label="Модель автомобиля">
                      <SelectValue>{(value) => value || (vehicleCatalog.modelsStatus === "loading" ? "Загружаем модели…" : form.vehicleMake ? "Выберите модель" : "Сначала выберите марку")}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="w-(--anchor-width)" align="start" alignItemWithTrigger={false}>
                      {form.vehicleModel && !vehicleCatalog.models.includes(form.vehicleModel) && <SelectItem value={form.vehicleModel}>{form.vehicleModel}</SelectItem>}
                      {vehicleCatalog.models.map((model) => <SelectItem value={model} key={model}>{model}</SelectItem>)}
                    </SelectContent>
                  </Select>}
                </Field>
                {(vehicleCatalog.status === "loading" || vehicleCatalog.status === "unavailable" || ["loading", "unavailable"].includes(vehicleCatalog.modelsStatus)) && <p className="col-span-2 m-0 text-sm leading-relaxed text-muted-foreground max-[480px]:col-span-1" role="status" aria-live="polite">
                  {vehicleCatalog.status === "loading" && "Загружаем марки из базы «Авто»…"}
                  {vehicleCatalog.status === "unavailable" && "Справочник «Авто» сейчас недоступен — марку и модель можно ввести вручную."}
                  {vehicleCatalog.status === "ready" && vehicleCatalog.modelsStatus === "loading" && "Загружаем модели выбранной марки…"}
                  {vehicleCatalog.status === "ready" && vehicleCatalog.modelsStatus === "unavailable" && "Модели не загрузились — модель можно ввести вручную."}
                </p>}
              </div>}

              <Field className="wish-editor__field wish-editor__field--link grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto] items-center gap-2">
                <FieldLabel className="col-start-1 row-start-1" htmlFor={fieldId("url")}>{isPlaces ? "Ссылка из Яндекс Карт" : isFood ? "Ссылка на продукт" : "Ссылка"}</FieldLabel>
                <Input className="col-span-2 row-start-2" id={fieldId("url")} autoFocus={!editing} type="url" inputMode="url" value={form.url} placeholder={isPlaces ? "https://yandex.ru/maps/…" : isFood ? "https://lenta.com/product/…" : isTransport ? "https://auto.ru/cars/used/sale/…" : "https://…"} onChange={(event) => updateMetadataField("url", event.target.value)} />
                <ShadcnButton className="wish-editor__link-action col-start-2 row-start-1 justify-self-end" type="button" variant="ghost" disabled={!form.url.trim() || metadata.status === "loading"} onClick={() => recognize(form.url)}>
                  {metadata.status === "loading" ? <LoaderCircle className="spin" /> : <Sparkles />}
                  <span>{metadata.status === "loading" ? "Заполняем…" : "Заполнить по ссылке"}</span>
                </ShadcnButton>
                {isPlaces && <p className="wish-editor__link-hint col-span-2 row-start-3 m-0 flex items-center gap-1.5"><MapPin size={14} aria-hidden="true" /> Ссылка на место из Яндекс Карт — подставим название и адрес</p>}
                {isMedia && <p className="wish-editor__link-hint col-span-2 row-start-3 m-0 flex items-center gap-1.5"><Clapperboard size={14} aria-hidden="true" /> {isKinopoisk ? "Ссылка на фильм или сериал с Кинопоиска — подставим постер" : isKinopoiskSite ? "Нужна ссылка на карточку фильма или сериала, а не на поиск Кинопоиска" : isVideo ? `Ссылка на видео в ${videoProviderLabel} — подставим название и превью` : "Ссылка на книгу с Bookmate, Альпины или МИФа — подставим название и обложку"}</p>}
                {isFood && <p className="wish-editor__link-hint col-span-2 row-start-3 m-0 flex items-center gap-1.5"><UtensilsCrossed size={14} aria-hidden="true" /> {browserRetailer ? `${browserRetailer.label} — помощник браузера автоматически подставит название, фото и доступную цену` : "Подставим название, фото и цену для выбранного магазином региона"}</p>}
                {isTransport && <p className="wish-editor__link-hint col-span-2 row-start-3 m-0 flex items-center gap-1.5"><Car size={14} aria-hidden="true" /> Подставим данные объявления и сверим марку с моделью по базе «Авто»</p>}
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
                      <FieldLabel className="wish-editor__list-title min-w-0 flex-1 cursor-pointer" htmlFor={listSwitchId}>{listDisplayTitle(list)}</FieldLabel>
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
    </section>;
  const editorSurface = editing ? editorContent : <Drawer
    open
    showSwipeHandle
    swipeDirection={isMobile ? "down" : "right"}
    onOpenChange={(nextOpen) => { if (!nextOpen) requestClose(); }}
  >
    <DrawerContent
      className="wish-editor-drawer rollapp-body"
      style={isMobile ? undefined : { "--drawer-content-width": "min(42rem, calc(100vw - 2rem))" }}
    >
      <DrawerHeader className="pr-16 text-left!">
        <DrawerTitle>Добавить желание</DrawerTitle>
        <DrawerDescription>Добавьте изображение и заполните основную информацию.</DrawerDescription>
      </DrawerHeader>
      {editorContent}
    </DrawerContent>
  </Drawer>;

  return <>
      {editorSurface}
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
    <div className="app-page friends-page typeset typeset-rollapp">
      <div className="friends-layout not-typeset">
        <section className="friends-directory" aria-label={config.label}>
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
          <InputGroup className="friends-search">
            <InputGroupAddon align="inline-start"><Search aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput
              className="h-full rounded-full py-0 font-semibold"
              type="search"
              aria-label={config.placeholder}
              placeholder={config.placeholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </InputGroup>
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
  const [openRouterSettings, setOpenRouterSettings] = useState({
    loading: true,
    available: false,
    configured: false,
    keyHint: "",
    serverFallbackConfigured: false,
  });
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [openRouterKeyVisible, setOpenRouterKeyVisible] = useState(false);
  const [openRouterBusy, setOpenRouterBusy] = useState(false);
  const [openRouterError, setOpenRouterError] = useState("");
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
  useEffect(() => {
    let active = true;
    api.get("/me/openrouter")
      .then((settings) => {
        if (active) setOpenRouterSettings({ ...settings, loading: false });
      })
      .catch((error) => {
        if (!active) return;
        setOpenRouterSettings((current) => ({ ...current, loading: false }));
        setOpenRouterError(error.message || "Не удалось загрузить настройку OpenRouter.");
      });
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
    if (loading || imageUploading || loggingOut || openRouterBusy) return;
    cleanupUploadedImages();
    onClose();
  };
  const saveOpenRouterKey = async () => {
    const apiKey = openRouterKey.trim();
    if (!/^sk-or-v1-[A-Za-z0-9_-]{11,}$/.test(apiKey)) {
      setOpenRouterError("Введите API-ключ OpenRouter в формате sk-or-v1-…");
      return;
    }
    setOpenRouterBusy(true);
    setOpenRouterError("");
    try {
      const settings = await api.post("/me/openrouter", { apiKey });
      setOpenRouterSettings({ ...settings, loading: false });
      setOpenRouterKey("");
      setOpenRouterKeyVisible(false);
      toast("Личный ключ OpenRouter подключён");
    } catch (error) {
      setOpenRouterError(error.message || "Не удалось сохранить ключ OpenRouter.");
    } finally {
      setOpenRouterBusy(false);
    }
  };
  const removeOpenRouterKey = async () => {
    if (openRouterBusy) return;
    setOpenRouterBusy(true);
    setOpenRouterError("");
    try {
      const settings = await api.delete("/me/openrouter");
      setOpenRouterSettings({ ...settings, loading: false });
      setOpenRouterKey("");
      setOpenRouterKeyVisible(false);
      toast("Личный ключ OpenRouter удалён");
    } catch (error) {
      setOpenRouterError(error.message || "Не удалось удалить ключ OpenRouter.");
    } finally {
      setOpenRouterBusy(false);
    }
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
      className="profile-settings-dialog rollapp-body"
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
          <Card className="grid gap-3 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <LockKeyhole className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <strong className="block text-sm font-medium">Личный ключ OpenRouter</strong>
                  <p className="text-sm text-muted-foreground">
                    Поиск предложений будет расходовать токены вашего аккаунта OpenRouter. Ключ хранится на сервере в зашифрованном виде.
                  </p>
                </div>
              </div>
              {openRouterSettings.configured && <Badge variant="secondary" className="shrink-0">Подключён</Badge>}
            </div>
            {openRouterSettings.loading ? (
              <div className="flex min-h-12 items-center gap-2 text-sm text-muted-foreground" role="status">
                <Spinner />Загружаем настройку…
              </div>
            ) : !openRouterSettings.available ? (
              <Alert variant="destructive">
                <AlertTitle>Хранилище ключей не настроено</AlertTitle>
                <AlertDescription>Подключение личного ключа станет доступно после настройки защищённого хранилища на сервере.</AlertDescription>
              </Alert>
            ) : (
              <>
                {openRouterSettings.configured && (
                  <p className="text-sm text-muted-foreground">
                    Сохранён ключ <span className="font-mono text-foreground">{openRouterSettings.keyHint}</span>. Вставьте новый, чтобы заменить его.
                  </p>
                )}
                <Field data-invalid={Boolean(openRouterError) || undefined}>
                  <FieldLabel htmlFor="settings-openrouter-key">API-ключ</FieldLabel>
                  <InputGroup className="h-12">
                    <InputGroupInput
                      id="settings-openrouter-key"
                      type={openRouterKeyVisible ? "text" : "password"}
                      autoComplete="new-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      aria-invalid={Boolean(openRouterError) || undefined}
                      placeholder="sk-or-v1-…"
                      value={openRouterKey}
                      onChange={(event) => {
                        setOpenRouterKey(event.target.value);
                        if (openRouterError) setOpenRouterError("");
                      }}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        size="icon-sm"
                        aria-label={openRouterKeyVisible ? "Скрыть API-ключ" : "Показать API-ключ"}
                        aria-pressed={openRouterKeyVisible}
                        onClick={() => setOpenRouterKeyVisible((visible) => !visible)}
                      >
                        {openRouterKeyVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  {openRouterError && <FieldError>{openRouterError}</FieldError>}
                  <FieldDescription>
                    Создать ключ можно в разделе Keys аккаунта OpenRouter. После сохранения полный ключ больше не показывается.
                  </FieldDescription>
                </Field>
                <div className="flex flex-wrap gap-2">
                  <ShadcnButton
                    type="button"
                    disabled={!openRouterKey.trim() || openRouterBusy}
                    aria-busy={openRouterBusy || undefined}
                    onClick={saveOpenRouterKey}
                  >
                    {openRouterBusy && <Spinner />}
                    {openRouterSettings.configured ? "Заменить ключ" : "Подключить ключ"}
                  </ShadcnButton>
                  {openRouterSettings.configured && (
                    <ShadcnButton type="button" variant="destructive" disabled={openRouterBusy} onClick={removeOpenRouterKey}>
                      Удалить ключ
                    </ShadcnButton>
                  )}
                </div>
                {!openRouterSettings.configured && openRouterSettings.serverFallbackConfigured && (
                  <p className="text-sm text-muted-foreground">Пока личный ключ не подключён, поиск использует ключ Rollapp.</p>
                )}
              </>
            )}
          </Card>
          <div className="border-t pt-4">
            <ShadcnButton
              type="button"
              variant="destructive"
              className="h-12 gap-2 px-4"
              disabled={loading || imageUploading || loggingOut || openRouterBusy}
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
          disabled={!changed || imageUploading || loggingOut || loading || openRouterBusy}
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
  const globalShareRef = useGlobalShareHandler();
  const endpoint = shared ? "/shared/" + params.token : "/profile/" + params.username;
  const { data, loading, error, reload } = useAsync(() => api.get(endpoint), [endpoint]);
  const [selected, setSelected] = useState(shared ? "all" : params.listId || "all");
  const [selectedSpace, setSelectedSpace] = useState(() => {
    const tab = new URLSearchParams(location.search).get("tab");
    return SPACE_IDS.includes(tab) ? tab : "products";
  });
  const [selectedWishId, setSelectedWishId] = useState(params.wishId || null);
  const [editingWishId, setEditingWishId] = useState(null);
  const [listModal, setListModal] = useState(null);
  const [wishModalOpen, setWishModalOpen] = useState(false);
  const [wishModalSpace, setWishModalSpace] = useState("products");
  const [visibleLimit, setVisibleLimit] = useState(20);
  const loadMoreRef = useRef(null);
  const lastWishOpenerRef = useRef(null);

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get("tab");
    const nextSpace = SPACE_IDS.includes(tab) ? tab : "products";
    if (nextSpace === selectedSpace) return;
    setSelectedSpace(nextSpace);
    setSelected("all");
  }, [location.search, selectedSpace]);

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

  useEffect(() => {
    if (loading || sessionLoading || !data || shared || !data.isOwner || selected !== "all" || params.wishId) return;
    const ownerLists = data.lists || [];
    const categoryLists = ownerLists.filter((list) => !isGeneralList(list) && listSpace(list) === selectedSpace);
    const listsById = new Map(ownerLists.map((list) => [list.id, list]));
    const spaceWishes = (data.wishes || []).filter((wish) => wishBelongsToSpace(wish, listsById, selectedSpace));
    const unlistedWishes = filterWishesWithoutList(spaceWishes, ownerLists.filter((list) => !isGeneralList(list)));
    const nextSelected = resolveVisibleListSelection("all", categoryLists, shouldShowUnsortedList(unlistedWishes.length));
    if (nextSelected === "all") return;
    setSelected(nextSelected);
    navigate(publicListPath(data.profile.username, nextSelected), { replace: true });
  }, [data, loading, navigate, params.wishId, selected, selectedSpace, sessionLoading, shared]);

  const renderCollectionState = ({ title, text, returnPath = APP_HOME, returnLabel = "В приложение", friendsContext = !shared }) => {
    const page = <div className="app-page wishes-page public-collection-page" data-public-collection-state>
      <header className="wishes-page__topbar"><AppBrandSpacer /></header>
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
  const routeSelectedList = routeList && !isGeneralList(routeList) ? routeList : null;
  const activeSpace = routeSelectedList ? listSpace(routeSelectedList) : selectedSpace;
  const navigationLists = shared ? lists : lists.filter((list) => !isGeneralList(list) && listSpace(list) === activeSpace);
  const listsById = new Map(lists.map((list) => [list.id, list]));
  const spaceWishes = shared ? visibleWishes : visibleWishes.filter((wish) => wishBelongsToSpace(wish, listsById, activeSpace));
  const unlistedWishes = !shared && data.isOwner
    ? filterWishesWithoutList(spaceWishes, lists.filter((list) => !isGeneralList(list)))
    : spaceWishes;
  const ownerCollection = data.isOwner && !shared;
  const showAllCollection = !ownerCollection || shouldShowUnsortedList(unlistedWishes.length);
  const selectedValue = resolveVisibleListSelection(routeSelectedList?.id || "all", navigationLists, showAllCollection);
  const selectedList = navigationLists.find((list) => list.id === selectedValue) || null;
  const wishes = shared
    ? visibleWishes
    : selectedValue === "all"
      ? unlistedWishes
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
  globalShareRef.current = share;

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
    ? <ShadcnButton
      type="button"
      variant="ghost"
      className="wishes-page__identity h-auto min-h-0 p-0 hover:bg-transparent active:translate-y-0"
      aria-label={`Редактировать профиль ${data.profile.name}`}
      title="Редактировать профиль"
      onClick={openProfileEditor}
    >
      <Avatar user={data.profile} size="xl" className="wishes-page__hero-avatar" />
      <span className="wishes-page__hero-copy"><h1 id="public-profile-name">{data.profile.name}</h1></span>
    </ShadcnButton>
    : <div className="wishes-page__identity friend-profile-page__identity">
      <Avatar user={data.profile} size="xl" className="wishes-page__hero-avatar" />
      <span className="wishes-page__hero-copy"><h1 id="public-profile-name">{data.profile.name}</h1></span>
    </div>;
  const collectionPage = <div className={`app-page wishes-page public-collection-page ${profileVisitor ? "friend-profile-page" : ""}`} data-public-collection>
    <header className="wishes-page__topbar">
      <AppBrandSpacer />
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

    {shouldShowListNavigation({ shared, canCreateList: ownerCollection, listCount: navigationLists.length }) && <div className={`list-tabs public-collection-tabs ${profileVisitor ? "friend-profile-tabs" : ""}`} aria-label="Списки желаний">
      <div className="list-tabs__track">
        <ToggleGroup className="contents" value={[selectedValue]} onValueChange={(values) => { if (values[0]) selectCollection(values[0]); }} aria-label="Списки желаний">
          {showAllCollection && <ToggleGroupItem style={LIST_TILE_STYLE} value="all" aria-label={listTileAccessibleName(shared ? listDisplayTitle(data.list) : ownerCollection ? UNSORTED_LIST_TITLE : "Все желания", unlistedWishes.length)}><ListTileContent title={shared ? listDisplayTitle(data.list) : ownerCollection ? UNSORTED_LIST_TITLE : "Все желания"} count={unlistedWishes.length} /></ToggleGroupItem>}
          {!shared && navigationLists.map((list) => <ToggleGroupItem style={LIST_TILE_STYLE} value={list.id} key={list.id} aria-label={listTileAccessibleName(listDisplayTitle(list), wishCountForList(list.id), ownerCollection && list.privacy === "private")}><ListTileContent title={listDisplayTitle(list)} count={wishCountForList(list.id)} privateList={ownerCollection && list.privacy === "private"} /></ToggleGroupItem>)}
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
    {wishModalOpen && <WishModal space={wishModalSpace} initialListId={selectedList?.id} onClose={() => setWishModalOpen(false)} onSaved={() => { setWishModalOpen(false); reload(); }} />}
  </div>;

  if (user) return <AppShell friendsContext={!data.isOwner && !shared} collectionChrome>{collectionPage}</AppShell>;
  return <div className="app-layout app-layout--dark public-collection-shell"><main className="app-main app-main--with-profile app-main--wishes">{collectionPage}</main></div>;
}

function NotFound() { return <div className="not-found rollapp-body"><Gift /><h1>Похоже, эта мечта потерялась</h1><p>Страница не существует или ссылка устарела.</p><Link to={APP_HOME} className={buttonVariants()}>В приложение</Link></div>; }

function LegacyProfileRedirect() {
  const params = useParams();
  const location = useLocation();
  const suffix = String(params["*"] || "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const target = `${publicProfilePath(params.username)}${suffix ? `/${suffix}` : ""}${location.search}${location.hash}`;
  return <Navigate to={target} replace />;
}

export default function App() { return <ToastProvider><SessionProvider><ProfileEditorProvider><GlobalAppChrome /><Routes><Route path="/" element={<RootRoute />} /><Route path="/login" element={<AuthPage mode="login" />} /><Route path="/register" element={<AuthPage mode="register" />} /><Route path="/forgot-password" element={<ForgotPasswordPage />} /><Route path="/reset-password" element={<ResetPasswordPage />} /><Route path="/ideas" element={<Navigate to={APP_HOME} replace />} /><Route path="/s/:token" element={<PublicProfile shared />} /><Route path="/s/:token/wishes/:wishId" element={<PublicProfile shared />} /><Route path="/app/*" element={<ProtectedApp />} /><Route path="/u/:username/*" element={<LegacyProfileRedirect />} /><Route path="/users/:username/*" element={<LegacyProfileRedirect />} /><Route path="/:username" element={<PublicProfile />} /><Route path="/:username/lists/:listId" element={<PublicProfile />} /><Route path="/:username/wishes/:wishId" element={<PublicProfile />} /><Route path="*" element={<NotFound />} /></Routes></ProfileEditorProvider></SessionProvider></ToastProvider>; }
