import { IDENTITY_TABS, CAREER_TABS, EDUCATION_TABS, HEALTH_TABS } from "../shared/sphere-tabs.js";
import { NOTE_TASKS_REQUEST_EVENT } from "@/lib/planning-assistant";
import { AssistantNoteTasks, createNoteTaskRows } from "@/components/assistant-note-tasks";
import { AddFab } from "@/components/add-fab";
import { ProductTitleInput } from "@/components/product-title-input";
import { AssistantDrawer, useAssistantChats } from "@/components/assistant-drawer";
import { MessengerDrawer } from "@/components/messenger";
import { WishlistBusinessManager, WishlistBusinessListing, WishSalesPage, wishSalesPath, wishlistSpace } from "@/components/wishlist-business";
import { canManageWishSales, canManageWishlistSpace } from "../shared/wishlist-business.js";
import { localDateKey } from "../shared/planning.js";
import { PlanningDatePicker } from "@/components/planning-date-picker";
import { HealthTracker } from "@/components/health-tracker";
import { IdentityReportsPage as CustomIdentityReportsPage } from "@/components/identity-reports-page";

import { Avatar, ProfileMoodCaption } from "@/components/profile-avatar";
import { ProfileMoodSettings } from "@/components/profile-mood-settings";
import { StoryAvatar } from "@/components/story-avatar";
import { ContactMeetingNotes } from "@/components/contact-meeting-notes";
import { WishParticipantField } from "@/components/wish-participant-field";
import { wishParticipantChanges } from "../shared/wish-participants.js";
import { ContactCardButton, ContactCardContent } from "@/components/contact-card-dialog";
import { ContactCompanyInput } from "@/components/contact-company-input";
import { PageActionButton } from "@/components/page-action-button";
import { isBrandCatalogSearch } from "../shared/catalog-links.js";
import { merchantProductUrl } from "../shared/product-links.js";
import { EXTERNAL_WISHLIST_PROVIDERS, EXTERNAL_WISHLIST_URL_MAX_LENGTH, externalWishlistUrl } from "../shared/external-wishlists.js";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Outlet, Route, Routes, useLocation, useMatch, useNavigate, useParams } from "react-router-dom";
import {
  Archive, ArrowLeft, ArrowRight, BriefcaseBusiness, Building2, CalendarDays, Car, Check, CheckCircle2, ChevronDown, ChevronRight,
  CircleUserRound, Clapperboard, Coins, Columns3, ContactRound, ExternalLink, Eye, EyeOff, Fingerprint, FolderInput, Gift, GraduationCap, GripVertical, Hand, Heart, HeartPulse, Image, Link2, ListPlus,
  MessageCircle, LayoutGrid, LoaderCircle, LockKeyhole, LogOut, Mail, MapPin, MoreHorizontal, Newspaper, NotebookText, PackageCheck, PackagePlus, Pencil, Phone, Plus, QrCode,
  Quote, RotateCcw, Search, Send, Share2, ShoppingBag, Smile, Sparkles, Star, Store, Tag, Trash2, UserPlus,
  Ungroup, Users, UtensilsCrossed, X,
} from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { api, bindApiAccount, sessionFetch } from "./api.js";
import { normalizeWaitlistTelegram, TELEGRAM_WAITLIST_ENABLED } from "../shared/telegram-waitlist.js";
import { useContactFeed } from "./hooks/use-contact-feed.js";
import { createCardDragPreview, guardDragClick } from "./lib/card-drag-preview.js";
import { ContentPage, ContentPageActions } from "@/components/content-page";
import { MobileFormFooter, MobileFormPages } from "@/components/mobile-form-pages";
import { ControlBar } from "@/components/control-bar";
import { BusinessGiftAction, BusinessGiftCertificates, ProfileGiftCards } from "@/components/gift-cards";
import { RollsWallet } from "@/components/rolls-wallet";
import { MemberNumberPage } from "@/components/member-number-page";
import { CatCheckout, restoreCatPurchase } from "@/components/cat-checkout";
import { OrdersDrawerContent } from "@/components/orders-drawer";
import { PlanningSpacesProvider, PlanningSpaceSwitcher } from "@/components/planning-space-switcher";
import { PlanningSpace, PLANNING_TABS } from "@/components/planning-space";
import { ProfilePublicationLinks, ProfilePublications } from "@/components/profile-publications";
import { MakiIcon } from "@/components/maki-icon";
import { buildRepeatWishPayload } from "./lib/wish-repeat.js";
import { createLatestSaveQueue } from "./lib/latest-save-queue.js";
import { refreshSession } from "./lib/session-refresh.js";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar as ShadcnAvatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AboutMe } from "@/components/about-me";
import { BusinessPersonalOffers, PersonalOffers } from "@/components/personal-offers";
import { BusinessMarketplacePage, SphereBusinessControls } from "@/components/business-marketplace-page";
import { RegistrationAccountFields } from "@/components/registration-account-fields";
import { BusinessRequestScopeFields } from "@/components/business-request-scope-fields";
import { BusinessClientAccessActions } from "@/components/business-client-access-actions";
import { Badge } from "@/components/ui/badge";
import { Button as ShadcnButton, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WishlistSnippet } from "@/components/wishlist-snippet";
import { Checkbox } from "@/components/ui/checkbox";
import { CharacterTraits } from "@/components/character-traits";
import { CoachingSessions } from "@/components/coaching-sessions";
import { Conferences } from "@/components/conferences";
import { Courses } from "@/components/courses";
import { DevelopmentPlan } from "@/components/development-plan";
import { Domain } from "@/components/domain";
import { CvResume } from "@/components/cv-resume";
import { FourQuestions } from "@/components/four-questions";
import { GallupProfile } from "@/components/gallup-profile";
import {
  IdentityGeneratedDocuments, IdentityReportEmpty, IdentityReportOverview,
  IdentityReportStatus,
} from "@/components/identity-report-manager";
import { PersonalDevelopmentPlan } from "@/components/personal-development-plan";
import { EditableLifeStrategy } from "@/components/editable-life-strategy";
import { FullscreenDialog } from "@/components/fullscreen-dialog";
import { GroupDialog } from "@/components/group-dialog";
import { WishGroupHeader } from "@/components/wish-group-fundraiser";
import { LabResults } from "@/components/lab-results";
import { Medications } from "@/components/medications";
import { Mission } from "@/components/mission";
import { IdealState } from "@/components/ideal-state";
import { OpenRouterSettings } from "@/components/openrouter-settings";
import { ProfileInvites } from "@/components/profile-invites";
import { ProfileAccounts } from "@/components/profile-accounts";
import { ProfileMcpKeys } from "@/components/profile-mcp-keys";
import { PrivateNotes, PrivateNotesLink, PRIVATE_NOTES_PATH } from "@/components/private-notes";
import { DiskProfileSettings } from "@/components/disk-profile-settings";
import { useDiskSyncSettings } from "@/components/disk-sync-settings";
import { WishListNavigation } from "@/components/wish-list-navigation";
import { BusinessCatalogList, BusinessCatalogProvider, BusinessCatalogSelect, brandCatalogPath } from "@/components/catalog-brands";
import { MarketplaceOffers } from "@/components/marketplace-offers";
import { PerformanceReview } from "@/components/performance-review";
import { Principles, Theses } from "@/components/theses";
import { Values } from "@/components/values";
import { Workouts } from "@/components/workouts";
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerSectionHeader, DrawerTitle, DrawerTrigger,
} from "@/components/form-surface";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import {
  Popover, PopoverContent, PopoverTitle, PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { canAutofocusForm, useIsMobile } from "@/hooks/use-mobile";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { useWishReorder } from "@/hooks/use-wish-reorder";
import { safeNextPath, yandexAuthErrorDetails, yandexAuthStartPath } from "./lib/auth.js";
import {
  findAssistantWishLists, isGeneralList, listDisplayTitle, orderWishListsForNavigation, resolveVisibleListSelection, shouldShowListNavigation,
  shouldShowUnsortedList, UNSORTED_LIST_TITLE, wishCountNoun,
} from "./lib/list-navigation.js";
import { canAccessPrivateSpheres, serviceSwitcherItemsForUser } from "./lib/service-navigation.js";
import { businessMarketplacePath, isPublicWishDetailPath, APP_ASSISTANT_PATH, APP_CATALOG_ITEM_ROUTE_PATH, APP_CLASSIFIEDS_PATH, APP_ORDERS_PATH, APP_SHELL_ROUTE_PATH, APP_STORE_PATH, APP_WISH_CATALOG_PATH, APP_WISH_LISTINGS_PATH, APP_WISH_OFFERS_PATH, APP_WISH_SALES_PATH, PUBLIC_WISH_ROUTE_PATH } from "./lib/app-routing.js";
import { businessCategoryFor, businessRequestSpheres, sphereBusinessCatalogPath } from "../shared/business-accounts.js";
import { SphereSharingProvider, sphereScopeFromLocation, useSphereSharing } from "./lib/sphere-sharing.jsx";
import { SPHERE_SECTIONS, SPHERE_SECTION_LABELS, sphereSectionPath } from "../shared/sphere-sharing.js";
import {
  buildWishGroupGridItems,
  disbandWishGroupFromDashboard,
  filterWishGroups,
  moveWishGroupInDashboard,
  moveWishGroupToTarget,
} from "./lib/wish-groups.js";
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
import { formatRolls } from "../shared/rolls.js";
import { isVideoUrl, isVkVideoUrl, isYouTubeUrl } from "../shared/video-links.js";
import { requestBrowserWishlist, requestRetailerBrowserMetadata } from "./lib/retailer-browser-import.js";
import { initializeTelegramWebApp } from "./telegram.js";

import { publicProfilePath, publicSpacePath, publicListPath, publicWishPath, publicPublicationPath, publicBookingPath, profilePublicationSection, publicProfileRoute, renamedProfileLocation } from "../shared/profile-links.js";

const CollectionNavigationContext = createContext(null);
function CollectionNavigationProvider({ children }) {
  const [collection, setCollection] = useState(null);
  const value = useMemo(() => ({ collection, setCollection }), [collection]);
  return <CollectionNavigationContext.Provider value={value}>{children}</CollectionNavigationContext.Provider>;
}

const SessionContext = createContext(null);
const ToastContext = createContext(null);
const ProfileEditorContext = createContext(null);
const previewBackfillRequests = new Map();
const APP_HOME = "/app/wishes";

function withWishReward(message, reward) {
  if (!reward?.granted) return message;
  return `${message} · +${formatRolls(reward.amount)} (${reward.ordinal} из ${reward.limit})`;
}

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
const isWishSecret = (wish, lists = []) => wish?.privacy === "private" || lists.some((list) => (
  list.privacy === "private" && wish?.listIds?.includes(list.id)
));

const wishSharePath = ({ wish, profile, lists = [], shareToken = "" }) => {
  if (shareToken) return `/s/${encodeURIComponent(shareToken)}/wishes/${encodeURIComponent(wish.id)}`;
  const linkedLists = lists.filter((list) => wish.listIds?.includes(list.id));
  const linkList = linkedLists.find((list) => list.privacy === "link" && list.shareToken);
  const publiclyReachable = linkedLists.some((list) => list.privacy === "public");
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
  const isMobile = useIsMobile();
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
        position={isMobile ? "top-center" : "bottom-left"}
        offset={16}
        mobileOffset={{
          top: "calc(12px + env(safe-area-inset-top))",
          bottom: "calc(12px + env(safe-area-inset-bottom))",
          left: 12,
          right: 12,
        }}
        richColors
        closeButton
      />
    </ToastContext.Provider>
  );
}

function SessionProvider({ children }) {
  const [session, updateSession] = useState({ user: null, loading: true, error: null });
  const [retrying, setRetrying] = useState(false);
  const setSession = useCallback((next) => {
    if (typeof next !== "function") bindApiAccount(next.user?.id);
    updateSession(next);
  }, []);
  const refresh = useCallback(() => refreshSession(() => api.get("/me"), setSession), [setSession]);
  useEffect(() => { refresh().catch(() => {}); }, [refresh]);
  useEffect(() => {
    if (!session.user?.id) return undefined;
    const checkAccount = () => { api.get("/me").catch(() => {}); };
    const onPageShow = (event) => { if (event.persisted) checkAccount(); };
    window.addEventListener("focus", checkAccount);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("focus", checkAccount);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [session.user?.id]);
  if (session.error && !session.user) {
    return <div className="auth-page rollapp-body">
      <div className="auth-panel">
        <div className="auth-form">
          <h1>Не удалось загрузить Rollapp</h1>
          <Alert variant="destructive"><AlertDescription>{session.error.message}</AlertDescription></Alert>
          <ShadcnButton className="auth-submit" disabled={retrying} aria-busy={retrying || undefined} onClick={async () => {
            setRetrying(true);
            try { await refresh(); } catch { /* Keep the error visible for another retry. */ }
            finally { setRetrying(false); }
          }}>{retrying && <Spinner data-icon="inline-start" />}Повторить</ShadcnButton>
        </div>
      </div>
    </div>;
  }
  return <SessionContext.Provider value={{ ...session, refresh, setSession }}>{children}</SessionContext.Provider>;
}

function useSession() { return useContext(SessionContext); }
function useToast() { return useContext(ToastContext); }
function useProfileEditor() { return useContext(ProfileEditorContext); }

function useLogout() {
  const { setSession } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  return useCallback(async () => {
    try {
      await api.post("/auth/logout", {});
      setSession({ user: null, loading: false, error: null });
      navigate("/");
      toast("Вы вышли из Rollapp на этом устройстве");
      return true;
    } catch (error) {
      toast(error?.message || "Не удалось выйти из аккаунта");
      return false;
    }
  }, [navigate, setSession, toast]);
}

function ProfileEditorProvider({ children }) {
  const { user, setSession } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [diskSyncCallback, setDiskSyncCallback] = useState(null);
  const [wishlistVersion, setWishlistVersion] = useState(0);
  const returnFocusRef = useRef(null);
  const openProfileEditor = useCallback((event) => {
    const trigger = event?.currentTarget;
    returnFocusRef.current = trigger instanceof HTMLElement ? trigger : null;
    setDiskSyncCallback(null);
    setOpen(true);
  }, []);
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(location.search);
    const result = params.get("diskSync");
    if (!["connected", "cancelled", "missing", "failed"].includes(result)) return;
    returnFocusRef.current = null;
    setDiskSyncCallback(result);
    setOpen(true);
    params.delete("diskSync");
    navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true, state: location.state });
  }, [user, location, navigate]);
  const closeProfileEditor = useCallback(() => setOpen(false), []);
  const refreshWishlist = useCallback(() => setWishlistVersion(version => version + 1), []);
  const value = useMemo(() => ({ openProfileEditor, wishlistVersion, refreshWishlist }), [openProfileEditor, wishlistVersion, refreshWishlist]);
  return (
    <ProfileEditorContext.Provider value={value}>
      {children}
      {open && user && <ProfileSettingsModal
        key={user.id}
        user={user}
        diskSyncCallback={diskSyncCallback}
        finalFocus={returnFocusRef}
        onClose={closeProfileEditor}
        onMoodSaved={({ level, publicMood }) => setSession((current) => current.user?.id === user.id
          ? { ...current, user: { ...current.user, moodLevel: level, publicMood } }
          : current)}
        onProfileUpdated={(savedUser) => setSession({ user: savedUser, loading: false, error: null })}
        onWishlistsImported={refreshWishlist}
        onSaved={async (savedUser) => {
          const target = renamedProfileLocation(location, user.username, savedUser.username);
          setSession({ user: savedUser, loading: false, error: null });
          if (target !== `${location.pathname}${location.search}${location.hash}`) navigate(target, { replace: true, state: location.state });
          closeProfileEditor();
        }}
      />}
    </ProfileEditorContext.Provider>
  );
}

function LogoMark({ className = "logo__mark" }) {
  return (
    <svg
      className={className}
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
  );
}

function Logo({ className = "" }) {
  return (
    <Link to={APP_HOME} className={`logo ${className}`} aria-label="Rollapp — в приложение">
      <LogoMark />
    </Link>
  );
}

function ProfilePortrait({ user, moodLevel }) {
  return (
    <span className="profile-portrait">
      <Avatar user={user} moodLevel={moodLevel} size="xl" className="wishes-page__hero-avatar" />
    </span>
  );
}

const SERVICE_SWITCHER_ITEMS = [
  { id: "identity", label: "Идентичность", path: "/app/spheres/identity", icon: Fingerprint, color: "#5967f2" },
  { id: "health", label: "Здоровье", path: "/app/spheres/health", icon: HeartPulse, color: "#43bd83" },
  { id: "wishlist", label: "Вишлист", path: APP_HOME, icon: Gift, color: "#f05f4f" },
  { id: "education", label: "Образование", path: "/app/spheres/education", icon: GraduationCap, color: "#f3c64e" },
  { id: "career", label: "Карьера", path: "/app/spheres/career", icon: BriefcaseBusiness, color: "#ff7557" },
];

const SPHERE_SERVICES = SERVICE_SWITCHER_ITEMS.filter((item) => item.id !== "wishlist");

const ROLLS_SERVICE = { id: "rolls", label: "Роллы", path: "/app/rolls", icon: Coins, color: "#f3c64e" };
const PLANNING_SERVICE = { id: "planning", label: "Планирование", path: "/app/planning", icon: Columns3 };

function isFriendsDirectoryPath(pathname) {
  return pathname === "/app/friends" || pathname.startsWith("/app/friends/");
}

function activeServiceFromPath(pathname) {
  if (pathname.startsWith("/app/rolls")) return "rolls";
  if (pathname === "/app/planning") return "planning";
  if (pathname.startsWith("/app/business")) return "business-access";
  if (pathname.startsWith("/app/wishes") || pathname === APP_STORE_PATH) return "wishlist";
  if (pathname.startsWith("/s/")) return "wishlist";
  if (isFriendsDirectoryPath(pathname)) return "wishlist";
  if (pathname.startsWith("/app/spheres/contacts")) return "career";
  const sphereId = pathname.match(/^\/app\/spheres\/([^/]+)/)?.[1];
  if (SPHERE_SERVICES.some((sphere) => sphere.id === sphereId)) return sphereId;
  const reserved = ["/", "/login", "/register", "/forgot-password", "/reset-password", "/ideas"];
  if (!reserved.includes(pathname) && !pathname.startsWith("/app/")) return "wishlist";
  return null;
}

function SphereSwitcher({ docked = false }) {
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
    if (user?.accountType !== "business") {
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
  }, [user?.accountType, user?.id, open]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<ShadcnButton data-control-icon className="sphere-switcher__trigger rounded-full" variant="outline" size="icon" type="button" />}
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
        className={cn("sphere-switcher__panel !gap-3 !rounded-3xl !p-2 max-[560px]:!rounded-2xl", docked ? "app-navigation-popup" : "!w-[min(20rem,calc(100vw-2rem))]")}
        align="start"
        side={docked ? "top" : "bottom"}
        sideOffset={10}
      >
        <nav className="sphere-switcher__list" aria-label="Сервисы и сферы Rollapp">
          {visibleServices.map(({ id, label, path, icon: Icon }) => {
            const active = id === activeService && !sharedOwner;
            return (
              <Link
                key={id}
                to={path}
                className={buttonVariants({
                  variant: active ? "secondary" : "ghost",
                  className: "sphere-switcher__item !h-auto !min-h-12 !justify-start !gap-4 !font-normal !whitespace-normal !rounded-xl !px-4 !py-3",
                })}
                data-active={active ? "true" : undefined}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <span className="sphere-switcher__icon">
                  <Icon className="size-6" aria-hidden="true" />
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
          <nav className="sphere-switcher__list" aria-label="Разделы, доступные для чтения">
            {incomingShares.map((share) => {
              const path = sphereSectionPath({ ownerUsername: share.owner.username, sphere: share.sphere, section: share.section });
              const active = `${location.pathname}${location.search}` === path;
              return (
                <Link
                  key={`${share.owner.id}:${share.sphere}:${share.section}`}
                  to={path}
                  className={buttonVariants({
                    variant: active ? "secondary" : "ghost",
                    className: "sphere-switcher__item !h-auto !min-h-12 !justify-start !gap-4 !font-normal !whitespace-normal !rounded-xl !px-4 !py-3",
                  })}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <Avatar user={share.owner} size="sm" />
                  <span className="sphere-switcher__shared-copy">
                    <span>{share.sphere === "wishlist" && share.section !== "wishlist" ? `Вишлист · ${businessSectionLabel(share.section)}` : businessSectionLabel(share.section)}</span>
                    <small>{share.owner.name}</small>
                  </span>
                </Link>
              );
            })}
          </nav>
        </>}
      </PopoverContent>
    </Popover>
  );
}

function AppBrand({ showSwitcher = true }) {
  return <div className="app-brand"><Logo className="app-shell-logo" />{showSwitcher && <SphereSwitcher />}</div>;
}

function PlanningFab() {
  const { user } = useSession();
  return user ? <PlanningControls key={user.id} user={user} /> : null;
}

function PlanningControls({ user }) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const returnPath = useRef(APP_HOME);
  useEffect(() => {
    if (location.pathname !== PLANNING_SERVICE.path && !isAssistantPath(location.pathname)) {
      returnPath.current = `${location.pathname}${location.search}${location.hash}`;
    }
  }, [location.pathname, location.search, location.hash]);
  const [open, setOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const assistant = useAssistantChats(assistantOpen);
  const { showList: showAssistantList } = assistant;
  const profileEditor = useProfileEditor();
  const { noteReviews, updateNoteReview } = assistant;
  const [noteRequest, setNoteRequest] = useState(null);
  const [noteTaskReview, setNoteTaskReview] = useState(null);
  const pendingNoteReview = useRef(null);
  const noteReviewLocation = useRef(null);
  const noteReviewReturning = useRef(false);
  const pageParams = new URLSearchParams(location.search);
  pageParams.delete("formScreen");
  const pageLocation = `${location.pathname}?${pageParams}`;
  const openNoteId = location.pathname === PLANNING_SERVICE.path && pageParams.get("tab") === "notes" ? pageParams.get("note") : null;
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [initialConversationId, setInitialConversationId] = useState(null);
  const [assistantWish, setAssistantWish] = useState(null);
  const assistantWishSource = useRef(null);
  const pendingAssistantWish = useRef(null);
  const assistantWishActive = useRef(false);
  const assistantWishResult = useRef(null);
  const navigate = useNavigate();
  const finishAssistantWish = () => {
    if (!assistantWishActive.current) return;
    assistantWishActive.current = false;
    const saved = assistantWishResult.current;
    assistantWishResult.current = null;
    const source = assistantWishSource.current;
    assistantWishSource.current = null;
    if (saved?.id) navigate(publicWishPath(user.username, saved.id));
    else if (source === location.pathname) setAssistantOpen(true);
  };
  const closeAssistantWish = (saved) => {
    if (!assistantWishActive.current) return;
    assistantWishResult.current = saved || null;
    setAssistantWish(null);
    if (!isMobile) finishAssistantWish();
  };
  useLayoutEffect(() => {
    if (noteTaskReview && noteReviewLocation.current === pageLocation) return;
    if (noteTaskReview) {
      noteReviewLocation.current = null;
      noteReviewReturning.current = false;
      setNoteTaskReview(null);
    }
    if (assistantWishActive.current && assistantWishSource.current === location.pathname) return;
    if (assistantWishActive.current) {
      assistantWishActive.current = false;
      assistantWishResult.current = null;
      assistantWishSource.current = null;
      setAssistantWish(null);
    }
    pendingAssistantWish.current = null;
    pendingNoteReview.current = null;
    setNoteRequest(null);
    const showMessages = Boolean(location.state?.messengerOpen);
    const showAssistant = !showMessages && Boolean(location.state?.assistantOpen);
    setOpen(false);
    if (showAssistant) showAssistantList();
    setAssistantOpen(showAssistant);
    setMessagesOpen(showMessages);
    setInitialConversationId(location.state?.messengerConversationId || null);
  }, [location, showAssistantList]);
  const setMessengerDrawerOpen = (value) => {
    setMessagesOpen(value);
    if (value) {
      setOpen(false);
      setAssistantOpen(false);
    }
    else setInitialConversationId(null);
  };
  const setAssistantDrawerOpen = (value) => {
    setAssistantOpen(value);
    if (value) {
      showAssistantList();
      setOpen(false);
      setMessengerDrawerOpen(false);
    }
  };
  useEffect(() => {
    if (!openNoteId) return;
    const openTasks = event => {
      if (event.detail?.noteId !== openNoteId) return;
      setNoteRequest(event.detail);
      setOpen(false);
      setMessagesOpen(false);
      setInitialConversationId(null);
      setAssistantOpen(true);
    };
    window.addEventListener(NOTE_TASKS_REQUEST_EVENT, openTasks);
    return () => window.removeEventListener(NOTE_TASKS_REQUEST_EVENT, openTasks);
  }, [openNoteId]);
  if (isAssistantPath(location.pathname) || location.pathname.startsWith("/app/messenger") || location.pathname.startsWith(`${APP_WISH_CATALOG_PATH}/item/`) || (isMobile && isPublicWishDetailPath(location.pathname))) return null;
  const inPlanning = location.pathname === PLANNING_SERVICE.path;
  const search = new URLSearchParams(location.search);
  const requestedTab = search.get("tab");
  const currentTab = PLANNING_TABS.some(({ id }) => id === requestedTab) ? requestedTab : "kanban";
  const noteGroupId = search.get("noteGroup");
  const backToNotes = inPlanning && currentTab === "notes" && Boolean(search.get("note") || noteGroupId);
  const backNotesSearch = new URLSearchParams({ tab: "notes" });
  if (search.get("note") && noteGroupId) backNotesSearch.set("noteGroup", noteGroupId);
  const backLabel = backToNotes ? "Назад к заметкам" : "Назад в приложение";
  return (
    <ControlBar className="planning-fab-controls" data-has-back={inPlanning || undefined} data-daily-todo={inPlanning && currentTab === "todo" || undefined}>
      <AssistantDrawer workspace={assistant} canDiscoverSpheres={canAccessPrivateSpheres(user)} noteId={openNoteId} noteRequest={noteRequest}
        onReviewNoteTasks={draft => {
          if (pendingNoteReview.current || pendingAssistantWish.current || noteTaskReview) return;
          pendingNoteReview.current = draft;
          setAssistantDrawerOpen(false);
        }} open={assistantOpen} onOpenChange={setAssistantDrawerOpen} onWishlistChanged={profileEditor?.refreshWishlist} onReviewWish={(draft) => {
        if (pendingAssistantWish.current || assistantWishActive.current) return;
        pendingAssistantWish.current = draft;
        setAssistantDrawerOpen(false);
      }} onAfterClose={() => {
        if (pendingNoteReview.current) {
          const draft = pendingNoteReview.current;
          pendingNoteReview.current = null;
          noteReviewLocation.current = pageLocation;
          noteReviewReturning.current = true;
          updateNoteReview(draft.batchId, current => current ?? { rows: createNoteTaskRows(draft.tasks) });
          setNoteTaskReview(draft);
          return;
        }
        if (!pendingAssistantWish.current) return;
        assistantWishActive.current = true;
        assistantWishSource.current = location.pathname;
        setAssistantWish(pendingAssistantWish.current);
        pendingAssistantWish.current = null;
      }} />
      {noteTaskReview && <AssistantNoteTasks key={noteTaskReview.batchId} value={noteTaskReview} review={noteReviews[noteTaskReview.batchId]}
        onUpdate={change => updateNoteReview(noteTaskReview.batchId, change)} onAfterClose={() => {
          if (!noteReviewReturning.current) return;
          noteReviewReturning.current = false;
          noteReviewLocation.current = null;
          setNoteTaskReview(null);
          setAssistantOpen(true);
        }} />}
      {assistantWish && <WishModal initialDraft={assistantWish} onClose={() => closeAssistantWish()}
        onSaved={closeAssistantWish} onAfterClose={finishAssistantWish} />}
      <MessengerDrawer user={user} open={messagesOpen} onOpenChange={setMessengerDrawerOpen} initialConversationId={initialConversationId} />
      {inPlanning && <Link
        data-control-icon
        to={backToNotes ? `${PLANNING_SERVICE.path}?${backNotesSearch}` : returnPath.current}
        className={cn(buttonVariants({ variant: "outline", size: "icon" }), "planning-fab planning-fab--back rounded-full")}
        aria-label={backLabel}
        title={backLabel}
      ><ArrowLeft aria-hidden="true" /></Link>}
      {inPlanning && isMobile && <div className="planning-fab-space"><PlanningSpaceSwitcher /></div>}
    <Popover open={open} onOpenChange={value => {
      setOpen(value);
      if (value) {
        setAssistantOpen(false);
        setMessengerDrawerOpen(false);
      }
    }}>
      <PopoverTrigger
        render={<ShadcnButton data-control-icon className="planning-fab planning-fab--launcher" variant="outline" size="icon" type="button" />}
        aria-label="Открыть планирование"
        title="Планирование"
      >
        {open ? <X aria-hidden="true" /> : <Columns3 aria-hidden="true" />}
      </PopoverTrigger>
      <PopoverContent className="planning-fab__panel app-navigation-popup rollapp-body w-80 max-w-(--available-width) !rounded-2xl !p-2" side="top" align="end" sideOffset={12}>
        <PopoverTitle className="sr-only">Планирование</PopoverTitle>
        <nav className="flex flex-col gap-1" aria-label="Инструменты планирования">
          {PLANNING_TABS.map(({ id, label, icon: Icon }) => (
            <Link key={id} to={`${PLANNING_SERVICE.path}?tab=${id}`}
              className={buttonVariants({ variant: inPlanning && currentTab === id ? "secondary" : "ghost", className: "!h-auto !min-h-12 !justify-start !gap-3 !rounded-xl !px-3 !py-3" })}
              aria-current={inPlanning && currentTab === id ? "page" : undefined}
              onClick={() => setOpen(false)}
            ><Icon aria-hidden="true" /><span>{label}</span></Link>
          ))}
        </nav>
      </PopoverContent>
    </Popover>
    </ControlBar>
  );
}

function useGlobalShareHandler() {
  const handlerRef = useRef(null);
  useEffect(() => {
    const handleShare = (event) => {
      if (!handlerRef.current) return;
      event.detail.handled = true;
      void Promise.resolve().then(() => handlerRef.current?.()).catch(() => sonnerToast.error("Не удалось скопировать ссылку"));
    };
    window.addEventListener("rollapp:share-request", handleShare);
    return () => window.removeEventListener("rollapp:share-request", handleShare);
  }, []);
  return handlerRef;
}

function GlobalAppChrome() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useSession();
  const waitlistLanding = TELEGRAM_WAITLIST_ENABLED && location.pathname === "/" && !user;
  const { collection } = useContext(CollectionNavigationContext);
  const collectionSpace = collection?.pathname === location.pathname ? collection.space : null;
  const brandCatalog = location.pathname === APP_WISH_CATALOG_PATH && isBrandCatalogSearch(location.search);
  const requestedService = serviceChromeFromPath(location.pathname);
  const sharedOwner = new URLSearchParams(location.search).get("owner");
  const service = ["wishlist", "planning"].includes(requestedService?.id) || canAccessPrivateSpheres(user) || sharedOwner
    ? requestedService
    : null;
  const publicRoute = publicProfileRoute(location.pathname);
  const requestedTab = publicRoute?.space || collectionSpace || new URLSearchParams(location.search).get("tab");
  const serviceOptions = service?.id === "planning" ? [] : service?.tabs || [];
  const options = location.pathname.startsWith("/s/") || isFriendsDirectoryPath(location.pathname) ? [] : sharedOwner
    ? serviceOptions.filter((option) => option.id === requestedTab || (!requestedTab && option === serviceOptions[0]))
    : serviceOptions;
  const normalizedTab = service?.id === "identity" && ["gallup", "hogan"].includes(requestedTab) ? "identity-reports" : requestedTab;
  const current = options.find((option) => option.id === normalizedTab) || options[0] || null;
  const selectTab = (tabId) => {
    if (!tabId || tabId === current?.id) return;
    if (publicRoute) {
      navigate(publicSpacePath(publicRoute.username, tabId));
      return;
    }
    const search = new URLSearchParams(location.search);
    search.set("tab", tabId);
    if (location.pathname === APP_HOME) search.delete("publication");
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
  if (waitlistLanding || isAssistantPath(location.pathname)) return null;
  if ((isMobile && location.pathname.startsWith("/app/messenger")) || (isMobile && location.pathname === PLANNING_SERVICE.path) || location.pathname.startsWith(`${APP_WISH_CATALOG_PATH}/item/`) || (isMobile && isPublicWishDetailPath(location.pathname))) return null;
  const sectionSelector = location.pathname === PLANNING_SERVICE.path && user
    ? <div className="planning-fab-space global-service-select"><PlanningSpaceSwitcher /></div>
    : brandCatalog && user ? <BusinessCatalogSelect side={isMobile ? "top" : "bottom"} fullWidth={isMobile} /> : current && (
        <Select value={current.id} onValueChange={selectTab}>
          <SelectTrigger className="space-select global-service-select" aria-label={`Раздел сервиса ${service.label}`} title={`Разделы: ${service.label}`}>
            <SelectValue>{(selected) => {
              const option = options.find((item) => item.id === selected) || current;
              const Icon = option.icon;
              return <>{Icon && <Icon aria-hidden="true" />}<span className="space-select__label">{option.label}</span></>;
            }}</SelectValue>
          </SelectTrigger>
          <SelectContent className={cn("space-select__content global-service-select__content w-max min-w-(--anchor-width) max-w-(--available-width)", isMobile && "app-navigation-popup")} side={isMobile ? "top" : "bottom"} align={isMobile && !user ? "end" : "center"} alignItemWithTrigger={false}>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
  return <>
    <ControlBar as="header" className="global-app-chrome" data-mobile-navigation={isMobile || undefined} aria-label="Панель приложения">
      <AppBrand showSwitcher={!isMobile} />
      {!isMobile && sectionSelector}
      {service && <div className="global-app-chrome__actions">
        <ShadcnButton data-control-icon className="global-app-chrome__share rounded-full" variant="outline" size="icon" type="button" aria-label="Поделиться" title="Поделиться" onClick={share}><Share2 aria-hidden="true" /></ShadcnButton>
      </div>}
    </ControlBar>
    {isMobile && location.pathname !== "/register" && <ControlBar as="nav" className="mobile-app-navigation" data-has-planning={Boolean(user) || undefined} aria-label="Навигация приложения">
      <SphereSwitcher docked />
      {sectionSelector && <div className="mobile-app-navigation__section">{sectionSelector}</div>}
    </ControlBar>}
  </>;
}

function AppBrandSpacer() {
  return <span className="app-brand-spacer" aria-hidden="true" />;
}

const SERVICE_TABS = {
  wishlist: SPACES,
  identity: IDENTITY_TABS,
  career: CAREER_TABS.map(tab => tab.id === "contacts" ? { ...tab, icon: ContactRound } : tab),
  education: EDUCATION_TABS,
  health: HEALTH_TABS,
};

function serviceChromeFromPath(pathname) {
  let serviceId = activeServiceFromPath(pathname);
  if (!serviceId && (pathname === "/app" || pathname.startsWith("/s/"))) serviceId = "wishlist";
  if (!serviceId && !["/", "/login", "/register", "/forgot-password", "/reset-password", "/ideas"].includes(pathname) && !pathname.startsWith("/app/")) {
    serviceId = "wishlist";
  }
  if (!serviceId) return null;
  const service = serviceId === "rolls"
      ? ROLLS_SERVICE
    : serviceId === "planning"
      ? PLANNING_SERVICE
    : SERVICE_SWITCHER_ITEMS.find((item) => item.id === serviceId);
  return service ? { ...service, tabs: SERVICE_TABS[serviceId] || [] } : null;
}

function Button({ children, className = "", variant = "primary", icon: Icon, loading, ...props }) {
  const shadcnVariant = { primary: "default", soft: "secondary", paper: "secondary", reserved: "secondary" }[variant] || variant;
  return <ShadcnButton variant={shadcnVariant} className={className} {...props} disabled={loading || props.disabled} aria-busy={loading || props["aria-busy"] || undefined}>{loading ? <Spinner data-icon="inline-start" /> : Icon ? <Icon data-icon="inline-start" aria-hidden="true" /> : null}{children}</ShadcnButton>;
}

function YandexIdButton({ href, disabled, accessibleName = "Войти с помощью Яндекс ID", label = "Войти с Яндекс ID" }) {
  const Component = href ? "a" : "button";
  const action = href ? { href } : { type: "submit", disabled };
  return (
    <Component className="yandex-id-button" aria-label={accessibleName} {...action}>
      <svg className="yandex-id-button__mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="12" fill="#fc3f1d" />
        <path fill="#fff" d="M15.24 16.2h-1.68V8.04h-1.2c-1.637 0-2.52.818-2.52 2.045 0 1.39.597 2.047 1.843 2.87l1.017.676-2.903 4.57H7.92l2.676-3.913C9.08 13.18 8.16 12.11 8.16 10.016c0-2.24 1.554-3.696 4.306-3.696h2.774v9.88Z" />
      </svg>
      <span>{label}</span>
    </Component>
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
  if (user || !TELEGRAM_WAITLIST_ENABLED) return <Navigate to={user ? APP_HOME : "/login"} replace />;
  return <TelegramWaitlistPage />;
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
      <p className="auth-switch"><a href="/login">Вернуться ко входу</a></p>
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

function RegisterPage() {
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

function RegistrationForm({ invite, email }) {
  const { user } = useSession();
  const { search } = useLocation();
  const id = useId();
  const [account, setAccount] = useState({ accountType: "personal", businessCategory: null, sellerSpace: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const params = new URLSearchParams(search);
  const nextPath = safeNextPath(params.get("next"));
  const authErrorCode = params.get("auth_error");
  const yandexError = yandexAuthErrorDetails(authErrorCode);

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
          <YandexIdButton disabled={loading} label="Создать с Яндекс ID" accessibleName="Зарегистрироваться с Яндекс ID" />
          <p className="auth-switch">Уже есть аккаунт? <Link to={`/login?next=${encodeURIComponent(nextPath)}`}>Войти</Link></p>
        </form>
      </div>
    </div>
  );
}

function AuthPage({ recovery }) {
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
      window.location.replace(APP_HOME);
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

function AppFriendsLink({ memberNumber }) {
  return (
    <ControlBar as="nav" aria-label="Связи профиля" className="flex items-center justify-center gap-2 whitespace-nowrap text-rollapp-body font-normal text-muted-foreground">
      {memberNumber && <span>{`ID #${memberNumber}`}</span>}
      <Link to="/app/friends" className={cn(buttonVariants({ variant: "link" }), "gap-2 px-2 text-rollapp-body font-normal text-muted-foreground hover:text-foreground hover:no-underline")}>
        <Users aria-hidden="true" />
        <span>Друзья</span>
      </Link>
    </ControlBar>
  );
}

function AppProfileButton({ user, compact = false }) {
  const { openProfileEditor } = useProfileEditor();
  const location = useLocation();
  const storiesEnabled = /^\/app\/friends(?:\/|$)/.test(location.pathname);
  return <div className="flex min-w-0 items-center gap-2">
    {storiesEnabled ? <StoryAvatar user={user} own onEditProfile={openProfileEditor}><Avatar user={user} size="sm" className="!size-8" /></StoryAvatar>
      : <ShadcnButton type="button" variant="ghost" size="icon" className="rounded-full" aria-label={`Редактировать профиль ${user.name}`} onClick={openProfileEditor}><Avatar user={user} size="sm" className="!size-8" /></ShadcnButton>}
    {!compact && <ShadcnButton type="button" variant="ghost" className="app-user-profile h-12 min-w-0 rounded-xl px-3" aria-label={`Редактировать профиль ${user.name}`} onClick={openProfileEditor}>
      <span className="app-user-profile__copy flex min-w-0 flex-col items-start"><strong className="max-w-full truncate text-sm leading-4">{user.name}</strong><span className="max-w-full truncate text-xs leading-4 text-muted-foreground">@{user.username}</span></span>
    </ShadcnButton>}
  </div>;
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

function AppShell({ children, friendsContext = false, collectionChrome = false, wishlistChrome = false }) {
  const { user } = useSession();
  const location = useLocation();
  const friendsRoute = friendsContext || isFriendsDirectoryPath(location.pathname);
  const wishesRoute = location.pathname.startsWith("/app/wishes");
  const catalogRoute = location.pathname === APP_WISH_CATALOG_PATH;
  const businessRoute = location.pathname.startsWith("/app/business");
  const rollsRoute = location.pathname.startsWith("/app/rolls");
  const planningRoute = location.pathname === "/app/planning";
  const messengerRoute = location.pathname.startsWith("/app/messenger");
  const diskNotesRoute = location.pathname === PRIVATE_NOTES_PATH;
  const notesRoute = planningRoute && new URLSearchParams(location.search).get("tab") === "notes";
  const planningLayout = notesRoute ? "app-layout--planning-notes" : planningRoute ? "app-layout--planning" : "";
  const sphereScope = sphereScopeFromLocation(location.pathname, location.search, SERVICE_TABS)
    || (wishesRoute && user?.accountType === "personal" ? { sphere: "wishlist", section: wishlistSpace(location.search) } : null);
  return (
    <SphereSharingProvider currentUser={user} scope={sphereScope} search={location.search}>
      <div className={`app-layout app-layout--dark ${planningLayout} ${friendsRoute ? "app-layout--friends" : ""}`}>
        <main className={`app-main ${(!friendsRoute && !diskNotesRoute) || collectionChrome ? "app-main--with-profile" : ""} ${wishesRoute || collectionChrome || wishlistChrome ? "app-main--wishes" : ""}`}>
          {!collectionChrome && !planningRoute && <div className="app-shell-chrome-spacer" aria-hidden="true" />}
          {wishlistChrome ? <PersistentProfileHero user={user} wishlistChrome /> : !collectionChrome && !catalogRoute && !businessRoute && !rollsRoute && !planningRoute && !messengerRoute && !diskNotesRoute && <PersistentProfileHero key={sphereScope ? `${sphereScope.sphere}:${sphereScope.section}` : "profile"} user={user} />}
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

function GeneratedHoganReport({ report }) {
  return <IdentityGeneratedDocuments report={report} />;
}

function HoganReport({ reportState: { state, error, load } }) {
  if (state.mode === "loading" || state.mode === "error") {
    return <IdentityReportStatus mode={state.mode} error={error} onRetry={load} />;
  }
  return state.mode === "generated"
    ? <GeneratedHoganReport report={state.report} />
    : <IdentityReportEmpty label="Hogan" />;
}

function IdentityReportsPage() {
  return <CustomIdentityReportsPage renderGallup={reportState => <GallupProfile reportState={reportState} />} renderHogan={reportState => <HoganReport reportState={reportState} />} />;
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
  const legacyIdentityReportTab = sphereId === "identity" && ["gallup", "hogan"].includes(requestedTab);
  const activeTab = legacyIdentityReportTab ? "identity-reports" : tabs.some((tab) => tab.id === requestedTab) ? requestedTab : tabs[0].id;
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
                : sphere.id === "identity" && tab.id === "principles"
                  ? <Principles />
              : sphere.id === "identity" && tab.id === "identity-reports"
                ? <IdentityReportsPage />
                    : sphere.id === "identity" && tab.id === "values"
                      ? <Values />
                      : sphere.id === "identity" && tab.id === "character"
                        ? <CharacterTraits />
                        : sphere.id === "identity" && tab.id === "mission"
                          ? <Mission />
                          : sphere.id === "identity" && tab.id === "ideal-state"
                            ? <IdealState />
                          : sphere.id === "identity" && tab.id === "personal-development-plan"
                            ? <PersonalDevelopmentPlan />
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
                                      : sphere.id === "health" && ["sleep", "nutrition"].includes(tab.id)
                                        ? <HealthTracker key={tab.id} tracker={tab.id} />
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
function contactLinkPayload(link) {
  const url = link.url.trim();
  const originalLabel = url === link.originalUrl && link.label?.trim();
  if (originalLabel) return { label: originalLabel, url };
  const platform = contactSocialPlatform({ url });
  if (platform !== "website") return { label: CONTACT_SOCIAL_PLATFORMS[platform].label, url };
  let hostname = "";
  try { hostname = new URL(url).hostname.replace(/^www\./iu, ""); } catch { /* Native URL and API validation handle invalid input. */ }
  return { label: hostname.slice(0, 40) || CONTACT_SOCIAL_PLATFORMS.website.label, url };
}

const contactFormFrom = (contact) => ({
  name: contact?.name || "",
  company: contact?.company || "",
  role: contact?.role || "",
  category: contact?.category || "",
  status: contact?.status || "",
  avatarUrl: contact?.avatarSourceUrl || "",
  links: (contact?.links || []).map((link) => ({ label: link.label || "", url: link.url || "", originalUrl: link.url?.trim() })),
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

function ContactEditForm({ contact = null, companies = [], favoriteSaving = false, onFavoriteToggle, onSaved, onDeleted }) {
  const toast = useToast();
  const contactFieldId = useId();
  const creating = !contact?.id;
  const [form, setForm] = useState(() => contactFormFrom(contact));
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [avatarResolving, setAvatarResolving] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarStatus, setAvatarStatus] = useState("");
  const [saveError, setSaveError] = useState("");
  const avatarFileRef = useRef(null);
  const uploadedImageIdsRef = useRef(new Set());
  const initialAvatarSourceUrl = contact?.avatarSourceUrl || "";
  const previewAvatarUrl = form.avatarUrl || contact?.avatarUrl || "";
  const busy = saving || deleting || imageUploading || avatarResolving;
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const setLinkUrl = (index, url) => setForm((current) => ({
    ...current,
    links: current.links.map((link, linkIndex) => linkIndex === index ? { ...link, url } : link),
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
      sessionFetch(`/api/uploads/images/${encodeURIComponent(id)}`, {
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
    setAvatarError("");
    setAvatarStatus(message);
    if (previousId && uploadedImageIdsRef.current.has(previousId) && previousId !== result.id) {
      uploadedImageIdsRef.current.delete(previousId);
      await api.delete(`/uploads/images/${encodeURIComponent(previousId)}`).catch(() => {});
    }
  };
  const uploadAvatar = async (file) => {
    if (!file || saving || deleting || imageUploading) return;
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
  const socialLinksKey = JSON.stringify(form.links.flatMap((link) => {
    const url = link.url.trim();
    try {
      const parsed = new URL(url);
      if (!["https:", "http:"].includes(parsed.protocol) || !parsed.pathname.replace(/\//gu, "")) return [];
      const platform = contactSocialPlatform({ url });
      return platform === "website" ? [] : [{ label: CONTACT_SOCIAL_PLATFORMS[platform].label, url }];
    } catch { return []; }
  }));
  useEffect(() => {
    // Keep existing or manually chosen photos. Only resolve complete social URLs.
    if (form.avatarUrl || previewAvatarUrl || imageUploading || saving || deleting || socialLinksKey === "[]") return;
    let active = true;
    const timer = setTimeout(async () => {
      setAvatarResolving(true);
      setAvatarError("");
      setAvatarStatus("Получаем фото из соцсети…");
      try {
        const result = await api.resolveContactAvatar(JSON.parse(socialLinksKey));
        if (!active) {
          if (result.id) await api.delete(`/uploads/images/${encodeURIComponent(result.id)}`).catch(() => {});
          return;
        }
        await applyAvatarResult(result, `Фото получено из ${result.source || "соцсети"}`);
      } catch (error) {
        if (active) {
          setAvatarStatus("");
          setAvatarError(error.message || "Не удалось получить публичное фото из соцсети. Нажмите на фото, чтобы загрузить его вручную.");
        }
      } finally {
        if (active) setAvatarResolving(false);
      }
    }, 650);
    return () => {
      active = false;
      clearTimeout(timer);
      setAvatarResolving(false);
      setAvatarStatus((current) => current === "Получаем фото из соцсети…" ? "" : current);
    };
  }, [socialLinksKey, form.avatarUrl, previewAvatarUrl, imageUploading, saving, deleting]);
  const save = async (event) => {
    event.preventDefault();
    if (busy) return;
    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        ...form,
        links: form.links.map(contactLinkPayload),
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
  const categoryItems = [
    { value: "", label: "Без направления" },
    ...(hasCustomCategory ? [{ value: form.category, label: form.category }] : []),
    ...knownCategories.map((value) => ({ value, label: CONTACT_CATEGORY_LABELS[value] })),
  ];

  return (
    <form className="contact-detail__edit-form" onSubmit={save}>
      <ScrollArea className="contact-detail__scroll">
        <div className="contact-detail__edit-body">
          <div className="contact-detail__profile">
            <div className="contact-detail__edit-heading contact-detail__edit-heading--editable">
              <ShadcnButton
                type="button"
                variant="ghost"
                className="contact-detail__avatar-picker rounded-full p-0"
                aria-label={previewAvatarUrl ? "Сменить фото контакта" : "Добавить фото контакта"}
                title={previewAvatarUrl ? "Сменить фото" : "Добавить фото"}
                aria-busy={imageUploading || avatarResolving || undefined}
                disabled={saving || deleting || imageUploading}
                onClick={() => avatarFileRef.current?.click()}
              >
                <Avatar user={{ name: form.name || contact?.name, avatarUrl: previewAvatarUrl }} size="xl" className="contact-detail__avatar" aria-hidden="true" />
              </ShadcnButton>
              <div><strong>{creating ? (form.name.trim() || "Новый контакт") : contact.name}</strong></div>
            </div>
            <Input
              ref={avatarFileRef}
              className="sr-only !size-px"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Загрузить фото контакта"
              onChange={(event) => uploadAvatar(event.target.files?.[0])}
            />
            {(avatarStatus || avatarError) && <p className={`contact-detail__avatar-message${avatarError ? " is-error" : ""}`} role={avatarError ? "alert" : "status"}>{avatarError || avatarStatus}</p>}
          </div>
          <div className="contact-detail__edit-fields">
            <Field className="contact-detail__edit-field--wide">
              <FieldLabel htmlFor={`${contactFieldId}-name`}>Имя</FieldLabel>
              <Input id={`${contactFieldId}-name`} value={form.name} maxLength={120} required autoFocus={canAutofocusForm()} onChange={(event) => setField("name", event.target.value)} />
            </Field>
            <Field className="contact-detail__edit-field--wide">
              <FieldLabel htmlFor={`${contactFieldId}-company`}>Компания</FieldLabel>
              <ContactCompanyInput id={`${contactFieldId}-company`} companies={companies} value={form.company} maxLength={160} placeholder="Не указана" disabled={busy} onValueChange={(value) => setField("company", value)} />
            </Field>
            <Field className="contact-detail__edit-field--wide">
              <FieldLabel htmlFor={`${contactFieldId}-category`}>Направление</FieldLabel>
              <Select items={categoryItems} value={form.category} onValueChange={(value) => setField("category", value ?? "")} disabled={busy}>
                <SelectTrigger id={`${contactFieldId}-category`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {categoryItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field className="contact-detail__edit-field--wide">
              <FieldLabel htmlFor={`${contactFieldId}-role`}>Должность или роль</FieldLabel>
              <Input id={`${contactFieldId}-role`} value={form.role} maxLength={240} placeholder="Не указана" onChange={(event) => setField("role", event.target.value)} />
            </Field>
            <Field className="contact-detail__edit-field--wide">
              <FieldLabel htmlFor={`${contactFieldId}-status`}>Статус</FieldLabel>
              <Input id={`${contactFieldId}-status`} value={form.status} maxLength={80} placeholder="Например, в работе" onChange={(event) => setField("status", event.target.value)} />
            </Field>
          </div>
          <section className="contact-detail__edit-section" aria-labelledby="contact-edit-links-title">
            <h2 id="contact-edit-links-title"><Link2 aria-hidden="true" />Ссылки</h2>
            <div className="contact-detail__edit-links">
              {form.links.map((link, index) => (
                <div className="contact-detail__edit-link" key={index}>
                  <Input aria-label={`Адрес ссылки ${index + 1}`} type="url" value={link.url} maxLength={2000} required placeholder="https://…" onChange={(event) => setLinkUrl(index, event.target.value)} />
                  <ShadcnButton type="button" variant="destructive" size="icon" className="rounded-full" aria-label={`Удалить ссылку ${index + 1}`} onClick={() => removeLink(index)}><Trash2 aria-hidden="true" /></ShadcnButton>
                </div>
              ))}
              {!form.links.length && <p>Ссылок пока нет.</p>}
            </div>
            {form.links.length < 12 && <ShadcnButton type="button" variant="ghost" className="contact-detail__add-link" onClick={() => setForm((current) => ({ ...current, links: [...current.links, { url: "" }] }))}><Plus />Добавить ссылку</ShadcnButton>}
          </section>
          <Field className="contact-detail__edit-notes">
            <FieldLabel htmlFor={`${contactFieldId}-notes`}>Заметки</FieldLabel>
            <Textarea id={`${contactFieldId}-notes`} value={form.notes} maxLength={50000} rows={8} placeholder="Добавьте контекст, договорённости или историю общения" onChange={(event) => setField("notes", event.target.value)} />
          </Field>
          <ContactMeetingNotes notes={contact?.meetingNotes} />
          {saveError && <p className="contact-detail__edit-error" role="alert">{saveError}</p>}
        </div>
      </ScrollArea>
      <MobileFormFooter className="contact-detail__edit-actions">
        {!creating && <ShadcnButton
          data-control-icon
          type="button"
          variant="outline"
          size="icon"
          className="contact-detail__favorite"
          data-favorite={contact.favorite ? "true" : "false"}
          aria-pressed={Boolean(contact.favorite)}
          aria-label={contact.favorite ? `Убрать ${contact.name} из избранного` : `Добавить ${contact.name} в избранное`}
          title={contact.favorite ? "Убрать из избранного" : "Добавить в избранное"}
          disabled={favoriteSaving}
          onClick={onFavoriteToggle}
        >
          {favoriteSaving ? <Spinner /> : <Star fill={contact.favorite ? "currentColor" : "none"} aria-hidden="true" />}
        </ShadcnButton>}
        <ShadcnButton type="submit" disabled={busy}>{saving ? <><Spinner />Сохраняем</> : <><Check />{creating ? "Добавить контакт" : "Сохранить"}</>}</ShadcnButton>
        {!creating && <ShadcnButton data-control-icon type="button" variant="destructive" size="icon" aria-label="Удалить контакт" title="Удалить контакт" disabled={busy} onClick={() => setDeleteOpen(true)}><Trash2 aria-hidden="true" /></ShadcnButton>}
      </MobileFormFooter>
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
        <h2 id="contact-read-notes-title">Заметки</h2>
        <ContactNotes notes={contact.notes} />
        <ContactMeetingNotes notes={contact.meetingNotes} />
      </section>
    </article>
  );
}

function ContactDetailDrawer({ contactId, companies, onClose, onUpdated, onDeleted, readOnly = false }) {
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
      <DrawerContent className="contact-detail-drawer rollapp-body app-drawer--form" style={{ "--contact-accent": accent }}>
        <DrawerTitle className="sr-only">{contact?.name || "Карточка контакта"}</DrawerTitle>
        <div className="contact-detail__toolbar flex shrink-0 justify-end px-4 pt-4 pb-2">
          <DrawerClose
            render={<ShadcnButton type="button" variant="ghost" size="icon" className="contact-detail__close size-12 rounded-full" />}
            aria-label="Закрыть карточку контакта"
          ><X /></DrawerClose>
        </div>
        {loading ? <LoadingScreen compact /> : error ? (
          <div className="contacts-sphere__empty" role="alert">
            <strong>Не удалось открыть контакт</strong>
            <span>{error.message}</span>
            <Button variant="outline" onClick={() => reload().catch(() => {})}>Попробовать снова</Button>
          </div>
        ) : contact ? (
          readOnly ? <ScrollArea className="contact-detail__scroll"><ContactReadView contact={contact} /></ScrollArea> : <ContactEditForm
              contact={contact}
              companies={companies}
              favoriteSaving={favoriteSaving}
              onFavoriteToggle={toggleFavorite}
              onSaved={(savedContact) => {
                updateData((current) => ({ ...current, contact: savedContact }));
                onUpdated?.(savedContact);
              }}
              onDeleted={onDeleted}
            />
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

function ContactCreateDrawer({ companies, onClose, onCreated }) {
  const isMobile = useIsMobile();
  return (
    <Drawer open showSwipeHandle={isMobile} swipeDirection={isMobile ? "down" : "right"} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerContent className="contact-detail-drawer rollapp-body app-drawer--form" style={{ "--contact-accent": contactAccent("") }}>
        <DrawerTitle className="sr-only">Добавить контакт</DrawerTitle>
        <div className="contact-detail__toolbar flex shrink-0 justify-end px-4 pt-4 pb-2">
          <DrawerClose
            render={<ShadcnButton type="button" variant="ghost" size="icon" className="contact-detail__close size-12 rounded-full" />}
            aria-label="Закрыть добавление контакта"
          ><X /></DrawerClose>
        </div>
        <ContactEditForm companies={companies} onSaved={onCreated} />
      </DrawerContent>
    </Drawer>
  );
}

function CareerSpherePage() {
  const location = useLocation();
  return new URLSearchParams(location.search).get("tab") === "contacts"
    ? <ContactsSpherePage />
    : <TabbedSpherePage sphereId="career" tabs={CAREER_TABS} />;
}

function LegacyContactsRedirect() {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  search.set("tab", "contacts");
  return <Navigate to={{ pathname: location.pathname.replace("/app/spheres/contacts", "/app/spheres/career"), search: `?${search.toString()}`, hash: location.hash }} replace />;
}

function ContactsProfileControls() {
  const user = useSession()?.user;
  const access = useSphereSharing();
  const location = useLocation();
  const catalogPath = ownedSphereCatalogPath(user, access, location);
  return (
    <section className="page-toolbar w-full justify-center" aria-label="Управление контактами" data-not-typeset>
      <div className="page-actions wishes-page__hero-actions horizontal-action-scroller" role="group" aria-label="Действия с контактами">
        <SphereBusinessControls sphereId="career" catalogPath={catalogPath} />
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
  const loadMoreRef = useRef(null);
  const location = useLocation();
  const [selectedContactId, setSelectedContactId] = useState("");
  const [creatingContact, setCreatingContact] = useState(false);
  const [contactsVersion, setContactsVersion] = useState(0);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [search]);
  const query = new URLSearchParams({ pageSize: "48", order: "source" });
  const owner = new URLSearchParams(location.search).get("owner");
  if (owner) query.set("owner", owner);
  if (debouncedSearch) query.set("search", debouncedSearch);
  if (company) query.set("company", company);
  if (category) query.set("category", category);
  if (favoriteOnly) query.set("favorite", "true");
  const { data, loading, loadingMore, error, reload, loadMore, updateData } = useContactFeed(query.toString(), contactsVersion);
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !data?.hasMore || loading || loadingMore || error || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { rootMargin: "500px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [data, loading, loadingMore, error, loadMore]);
  const contacts = data?.contacts || [];
  const companies = data?.facets?.companies || [];
  const categories = data?.facets?.categories || [];
  const hasFilters = Boolean(search || company || category || favoriteOnly);
  const clearFilters = () => { setSearch(""); setDebouncedSearch(""); setCompany(""); setCategory(""); setFavoriteOnly(false); };
  globalShareRef.current = async () => {
    const path = sphereSectionPath({ ownerUsername: access.owner?.username, sphere: "career", section: "contacts" });
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
      if (favoriteOnly) await reload({ background: true });
    } catch (favoriteError) {
      toast(favoriteError.message, "error");
    } finally {
      setFavoriteSavingIds((current) => {
        const next = new Set(current);
        next.delete(contact.id);
        return next;
      });
    }
  };

  return (
    <div data-read-only={access.readOnly ? "true" : undefined} className="app-page page-stack sphere-page sphere-page--contacts typeset typeset-rollapp">
      {!access.readOnly && <><ContactsProfileControls /><AddFab actions={[{ label: "Добавить контакт", onSelect: () => setCreatingContact(true) }]} /></>}
      <section className="contacts-sphere not-typeset" aria-label="Контакты">
        <div className="contacts-sphere__toolbar">
          <InputGroup className="contacts-sphere__search">
            <InputGroupAddon align="inline-start"><Search aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput type="search" aria-label="Поиск по контактам" placeholder="Имя, роль, компания или заметка" value={search} onChange={(event) => setSearch(event.target.value)} />
            {search && <InputGroupAddon align="inline-end"><InputGroupButton type="button" size="icon-sm" className="contacts-sphere__search-clear rounded-full" aria-label="Очистить поиск" onClick={() => setSearch("")}><X /></InputGroupButton></InputGroupAddon>}
          </InputGroup>
          <div className="contacts-sphere__filters" aria-label="Фильтры контактов">
            <Select value={company || ALL_CONTACT_COMPANIES} onValueChange={(value) => { setCompany(value === ALL_CONTACT_COMPANIES ? "" : value); }}>
              <SelectTrigger className="contacts-sphere__select" aria-label="Компания">
                <SelectValue>{(value) => value === ALL_CONTACT_COMPANIES ? "Все компании" : value}</SelectValue>
              </SelectTrigger>
              <SelectContent className="contacts-sphere__select-content" align="start" alignItemWithTrigger={false}>
                <SelectItem value={ALL_CONTACT_COMPANIES}>Все компании</SelectItem>
                {companies.map((item) => <SelectItem key={item.company} value={item.company}>{item.company} · {item.count}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={category || ALL_CONTACT_CATEGORIES} onValueChange={(value) => { setCategory(value === ALL_CONTACT_CATEGORIES ? "" : value); }}>
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
              onClick={() => { setFavoriteOnly((value) => !value); }}
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
            {data?.total > contacts.length && <span>Показаны {contacts.length} из {data.total}</span>}
          </div>
        )}
        {loading ? <LoadingScreen compact /> : error && (!data || !contacts.length) ? (
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
                    {(!access.readOnly || contact.hasNotes || socialLinks.length > 0) && (
                      <footer className="contact-card__footer">
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
                        {(contact.hasNotes || socialLinks.length > 0) && <div className="contact-card__secondary-actions">
                          {contact.hasNotes && <ShadcnButton type="button" variant="ghost" className="contact-card__details h-9 rounded-full px-1" onClick={() => setSelectedContactId(contact.id)}><NotebookText aria-hidden="true" />Заметки</ShadcnButton>}
                          {socialLinks.length > 0 && (
                            <span className="contact-card__social-links" aria-label={`Ссылки ${contact.name}`}>
                              {socialLinks.map((link, index) => <ContactSocialLink key={`${link.url}-${index}`} link={link} contactName={contact.name} />)}
                            </span>
                          )}
                        </div>}
                      </footer>
                    )}
                  </li>
                );
              })}
            </ul>
            {data.hasMore && (
              <div ref={loadMoreRef} className="contacts-load-more" aria-live="polite" aria-busy={loadingMore}>
                {error && <span role="alert">Не удалось загрузить ещё контакты: {error.message}</span>}
                <ShadcnButton type="button" variant="outline" className="rounded-full" disabled={loadingMore} onClick={() => void loadMore()}>
                  {loadingMore ? <><Spinner />Загрузка контактов…</> : error ? "Попробовать снова" : "Загрузить ещё"}
                </ShadcnButton>
              </div>
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
        companies={companies}
        onClose={() => setSelectedContactId("")}
        onUpdated={() => reload({ background: true }).catch(() => {})}
        onDeleted={() => {
          setSelectedContactId("");
          setContactsVersion((value) => value + 1);
        }}
      />}
      {!access.readOnly && creatingContact && <ContactCreateDrawer
        companies={companies}
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
  if (!access.active || access.loading || !access.isOwner || access.requests.length === 0) return null;

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
        <Card key={request.id} className="sphere-access-request grid">
          <div className="sphere-access-request__person">
            <Avatar user={request.requester} size="sm" className="!size-11" />
            <span>
              <strong>{request.requester.name}</strong>
              <small>Бизнес-аккаунт · @{request.requester.username}</small>
            </span>
          </div>
          <div className="sphere-access-request__copy">
            <strong>Запрашивает доступ к «{request.sphere === "wishlist" && request.section !== "wishlist"
              ? `Вишлист · ${businessSectionLabel(request.section)}`
              : businessSectionLabel(request.section)}»</strong>
            {request.message && <p>{request.message}</p>}
          </div>
          <div className="sphere-access-request__actions">
            <ShadcnButton type="button" variant="destructive" disabled={Boolean(savingId)} onClick={() => respond(request, "declined")}>Отклонить</ShadcnButton>
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
  approved: { label: "Доступ закрыт", variant: "outline" },
  declined: { label: "Отклонён", variant: "destructive" },
  cancelled: { label: "Отменён", variant: "outline" },
};

const businessScopeKey = (ownerId, sphere, section) => JSON.stringify([ownerId, sphere, section]);
const businessSphereLabel = (sphere) => SERVICE_SWITCHER_ITEMS.find((item) => item.id === sphere)?.label || sphere;
const businessSectionLabel = (section) => SPHERE_SECTION_LABELS[section] || section;
const businessSharePath = ({ owner, sphere, section }) => sphereSectionPath({ ownerUsername: owner.username, sphere, section });

function BusinessAccessPage() {
  const { user } = useSession();
  if (user?.accountType !== "business") return <Navigate to={APP_HOME} replace />;
  return <BusinessAccessContent key={user.id} user={user} />;
}

function BusinessAccessContent({ user }) {
  const isMobile = useIsMobile();
  const toast = useToast();
  const category = businessCategoryFor(user);
  const availableSpheres = businessRequestSpheres(user);
  const initialSphere = availableSpheres[0]?.id || "identity";
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [people, setPeople] = useState([]);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [peopleError, setPeopleError] = useState("");
  const [accessData, setAccessData] = useState({ shares: [], requests: [], loading: true, error: "" });
  const accessLoad = useRef(0);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [sphere, setSphere] = useState(initialSphere);
  const [section, setSection] = useState(user.sellerSpace || SPHERE_SECTIONS[initialSphere][0]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState("");

  const loadAccess = useCallback(async () => {
    const load = ++accessLoad.current;
    try {
      const { shares = [], requests = [] } = await api.get("/business-access/requests");
      if (load === accessLoad.current) setAccessData({ shares, requests, loading: false, error: "" });
    } catch (error) {
      if (load === accessLoad.current) setAccessData({ shares: [], requests: [], loading: false, error: error.message });
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 180);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    let current = true;
    const query = new URLSearchParams();
    if (debouncedSearch) query.set("search", debouncedSearch);
    setLoadingPeople(true);
    setPeopleError("");
    api.get(`/business-access/users${query.size ? `?${query.toString()}` : ""}`).then((result) => {
      if (current) setPeople(result.people || []);
    }).catch((error) => {
      if (current) setPeopleError(error.message);
    }).finally(() => {
      if (current) setLoadingPeople(false);
    });
    return () => { current = false; };
  }, [debouncedSearch]);

  useEffect(() => {
    void loadAccess();
    window.addEventListener("focus", loadAccess);
    return () => {
      ++accessLoad.current;
      window.removeEventListener("focus", loadAccess);
    };
  }, [loadAccess]);

  const { requests, loading, error } = accessData;
  const fixedSellerSpace = category?.id === "seller" ? user.sellerSpace : null;
  const contactShares = accessData.shares.map((share) => fixedSellerSpace && share.sphere === "wishlist" && share.section === "wishlist"
    ? { ...share, section: fixedSellerSpace }
    : share);
  const shares = [...new Map(contactShares.map((share) => [businessScopeKey(share.owner.id, share.sphere, share.section), share])).values()];
  const sharesByScope = new Map(shares.map((share) => [businessScopeKey(share.owner.id, share.sphere, share.section), share]));
  const activeShareFor = (ownerId, scopeSphere, scopeSection) => sharesByScope.get(businessScopeKey(ownerId, scopeSphere, scopeSection))
    || (scopeSphere === "wishlist" && sharesByScope.get(businessScopeKey(ownerId, "wishlist", "wishlist")));
  const outstanding = requests.filter((request) => !activeShareFor(request.owner.id, request.sphere, request.section));
  const pendingByScope = new Map(outstanding.filter((request) => request.status === "pending")
    .map((request) => [businessScopeKey(request.owner.id, request.sphere, request.section), request]));
  const selectedScope = businessScopeKey(selectedPerson?.id, sphere, section);
  const selectedShare = activeShareFor(selectedPerson?.id, sphere, section);
  const selectedRequest = pendingByScope.get(selectedScope);
  const accessReady = !loading && !error;

  const selectSphere = (nextSphere) => {
    setSphere(nextSphere);
    setSection(SPHERE_SECTIONS[nextSphere][0]);
  };
  const openRequest = (person) => {
    const existing = shares.find((share) => share.owner.id === person.id)
      || outstanding.find((request) => request.owner.id === person.id && request.status === "pending");
    setSelectedPerson(person);
    setSphere(existing?.sphere || initialSphere);
    setSection(existing?.section || user.sellerSpace || SPHERE_SECTIONS[initialSphere][0]);
    setMessage("");
    void loadAccess();
  };
  const sendRequest = async (event) => {
    event.preventDefault();
    if (!selectedPerson || saving || !accessReady || selectedShare || selectedRequest) return;
    setSaving(true);
    try {
      await api.post("/business-access/requests", {
        ownerId: selectedPerson.id,
        sphere,
        section,
        message,
      });
      setSelectedPerson(null);
      await loadAccess();
      toast("Запрос отправлен владельцу пространства", "success");
    } catch (error) {
      toast(error.message, "error");
      if (error.status === 409) await loadAccess();
    } finally {
      setSaving(false);
    }
  };
  const cancelRequest = async (request) => {
    if (cancellingId) return;
    setCancellingId(request.id);
    try {
      await api.delete(`/business-access/requests/${request.id}`);
      await loadAccess();
      toast("Запрос отменён", "success");
    } catch (error) {
      toast(error.message, "error");
      if (error.status === 404) await loadAccess();
    } finally {
      setCancellingId("");
    }
  };
  const accessStatus = loading ? (
    <div className="business-access-page__status" role="status"><Spinner /><span>Загружаем доступы и запросы…</span></div>
  ) : error ? (
    <Alert variant="destructive">
      <AlertTitle>Не удалось загрузить доступы и запросы</AlertTitle>
      <AlertDescription>{error}<ShadcnButton type="button" variant="outline" onClick={loadAccess}>Повторить</ShadcnButton></AlertDescription>
    </Alert>
  ) : null;

  return (
    <div className="app-page business-access-page page-stack page-stack--sections rollapp-body">
      <header className="business-access-page__header typeset typeset-rollapp">
        <h1>Доступ к пространствам клиентов</h1>
        {category && <p>{category.label} · {category.sphereLabel}</p>}
        <p>Открытые владельцами разделы доступны только для чтения. Чтобы получить доступ к другому разделу, найдите пользователя и отправьте запрос.</p>
        {category?.id === "seller" && <PageActionButton to={publicSpacePath(user.username, user.sellerSpace || "products")}>Моя страница</PageActionButton>}
      </header>

      {category?.id !== "seller" && <BusinessPersonalOffers user={user} />}

      <section className="business-access-page__section" aria-labelledby="business-shares-title">
        <div className="typeset typeset-rollapp"><h2 id="business-shares-title">Открытые разделы</h2></div>
        {accessStatus || (shares.length ? (
          <ul className="contacts-grid">
            {shares.map((share) => (
              <BusinessAccessCard key={businessScopeKey(share.owner.id, share.sphere, share.section)} owner={share.owner} scope={share} actions={
                <Link to={businessSharePath(share)} data-slot="button" className={buttonVariants({ variant: "outline" })} aria-label={`Открыть «${businessSectionLabel(share.section)}» — ${share.owner.name}`}><span>Открыть</span></Link>
              } />
            ))}
          </ul>
        ) : <div className="business-access-page__status">У вас пока нет открытых разделов</div>)}
      </section>

      <section className="business-access-page__section" aria-labelledby="business-requests-title">
        <div className="typeset typeset-rollapp"><h2 id="business-requests-title">Мои запросы</h2></div>
        {accessReady && (outstanding.length ? (
          <ul className="contacts-grid">
            {outstanding.map((request) => {
              const status = BUSINESS_REQUEST_STATUS[request.status];
              return (
                <BusinessAccessCard key={request.id} owner={request.owner} scope={request} status={status && <Badge variant={status.variant}>{status.label}</Badge>} actions={request.status === "pending" && (
                  <ShadcnButton type="button" variant="outline" disabled={Boolean(cancellingId)} onClick={() => cancelRequest(request)}>{cancellingId === request.id && <Spinner data-icon="inline-start" />}<span>Отменить</span></ShadcnButton>
                )} />
              );
            })}
          </ul>
        ) : <div className="business-access-page__status">Здесь появятся запросы, по которым сейчас нет доступа</div>)}
      </section>

      <section className="business-access-page__section" aria-labelledby="business-people-title">
        <div className="typeset typeset-rollapp"><h2 id="business-people-title">Пользователи</h2></div>
        <InputGroup className="business-access-page__search">
          <InputGroupAddon align="inline-start"><Search aria-hidden="true" /></InputGroupAddon>
          <InputGroupInput type="search" aria-label="Найти пользователя" placeholder="Имя или username" value={search} onChange={(event) => setSearch(event.target.value)} />
          {search && <InputGroupAddon align="inline-end"><InputGroupButton type="button" size="icon-sm" className="rounded-full" aria-label="Очистить поиск" onClick={() => setSearch("")}><X aria-hidden="true" /></InputGroupButton></InputGroupAddon>}
        </InputGroup>
        {loadingPeople ? <div className="business-access-page__status" role="status"><Spinner /><span>Загружаем пользователей…</span></div> : peopleError ? (
          <Alert variant="destructive"><AlertTitle>Не удалось загрузить пользователей</AlertTitle><AlertDescription>{peopleError}</AlertDescription></Alert>
        ) : people.length ? (
          <ul className="contacts-grid" aria-label="Пользователи">
            {people.map((person) => {
              const sections = shares.filter((share) => share.owner.id === person.id);
              const hasPending = outstanding.some((request) => request.owner.id === person.id && request.status === "pending");
              return (
                <BusinessAccessCard key={person.id} owner={person} status={hasPending && <Badge variant="outline">Есть запрос</Badge>} actions={
                  <BusinessClientAccessActions account={user} person={person} sections={sections} onRequest={() => openRequest(person)} />
                } />
              );
            })}
          </ul>
        ) : <div className="business-access-page__status"><Users aria-hidden="true" /><span>Пользователи не найдены</span></div>}
      </section>

      <Drawer open={Boolean(selectedPerson)} showSwipeHandle swipeDirection={isMobile ? "down" : "right"} onOpenChange={(open) => !open && !saving && setSelectedPerson(null)}>
        <DrawerContent className="rollapp-body app-drawer--form">
          <DrawerClose render={<ShadcnButton className="absolute top-2 right-2 z-10 size-12" variant="ghost" size="icon" type="button" disabled={saving} />} aria-label="Закрыть запрос доступа"><X aria-hidden="true" /></DrawerClose>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>Разделы и доступ</DrawerTitle>
            <DrawerDescription>Выберите раздел, чтобы открыть его или запросить доступ у владельца.</DrawerDescription>
          </DrawerHeader>
          <form className="business-access-form" onSubmit={sendRequest}>
            <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <div className="business-access-form__person"><Avatar user={selectedPerson} size="md" /><span><strong>{selectedPerson?.name}</strong><small>@{selectedPerson?.username}</small></span></div>
            <FieldGroup className="gap-4">
              <BusinessRequestScopeFields account={user} sphere={sphere} section={section} onSphereChange={selectSphere} onSectionChange={setSection} disabled={saving} />
              {accessStatus || (selectedShare ? (
                <p role="status">Доступ открыт для чтения.</p>
              ) : selectedRequest ? (
                <p role="status">Запрос отправлен. Ожидаем ответа владельца.</p>
              ) : (
                <Field><FieldLabel htmlFor="business-access-message">Сообщение <span className="muted">необязательно</span></FieldLabel><Textarea id="business-access-message" maxLength={500} rows={4} placeholder="Объясните, зачем вам нужен доступ" value={message} disabled={saving} onChange={(event) => setMessage(event.target.value)} /></Field>
              ))}
            </FieldGroup>
            </div>
            {accessReady && !selectedRequest && <DrawerFooter>{selectedShare ? (
              <Link
                to={businessSharePath({ owner: selectedShare.owner, sphere, section })}
                replace={isMobile}
                onClick={() => setSelectedPerson(null)}
                data-slot="button"
                className={buttonVariants({ className: "flex-1" })}
              >Открыть</Link>
            ) : (
              <ShadcnButton type="submit" disabled={saving}>{saving && <Spinner data-icon="inline-start" />}Отправить запрос</ShadcnButton>
            )}</DrawerFooter>}
          </form>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function BusinessAccessCard({ owner, scope, status, actions }) {
  return (
    <li className="business-access-card" style={{ "--contact-accent": contactAccent(owner.username || owner.name) }}>
      <div className="business-access-card__body">
        <div className="contact-card__avatar-wrap">
          <Avatar user={owner} size="lg" className="contact-card__avatar" aria-hidden="true" />
        </div>
        <div className="business-access-card__identity">
          <strong>{owner.name}</strong>
          <span className="business-access-card__caption">@{owner.username}</span>
        </div>
        {scope && (
          <div className="business-access-card__scope">
            <span><Building2 aria-hidden="true" /><span>{businessSectionLabel(scope.section)}</span></span>
            {scope.section !== scope.sphere && <span className="business-access-card__caption">{businessSphereLabel(scope.sphere)}</span>}
          </div>
        )}
        {status}
      </div>
      {actions && <footer className="business-access-card__footer">{actions}</footer>}
    </li>
  );
}

function SphereSharePicker({ open, onOpenChange }) {
  const isMobile = useIsMobile();
  const toast = useToast();
  const { sphere, section, isOwner, reload } = useSphereSharing();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const label = SPHERE_SECTION_LABELS[section] || section;

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 180);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!open || !isOwner || !section) return undefined;
    let current = true;
    const query = new URLSearchParams({ sphere, section });
    if (debouncedSearch) query.set("search", debouncedSearch);
    setPeople([]);
    setLoading(true);
    setError("");
    api.get(`/sphere-shares/candidates?${query.toString()}`).then((result) => {
      if (current) setPeople((result.people || []).filter((person) => person.accountType === "business"));
    }).catch((loadError) => {
      if (current) setError(loadError.message);
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [debouncedSearch, isOwner, open, section, sphere]);

  const toggle = async (person) => {
    if (savingId) return;
    const granted = !person.granted;
    setSavingId(person.id);
    setError("");
    try {
      await api.post("/sphere-shares", {
        viewerId: person.id,
        sphere,
        section: person.granted ? (person.grantSection || section) : section,
        granted,
      });
      setPeople((current) => current.map((item) => item.id === person.id ? { ...item, granted, grantSection: section } : item));
      const refreshed = await api.get(`/sphere-shares/candidates?${new URLSearchParams({ sphere, section, search: debouncedSearch })}`).catch(() => null);
      if (refreshed) setPeople(refreshed.people || []);
      await reload();
      toast(granted
        ? `Доступ к «${label}» для ${person.name} открыт`
        : `Доступ к «${label}» для ${person.name} закрыт`, "success");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingId("");
    }
  };

  return (
    <Drawer open={open} showSwipeHandle swipeDirection={isMobile ? "down" : "right"} onOpenChange={(nextOpen) => !savingId && onOpenChange(nextOpen)}>
      <DrawerContent
        className="rollapp-body app-drawer--form"
      >
        <DrawerClose
          render={<ShadcnButton className="absolute top-2 right-2 z-10 size-12" variant="ghost" size="icon" type="button" disabled={Boolean(savingId)} />}
          aria-label="Закрыть выбор пользователей"
        >
          <X aria-hidden="true" />
        </DrawerClose>
        <DrawerHeader className="pr-16 text-left!">
          <DrawerTitle>Доступ к «{label}»</DrawerTitle>
          <DrawerDescription>Выберите бизнес-аккаунты, которым хотите открыть этот раздел для чтения.</DrawerDescription>
        </DrawerHeader>
        <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <InputGroup className="sphere-share-picker__search">
            <InputGroupAddon align="inline-start"><Search aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput autoFocus={canAutofocusForm()} type="search" aria-label="Найти бизнес-аккаунт" placeholder="Название или username" value={search} onChange={(event) => setSearch(event.target.value)} />
          </InputGroup>
          {error && <Alert variant="destructive"><AlertTitle>Не удалось изменить доступ</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          {loading ? <div className="sphere-share-picker__status"><Spinner /><span>Загружаем людей…</span></div> : people.length ? (
            <ul className="sphere-share-picker__list" aria-label={`Бизнес-аккаунты с доступом к «${label}»`}>
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
                    <span><strong>{person.name}</strong><small>@{person.username}{person.grantSection === "wishlist" ? " · Доступ ко всему Вишлисту" : ""}</small></span>
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
          ) : <div className="sphere-share-picker__status"><Users /><span>Бизнес-аккаунты не найдены</span></div>}
        </div>
        <DrawerFooter>
          <DrawerClose render={<ShadcnButton className="min-h-12 text-base" type="button" />}>Готово</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function ownedSphereCatalogPath(user, access, location) {
  const params = new URLSearchParams(location.search);
  if ((access.active && !access.isOwner) || access.error || user?.accountType !== "personal" || !canAccessPrivateSpheres(user)
    || params.has("owner") || location.pathname.includes("/business/")) return null;
  const identityReports = location.pathname === "/app/spheres/identity" && params.get("tab") === "identity-reports";
  return identityReports
    ? sphereBusinessCatalogPath("identity", "identity-reports")
    : sphereBusinessCatalogPath(access.sphere, access.section);
}

function PersistentProfileHero({ user, wishlistChrome = false }) {
  const { openProfileEditor } = useProfileEditor();
  const location = useLocation();
  const wishlistPage = useMatch(APP_HOME);
  const access = useSphereSharing();
  const profile = !wishlistChrome && access.active && access.owner
    ? access.owner
    : user;
  const moodLevel = profile.id === user.id ? user.moodLevel ?? user.publicMood : profile.publicMood;
  const editable = !access.active || access.isOwner;
  const catalogPath = access.sphere === "career" && access.section === "contacts"
    ? null
    : ownedSphereCatalogPath(user, access, location);
  return (
    <section className="wishes-page__hero persistent-profile-hero" data-persistent-profile aria-labelledby="persistent-profile-name">
      <div className="wishes-page__identity wishes-page__identity--readonly">
        <div className="sphere-share-avatars">
          {/^\/app\/friends(?:\/|$)/.test(location.pathname) ? <StoryAvatar user={profile} own={editable} onEditProfile={openProfileEditor}>
            <ProfilePortrait user={profile} moodLevel={moodLevel} />
          </StoryAvatar> : editable ? <ShadcnButton type="button" variant="ghost" className="persistent-profile-hero__avatar-button h-auto min-h-0 rounded-full p-0 active:translate-y-0" aria-label={`Редактировать профиль ${profile.name}`} title="Редактировать профиль" onClick={openProfileEditor}>
            <ProfilePortrait user={profile} moodLevel={moodLevel} />
          </ShadcnButton> : <ProfilePortrait user={profile} moodLevel={moodLevel} />}
          {catalogPath && (
            <ControlBar as="nav" className="sphere-share-avatars__people" aria-label="Бизнес-каталог">
              <Link to={catalogPath} data-control-icon aria-label="Открыть каталог брендов" title="Каталог брендов"
                className={buttonVariants({ variant: "outline", size: "icon" })}>
                <ShoppingBag aria-hidden="true" />
              </Link>
            </ControlBar>
          )}
        </div>
        <div className="wishes-page__hero-copy">
          <h1 id="persistent-profile-name">{profile.name}</h1>
          {(wishlistChrome || wishlistPage) && editable && <AppFriendsLink memberNumber={profile.memberNumber} />}
          <ProfileMoodCaption level={moodLevel} />
          {wishlistChrome && <WishlistSectionNavigation user={user} />}
        </div>
        {access.readOnly && <Badge variant="secondary" className="sphere-share-readonly-badge"><Eye aria-hidden="true" />Только чтение</Badge>}
      </div>
    </section>
  );
}

function CatalogPageHeader({ selectedSpace, source, title, action }) {
  const heading = title || `${source === "brands" ? "Бренды" : "Лента"} · ${SPACES.find(space => space.id === selectedSpace)?.label || "Товары"}`;
  return (
    <header className="typeset typeset-rollapp flex flex-wrap items-center justify-between gap-2">
      <h2>{heading}</h2>
      {action}
    </header>
  );
}

function wishlistPublicationPath(space, publication) {
  const search = new URLSearchParams({ tab: space });
  if (publication) search.set("publication", publication);
  return `${APP_HOME}?${search}`;
}

function WishlistSectionNavigation({ user }) {
  const { pathname, search } = useLocation();
  const { isOwner } = useSphereSharing();
  const path = pathname.replace(/\/+$/, "").toLowerCase();
  const space = wishlistSpace(search);
  const tab = new URLSearchParams({ tab: space });
  const brands = isBrandCatalogSearch(search);
  const publication = path === APP_HOME ? profilePublicationSection(new URLSearchParams(search).get("publication")) : null;
  const links = [
    { to: wishlistPublicationPath(space), active: path === APP_HOME && !publication, label: "Вишлист", title: "Вишлист", icon: Gift },
    { to: `${APP_WISH_CATALOG_PATH}?${tab}`, active: path === APP_WISH_CATALOG_PATH && !brands, label: "Открыть ленту", title: "Лента", icon: Newspaper },
    { to: brandCatalogPath(space), active: path === APP_WISH_CATALOG_PATH && brands, label: "Открыть каталог брендов", title: "Каталог брендов", icon: ShoppingBag },
    { to: `${APP_STORE_PATH}?${tab}`, active: path === APP_STORE_PATH || path === APP_ORDERS_PATH, label: "Открыть магазин", title: "Магазин", icon: Store },
    { to: `${APP_WISH_OFFERS_PATH}?${tab}`, active: path === APP_WISH_OFFERS_PATH, label: "Открыть предложения", title: "Предложения", icon: Send },
  ];
  if (canManageWishSales(user, space)) {
    links.push({ to: wishSalesPath(space), active: path === APP_WISH_SALES_PATH, label: "Мои продажи", title: "Мои продажи", icon: Tag });
  }
  return (
    <ControlBar as="nav" className="wishlist-section-navigation" aria-label="Разделы Вишлиста">
      {links.map(({ to, active, label, title, icon: Icon }) => (
        <Link key={title} to={to} aria-current={active ? "page" : undefined}
          className={buttonVariants({ variant: active ? "default" : "outline", size: "icon" })}
          data-control-icon aria-label={label} title={title}>
          <Icon aria-hidden="true" />
        </Link>
      ))}
      {isOwner && user.username && <ProfilePublicationLinks activeSection={publication}
        toSection={section => wishlistPublicationPath(space, section)} />}
    </ControlBar>
  );
}

function WishesProfileControls({ selectedSpace }) {
  const { user } = useSession();
  if (!canManageWishlistSpace(user, selectedSpace)) return null;
  return (
    <section className="wishes-page__profile-controls" aria-label="Управление Вишлистом">
      <ControlBar className="page-actions wishes-page__hero-actions horizontal-action-scroller" role="group" aria-label="Действия со списком желаний">
        {canManageWishlistSpace(user, selectedSpace) && <PageActionButton variant="outline" to={publicSpacePath(user.username, selectedSpace)}>Моя страница</PageActionButton>}
      </ControlBar>
    </section>
  );
}

const STORE_CATS = [
  { id: "red", name: "Красный", mood: "Злой", image: "/store/cats/red-angry.webp", accent: "#f23849" },
  { id: "white", name: "Белый", mood: "Милаха", image: "/store/cats/white-cute.webp", accent: "#eef3f6" },
  { id: "blue", name: "Синий", mood: "Уставший", image: "/store/cats/blue-tired.webp", accent: "#438de4" },
  { id: "pink", name: "Розовый", mood: "Влюблён", image: "/store/cats/pink-in-love.webp", accent: "#f51a91" },
  { id: "black", name: "Чёрный", mood: "Крутой", image: "/store/cats/black-cool.webp", accent: "#d7a945" },
  { id: "gold", name: "Золотой", mood: "", image: "/store/cats/gold.png", accent: "#c9a06f" },
];
const STORE_CAT_PRICE = "1 000 ролл";

function StorePage({ user, selectedSpace, ordersOpen }) {
  const location = useLocation();
  const navigate = useNavigate();
  function changeOrdersOpen(open) {
    if (open) navigate(APP_ORDERS_PATH, { state: { ordersFromStore: true } });
    else if (location.state?.ordersFromStore) navigate(-1);
    else navigate(APP_STORE_PATH, { replace: true });
  }
  const toast = useToast();
  const isProducts = selectedSpace === "products";
  const storageKey = `rollapp:pending-cat-purchase:${user.id}`;
  const [purchase, setPurchase] = useState(() => isProducts ? restoreCatPurchase(storageKey, STORE_CATS) : null);
  const beginPurchase = (cat) => {
    setPurchase(restoreCatPurchase(storageKey, STORE_CATS) || { cat, idempotencyKey: crypto.randomUUID() });
  };
  return <>
    <div className="app-page wish-catalog-page cat-store-page page-stack">
      <Drawer mobileDrawer open={ordersOpen} onOpenChange={changeOrdersOpen}>
        <CatalogPageHeader title={`Магазин · ${SPACES.find((space) => space.id === selectedSpace)?.label}`} action={isProducts && (
          <DrawerTrigger render={<PageActionButton variant="outline" />}>
            <PackageCheck aria-hidden="true" />Заказы
          </DrawerTrigger>
        )} />
        <OrdersDrawerContent products={STORE_CATS} />
      </Drawer>
      {isProducts ? <div className="wish-grid catalog-wish-grid">
        {STORE_CATS.map((cat) => (
          <WishlistSnippet
            key={cat.id}
            className="cat-store-card"
            title={`${cat.name} кот${cat.mood ? ` — ${cat.mood}` : ""}`}
            imageUrl={cat.image}
            imageAlt={`${cat.name} кот${cat.mood ? ` — ${cat.mood.toLowerCase()}` : ""}`}
            imageLoading="lazy"
            price={<><Coins aria-hidden="true" />{STORE_CAT_PRICE}</>}
            mediaAction={(
              <ShadcnButton
                type="button"
                variant="outline"
                size="icon"
                className="!size-12 !rounded-full !border-black !bg-black !p-0 !text-white hover:!bg-black/85"
                aria-label={`Купить «${cat.name} кот» за ${STORE_CAT_PRICE}`}
                title="Купить"
                onClick={() => beginPurchase(cat)}
              >
                <Coins className="size-5 text-amber-300" aria-hidden="true" />
              </ShadcnButton>
            )}
          />
        ))}
      </div> : <Empty><EmptyHeader><EmptyTitle>В этом разделе магазина пока пусто</EmptyTitle></EmptyHeader></Empty>}
    </div>
    {!ordersOpen && purchase && <CatCheckout key={purchase.idempotencyKey} purchase={purchase} storageKey={storageKey} onClose={() => setPurchase(null)} onSuccess={() => toast(`${purchase.cat.name} кот куплен за 1 000 роллов`, "success")} />}
  </>;
}

function LegacyClassifiedsRedirect() {
  const { search } = useLocation();
  const requestedSpace = new URLSearchParams(search).get("tab");
  const query = new URLSearchParams();
  if (SPACE_IDS.includes(requestedSpace)) query.set("tab", requestedSpace);
  query.set("publication", "announcements");
  return <Navigate to={`${APP_HOME}?${query}`} replace />;
}

function ProtectedWishlistBusiness({ listings = false }) {
  const location = useLocation();
  const { user, loading } = useSession();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(safeNextPath(`${location.pathname}${location.search}`))}`} replace />;
  if (listings) {
    const space = wishlistSpace(location.search);
    const business = new URLSearchParams(location.search).get("business") || "";
    return <AppShell><section className="app-page page-stack rollapp-body">
      <header className="typeset typeset-rollapp"><h1>Объявления продавцов</h1></header>
      <WishlistBusinessListing key={`${user.id}:${space}:${business}`} space={space} business={business} viewerId={user.id} />
    </section></AppShell>;
  }
  const requestedSpace = wishlistSpace(location.search);
  const space = user.sellerSpace || requestedSpace;
  return <Navigate to={canManageWishlistSpace(user, space) ? publicSpacePath(user.username, space) : APP_HOME} replace />;
}

function WishlistSectionLayout() {
  const location = useLocation();
  const { user, loading } = useSession();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(safeNextPath(`${location.pathname}${location.search}`))}`} replace />;
  return <AppShell wishlistChrome><Outlet /></AppShell>;
}

function WishlistHomeRoute() {
  const { search } = useLocation();
  const { user } = useSession();
  const [wishModal, setWishModal] = useState(null);
  const [version, setVersion] = useState(0);
  if (user.accountType === "business") {
    const query = new URLSearchParams(search);
    const requestedSpace = query.get("tab");
    const space = SPACE_IDS.includes(requestedSpace) ? requestedSpace : user.sellerSpace || "products";
    const publication = profilePublicationSection(query.get("publication"));
    const destination = publication
      ? `${publicPublicationPath(user.username, publication)}?${new URLSearchParams({ tab: space })}`
      : publicSpacePath(user.username, space);
    return <Navigate to={destination} replace />;
  }
  return <>
    <WishesPage version={version} onAdd={(space, listId) => setWishModal({ space, listId })} />
    {wishModal && <WishModal space={wishModal.space} initialListId={wishModal.listId} onClose={() => setWishModal(null)} onSaved={() => {
      setWishModal(null);
      setVersion(value => value + 1);
    }} />}
  </>;
}

function WishlistStoreRoute({ ordersOpen = false }) {
  const { search } = useLocation();
  const { user } = useSession();
  const space = ordersOpen ? "products" : wishlistSpace(search);
  return <StorePage key={`${user.id}:${space}`} user={user} selectedSpace={space} ordersOpen={ordersOpen} />;
}

function WishlistOffersRoute() {
  const { search } = useLocation();
  const space = wishlistSpace(search);
  const label = SPACES.find((entry) => entry.id === space)?.label;
  return <section className="app-page page-stack rollapp-body" aria-label={`Предложения: ${label}`}>
    <WishlistBusinessListing key={space} space={space} offers />
  </section>;
}

function WishlistSalesRoute() {
  const { user } = useSession();
  return <WishSalesPage user={user} />;
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
          <EmptyContent><Link to={APP_HOME} className={buttonVariants()}>Вернуться в Rollapp</Link></EmptyContent>
        </Empty>
      </div>
    );
  }
  if (!canAccessPrivateSpheres(user) && !access.readOnly) return <Navigate to={APP_HOME} replace />;
  return children;
}

function BusinessMarketplaceRoute() {
  const { user } = useSession();
  const { sphereId = "" } = useParams();
  if (sphereId === "contacts") return <LegacyContactsRedirect />;
  const sphere = SPHERE_SERVICES.find((item) => item.id === sphereId);
  if (!sphere || !businessMarketplacePath(sphereId)) return <Navigate to={APP_HOME} replace />;
  return <BusinessMarketplacePage key={`${user?.id}:${sphere.id}`} user={user} sphere={sphere} />;
}

function SphereBusinessCatalogRoute() {
  const { user } = useSession();
  const { sphereId } = useParams();
  const { search } = useLocation();
  const access = useSphereSharing();
  const [sharePickerOpen, setSharePickerOpen] = useState(false);
  const sphere = sphereId === "contacts" ? "career" : sphereId;
  const query = new URLSearchParams(search);
  const identityReports = sphere === "identity" && query.get("tab") === "identity-reports";
  const section = sphereId === "contacts" ? "contacts" : identityReports ? "identity-reports" : access.section;
  const catalogPath = sphereBusinessCatalogPath(sphere, section);
  if (!catalogPath) return <Navigate to={APP_HOME} replace />;
  if (sphereId === "contacts") return <Navigate to={catalogPath} replace />;
  const home = sphereSectionPath({ sphere, section });
  if (user.accountType !== "personal" || !access.isOwner || access.readOnly || query.has("owner")) return <Navigate to={APP_HOME} replace />;
  const offers = query.get("view") === "offers";
  const offerSearch = new URLSearchParams({ tab: section, view: "offers" });
  const title = SPHERE_SERVICES.find(item => item.id === sphere)?.label;
  return <div className="app-page page-stack rollapp-body">
    <ControlBar as="nav" className="page-actions horizontal-action-scroller" aria-label={`Разделы сферы «${title}»`}>
      <Link to={home} data-control-icon className={buttonVariants({ variant: "outline", size: "icon" })} aria-label={`К сфере «${title}»`} title={`К сфере «${title}»`}><ArrowLeft aria-hidden="true" /></Link>
      <Link to={catalogPath} data-control-icon className={buttonVariants({ variant: offers ? "outline" : "default", size: "icon" })} aria-current={!offers ? "page" : undefined} aria-label="Каталог брендов" title="Каталог брендов"><ShoppingBag aria-hidden="true" /></Link>
      <Link to={`${catalogPath.split("?")[0]}?${offerSearch}`} data-control-icon className={buttonVariants({ variant: offers ? "default" : "outline", size: "icon" })} aria-current={offers ? "page" : undefined} aria-label="Предложения" title="Предложения"><Send aria-hidden="true" /></Link>
    </ControlBar>
    <section className="page-stack mx-auto w-full max-w-(--layout-collection-width)" aria-label={offers ? "Предложения сферы" : "Каталог брендов"}>
      {offers ? <PersonalOffers key={sphere} user={user} sphere={sphere} /> : <>
        <header className="typeset typeset-rollapp">
          <h2>Бренды · {title}</h2>
          <p>Подпишитесь на бизнес, чтобы получать от него предложения.</p>
        </header>
        <BusinessCatalogProvider sphere={sphere}><BusinessCatalogList /></BusinessCatalogProvider>
        {access.active && <><div><PageActionButton type="button" variant="outline" onClick={event => {
          event.currentTarget.focus({ preventScroll: true });
          setSharePickerOpen(true);
        }}>Доступ к личному разделу</PageActionButton></div>
        <SphereSharePicker open={sharePickerOpen} onOpenChange={setSharePickerOpen} /></>}
      </>}
    </section>
  </div>;
}

function isAssistantPath(pathname) {
  return pathname.replace(/\/$/, "").toLowerCase() === APP_ASSISTANT_PATH;
}

function messagesHostPath(user) {
  return user.accountType === "business"
    ? publicSpacePath(user.username, user.sellerSpace || "products")
    : APP_HOME;
}

function AssistantRoute() {
  const { user, loading } = useSession();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(APP_ASSISTANT_PATH)}`} replace />;
  return <Navigate to={messagesHostPath(user)} replace state={{ assistantOpen: true }} />;
}

function MessengerRoute({ user }) {
  const { conversationId } = useParams();
  return <Navigate to={messagesHostPath(user)} replace state={{ messengerOpen: true, messengerConversationId: conversationId || null }} />;
}

function ProtectedApp() {
  const location = useLocation();
  const { user, loading, refresh } = useSession();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(safeNextPath(`${location.pathname}${location.search}`))}`} replace />;
  return <AppShell><Routes><Route path="messenger/:conversationId?" element={<MessengerRoute user={user} />} /><Route index element={<Navigate to={APP_HOME} replace />} /><Route path="planning" element={<PlanningSpace key={user.id} />} /><Route path="private-notes" element={<PrivateNotes key={user.id} ownerId={user.id} />} /><Route path="rolls" element={<RollsWallet key={user.id} user={user} />} /><Route path="member-number" element={<MemberNumberPage key={user.id} user={user} onDrawn={refresh} />} /><Route path="business/access" element={<BusinessAccessPage />} /><Route path="ideas" element={<Navigate to={APP_HOME} replace />} /><Route path="friends" element={<Navigate to="/app/friends/subscriptions" replace />} /><Route path="friends/:section" element={<FriendsPage />} /><Route path="spheres/:sphereId/business/catalog" element={<PrivateSphereRoute><SphereBusinessCatalogRoute /></PrivateSphereRoute>} /><Route path="spheres/:sphereId/business/store" element={<PrivateSphereRoute><BusinessMarketplaceRoute /></PrivateSphereRoute>} /><Route path="spheres/identity" element={<PrivateSphereRoute><TabbedSpherePage sphereId="identity" tabs={IDENTITY_TABS} /></PrivateSphereRoute>} /><Route path="spheres/career" element={<PrivateSphereRoute><CareerSpherePage /></PrivateSphereRoute>} /><Route path="spheres/education" element={<PrivateSphereRoute><TabbedSpherePage sphereId="education" tabs={EDUCATION_TABS} /></PrivateSphereRoute>} /><Route path="spheres/health" element={<PrivateSphereRoute><TabbedSpherePage sphereId="health" tabs={HEALTH_TABS} /></PrivateSphereRoute>} /><Route path="spheres/contacts" element={<LegacyContactsRedirect />} /><Route path="gifts" element={<Navigate to={APP_HOME} replace />} /><Route path="notifications" element={<Navigate to={APP_HOME} replace />} /><Route path="settings" element={<Navigate to={APP_HOME} replace />} /><Route path="*" element={<Navigate to={APP_HOME} replace />} /></Routes></AppShell>;
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
  const leave = async () => {
    setBusy(true);
    try {
      await api.delete(`/wishes/${wish.id}/participation`);
      onDeleted?.();
      await refreshAfterMutation();
      toast("Совместное желание убрано с вашей доски");
    } catch (error) {
      toast(error.message, "error");
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
      toast(wish.participants?.length ? "Секретное желание доступно вам и участникам" : "Секретное желание видно только вам", "error");
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
      const result = await api.post(`/wishes/${wish.id}/copy`, { shareToken: shareToken || wish.shareToken || "" });
      toast(withWishReward(
        wish.likedByMe ? "Желание уже в вашем общем списке" : "Понравилось — желание добавлено в ваш общий список",
        result.reward,
      ));
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
      const result = await api.post("/wishes", buildRepeatWishPayload(wish, wishSpaceId(wish, lists)));
      toast(withWishReward("Желание снова добавлено в активные ✦", result.reward));
      await refreshAfterMutation();
      return true;
    } catch (error) {
      toast(error.message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, reserve, remove, leave, fulfilled, share, save, update, repeat };
}

function WishGroupingSubmenu({ wish, groups = [], busy = false, onCreate, onAdd }) {
  return <DropdownMenuSub>
    <DropdownMenuSubTrigger className="card-menu__submenu-trigger min-h-12 gap-2 px-3 py-2 text-base" disabled={busy}>
      <PackagePlus /> <span>Добавить в группу</span>
    </DropdownMenuSubTrigger>
    <DropdownMenuSubContent
      id={`wish-groups-${wish.id}`}
      className="w-70 max-w-(--available-width) rounded-2xl p-2 [&_[data-slot=dropdown-menu-item]]:min-h-12"
      sideOffset={4}
      aria-label={`Группы для желания «${wish.title}»`}
    >
      <DropdownMenuGroup>
        <DropdownMenuLabel className="px-2 py-2 text-sm">Группы</DropdownMenuLabel>
        <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={onCreate}>
          <PackagePlus /> Обернуть в группу
        </DropdownMenuItem>
      </DropdownMenuGroup>
      {groups.length > 0 && <DropdownMenuSeparator />}
      <div className="max-h-[22.75rem] overflow-y-auto overscroll-contain">
        {groups.map((group) => <DropdownMenuItem
          key={group.id}
          className="min-h-12 gap-2 px-3 py-2 text-base"
          disabled={busy}
          onClick={() => onAdd(group.id)}
        >
          <LayoutGrid />
          <span className="min-w-0 flex-1 truncate">{group.title}</span>
          <span className="shrink-0 text-sm text-muted-foreground">{group.wishIds?.length || 0}</span>
        </DropdownMenuItem>)}
      </div>
    </DropdownMenuSubContent>
  </DropdownMenuSub>;
}

function WishSaleMenuItem({ wish, space, disabled }) {
  const { user } = useSession();
  if (!canManageWishSales(user, space)) return null;
  return <DropdownMenuItem
    className="min-h-12 gap-2 px-3 py-2 text-base"
    disabled={disabled}
    render={<Link to={wishSalesPath(space, wish.id)} />}
  ><Tag aria-hidden="true" /> Выставить на продажу</DropdownMenuItem>;
}

function WishCard({ wish, owner = false, onChanged, onOpen, onEdit, onCreateList, groupOptions = [], onCreateGroup, onAddToGroup, onRemoveFromGroup, groupBusy = false, profile, lists = [], shareToken = "", draggable = false, nativeDraggable = draggable, dragGroupId = "", onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, onPointerDown, isDropTarget = false, isDragging = false }) {
  const [menu, setMenu] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [grouping, setGrouping] = useState(false);
  const [removingFromGroup, setRemovingFromGroup] = useState(false);
  const [selectedListIds, setSelectedListIds] = useState(() => [...(wish.listIds || [])]);
  const listMutationRef = useRef(false);
  const { busy, remove, leave, fulfilled, share, save, update, repeat } = useWishActions({ wish, profile, lists, shareToken, onChanged });
  const interactionBusy = busy || grouping || removingFromGroup || groupBusy;
  const categoryLists = lists.filter((list) => !isGeneralList(list));
  const cardSpace = wishSpaceId(wish, lists);
  const visibleLists = categoryLists.filter((list) => listSpace(list) === cardSpace);
  const placeAddress = cardSpace === "places" ? placeSnippetAddress(wish.description) : "";
  const secretListMembership = lists.some((list) => list.privacy === "private" && wish.listIds?.includes(list.id));
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

  const runGroupAction = async (action) => {
    if (!action || interactionBusy) return;
    setGrouping(true);
    try {
      await action();
    } finally {
      setGrouping(false);
    }
  };

  return (
    <>
    <WishlistSnippet
      title={wish.title}
      price={[
        wish.price != null ? formatMoney(wish.price, wish.currency) : "",
        wish.eventDate ? formatEventDate(wish.eventDate) : "",
      ].filter(Boolean).join(" · ")}
      imageUrl={previewImageUrl}
      fallbackImageUrl={retailerPreviewImageUrl(wish.url)}
      video={videoPreview}
      mediaBadge={wish.status === "fulfilled" && (
        <Badge variant="secondary"><Check data-icon="inline-start" aria-hidden="true" />Исполнено</Badge>
      )}
      openButton={onOpen && {
        draggable: nativeDraggable,
        "data-wish-id": wish.id,
        "aria-label": `Открыть желание «${wish.title}»`,
        "aria-haspopup": "dialog",
        onClick: (event) => { closeMenu(); onOpen(event.currentTarget); },
      }}
      beforeMedia={draggable && <span className="wish-card__drag-handle" data-wish-drag-handle draggable={nativeDraggable} aria-hidden="true"><GripVertical /></span>}
      data-group-wish-id={wish.id}
      data-wish-group-id={dragGroupId || undefined}
      draggable={nativeDraggable}
      aria-busy={groupBusy || undefined}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onPointerDown={onPointerDown}
      className={cn(
        cardSpace === "places" && "wish-card--place",
        wish.status === "fulfilled" && "is-fulfilled",
        draggable && "is-draggable",
        isDropTarget && "is-group-target",
        isDragging && "is-dragging",
      )}
      address={placeAddress}
      details={(wish.sharedBy || wish.participants?.length > 0) && (
        <span className="flex min-w-0 items-center gap-1"><Users className="size-4 shrink-0" aria-hidden="true" /><span className="truncate">{wish.sharedBy?.name || "Совместное"}</span></span>
      )}
      menu={(
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
              {!owner && !wish.sharedBy && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={save}><Archive /> Сохранить к себе</DropdownMenuItem>}
              {owner && wish.status === "fulfilled" ? <>
                <WishSaleMenuItem wish={wish} space={cardSpace} disabled={interactionBusy} />
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
              {owner && onCreateGroup && <WishGroupingSubmenu
                wish={wish}
                groups={groupOptions}
                busy={interactionBusy}
                onCreate={() => runGroupAction(onCreateGroup)}
                onAdd={(groupId) => runGroupAction(() => onAddToGroup?.(groupId))}
              />}
              {owner && onRemoveFromGroup && <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" className="app-destructive-menu-item min-h-12 gap-2 px-3 py-2 text-base" disabled={interactionBusy} onClick={removeFromGroup}>{removingFromGroup || groupBusy ? <LoaderCircle className="spin" /> : <Ungroup />} Убрать из группы</DropdownMenuItem>
              </>}
              {!wish.sharedBy && (!owner || wish.status !== "fulfilled") && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={share}><Share2 /> Поделиться</DropdownMenuItem>}
              {!owner && merchantProductUrl(wish.url) && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" render={<a href={merchantProductUrl(wish.url)} target="_blank" rel="noreferrer" />}><ExternalLink /> {isYandexMapsUrl(wish.url) ? "Открыть в Яндекс Картах" : "Открыть магазин"}</DropdownMenuItem>}
              {!owner && wish.fundraisingUrl && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" render={<a href={wish.fundraisingUrl} target="_blank" rel="noopener noreferrer" />}><ExternalLink /> Перейти к сбору</DropdownMenuItem>}
              {wish.sharedBy && <DropdownMenuItem variant="destructive" className="app-destructive-menu-item min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={leave}><LogOut /> Убрать с доски</DropdownMenuItem>}
              {owner && <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" className="app-destructive-menu-item min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} aria-haspopup="dialog" onClick={() => setDeleteOpen(true)}><Trash2 /> Удалить</DropdownMenuItem>
              </>}
            </DropdownMenuContent>
          </DropdownMenu>
      )}
    />
    {deleteOpen && <WishDeleteAlert open wish={wish} busy={busy} onOpenChange={setDeleteOpen} onConfirm={async () => { if (await remove()) setDeleteOpen(false); }} />}
    </>
  );
}

function SharedWishes({ wishes, profile, onOpen, onChanged }) {
  const titleId = useId();
  if (!wishes.length) return null;
  return <section className="page-stack min-w-0" aria-labelledby={titleId}>
    <h2 id={titleId} className="font-semibold">Совместные со мной</h2>
    <div className="wish-grid">
      {wishes.map((wish) => <WishCard key={wish.id} wish={wish} profile={profile} onChanged={onChanged} onOpen={(opener) => onOpen(wish.id, opener)} />)}
    </div>
  </section>;
}

function WishGroupMoveSubmenu({ lists, busy, onMove }) {
  return <DropdownMenuSub>
    <DropdownMenuSubTrigger className="min-h-12 gap-3 rounded-xl px-3 text-base whitespace-nowrap" disabled={busy || lists.length === 0}><FolderInput />Переместить в список</DropdownMenuSubTrigger>
    <DropdownMenuSubContent className="w-(--layout-menu-width) max-w-(--available-width) rounded-2xl p-2">
      {lists.map((list) => <DropdownMenuItem key={list.id} className="min-h-12 rounded-xl px-3 text-base" disabled={busy} onClick={() => onMove(list)}>{listDisplayTitle(list)}</DropdownMenuItem>)}
    </DropdownMenuSubContent>
  </DropdownMenuSub>;
}

function WishGroupTile({
  group,
  wishes,
  moveTargets = [],
  draggable = false,
  nativeDraggable = false,
  onOpen,
  onRename,
  onMove,
  onDisband,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onPointerDown,
  isDragging = false,
  isDropTarget,
}) {
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
  <div data-group-id={group.id} draggable={nativeDraggable} className={`wish-group-tile ${draggable ? "is-draggable" : ""} ${isDragging ? "is-dragging" : ""} ${isDropTarget ? "is-drop-target" : ""}`} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onPointerDown={onPointerDown}>
    <ShadcnButton type="button" draggable={nativeDraggable} variant="ghost" className="wish-group-tile__open" onClick={onOpen} aria-label={`Открыть группу «${group.title}», ${wishes.length} ${wishCountNoun(wishes.length)}`} title={draggable ? "Нажмите, чтобы открыть. Перетащите, чтобы изменить порядок" : undefined} />
    <span className="wish-group-tile__preview">
      {wishes.slice(0, 4).map((wish) => {
        const previewImageUrl = wishPreviewImageUrl(wish);
        return <span key={wish.id}>{previewImageUrl ? <img src={previewImageUrl} alt="" referrerPolicy="strict-origin-when-cross-origin" onError={(event) => applyRetailerPreviewFallback(event, wish.url)} /> : <Gift />}</span>;
      })}
    </span>
    {draggable && <span className="wish-card__drag-handle wish-group-tile__drag-handle" data-wish-group-drag-handle draggable={nativeDraggable} aria-hidden="true"><GripVertical /></span>}
    <div className="wish-card__body wish-group-tile__meta">
      {editing ? <Input autoFocus value={title} disabled={busy} maxLength={60} aria-label="Название группы" onFocus={(event) => event.currentTarget.select()} onChange={(event) => setTitle(event.target.value)} onBlur={saveTitle} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.blur(); } if (event.key === "Escape") { event.preventDefault(); setTitle(group.title); finishEditing(); } }} /> : <h3 className="wish-card__title"><ShadcnButton type="button" variant="ghost" className="wish-group-tile__title justify-start" title={group.title} onClick={onOpen}><span className="min-w-0 flex-1 truncate">{group.title}</span></ShadcnButton></h3>}
      <div className="wish-card__top">
        <span>{wishes.length} {wishCountNoun(wishes.length)}</span>
        {!editing && onRename && <DropdownMenu><DropdownMenuTrigger render={<ShadcnButton type="button" variant="ghost" size="icon" className="wish-card__menu-trigger wish-group-tile__menu size-9 active:translate-y-0" />} aria-label={`Опции группы «${group.title}»`}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent finalFocus={resolveMenuFinalFocus} align="end" sideOffset={8} className="wish-group-actions-menu w-(--layout-menu-width) max-w-(--available-width) rounded-2xl p-2"><DropdownMenuItem className="min-h-12 gap-3 rounded-xl px-3 text-base whitespace-nowrap" disabled={busy} onClick={beginEditing}><Pencil />Переименовать</DropdownMenuItem><WishGroupMoveSubmenu lists={moveTargets} busy={busy} onMove={move} /><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" className="app-destructive-menu-item min-h-12 gap-3 rounded-xl px-3 text-base whitespace-nowrap" disabled={busy} aria-haspopup="dialog" onClick={() => setDisbandOpen(true)}><Ungroup />Расформировать</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
      </div>
    </div>
  </div>
  {disbandOpen && <AlertDialog open={disbandOpen} onOpenChange={(open) => { if (!busy) setDisbandOpen(open); }}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Расформировать группу «{group.title}»?</AlertDialogTitle><AlertDialogDescription>Желания останутся в списке и снова будут показаны отдельно.{group.space === "products" && " Сбор закроется, а внесённые роллы останутся в кошельке владельца."}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} aria-busy={busy || undefined} onClick={disband}>{busy ? <Spinner data-icon="inline-start" /> : <Ungroup data-icon="inline-start" aria-hidden="true" />}Расформировать</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>}
  </>;
}

function WishGroupDialog({ group, count, moveTargets, onRename, onMove, onDisband, viewerId, busy: itemBusy, children, ...props }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(group.title);
  const [saving, setSaving] = useState(false);
  const [disbandOpen, setDisbandOpen] = useState(false);
  const renamingFromMenuRef = useRef(false);
  const busy = itemBusy || saving;
  useEffect(() => { if (!editing) setTitle(group.title); }, [editing, group.title]);
  const saveTitle = async () => {
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === group.title) { setTitle(group.title); setEditing(false); return; }
    setSaving(true);
    const saved = await onRename(nextTitle);
    setSaving(false);
    if (saved) setEditing(false);
  };
  const move = async (list) => { setSaving(true); await onMove(list); setSaving(false); };
  const disband = async () => {
    setSaving(true);
    const removed = await onDisband();
    setSaving(false);
    if (removed) setDisbandOpen(false);
  };
  return <GroupDialog {...props} className="wish-group-open" busy={busy || editing} aria-label={`Группа «${group.title}»`}>
    <WishGroupHeader
      group={group}
      viewerId={viewerId}
      busy={busy || editing}
      title={editing ? <Input
        autoFocus value={title} disabled={busy} maxLength={60} aria-label="Название группы"
        className="min-h-12 w-full min-w-0 max-w-sm text-base font-semibold"
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={saveTitle}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.blur(); }
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setTitle(group.title); setEditing(false); }
        }}
      /> : group.title}
      description={`${count} ${wishCountNoun(count)}`}
      actions={!editing && <DropdownMenu>
        <DropdownMenuTrigger render={<ShadcnButton data-control-icon type="button" variant="outline" size="icon" className="rounded-full bg-card" disabled={busy} />} aria-label={`Опции группы «${group.title}»`}><MoreHorizontal /></DropdownMenuTrigger>
        <DropdownMenuContent
          align="end" sideOffset={8} className="wish-group-actions-menu w-(--layout-menu-width) max-w-(--available-width) rounded-2xl p-2"
          finalFocus={() => { const restore = !renamingFromMenuRef.current; renamingFromMenuRef.current = false; return restore; }}
        >
          <DropdownMenuItem className="min-h-12 gap-3 rounded-xl px-3 text-base" disabled={busy} onClick={() => { renamingFromMenuRef.current = true; setTitle(group.title); setEditing(true); }}><Pencil />Переименовать</DropdownMenuItem>
          <WishGroupMoveSubmenu lists={moveTargets} busy={busy} onMove={move} />
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" className="app-destructive-menu-item min-h-12 gap-3 rounded-xl px-3 text-base" disabled={busy} aria-haspopup="dialog" onClick={() => setDisbandOpen(true)}><Ungroup />Расформировать</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>}
    />
    {children}
    {disbandOpen && <AlertDialog open onOpenChange={(open) => { if (!busy) setDisbandOpen(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Расформировать группу «{group.title}»?</AlertDialogTitle><AlertDialogDescription>Желания останутся в списке и снова будут показаны отдельно.{group.space === "products" && " Сбор закроется, а внесённые роллы останутся в кошельке владельца."}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} aria-busy={busy || undefined} onClick={disband}>{busy ? <Spinner data-icon="inline-start" /> : <Ungroup data-icon="inline-start" aria-hidden="true" />}Расформировать</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
  </GroupDialog>;
}

const CATALOG_PAGE_SIZE = 48;

function CatalogOwnerStack({ owners = [], ownerCount = owners.length }) {
  if (!ownerCount) return <div className="catalog-owner-stack">Пока ни у кого в вишлисте</div>;
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

function CatalogBrandAttribution({ brand, compact = false }) {
  const label = String(brand?.label || "").trim();
  if (!label) return null;
  return (
    <div
      className={cn("catalog-brand-attribution", compact && "catalog-brand-attribution--compact")}
      aria-label={`Бренд товара: ${label}`}
    >
      <ShadcnAvatar size="sm" className={cn("catalog-brand-attribution__logo bg-white", compact ? "!size-7" : "!size-9")}>
        <AvatarImage src={brand.logoUrl || undefined} alt="" className="object-contain" loading="lazy" />
        <AvatarFallback className="bg-white font-semibold text-black">{label.slice(0, 1).toLocaleUpperCase("ru-RU")}</AvatarFallback>
      </ShadcnAvatar>
      <span>{label}</span>
    </div>
  );
}

function catalogMarketplaceItem(item) {
  return { ...item, url: merchantProductUrl(item?.url) };
}

function CatalogWishCard({ item, wishlistDisabled = false, wishlistPending = false, onToggleWishlist, onOpen }) {
  const space = SPACES.find((entry) => entry.id === item.space) || SPACES[0];
  const eventDate = item.eventDate ? formatEventDate(String(item.eventDate).slice(0, 10)) : "";
  const wishlistLabel = item.addedByMe
    ? `Удалить «${item.title}» из вишлиста, раздел «${space.label}»`
    : `Добавить «${item.title}» в вишлист, раздел «${space.label}»`;
  return (
    <WishlistSnippet
      className="catalog-wish-card"
      title={item.title}
      imageUrl={wishPreviewImageUrl(item)}
      fallbackImageUrl={retailerPreviewImageUrl(item.url)}
      imageLoading="lazy"
      icon={space.icon}
      video={isVideoUrl(item.url)}
      price={[item.price != null ? formatMoney(item.price, item.currency) : "", eventDate].filter(Boolean).join(" · ")}
      openButton={{
        "data-catalog-item-id": item.id,
        "aria-label": `Открыть информацию о «${item.title}»`,
        "aria-haspopup": "dialog",
        onClick: (event) => onOpen(item.id, event.currentTarget),
      }}
      mediaBadge={item.ownerCount > 1 && <Badge variant="secondary">{participantCountLabel(item.ownerCount)}</Badge>}
      mediaAction={(
        <ShadcnButton
          type="button"
          variant="outline"
          size="icon"
          className={`catalog-wish-card__action !size-12 !rounded-full !text-destructive hover:!text-destructive ${item.addedByMe ? "is-added" : ""}`}
          disabled={wishlistDisabled}
          aria-label={wishlistLabel}
          aria-pressed={Boolean(item.addedByMe)}
          aria-busy={wishlistPending || undefined}
          title={wishlistLabel}
          onClick={() => onToggleWishlist(item)}
        >
          {wishlistPending ? <Spinner className="!size-5" /> : <Heart className={`!size-5 ${item.addedByMe ? "fill-current text-destructive" : ""}`} aria-hidden="true" />}
        </ShadcnButton>
      )}
      details={item.brand
        ? <CatalogBrandAttribution brand={item.brand} />
        : !item.source && <CatalogOwnerStack owners={item.owners} ownerCount={item.ownerCount} />}
    />
  );
}

function CatalogWishDetailsContent({ item, wishlistDisabled = false, wishlistPending = false, onToggleWishlist, screen = false }) {
  const isMobile = useIsMobile();
  const Title = screen ? "h1" : DrawerTitle;
  const Description = screen ? "p" : DrawerDescription;
  const space = SPACES.find((entry) => entry.id === item.space) || SPACES[0];
  const previewImageUrl = wishPreviewImageUrl(item);
  const eventDate = item.eventDate ? formatEventDate(String(item.eventDate).slice(0, 10)) : "";
  const description = String(item.description || "").trim();
  const marketplaceItem = catalogMarketplaceItem(item);
  const wishlistLabel = item.addedByMe
    ? `Убрать «${item.title}» из вишлиста`
    : `Добавить «${item.title}» в вишлист`;

  const ActionBar = screen ? ContentPageActions : DrawerFooter;
  const actions = (
          <ActionBar
            data-slot="wish-actions"
            className={screen ? "mx-auto flex w-full max-w-(--layout-compact-width) min-w-0 flex-nowrap items-center gap-2" : undefined}
            role="group"
            aria-label="Действия с позицией каталога"
          >
            <ShadcnButton
              type="button"
              className="h-12 min-w-0 flex-1"
              disabled={wishlistDisabled}
              aria-label={wishlistLabel}
              aria-pressed={Boolean(item.addedByMe)}
              aria-busy={wishlistPending || undefined}
              onClick={() => onToggleWishlist(item)}
            >
              {wishlistPending ? <Spinner /> : <Heart className={item.addedByMe ? "fill-current text-destructive" : ""} aria-hidden="true" />}
              {screen && isMobile ? (wishlistPending ? item.addedByMe ? "Удаляем…" : "Добавляем…" : item.addedByMe ? "Убрать" : "Добавить") : wishlistPending
                ? item.addedByMe ? "Удаляем…" : "Добавляем…"
                : item.addedByMe ? "Убрать из вишлиста" : "Добавить в вишлист"}
            </ShadcnButton>
          </ActionBar>
  );

  return <>
        <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 [&>*]:shrink-0">
          <Card data-slot="wish-media" className="mx-auto w-full max-w-(--layout-compact-width) relative overflow-hidden p-0">
            {previewImageUrl
              ? <img className="block h-auto w-full" src={previewImageUrl} alt={`Фото позиции каталога «${item.title}»`} referrerPolicy="strict-origin-when-cross-origin" onError={(event) => applyRetailerPreviewFallback(event, item.url)} />
              : <span className="grid aspect-[4/3] w-full place-items-center text-muted-foreground"><Gift aria-hidden="true" /></span>}
          </Card>

          <DrawerHeader className="mx-auto w-full max-w-(--layout-compact-width) p-0 text-left!">
            <Title className={screen ? "text-2xl font-semibold" : undefined}><span className="sr-only">Позиция каталога: </span>{item.title}</Title>
            {(item.vehicleMake || item.vehicleModel) && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Car className="size-4" aria-hidden="true" />{[item.vehicleMake, item.vehicleModel].filter(Boolean).join(" ")}</span>
            )}
            {(item.price != null || eventDate) && (
              <div data-slot="wish-price-row" className="w-full">
                {item.price != null && <strong data-slot="wish-price" className="whitespace-nowrap tabular-nums text-3xl leading-none font-semibold sm:text-4xl">{formatMoney(item.price, item.currency)}</strong>}
                {eventDate && <span data-slot="wish-event-date" className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarDays className="size-4" aria-hidden="true" />{eventDate}</span>}
              </div>
            )}
            <Description className={screen ? "text-muted-foreground" : undefined}>
              {description || "Автор пока не добавил описание — иногда желание говорит само за себя."}
            </Description>
          </DrawerHeader>

          <div data-slot="wish-toolbar" className="mx-auto flex w-full max-w-(--layout-compact-width) min-w-0 items-center gap-2">
            <Badge variant="secondary" className="max-w-full truncate">{space.label}</Badge>
            {item.brand && <CatalogBrandAttribution brand={item.brand} compact />}
          </div>

          {["products", "food", "transport"].includes(item.space) && (
            <MarketplaceOffers wish={marketplaceItem} owner={false} formatPrice={formatMoney} />
          )}
          {item.url && !["products", "food", "transport"].includes(item.space) && (
            <a href={item.url} target="_blank" rel="noreferrer" className={buttonVariants({ className: "wish-buy-action mx-auto h-12 w-full max-w-(--layout-compact-width)" })}>
              {isYandexMapsUrl(item.url) ? "Открыть в Яндекс Картах" : "Где купить"} <ExternalLink data-icon="inline-end" aria-hidden="true" />
            </a>
          )}
          {item.fundraisingUrl && (
            <a href={item.fundraisingUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ className: "wish-buy-action mx-auto h-12 w-full max-w-(--layout-compact-width)" })}>
              Перейти к сбору <ExternalLink data-icon="inline-end" aria-hidden="true" />
            </a>
          )}

          {screen && actions}

        </div>
    {!screen && actions}
  </>;
}

function CatalogWishDetailsDrawer({ item, wishlistDisabled = false, wishlistPending = false, onToggleWishlist, onClose, returnFocusRef }) {
  const isMobile = useIsMobile();
  const location = useLocation();
  if (isMobile) return <Navigate replace to={`${APP_WISH_CATALOG_PATH}/item/${encodeURIComponent(item.id)}`} state={{ returnTo: `${location.pathname}${location.search}` }} />;
  return <Drawer open showSwipeHandle swipeDirection="right" onOpenChange={(open) => { if (!open) onClose(); }}>
    <DrawerContent className="catalog-wish-details app-drawer--compact" finalFocus={returnFocusRef}>
      <DrawerClose render={<ShadcnButton type="button" variant="ghost" size="icon-sm" className="absolute top-2 right-2 z-10" />}><X aria-hidden="true" /><span className="sr-only">Закрыть</span></DrawerClose>
      <CatalogWishDetailsContent item={item} wishlistDisabled={wishlistDisabled} wishlistPending={wishlistPending} onToggleWishlist={onToggleWishlist} />
    </DrawerContent>
  </Drawer>;
}

function CatalogItemPage() {
  const { itemId } = useParams();
  const { user, loading: sessionLoading } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => api.get(`/catalog/items/${encodeURIComponent(itemId)}`), [itemId]);
  const [busy, setBusy] = useState(false);
  const returnTo = location.state?.returnTo?.startsWith(`${APP_WISH_CATALOG_PATH}?`) || location.state?.returnTo === APP_WISH_CATALOG_PATH ? location.state.returnTo : APP_WISH_CATALOG_PATH;
  const back = () => location.state?.fromCatalog ? navigate(-1) : navigate(returnTo, { replace: true });
  if (sessionLoading) return <LoadingScreen />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  const toggle = async (item) => {
    if (busy) return;
    setBusy(true);
    try {
      if (item.addedByMe) await api.post("/catalog/items/remove", { itemId: item.id, wishId: item.addedWishId });
      else await api.post("/catalog/items/add", { itemId: item.id });
      await reload();
    } catch (cause) { toast(cause.message, "error"); }
    finally { setBusy(false); }
  };
  return <ContentPage key={itemId} title="Каталог" onBack={back} className="catalog-item-page">
    {loading && !data ? <LoadingScreen /> : error && !data ? <Alert variant="destructive"><AlertDescription>{error.message}</AlertDescription><ShadcnButton onClick={() => reload().catch(() => {})}>Повторить</ShadcnButton></Alert> : data && <CatalogWishDetailsContent screen item={data.item} wishlistDisabled={busy} wishlistPending={busy} onToggleWishlist={toggle} />}
  </ContentPage>;
}

function WishCatalogPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const search = new URLSearchParams(location.search);
  const source = isBrandCatalogSearch(location.search) ? "brands" : "community";
  const selectedBrand = source === "brands" ? search.get("brand") || "" : "";
  const selectedSpace = wishlistSpace(location.search);
  useEffect(() => {
    const search = new URLSearchParams(location.search);
    if (!isBrandCatalogSearch(location.search) || search.get("source") === "brands") return;
    search.set("source", "brands");
    navigate({ pathname: location.pathname, search: `?${search}` }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  if (source === "brands" && !selectedBrand) return (
    <div className="app-page wish-catalog-page page-stack">
      <CatalogPageHeader selectedSpace={selectedSpace} source={source} />
      <BusinessCatalogList />
    </div>
  );
  return <CatalogItemFeed source={source} selectedSpace={selectedSpace} selectedBrand={selectedBrand} />;
}

function CatalogItemFeed({ source, selectedSpace, selectedBrand }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useSession();
  const toast = useToast();
  const catalogFilter = source === "brands"
    ? `source=brands&space=${encodeURIComponent(selectedSpace)}&brand=${encodeURIComponent(selectedBrand)}&sections=certificates`
    : `source=community&space=${encodeURIComponent(selectedSpace)}`;
  const space = SPACES.find((entry) => entry.id === selectedSpace) || SPACES[0];
  const requestIdRef = useRef(0);
  const pendingWishlistIdsRef = useRef(new Map());
  const catalogLoadMoreOperationRef = useRef(null);
  const loadMoreRef = useRef(null);
  const lastCatalogOpenerRef = useRef(null);
  const [catalog, setCatalog] = useState({ filter: null, items: [], certificates: [], total: 0, nextOffset: 0, loading: true, loadingMore: false, error: null });
  const [pendingWishlistIds, setPendingWishlistIds] = useState(new Set());
  const [selectedCatalogItemId, setSelectedCatalogItemId] = useState(null);
  const { nextOffset, loadingMore } = catalog;
  const hasMore = catalog.filter === catalogFilter && !catalog.loading && nextOffset < catalog.total;
  const canAutoLoad = typeof IntersectionObserver !== "undefined";
  const selectedCatalogItem = selectedCatalogItemId
    ? catalog.items.find((item) => item.id === selectedCatalogItemId)
      || catalog.certificates.find((item) => item.id === selectedCatalogItemId) || null
    : null;

  const updateCatalogItem = useCallback((itemId, patch) => {
    const update = (item) => item.id === itemId
      ? { ...item, ...(typeof patch === "function" ? patch(item) : patch) }
      : item;
    setCatalog((current) => ({
      ...current,
      items: current.items.map(update),
      certificates: current.certificates.map(update),
    }));
  }, []);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    pendingWishlistIdsRef.current.clear();
    catalogLoadMoreOperationRef.current = null;
    lastCatalogOpenerRef.current = null;
    setPendingWishlistIds(new Set());
    setSelectedCatalogItemId(null);
    setCatalog({ filter: catalogFilter, items: [], certificates: [], total: 0, nextOffset: 0, loading: true, loadingMore: false, error: null });
    api.get(`/catalog?${catalogFilter}&limit=${CATALOG_PAGE_SIZE}&offset=0`)
      .then((result) => {
        if (requestId !== requestIdRef.current) return;
        const items = result.items || [];
        setCatalog({ filter: catalogFilter, items, brand: result.brand, certificates: result.certificates || [], total: Number(result.total) || 0, nextOffset: items.length, loading: false, loadingMore: false, error: null });
      })
      .catch((error) => {
        if (requestId !== requestIdRef.current) return;
        setCatalog({ filter: catalogFilter, items: [], certificates: [], total: 0, nextOffset: 0, loading: false, loadingMore: false, error });
      });
    return () => { requestIdRef.current += 1; };
  }, [catalogFilter]);

  useEffect(() => {
    if (selectedCatalogItemId) return undefined;
    return scheduleDocumentScrollUnlock();
  }, [selectedCatalogItemId]);

  const openCatalogItem = (itemId, opener) => {
    if (isMobile) {
      navigate(`${APP_WISH_CATALOG_PATH}/item/${encodeURIComponent(itemId)}`, { state: { returnTo: `${location.pathname}${location.search}`, fromCatalog: true } });
      return;
    }
    lastCatalogOpenerRef.current = opener;
    setSelectedCatalogItemId(itemId);
  };

  const closeCatalogItem = () => {
    setSelectedCatalogItemId(null);
  };

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore
      || catalogLoadMoreOperationRef.current
      || pendingWishlistIdsRef.current.size > 0) return;
    const requestId = requestIdRef.current;
    const operation = Symbol("catalog-load-more");
    catalogLoadMoreOperationRef.current = operation;
    setCatalog((current) => ({ ...current, loadingMore: true, error: null }));
    try {
      const result = await api.get(`/catalog?${catalogFilter}&limit=${CATALOG_PAGE_SIZE}&offset=${nextOffset}`);
      if (requestId !== requestIdRef.current) return;
      const incoming = result.items || [];
      const total = Number(result.total) || 0;
      setCatalog((current) => {
        const existingIds = new Set(current.items.map((item) => item.id));
        return {
          ...current,
          items: [...current.items, ...incoming.filter((item) => !existingIds.has(item.id))],
          total: incoming.length ? total : Math.min(total, nextOffset),
          nextOffset: nextOffset + incoming.length,
          loadingMore: false,
        };
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setCatalog((current) => ({ ...current, loadingMore: false, error }));
    } finally {
      if (catalogLoadMoreOperationRef.current === operation) catalogLoadMoreOperationRef.current = null;
    }
  }, [catalogFilter, hasMore, loadingMore, nextOffset]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore || !canAutoLoad || loadingMore || catalog.error || pendingWishlistIds.size || selectedCatalogItemId) return;
    let active = true;
    const observer = new IntersectionObserver((entries) => {
      if (active && entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { rootMargin: "0px 0px 500px" });
    observer.observe(node);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [canAutoLoad, hasMore, loadingMore, catalog.error, pendingWishlistIds.size, selectedCatalogItemId, loadMore]);

  const refreshLoadedCatalog = async (requestId) => {
    const targetCount = Math.max(CATALOG_PAGE_SIZE, catalog.nextOffset || catalog.items.length);
    const items = [];
    let certificates = [];
    let total = 0;
    for (let offset = 0; offset < targetCount; offset += CATALOG_PAGE_SIZE) {
      const result = await api.get(`/catalog?${catalogFilter}&limit=${CATALOG_PAGE_SIZE}&offset=${offset}`);
      if (requestId !== requestIdRef.current) return null;
      const incoming = result.items || [];
      total = Number(result.total) || 0;
      if (offset === 0) certificates = result.certificates || [];
      items.push(...incoming.filter((candidate) => !items.some((existing) => existing.id === candidate.id)));
      if (incoming.length < CATALOG_PAGE_SIZE || offset + incoming.length >= total) break;
    }
    return { items, certificates, total };
  };

  const toggleCatalogWishlist = async (item) => {
    if (catalogLoadMoreOperationRef.current || pendingWishlistIdsRef.current.size > 0) return;
    const requestId = requestIdRef.current;
    const operation = Symbol(item.id);
    const removing = Boolean(item.addedByMe);
    pendingWishlistIdsRef.current.set(item.id, operation);
    setPendingWishlistIds((current) => new Set(current).add(item.id));
    try {
      if (removing) {
        const wishId = String(item.addedWishId || "").trim();
        if (!wishId) throw new Error("Не удалось определить желание в вашем вишлисте");
        await api.post("/catalog/items/remove", { itemId: item.id, wishId });
        if (requestId !== requestIdRef.current) return;

        updateCatalogItem(item.id, { addedByMe: false, addedWishId: null });
        let refreshFailed = false;
        try {
          const refreshed = await refreshLoadedCatalog(requestId);
          if (!refreshed || requestId !== requestIdRef.current) return;
          setCatalog((current) => ({
            ...current,
            items: refreshed.items,
            certificates: refreshed.certificates,
            total: refreshed.total,
            nextOffset: refreshed.items.length,
            error: null,
          }));
          setSelectedCatalogItemId((current) => (
            current && ![...refreshed.items, ...refreshed.certificates].some((candidate) => candidate.id === current) ? null : current
          ));
        } catch {
          refreshFailed = true;
        }
        if (requestId !== requestIdRef.current) return;
        const itemSpace = SPACES.find((entry) => entry.id === item.space) || SPACES[0];
        toast(
          refreshFailed
            ? `«${item.title}» удалено из раздела «${itemSpace.label}». Обновите каталог, чтобы синхронизировать карточки`
            : `«${item.title}» удалено из раздела «${itemSpace.label}»`,
          "success",
        );
        return;
      }

      const result = await api.post("/catalog/items/add", { itemId: item.id });
      if (requestId === requestIdRef.current) {
        const currentUserAlreadyListed = item.owners?.some((owner) => owner.id === user?.id);
        const owner = user ? {
          id: user.id,
          username: user.username,
          name: user.name,
          avatarUrl: user.avatarUrl || "",
        } : null;
        updateCatalogItem(item.id, {
          addedByMe: true,
          addedWishId: result.wish?.id || null,
          ...(!item.source && result.created && owner && !currentUserAlreadyListed ? {
            owners: [...(item.owners || []), owner],
            ownerCount: (Number(item.ownerCount) || 0) + 1,
            wishCount: (Number(item.wishCount) || 0) + 1,
          } : {}),
        });
        const itemSpace = SPACES.find((entry) => entry.id === item.space) || SPACES[0];
        toast(withWishReward(
          result.created
            ? `«${item.title}» добавлено в раздел «${itemSpace.label}»`
            : result.restored
              ? `«${item.title}» возвращено в раздел «${itemSpace.label}»`
              : `«${item.title}» уже находится в разделе «${itemSpace.label}»`,
          result.reward,
        ), "success");
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        toast(error.message || (removing ? "Не удалось удалить позицию из вишлиста" : "Не удалось добавить позицию"), "error");
      }
    } finally {
      if (pendingWishlistIdsRef.current.get(item.id) !== operation) return;
      pendingWishlistIdsRef.current.delete(item.id);
      setPendingWishlistIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  };

  const showManualLoad = !canAutoLoad || Boolean(catalog.error);
  const brand = catalog.filter === catalogFilter ? catalog.brand : null;
  const certificates = brand ? catalog.certificates : [];
  const renderCards = (items) => (
    <div className="wish-grid catalog-wish-grid">
      {items.map((item) => (
        <CatalogWishCard
          key={item.id}
          item={item}
          wishlistDisabled={pendingWishlistIds.size > 0 || loadingMore}
          wishlistPending={pendingWishlistIds.has(item.id)}
          onToggleWishlist={toggleCatalogWishlist}
          onOpen={openCatalogItem}
        />
      ))}
    </div>
  );
  return (
    <div className="app-page wish-catalog-page page-stack">
      <CatalogPageHeader selectedSpace={selectedSpace} source={source} title={brand?.label} />
      {certificates.length > 0 && <section className="flex min-w-0 flex-col gap-4" aria-labelledby="catalog-brand-certificates">
        <h2 id="catalog-brand-certificates" className="text-2xl font-semibold">Сертификаты</h2>
        {renderCards(certificates)}
      </section>}
      {catalog.loading ? <LoadingScreen compact /> : catalog.error && !catalog.items.length ? null : catalog.items.length ? (
        <>
          {certificates.length ? <section className="flex min-w-0 flex-col gap-4" aria-labelledby="catalog-brand-products">
            <h2 id="catalog-brand-products" className="text-2xl font-semibold">Товары</h2>
            {renderCards(catalog.items)}
          </section> : renderCards(catalog.items)}
          {hasMore && (
            <div ref={loadMoreRef} className={showManualLoad || loadingMore ? "wish-catalog-page__more" : "h-px"}>
              {showManualLoad ? (
                <ShadcnButton type="button" variant="outline" disabled={loadingMore || pendingWishlistIds.size > 0} onClick={loadMore}>
                  {loadingMore && <Spinner data-icon="inline-start" />}
                  {catalog.error ? "Повторить" : "Показать ещё"}
                </ShadcnButton>
              ) : loadingMore && (
                <div role="status">
                  <Spinner aria-hidden="true" />
                  <span className="sr-only">Загружаем карточки каталога</span>
                </div>
              )}
            </div>
          )}
        </>
      ) : certificates.length ? null : (
        <EmptyState icon={source === "brands" ? Gift : LayoutGrid} title={source === "brands" ? "У этого бренда пока нет товаров" : `В разделе «${space.label}» пока пусто`} text={source === "brands" ? "Выберите бизнес-аккаунт в меню." : "Здесь появятся публичные желания участников."} />
      )}
      {catalog.error && !catalog.loading && <Alert variant="destructive" className="wish-catalog-page__error"><AlertTitle>Не удалось загрузить каталог</AlertTitle><AlertDescription>{catalog.error.message}</AlertDescription></Alert>}
      {selectedCatalogItem && (
        <CatalogWishDetailsDrawer
          item={selectedCatalogItem}
          wishlistDisabled={pendingWishlistIds.size > 0 || catalog.loadingMore}
          wishlistPending={pendingWishlistIds.has(selectedCatalogItem.id)}
          onToggleWishlist={toggleCatalogWishlist}
          onClose={closeCatalogItem}
          returnFocusRef={lastCatalogOpenerRef}
        />
      )}
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
  return <section className="mx-auto flex w-full max-w-(--layout-collection-width) flex-col gap-4 rounded-3xl border border-border bg-card p-4 sm:p-5" aria-labelledby="gift-suggestions-title">
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
  const { isOwner } = useSphereSharing();
  const { wishlistVersion } = useProfileEditor();
  const location = useLocation();
  const navigate = useNavigate();
  const publication = isOwner && user?.username ? profilePublicationSection(new URLSearchParams(location.search).get("publication")) : null;
  const toast = useToast();
  const globalShareRef = useGlobalShareHandler();
  const isMobile = useIsMobile();
  const viewerId = user?.id;
  const { data, loading, error, reload, updateData } = useAsync(async () => ({
    ...await api.get("/dashboard"), viewerId,
  }), [version, wishlistVersion, viewerId]);
  const { data: giftSuggestionData, reload: reloadGiftSuggestions } = useAsync(() => api.get("/gift-suggestions"), [version]);
  const [selected, setSelected] = useState("all");
  const [selectedSpace, setSelectedSpace] = useState(() => {
    const tab = new URLSearchParams(location.search).get("tab");
    return SPACE_IDS.includes(tab) ? tab : "products";
  });
  const [selectedWishId, setSelectedWishId] = useState(null);
  const [editingWishId, setEditingWishId] = useState(null);
  const [listModal, setListModal] = useState(null);
  const listSettingsTriggerRef = useRef(null);
  const [draggedWishId, setDraggedWishId] = useState(null);
  const [draggedGroupId, setDraggedGroupId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [orderedWishIds, setOrderedWishIds] = useState([]);
  const [openedGroupId, setOpenedGroupId] = useState(null);
  const groupOpenerRef = useRef(null);
  const [removingGroupId, setRemovingGroupId] = useState(null);
  const pointerDragRef = useRef(null);
  const pointerTimerRef = useRef(null);
  const reorderTimerRef = useRef(null);
  const reorderTargetRef = useRef(null);
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
  const clickGuardCleanupRef = useRef(null);
  const dragSessionRef = useRef(false);
  const dragSourceWishIdRef = useRef(null);
  const dragSourceGroupRef = useRef(null);
  const dragScopeRef = useRef(null);
  const orderDirtyRef = useRef(false);
  const pendingOrderRef = useRef(null);
  const orderPersistingRef = useRef(false);
  const deferredAuthoritativeOrderRef = useRef(null);
  const removingGroupIdRef = useRef(null);
  const cancelDragRef = useRef(null);
  useLayoutEffect(() => { cancelDragRef.current?.(); }, [selectedSpace, selected, openedGroupId, user?.id, publication]);
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
    clearTimeout(reorderTimerRef.current);
    clearTimeout(groupTimerRef.current);
    cancelAnimationFrame(pointerAutoScrollFrameRef.current);
    pointerListenerCleanupRef.current?.();
    clickGuardCleanupRef.current?.();
    const drag = pointerDragRef.current; pointerDragRef.current = null;
    if (drag?.captureTarget.hasPointerCapture?.(drag.pointerId)) drag.captureTarget.releasePointerCapture(drag.pointerId);
    pointerGhostRef.current?.remove();
  }, []);
  useLayoutEffect(() => {
    if (!flipPositionsRef.current.size) return;
    const cards = document.querySelectorAll(".wishes-page > .wish-grid [data-group-wish-id], .wishes-page > .wish-grid [data-group-id], .wish-group-open > .wish-grid [data-group-wish-id]");
    cards.forEach((card) => {
      const key = card.dataset.groupWishId ? `wish:${card.dataset.groupWishId}` : `group:${card.dataset.groupId}`;
      const previous = flipPositionsRef.current.get(key);
      if (!previous || card.dataset.groupWishId === draggedWishId || card.dataset.groupId === draggedGroupId) return;
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
  }, [orderedWishIds, draggedWishId, draggedGroupId]);
  const orderIndex = new Map(orderedWishIds.map((id, index) => [id, index]));
  const dashboardWishes = data?.wishes || [];
  const dashboardLists = data?.lists || [];
  const visibleWishes = [...dashboardWishes]
    .sort((a, b) => (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  const listsById = new Map(dashboardLists.map((list) => [list.id, list]));
  const allCategoryLists = dashboardLists.filter((list) => !isGeneralList(list));
  const categoryLists = orderWishListsForNavigation(allCategoryLists.filter((list) => listSpace(list) === selectedSpace));
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
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const gridItems = buildWishGroupGridItems({ wishes, groups });
  const selectedList = categoryLists.find((list) => list.id === selectedValue) || null;
  const groupMoveTargets = [
    ...(generalList && groupingListId !== generalList.id ? [{ ...generalList, title: UNSORTED_LIST_TITLE }] : []),
    ...categoryLists.filter((list) => list.id !== groupingListId),
  ];
  const sharedWishes = data?.sharedWishes || [];
  const spaceSharedWishes = sharedWishes.filter((wish) => wish.space === selectedSpace);
  const selectedWish = selectedWishId ? [...dashboardWishes, ...sharedWishes].find((wish) => wish.id === selectedWishId) : null;
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
    }
  }, [openedGroupId, openedGroup?.id]);
  const profileControls = <WishesProfileControls selectedSpace={selectedSpace} />;
  const wishlistPath = wishlistPublicationPath(selectedSpace);
  const publicationContent = publication && <ProfilePublicationsPage key={`${user.id}:${user.username}:${publication}`} section={publication}
    username={user.username} user={user} returnTo={wishlistPath} showIntro={publication !== "calendar"} />;
  const loadError = error && <Alert variant="destructive" className="not-typeset rollapp-body">
    <AlertTitle>Не удалось загрузить Вишлист</AlertTitle>
    <AlertDescription className="grid gap-3">{error.message}<ShadcnButton type="button" variant="outline" onClick={() => reload({ background: Boolean(data) }).catch(() => {})}>Повторить</ShadcnButton></AlertDescription>
  </Alert>;
  if (data && data.viewerId !== viewerId) return <LoadingScreen compact />;
  const share = async () => {
    if (publication) {
      await navigator.clipboard.writeText(`${window.location.origin}${publication === "calendar" ? publicBookingPath(user.username) : publicPublicationPath(user.username, publication)}`);
      toast("Ссылка скопирована");
      return;
    }
    if (selectedValue === "secret" || selectedList?.privacy === "private") {
      toast("Приватный список виден только вам", "error");
      return;
    }
    const url = selectedValue === "all"
      ? `${window.location.origin}${publicSpacePath(user.username, selectedSpace)}`
      : selectedList?.privacy === "link"
        ? `${window.location.origin}/s/${selectedList.shareToken}`
        : `${window.location.origin}${publicListPath(user.username, selectedList?.id)}`;
    await navigator.clipboard.writeText(url);
    toast("Ссылка на список скопирована");
  };
  globalShareRef.current = share;
  if (loading || (error && !data)) {
    return <div className="app-page wishes-page">{profileControls}{publicationContent || (loading ? <LoadingScreen compact /> : loadError)}</div>;
  }
  const editWish = (id) => { setSelectedWishId(null); setEditingWishId(id); };
  const refreshWishes = () => Promise.all([
    reload({ background: true }),
    reloadGiftSuggestions({ background: true }),
  ]);
  const saveList = async (saved) => {
    const editingList = Boolean(listModal?.id);
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
    await reload({ background: editingList });
    if (!editingList && saved?.id && attached) setSelected(saved.id);
  };
  const openListSettings = (id, trigger) => {
    const list = categoryLists.find((entry) => entry.id === id);
    if (!list) return;
    listSettingsTriggerRef.current = trigger;
    setListModal(list);
  };
  const deleteList = async () => {
    setListModal(null);
    if (selectedValue === listModal.id) setSelected("all");
    await reload({ background: true });
  };
  const clearGroupIntent = () => {
    clearTimeout(groupTimerRef.current);
    groupTimerRef.current = null;
    hoverTargetRef.current = null;
    armedDropTargetRef.current = null;
    setDropTarget(null);
  };
  const clearReorderIntent = () => {
    clearTimeout(reorderTimerRef.current);
    reorderTimerRef.current = null;
    reorderTargetRef.current = null;
  };
  const captureGridPositions = () => {
    const positions = new Map();
    document.querySelectorAll(".wishes-page > .wish-grid [data-group-wish-id], .wishes-page > .wish-grid [data-group-id], .wish-group-open > .wish-grid [data-group-wish-id]").forEach((card) => {
      const key = card.dataset.groupWishId ? `wish:${card.dataset.groupWishId}` : `group:${card.dataset.groupId}`;
      positions.set(key, card.getBoundingClientRect());
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
    const ghost = createCardDragPreview(source, "wish-card--drag-preview");
    ghost.style.setProperty("--drag-width", `${rect.width}px`);
    ghost.style.setProperty("--drag-x", `${rect.left}px`);
    ghost.style.setProperty("--drag-y", `${rect.top}px`);
    document.body.appendChild(ghost);
    pointerGhostRef.current = ghost;
    pointerGhostSizeRef.current = { width: rect.width, height: rect.height, offsetX: clientX - rect.left, offsetY: clientY - rect.top };
  };
  const movePointerGhost = (clientX, clientY) => {
    const ghost = pointerGhostRef.current;
    if (!ghost) return;
    const { offsetX, offsetY } = pointerGhostSizeRef.current;
    ghost.style.setProperty("--drag-x", `${clientX - offsetX}px`);
    ghost.style.setProperty("--drag-y", `${clientY - offsetY}px`);
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
  const reorderWish = (sourceId, targetId, targetKind = "wish") => {
    const targetKey = `${targetKind}:${targetId}`;
    if (!sourceId || !targetId || sourceId === targetId || lastReorderTargetRef.current === targetKey) return;
    const dragScope = dragScopeRef.current;
    const targetGroup = targetKind === "group" ? groupsById.get(targetId) : null;
    if (targetKind === "group" && (dragScope?.kind !== "list" || !dragScope.wishIds.has(sourceId) || !targetGroup)) return;
    const next = targetGroup
      ? moveWishGroupToTarget(orderedWishIdsRef.current, [sourceId], targetGroup.wishIds)
      : dragScope?.wishIds
        ? moveWishWithinSubset(orderedWishIdsRef.current, dragScope.wishIds, sourceId, targetId)
        : moveWishToTargetPosition(orderedWishIdsRef.current, sourceId, targetId);
    if (next === orderedWishIdsRef.current) return;
    lastReorderTargetRef.current = targetKey;
    orderDirtyRef.current = true;
    orderedWishIdsRef.current = next;
    captureGridPositions();
    setOrderedWishIds(next);
  };
  const queueWishReorder = (sourceId, targetId, targetKind = "wish", pointerDrag = null) => {
    const target = `${targetKind}:${targetId}`;
    if (reorderTargetRef.current === target) return;
    clearReorderIntent();
    reorderTargetRef.current = target;
    reorderTimerRef.current = setTimeout(() => {
      if (!dragSessionRef.current || dragSourceWishIdRef.current !== sourceId
        || pointerDragRef.current !== pointerDrag || reorderTargetRef.current !== target
        || (pointerDrag && pointerDrag.hoverTarget !== `reorder:${target}`)) return;
      reorderWish(sourceId, targetId, targetKind);
    }, 120);
  };
  const reorderGroup = (sourceGroupId, target) => {
    if (!sourceGroupId || !target?.id) return;
    const targetKey = `${target.kind}:${target.id}`;
    if (sourceGroupId === target.id || lastReorderTargetRef.current === targetKey) return;
    const sourceGroup = groupsById.get(sourceGroupId);
    const targetWishIds = target.kind === "group"
      ? groupsById.get(target.id)?.wishIds
      : [target.id];
    const next = moveWishGroupToTarget(orderedWishIdsRef.current, sourceGroup?.wishIds, targetWishIds);
    if (next === orderedWishIdsRef.current) return;
    lastReorderTargetRef.current = targetKey;
    orderDirtyRef.current = true;
    orderedWishIdsRef.current = next;
    captureGridPositions();
    setOrderedWishIds(next);
  };
  const reorderWishToGroup = (sourceId, groupId) => {
    const scope = dragScopeRef.current;
    const target = groupsById.get(groupId);
    const targetKey = `group:${groupId}`;
    if (scope?.kind !== "list" || !scope.wishIds.has(sourceId) || !target || lastReorderTargetRef.current === targetKey) return;
    const next = moveWishGroupToTarget(orderedWishIdsRef.current, [sourceId], target.wishIds);
    if (next === orderedWishIdsRef.current) return;
    lastReorderTargetRef.current = targetKey;
    orderDirtyRef.current = true;
    orderedWishIdsRef.current = next;
    captureGridPositions();
    setOrderedWishIds(next);
  };
  const groupHoverMode = (element, clientX, clientY) => resolveWishHoverMode({
    groupingEnabled: Boolean(groupingListId),
    rect: element?.querySelector('.wish-group-tile__preview')?.getBoundingClientRect() || element?.getBoundingClientRect(),
    clientX, clientY,
  });
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
    dragSourceGroupRef.current = null;
    dragScopeRef.current = group
      ? { kind: "group", groupId: group.id, wishIds: scopeWishIds }
      : { kind: "list", groupId: null, wishIds: scopeWishIds };
    dragInitialOrderRef.current = [...orderedWishIdsRef.current];
    setDraggedWishId(wishId); lastReorderTargetRef.current = null;
  };
  const beginGroupDragSession = (group) => {
    if (!group) return;
    dragSessionRef.current = true; orderDirtyRef.current = false;
    dragSourceWishIdRef.current = null;
    dragSourceGroupRef.current = group;
    dragScopeRef.current = { kind: "grid-group", groupId: group.id, wishIds: new Set(group.wishIds || []) };
    dragInitialOrderRef.current = [...orderedWishIdsRef.current];
    setDraggedGroupId(group.id); lastReorderTargetRef.current = null;
  };
  const startNativeDrag = (event, wishId, group = null) => {
    if (pointerDragRef.current) {
      event.preventDefault();
      return;
    }
    if (!event.target.closest?.(".wish-card__open, [data-wish-drag-handle]")) {
      event.preventDefault();
      return;
    }
    if (!event.dataTransfer) return;
    beginDragSession(wishId, group);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", wishId);
    const rect = event.currentTarget.getBoundingClientRect();
    const preview = createCardDragPreview(event.currentTarget, "wish-card--native-preview");
    preview.setAttribute("aria-hidden", "true");
    preview.style.width = `${rect.width}px`;
    document.body.appendChild(preview);
    event.dataTransfer.setDragImage(preview, event.clientX - rect.left, event.clientY - rect.top);
    requestAnimationFrame(() => preview.remove());
  };
  const startNativeGroupDrag = (event, group) => {
    if (pointerDragRef.current) {
      event.preventDefault();
      return;
    }
    if (!event.target.closest?.(".wish-group-tile__open, [data-wish-group-drag-handle]")) {
      event.preventDefault();
      return;
    }
    if (!event.dataTransfer) return;
    beginGroupDragSession(group);
    suppressOpenRef.current = true;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", group.id);
    const rect = event.currentTarget.getBoundingClientRect();
    const preview = createCardDragPreview(event.currentTarget, "wish-card--native-preview wish-group-tile--native-preview");
    preview.setAttribute("aria-hidden", "true");
    preview.style.width = `${rect.width}px`;
    document.body.appendChild(preview);
    event.dataTransfer.setDragImage(preview, event.clientX - rect.left, event.clientY - rect.top);
    requestAnimationFrame(() => preview.remove());
  };
  const finishDrag = ({ persist = true, restore = false } = {}) => {
    clearReorderIntent();
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
    dragSourceGroupRef.current = null;
    dragScopeRef.current = null;
    dragInitialOrderRef.current = [];
    stopPointerAutoScroll(); clearGroupIntent(); removePointerGhost(); setDraggedWishId(null); setDraggedGroupId(null); lastReorderTargetRef.current = null;
    if (shouldPersistOrder) {
      deferredAuthoritativeOrderRef.current = null;
      void persistOrder(orderToPersist);
    }
  };
  const allowNativeWishDrop = (event, wishId, targetGroupId = null) => {
    const sourceWishId = dragSourceWishIdRef.current;
    const sourceGroup = dragSourceGroupRef.current;
    const dragScope = dragScopeRef.current;
    if (dragScope?.kind === "grid-group") {
      if (!dragSessionRef.current || !sourceGroup || targetGroupId || dragScope.wishIds.has(wishId)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      reorderGroup(sourceGroup.id, { kind: "wish", id: wishId });
      clearGroupIntent();
      return;
    }
    const validTarget = dragScope?.kind === "group"
      ? dragScope.groupId === targetGroupId && dragScope.wishIds.has(wishId)
      : !targetGroupId;
    if (!dragSessionRef.current || !sourceWishId || !dragScope || !validTarget) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (sourceWishId === wishId) {
      clearReorderIntent();
      if (hoverTargetRef.current) clearGroupIntent();
      lastReorderTargetRef.current = null;
      return;
    }
    if (dragScope.kind === "group") {
      reorderWish(sourceWishId, wishId);
    } else if (groupingListId) {
      const hoverMode = resolveWishHoverMode({
        groupingEnabled: true,
        rect: event.currentTarget.querySelector(".wish-card__image")?.getBoundingClientRect() || event.currentTarget.getBoundingClientRect(),
        clientX: event.clientX,
        clientY: event.clientY,
      });
      if (hoverMode === "group") {
        clearReorderIntent();
        armGroupIntent(`wish:${wishId}`);
      } else {
        clearGroupIntent();
        queueWishReorder(sourceWishId, wishId);
      }
    } else reorderWish(sourceWishId, wishId);
  };
  const allowNativeGroupDrop = (event, groupId) => {
    const sourceGroup = dragSourceGroupRef.current;
    if (dragScopeRef.current?.kind === "grid-group") {
      if (!dragSessionRef.current || !sourceGroup || sourceGroup.id === groupId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      reorderGroup(sourceGroup.id, { kind: "group", id: groupId });
      clearGroupIntent();
      return;
    }
    if (!dragSessionRef.current || !dragSourceWishIdRef.current || dragScopeRef.current?.kind !== "list") return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const hoverMode = resolveWishHoverMode({
      groupingEnabled: true,
      rect: event.currentTarget.querySelector(".wish-group-tile__preview")?.getBoundingClientRect() || event.currentTarget.getBoundingClientRect(),
      clientX: event.clientX,
      clientY: event.clientY,
    });
    if (hoverMode === "group") {
      clearReorderIntent();
      armGroupIntent(`group:${groupId}`);
    } else {
      clearGroupIntent();
      queueWishReorder(dragSourceWishIdRef.current, groupId, "group");
    }
  };
  const leaveNativeDropTarget = (event) => {
    if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX >= bounds.left && event.clientX <= bounds.right
      && event.clientY >= bounds.top && event.clientY <= bounds.bottom) return;
    clearReorderIntent();
    clearGroupIntent();
  };
  const createGroup = async (sourceWishId, targetWishId = null) => {
    finishDrag({ persist: false, restore: true });
    if (!sourceWishId || sourceWishId === targetWishId || !groupingListId) return false;
    const wishIds = [sourceWishId, targetWishId].filter(Boolean);
    try {
      const { group } = await api.post(`/lists/${groupingListId}/groups`, { wishIds, space: selectedSpace });
      updateData((current) => {
        const linked = attachWishesToDashboardList(current, groupingListId, group.wishIds);
        return {
          ...linked,
          groups: [...(linked.groups || []).filter((item) => item.id !== group.id), group],
        };
      });
      toast("Группа создана");
      void reload({ background: true }).catch(() => {});
      return true;
    } catch (error) { toast(error.message, "error"); return false; }
  };
  const addToGroup = async (sourceWishId, groupId) => {
    finishDrag({ persist: false, restore: true });
    if (!sourceWishId || !groupingListId) return false;
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
      return true;
    } catch (error) { toast(error.message, "error"); return false; }
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
  const dropNativeOnWish = (event, targetWishId, targetGroupId = null) => {
    event.preventDefault();
    const sourceWishId = dragSourceWishIdRef.current;
    const sourceGroup = dragSourceGroupRef.current;
    const dragScope = dragScopeRef.current;
    if (dragScope?.kind === "grid-group") {
      if (sourceGroup && !targetGroupId && !dragScope.wishIds.has(targetWishId)) reorderGroup(sourceGroup.id, { kind: "wish", id: targetWishId });
      finishDrag();
    } else if (dragScope?.kind === "group") {
      if (dragScope.groupId === targetGroupId && dragScope.wishIds.has(targetWishId)) finishDrag();
      else finishDrag({ persist: false, restore: true });
    } else if (armedDropTargetRef.current === `wish:${targetWishId}`) {
      void createGroup(sourceWishId, targetWishId);
    } else {
      reorderWish(sourceWishId, targetWishId);
      finishDrag();
    }
  };
  const dropNativeOnGroup = (event, groupId) => {
    event.preventDefault();
    const sourceWishId = dragSourceWishIdRef.current;
    const sourceGroup = dragSourceGroupRef.current;
    if (dragScopeRef.current?.kind === "grid-group") {
      if (sourceGroup && sourceGroup.id !== groupId) reorderGroup(sourceGroup.id, { kind: "group", id: groupId });
      finishDrag();
    } else if (dragScopeRef.current?.kind !== "list") finishDrag({ persist: false, restore: true });
    else if (groupHoverMode(event.currentTarget, event.clientX, event.clientY) === "reorder") {
      clearGroupIntent();
      reorderWishToGroup(sourceWishId, groupId);
      finishDrag();
    }
    else if (armedDropTargetRef.current === `group:${groupId}`) void addToGroup(sourceWishId, groupId);
    else {
      reorderWish(sourceWishId, groupId, "group");
      finishDrag();
    }
  };
  const stopPointerAutoScroll = () => {
    if (pointerAutoScrollFrameRef.current !== null) cancelAnimationFrame(pointerAutoScrollFrameRef.current);
    pointerAutoScrollFrameRef.current = null;
    pointerAutoScrollTimeRef.current = null;
  };
  const clearPointerListeners = () => {
    clearReorderIntent();
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
    const key = (event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelPointerDrag(event); } };
    window.addEventListener("pointermove", move, { capture: true, passive: false });
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key, true);
    document.addEventListener("visibilitychange", visibility);
    pointerListenerCleanupRef.current = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key, true);
      document.removeEventListener("visibilitychange", visibility);
    };
  };
  const activatePointerDrag = (drag) => {
    if (!drag || pointerDragRef.current !== drag || drag.active) return;
    try { drag.captureTarget.setPointerCapture?.(drag.pointerId); } catch {}
    drag.active = true;
    clickGuardCleanupRef.current?.();
    clickGuardCleanupRef.current = guardDragClick(suppressOpenRef, drag.pointerId);
    if (drag.kind === "group") beginGroupDragSession(drag.group);
    else beginDragSession(drag.wishId, drag.group);
    createPointerGhost(drag.source, drag.startX, drag.startY);
    startPointerAutoScroll(drag);
    navigator.vibrate?.(18);
  };
  const beginPointerDrag = (event, wishId, group = null) => {
    const pointerType = event.pointerType || "mouse";
    if (!event.isPrimary || event.button !== 0) return;
    if (!event.target.closest?.(".wish-card__open, [data-wish-drag-handle]")) return;
    if (pointerType === "mouse") event.preventDefault();
    if (pointerDragRef.current) return;
    suppressOpenRef.current = false;
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
    pointerTimerRef.current = setTimeout(() => {
      activatePointerDrag(drag);
    }, 260);
  };
  const beginPointerGroupDrag = (event, group) => {
    const pointerType = event.pointerType || "mouse";
    if (!event.isPrimary || event.button !== 0 || !group) return;
    if (!event.target.closest?.(".wish-group-tile__open, [data-wish-group-drag-handle]")) return;
    if (pointerType === "mouse") event.preventDefault();
    if (pointerDragRef.current) return;
    suppressOpenRef.current = false;
    const drag = { kind: "group", group, pointerId: event.pointerId, pointerType, startX: event.clientX, startY: event.clientY, clientX: event.clientX, clientY: event.clientY, active: false, source: event.currentTarget, captureTarget: event.currentTarget.closest(".wish-grid") || event.currentTarget };
    pointerDragRef.current = drag;
    clearTimeout(pointerTimerRef.current);
    clearPointerListeners();
    listenForPointerDrag();
    if (event.target.closest?.("[data-wish-group-drag-handle]")) {
      event.preventDefault();
      activatePointerDrag(drag);
      return;
    }
    pointerTimerRef.current = setTimeout(() => {
      activatePointerDrag(drag);
    }, 260);
  };
  const updatePointerDragPosition = (drag, clientX, clientY) => {
    // Crossing an edge on the way to a card's center is not a reorder intent.
    // Give that edge a short grace period; movement within it keeps the intent.
    movePointerGhost(clientX, clientY);
    const element = document.elementFromPoint(clientX, clientY);
    const pointerGroupTile = element?.closest?.("[data-group-id]");
    const groupId = pointerGroupTile?.dataset.groupId;
    const pointerWishCard = element?.closest?.("[data-group-wish-id]");
    if (drag.kind === "group") {
      const targetGroupId = groupId && groupId !== drag.group.id ? groupId : null;
      const targetWishId = pointerWishCard?.dataset.groupWishId || null;
      if (targetGroupId) {
        const target = `group:${targetGroupId}`;
        if (drag.hoverTarget !== target) {
          drag.hoverTarget = target;
          reorderGroup(drag.group.id, { kind: "group", id: targetGroupId });
        }
        return;
      }
      if (targetWishId && !(drag.group.wishIds || []).includes(targetWishId)) {
        const target = `wish:${targetWishId}`;
        if (drag.hoverTarget !== target) {
          drag.hoverTarget = target;
          reorderGroup(drag.group.id, { kind: "wish", id: targetWishId });
        }
        return;
      }
      drag.hoverTarget = null;
      lastReorderTargetRef.current = null;
      return;
    }
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
    const validWishReorderTarget = wishId
      && wishId !== drag.wishId
      && dragScopeRef.current?.wishIds?.has(wishId)
      && (dragGroupId ? targetGroupId === dragGroupId : !targetGroupId);
    const validGroupReorderTarget = !dragGroupId && groupsById.has(groupId);
    const validReorderTarget = validWishReorderTarget || validGroupReorderTarget;
    const validGroupTarget = validGroupReorderTarget || (wishId
      && wishId !== drag.wishId
      && !dragGroupId
      && !targetGroupId);
    const groupingEnabled = Boolean(groupingListId && validGroupTarget);
    let hoverMode = null;
    if (overlapGroupTarget) hoverMode = "group";
    else if (validReorderTarget) {
      hoverMode = resolveWishHoverMode({
        groupingEnabled,
        rect: validGroupReorderTarget
          ? pointerGroupTile.querySelector(".wish-group-tile__preview")?.getBoundingClientRect() || pointerGroupTile.getBoundingClientRect()
          : wishCard.querySelector(".wish-card__image")?.getBoundingClientRect() || wishCard.getBoundingClientRect(),
        clientX,
        clientY,
      });
    } else if (groupingEnabled) hoverMode = "group";
    const target = dragGroupId
      ? validReorderTarget ? `wish:${wishId}` : null
      : validGroupReorderTarget
        ? `group:${groupId}`
        : groupingListId
          ? validGroupTarget ? `wish:${wishId}` : null
          : validReorderTarget ? `wish:${wishId}` : null;
    const interactionTarget = target && hoverMode ? `${hoverMode}:${target}` : null;
    if (interactionTarget && interactionTarget !== drag.hoverTarget) {
      drag.hoverTarget = interactionTarget;
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
    if (hoverMode === "reorder" && validReorderTarget) {
      const targetId = validGroupReorderTarget ? groupId : wishId;
      const targetKind = validGroupReorderTarget ? "group" : "wish";
      if (groupingEnabled) queueWishReorder(drag.wishId, targetId, targetKind, drag);
      else {
        clearReorderIntent();
        reorderWish(drag.wishId, targetId, targetKind);
      }
    } else clearReorderIntent();
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
    if (drag.active && (drag.clientX !== event.clientX || drag.clientY !== event.clientY)) updatePointerDragPosition(drag, event.clientX, event.clientY);
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
    const insideGrid = element && drag.captureTarget.contains(element);
    if (!insideGrid) { finishDrag({ persist: false, restore: true }); return; }
    if (drag.kind === "group") {
      if (groupId && groupId !== drag.group.id) reorderGroup(drag.group.id, { kind: "group", id: groupId });
      else if (wishId && !(drag.group.wishIds || []).includes(wishId) && !targetGroupId) reorderGroup(drag.group.id, { kind: "wish", id: wishId });
      // A previewed move belongs to the source grid, including its gaps and
      // the thin space exposed by the scaled source placeholder.
      if (orderDirtyRef.current) finishDrag();
      else finishDrag({ persist: false, restore: true });

      return;
    }
    const dragGroupId = drag.group?.id || null;
    const hoverGroupTarget = drag.hoverTarget === `group:${armedDropTargetRef.current}`
      ? armedDropTargetRef.current : null;
    const hoveredGroupId = hoverGroupTarget?.startsWith("group:") ? hoverGroupTarget.slice("group:".length) : null;
    const hoveredWishId = hoverGroupTarget?.startsWith("wish:") ? hoverGroupTarget.slice("wish:".length) : null;
    if (dragGroupId && orderDirtyRef.current) finishDrag();
    else if (dragGroupId) finishDrag({ persist: false, restore: true });
    else if (hoveredGroupId) addToGroup(drag.wishId, hoveredGroupId);
    else if (hoveredWishId && hoveredWishId !== drag.wishId) createGroup(drag.wishId, hoveredWishId);
    else if (groupId && groupsById.has(groupId)) {
      reorderWish(drag.wishId, groupId, "group");
      finishDrag();
    }
    else if (!groupId && !targetGroupId && dragScopeRef.current?.wishIds?.has(wishId) && wishId !== drag.wishId) {
      reorderWish(drag.wishId, wishId);
      finishDrag();
    }
    else if (orderDirtyRef.current) finishDrag();
    else finishDrag({ persist: false, restore: true });

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

  };
  cancelDragRef.current = () => {
    cancelPointerDrag({ preventDefault() {} });
    if (dragSessionRef.current) finishDrag({ persist: false, restore: true });
  };
  const renderWish = (wish, group = null) => {
    const dragEnabled = !group || !removingGroupId;
    return <WishCard key={wish.id} wish={wish} owner profile={user} lists={data.lists} draggable={dragEnabled} nativeDraggable={dragEnabled} dragGroupId={group?.id} groupBusy={Boolean(group && removingGroupId)} groupOptions={group ? [] : groups} onCreateGroup={!group && groupingListId ? () => createGroup(wish.id) : undefined} onAddToGroup={!group && groupingListId ? (groupId) => addToGroup(wish.id, groupId) : undefined} isDragging={draggedWishId === wish.id} isDropTarget={!group && dropTarget === `wish:${wish.id}`} onDragStart={(event) => startNativeDrag(event, wish.id, group)} onDragEnd={() => finishDrag({ persist: false, restore: true })} onDragOver={(event) => allowNativeWishDrop(event, wish.id, group?.id || null)} onDragLeave={leaveNativeDropTarget} onDrop={(event) => dropNativeOnWish(event, wish.id, group?.id || null)} onPointerDown={(event) => { if (!group || !removingGroupId) beginPointerDrag(event, wish.id, group); }} onRemoveFromGroup={group ? () => removeWishFromGroup(wish.id, group) : undefined} onChanged={refreshWishes} onOpen={() => {
    if (suppressOpenRef.current) { suppressOpenRef.current = false; return; }
    setSelectedWishId(wish.id);
  }} onEdit={() => editWish(wish.id)} onCreateList={() => setListModal({ attachWishId: wish.id })} />;
  };
  const renderGroupTile = (group, groupWishes) => <WishGroupTile
    key={group.id}
    group={group}
    wishes={groupWishes}
    moveTargets={groupMoveTargets}
    draggable={!removingGroupId}
    nativeDraggable={!removingGroupId}
    isDragging={draggedGroupId === group.id}
    isDropTarget={dropTarget === `group:${group.id}`}
    onOpen={(event) => {
      if (suppressOpenRef.current) { suppressOpenRef.current = false; return; }
      groupOpenerRef.current = event.currentTarget;
      setOpenedGroupId(group.id);
    }}
    onRename={(title) => renameGroup(group.id, group.listId, title)}
    onMove={(targetList) => moveGroup(group, targetList)}
    onDisband={() => disbandGroup(group.id, group.listId)}
    onDragStart={(event) => startNativeGroupDrag(event, group)}
    onDragEnd={() => {
      finishDrag({ persist: false, restore: true });
      setTimeout(() => { suppressOpenRef.current = false; }, 0);
    }}
    onDragOver={(event) => allowNativeGroupDrop(event, group.id)}
    onDragLeave={leaveNativeDropTarget}
    onDrop={(event) => dropNativeOnGroup(event, group.id)}
    onPointerDown={(event) => { if (!removingGroupId) beginPointerGroupDrag(event, group); }}
  />;
  const renderGridItem = (item) => (
    item.type === "group"
      ? renderGroupTile(item.group, item.wishes)
      : renderWish(item.wish)
  );
  return <div className="app-page wishes-page">
    {profileControls}{loadError}
    {!publication && data && <AddFab actions={[
      { label: "Добавить желание", onSelect: () => onAdd(selectedSpace, selectedList?.id) },
      { label: "Новый список", icon: ListPlus, onSelect: () => setListModal({}) },
    ]} />}
    {!publication && shouldShowListNavigation({ listCount: categoryLists.length, unlistedCount: unlistedWishes.length }) && <WishListNavigation
      value={selectedValue}
      items={categoryLists.map((list) => ({ id: list.id, title: listDisplayTitle(list), count: wishCountForList(list.id), privateList: list.privacy === "private" }))}
      leadingItem={shouldShowUnsortedList(unlistedWishes.length) ? { title: UNSORTED_LIST_TITLE, count: unlistedWishes.length } : null}
      orderScope={viewerId ? `${viewerId}:${selectedSpace}` : null}
      onSelect={(id) => {
        if (id) { setSelected(id); setOpenedGroupId(null); }
      }}
      onSettings={openListSettings}
      onOrderError={() => toast("Не удалось сохранить порядок списков", "error")}
    />}
{publicationContent || <>
<GiftSuggestionsPanel items={giftSuggestions} onOpenWish={setSelectedWishId} />
{openedGroup && <WishGroupDialog
  group={openedGroup}
  viewerId={user.id}
  count={openedGroupWishes.length}
  moveTargets={groupMoveTargets}
  onRename={(title) => renameGroup(openedGroup.id, openedGroup.listId, title)}
  onMove={(list) => moveGroup(openedGroup, list)}
  onDisband={() => disbandGroup(openedGroup.id, openedGroup.listId)}
  finalFocus={groupOpenerRef}
  busy={Boolean(removingGroupId)}
  suspended={Boolean(selectedWish || editingWish || listModal)}
  onClose={() => setOpenedGroupId(null)}
><div className="wish-grid" onLostPointerCapture={cancelPointerDrag}>{openedGroupWishes.map((wish) => renderWish(wish, openedGroup))}</div></WishGroupDialog>}
{wishes.length ? <div className="wish-grid" onLostPointerCapture={cancelPointerDrag}>{gridItems.map(renderGridItem)}</div> : !spaceSharedWishes.length && <EmptyState icon={Heart} title="В этом списке пока пусто" text="Добавьте то, что действительно порадует." />}
<SharedWishes wishes={spaceSharedWishes} profile={user} onOpen={(id) => {
  if (isMobile) navigate(publicWishPath(user.username, id), { state: { fromWishlistBoard: true } });
  else setSelectedWishId(id);
}} onChanged={refreshWishes} />
{selectedWish && <WishDetailsModal wish={selectedWish} owner={!selectedWish.sharedBy} profile={user} lists={data.lists} giftSuggestion={selectedWishSuggestion} onChanged={refreshWishes} onEdit={() => editWish(selectedWish.id)} onCreateList={() => { setSelectedWishId(null); setListModal({ attachWishId: selectedWish.id }); }} onClose={() => setSelectedWishId(null)} />}
{editingWish && <WishModal wish={editingWish} space={selectedSpace} onClose={() => setEditingWishId(null)} onSaved={async () => { setEditingWishId(null); await reload(); }} onDeleted={async () => { setEditingWishId(null); await reload(); }} />}</>}
{listModal && <ListModal list={listModal.id ? listModal : null} listsCount={data.lists.length} space={selectedSpace} onClose={() => setListModal(null)} onSaved={saveList} onDeleted={deleteList} returnFocusRef={listModal.id ? listSettingsTriggerRef : undefined} />}</div>;
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
  const saveQueue = useMemo(
    () => createLatestSaveQueue((draft) => api.patch(`/wishes/${wish.id}/media-note`, draft)),
    [wish.id],
  );

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
    return () => { saveRequestRef.current += 1; };
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
      const { value: savedDraft, result } = await saveQueue(candidate);
      if (requestId !== saveRequestRef.current) return false;
      setSavedAt(result.note?.updatedAt || new Date().toISOString());
      const unchanged = Object.keys(EMPTY_MEDIA_NOTE).every((key) => formRef.current[key] === savedDraft[key]);
      if (unchanged) setDirty(false);
      if (announce) toast("Конспект сохранён");
      return true;
    } catch (error) {
      if (requestId === saveRequestRef.current) {
        setDirty(true);
        toast(error.message, "error");
      }
      return false;
    } finally {
      if (requestId === saveRequestRef.current) setSaving(false);
    }
  }, [loaded, saveQueue, toast]);

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

  return <section className="mx-auto w-full max-w-(--layout-compact-width) overflow-hidden rounded-2xl border bg-card" aria-label="Конспект медиа-айтема">
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

function ScreenNavigation({ to }) {
  const navigate = useNavigate();
  const navigated = useRef(false);
  useLayoutEffect(() => {
    if (navigated.current) return;
    navigated.current = true;
    navigate(to);
  }, [navigate, to]);
  return <LoadingScreen />;
}

function WishDetailsModal({ wish, screen = false, owner = false, profile, shareToken = "", lists = [], giftSuggestion = null, onChanged, onEdit, onCreateList, onClose }) {
  const isMobile = useIsMobile();
  const sharedBy = wish.sharedBy;
  const resolvedSpace = wishSpaceId(wish, lists);
  const offerWish = useMemo(
    () => ({ ...wish, space: resolvedSpace, url: merchantProductUrl(wish.url) }),
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
  const { busy, reserve, remove, leave, fulfilled, share, save, update, repeat } = useWishActions({
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

  if (isMobile && !screen) {
    return <ScreenNavigation to={shareToken ? `/s/${encodeURIComponent(shareToken)}/wishes/${encodeURIComponent(wish.id)}` : publicWishPath(profile.username, wish.id)} />;
  }
  const Title = screen ? "h1" : DrawerTitle;
  const Description = screen ? "p" : DrawerDescription;
  const mobilePage = screen && isMobile;
  const marketplacePrimary = mobilePage && owner && ["products", "food", "transport"].includes(resolvedSpace);
  const reservationLabel = wish.reservedByMe ? "Забронировано вами" : reservationUnavailable ? "Уже забронировано" : "Забронировать";
  const reservationText = mobilePage ? (wish.reservedByMe ? "Ваша бронь" : reservationUnavailable ? "Занято" : "Забронировать") : reservationLabel;
  const fulfillmentLabel = wish.status === "fulfilled" ? "Вернуть в активные" : "Отметить исполненным";
  const fulfillmentText = !screen || mobilePage ? (wish.status === "fulfilled" ? "В активные" : "Исполнить") : fulfillmentLabel;
  const ActionBar = screen ? ContentPageActions : DrawerFooter;
  const renderActions = (primaryAction) => (
          <ActionBar
            data-slot="wish-actions"
            className={screen ? "mx-auto flex w-full max-w-(--layout-compact-width) min-w-0 flex-nowrap items-center gap-2" : undefined}
            role="group"
            aria-label="Действия с желанием"
          >
            {sharedBy ? <ShadcnButton type="button" className="min-w-0 flex-1" variant="destructive" disabled={busy} onClick={leave}>Убрать с доски</ShadcnButton> : <>
            {primaryAction ?? <>
            {!owner && <ShadcnButton className="h-12 min-w-0 flex-1" disabled={busy || wish.status !== "active" || reservationUnavailable} aria-label={mobilePage ? (wish.reservedByMe ? "Ваша бронь: снять бронирование" : reservationUnavailable ? "Занято: желание уже забронировано" : "Забронировать") : reservationLabel} aria-busy={busy || undefined} onClick={reserve}>{busy ? <Spinner /> : !mobilePage && <Gift />}{reservationText}</ShadcnButton>}
            {!owner && !mobilePage && <ShadcnButton data-control-icon className={`size-12 shrink-0 ${wish.likedByMe ? "" : "text-destructive"}`} variant={wish.likedByMe ? "default" : "outline"} size="icon" disabled={busy || wish.likedByMe} aria-label={wish.likedByMe ? "Желание уже в вашем общем списке" : "Лайкнуть и добавить в общий список"} title={wish.likedByMe ? "Уже в вашем списке" : "Добавить к себе"} onClick={save}><Heart fill={wish.likedByMe ? "currentColor" : "none"} /></ShadcnButton>}
            {owner && <ShadcnButton className="h-12 min-w-0 flex-1" variant={screen && !mobilePage ? "outline" : "default"} disabled={busy} aria-label={mobilePage && wish.status !== "fulfilled" ? "Исполнить желание: отметить исполненным" : fulfillmentLabel} aria-busy={busy || undefined} onClick={fulfilled}>{busy ? <Spinner /> : <PackageCheck />}{fulfillmentText}</ShadcnButton>}
            </>}
            {!screen && owner && <ShadcnButton data-control-icon type="button" variant="destructive" size="icon" aria-label="Удалить желание" title="Удалить желание" aria-haspopup="dialog" disabled={busy} onClick={() => setDeleteOpen(true)}><Trash2 aria-hidden="true" /></ShadcnButton>}
            <DropdownMenu open={menuOpen} onOpenChange={(open) => {
              setMenuOpen(open);
              if (open) setListsOpen(false);
            }}>
              <DropdownMenuTrigger
                render={<ShadcnButton data-control-icon variant="outline" size="icon" className="size-12 shrink-0" />}
                aria-label={`Опции желания «${wish.title}»`}
                title="Опции желания"
              ><MoreHorizontal /></DropdownMenuTrigger>
              <DropdownMenuContent
                id={`wish-detail-menu-${wish.id}`}
                className="max-h-[calc(100dvh-12px)] w-(--layout-menu-width) max-w-(--available-width) rounded-2xl p-2 [&_[data-slot=dropdown-menu-item]]:min-h-12 [&_[data-slot=dropdown-menu-sub-trigger]]:min-h-12"
                align="end"
                sideOffset={4}
                aria-label={`Действия с желанием «${wish.title}»`}
              >
                <DropdownMenuGroup>
                  {!owner && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy || wish.status !== "active" || reservationUnavailable} onClick={reserve}><Gift /> {wish.reservedByMe ? "Снять бронь" : "Забронировать"}</DropdownMenuItem>}
                  {!owner && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy || wish.likedByMe} onClick={save}><Heart fill={wish.likedByMe ? "currentColor" : "none"} /> {wish.likedByMe ? "Уже в вашем списке" : "Лайкнуть и добавить к себе"}</DropdownMenuItem>}
                  {owner && wish.status === "fulfilled" ? <>
                    <WishSaleMenuItem wish={wish} space={resolvedSpace} disabled={busy} />
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
                        className="max-h-[calc(100dvh-12px)] w-(--layout-menu-width) max-w-(--available-width) rounded-2xl p-2 [&_[data-slot=dropdown-menu-item]]:min-h-12"
                        sideOffset={4}
                        aria-label={`Списки желания «${wish.title}»`}
                      >
                        {renderListPickerBody()}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>}
                  {(!owner || wish.status !== "fulfilled") && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} onClick={share}><Share2 /> Поделиться</DropdownMenuItem>}
                  {!owner && merchantProductUrl(wish.url) && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" render={<a href={merchantProductUrl(wish.url)} target="_blank" rel="noreferrer" />}><ExternalLink /> {isYandexMapsUrl(wish.url) ? "Открыть в Яндекс Картах" : "Открыть магазин"}</DropdownMenuItem>}
                  {!owner && wish.fundraisingUrl && <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" render={<a href={wish.fundraisingUrl} target="_blank" rel="noopener noreferrer" />}><ExternalLink /> Перейти к сбору</DropdownMenuItem>}
                  {screen && owner && <DropdownMenuItem variant="destructive" className="app-destructive-menu-item min-h-12 gap-2 px-3 py-2 text-base" disabled={busy} aria-haspopup="dialog" onClick={() => setDeleteOpen(true)}><Trash2 /> Удалить</DropdownMenuItem>}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            </>}
          </ActionBar>
  );
  const detailsContent = (
          <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 [&>*]:shrink-0">
          <Card data-slot="wish-media" className="mx-auto w-full max-w-(--layout-compact-width) relative overflow-hidden p-0">
            {previewImageUrl
              ? <img className="block h-auto w-full" src={previewImageUrl} alt={`Фото желания «${wish.title}»`} referrerPolicy="strict-origin-when-cross-origin" onError={(event) => applyRetailerPreviewFallback(event, wish.url)} />
              : <span className="grid aspect-[4/3] w-full place-items-center text-muted-foreground"><Gift /></span>}
            {wish.status === "fulfilled" && <Badge variant="secondary" className="absolute left-3 top-3"><Check data-icon="inline-start" aria-hidden="true" />Исполнено</Badge>}
          </Card>

          <DrawerHeader className="mx-auto w-full max-w-(--layout-compact-width) p-0 text-left!">
            <Title className={screen ? "text-2xl font-semibold" : undefined}><span className="sr-only">Желание: </span>{wish.title}</Title>
            {(sharedBy || wish.participants?.length > 0) && <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><Users className="size-4 shrink-0" aria-hidden="true" /><span className="break-words">Совместное желание · {sharedBy ? sharedBy.name : wish.participants.map((person) => person.name).join(", ")}</span></span>}
            {(wish.vehicleMake || wish.vehicleModel) && <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Car className="size-4" aria-hidden="true" />{[wish.vehicleMake, wish.vehicleModel].filter(Boolean).join(" ")}</span>}
            {(wish.price != null || wish.eventDate) && <div data-slot="wish-price-row" className="w-full">
              {wish.price != null && <strong data-slot="wish-price" className="whitespace-nowrap tabular-nums text-3xl leading-none font-semibold sm:text-4xl">{formatMoney(wish.price, wish.currency)}</strong>}
              {wish.eventDate && <span data-slot="wish-event-date" className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarDays className="size-4" aria-hidden="true" />{formatEventDate(wish.eventDate)}</span>}
            </div>}
            <Description className={screen ? "text-muted-foreground" : undefined}>{wish.description || "Автор пока не добавил описание — иногда желание говорит само за себя."}</Description>
          </DrawerHeader>

          {owner && resolvedSpace === "media" && <MediaNotesPanel wish={wish} />}

          {!sharedBy && <div data-slot="wish-toolbar" className="mx-auto flex w-full max-w-(--layout-compact-width) min-w-0 items-center gap-2">
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

          </div>}

          {owner && wish.status === "fulfilled" && giftSuggestion && <Card className="mx-auto w-full max-w-(--layout-compact-width) gap-3 p-4">
            <div className="flex flex-col gap-1">
              <h3 className="font-semibold">Кому это ещё подарить</h3>
              <p className="text-sm text-muted-foreground">Это желание сейчас есть у {participantCountLabel(giftSuggestion.participantCount)}.</p>
            </div>
            <GiftSuggestionPeople suggestion={giftSuggestion} />
          </Card>}

          {["products", "food", "transport"].includes(resolvedSpace) && <MarketplaceOffers wish={offerWish} owner={owner} formatPrice={formatMoney} compactAction={marketplacePrimary} renderAction={marketplacePrimary ? renderActions : undefined} />}

          {merchantProductUrl(wish.url) && (sharedBy || !["products", "food"].includes(resolvedSpace)) && <a href={merchantProductUrl(wish.url)} target="_blank" rel="noreferrer" className={buttonVariants({ className: "wish-buy-action mx-auto h-12 w-full max-w-(--layout-compact-width)" })}>{isYandexMapsUrl(wish.url) ? "Открыть в Яндекс Картах" : "Где купить"} <ExternalLink data-icon="inline-end" aria-hidden="true" /></a>}
          {wish.fundraisingUrl && <a href={wish.fundraisingUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ className: "wish-buy-action mx-auto h-12 w-full max-w-(--layout-compact-width)" })}>Перейти к сбору <ExternalLink data-icon="inline-end" aria-hidden="true" /></a>}

          {screen && !marketplacePrimary && renderActions()}

          {!owner && !sharedBy && <Alert className="mx-auto w-full max-w-(--layout-compact-width)"><Hand /><AlertDescription>Если вы решили исполнить это желание, обязательно забронируйте его, чтобы никто другой не подарил то же самое.</AlertDescription></Alert>}
          </div>
  );
  return <>
    {screen ? <ContentPage title="Желание" onBack={onClose} className="wish-item-page">{detailsContent}</ContentPage> : <Drawer open showSwipeHandle swipeDirection="right" onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerContent className="wish-details-dialog app-drawer--compact">
        <DrawerClose render={<ShadcnButton variant="ghost" className="absolute top-2 right-2 z-10" size="icon-sm" />}><X /><span className="sr-only">Закрыть</span></DrawerClose>
        {detailsContent}
        {renderActions()}
      </DrawerContent>
    </Drawer>}
      {deleteOpen && <WishDeleteAlert open wish={wish} busy={busy} onOpenChange={setDeleteOpen} onConfirm={async () => { if (await remove()) setDeleteOpen(false); }} />}
    </>;
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
    if (loading || deleting || deleteOpen) return;
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
    if (!editing || loading || deleting || listsCount <= 1) return;
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
    <Drawer open mobileDrawer={editing} onOpenChange={(open) => { if (!open && !loading && !deleting) onClose(); }}>
      <DrawerContent className="app-drawer--compact" finalFocus={returnFocusRef}>
        <DrawerClose
          render={<ShadcnButton variant="ghost" className="absolute top-2 right-2 z-10" size="icon-sm" />}
        >
          <X />
          <span className="sr-only">Закрыть</span>
        </DrawerClose>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>{editing ? "Изменить список" : "Создать список"}</DrawerTitle>
            <DrawerDescription>{editing ? "Измените название, описание и приватность списка." : "Задайте название, описание и приватность нового списка."}</DrawerDescription>
          </DrawerHeader>
          <div className="app-drawer-body flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={titleId}>Название</FieldLabel>
              <Input id={titleId} autoFocus={canAutofocusForm()} required placeholder="Например, Новоселье" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
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
          </FieldGroup>
          </div>
          <DrawerFooter>
            <ShadcnButton
              type="submit"
              aria-label={editing ? "Сохранить изменения" : undefined}
              disabled={loading || deleting}
              aria-busy={loading || undefined}
            >
              {loading && <Spinner data-icon="inline-start" />}
              {editing ? (isMobile ? "Сохранить" : "Сохранить изменения") : "Создать список"}
            </ShadcnButton>
            {editing && <ShadcnButton
              data-control-icon=""
              type="button"
              variant="destructive"
              size="icon"
              aria-label="Удалить список"
              title="Удалить список"
              disabled={loading || deleting || listsCount <= 1}
              aria-busy={deleting || undefined}
              onClick={() => setDeleteOpen(true)}
            >
              {deleting ? <Spinner /> : <Trash2 aria-hidden="true" />}
            </ShadcnButton>}
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

function WishModal({ onClose, onSaved, onDeleted, onAfterClose, wish = null, space = "products", initialListId = "", initialDraft = null }) {
  const isMobile = useIsMobile();
  const editing = Boolean(wish?.id);
  const toast = useToast();
  const { data, loading: listsLoading, error: listsError, reload: reloadDashboard } = useAsync(() => api.get("/dashboard"), []);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageDropActive, setImageDropActive] = useState(false);
  const [imageError, setImageError] = useState("");
  const [listCreatorOpen, setListCreatorOpen] = useState(false);
  const [metadata, setMetadata] = useState({ status: "idle", message: "" });
  const [vehicleCatalog, setVehicleCatalog] = useState({ status: "idle", makes: [], models: [], modelsStatus: "idle" });
  const [form, setForm] = useState(() => wishFormFrom(wish || initialDraft, initialListId));
  const [initialParticipants] = useState(() => wish?.participants || []);
  const [participants, setParticipants] = useState(initialParticipants);
  const autoTimerRef = useRef(null);
  const metadataRequestRef = useRef(0);
  const editedMetadataFieldsRef = useRef(new Set(initialDraft
    ? ["title", "description", "imageUrl", "price", "currency"].filter(field =>
      field === "price" || field === "currency" ? initialDraft.price != null : Boolean(initialDraft[field]))
    : []));
  const imageFileRef = useRef(null);
  const uploadedImageIdsRef = useRef(new Set());
  const mutationRef = useRef(null);
  const deleteTriggerRef = useRef(null);
  const listCreatorTriggerRef = useRef(null);
  const selectableLists = data?.lists?.filter((list) => !isGeneralList(list)) || [];
  const requestedListName = initialDraft?.listName;
  const matchingLists = findAssistantWishLists(selectableLists, requestedListName);
  const matchedList = matchingLists.length === 1 ? matchingLists[0] : null;
  const [assistantListResolved, setAssistantListResolved] = useState(false);
  useEffect(() => {
    if (!requestedListName || !data || assistantListResolved) return;
    if (matchedList) setForm((current) => ({ ...current, listIds: initialWishListIds(current, matchedList.id) }));
    setAssistantListResolved(true);
  }, [data, matchedList, requestedListName, assistantListResolved]);
  const assistantListPending = Boolean(requestedListName && (listsLoading || listsError || !assistantListResolved));
  const effectiveSpace = (() => {
    if (matchedList) return listSpace(matchedList);
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
      sessionFetch(`/api/uploads/images/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
        keepalive: true,
      }).catch(() => {});
    });
  }, []);
  const uploadImage = async (file) => {
    if (!file || imageUploading || loading || deleting || mutationRef.current) return;
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
    if (mutationRef.current || deleting || imageUploading || assistantListPending) return;
    mutationRef.current = "save";
    setLoading(true);
    try {
      const payload = { ...form, price: form.price === "" ? null : Number(form.price), eventDate: form.eventDate || null };
      if (editing) {
        const { add, remove } = wishParticipantChanges(initialParticipants, participants);
        if (add.length || remove.length) payload.participantChanges = { add, remove };
      } else {
        payload.space = effectiveSpace;
        payload.participantIds = participants.map(({ id }) => id);
      }
      const result = editing ? await api.patch(`/wishes/${wish.id}`, payload) : await api.post("/wishes", payload);
      const savedUploadId = uploadedImageIdFromUrl(result.wish?.imageUrl);
      if (savedUploadId) uploadedImageIdsRef.current.delete(savedUploadId);
      await cleanupUploadedImages(result.wish?.imageUrl || "");
      toast(withWishReward(editing ? "Изменения сохранены" : "Желание добавлено ✦", result.reward));
      await onSaved?.(result.wish);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      mutationRef.current = null;
      setLoading(false);
    }
  };
  const remove = async () => {
    if (mutationRef.current || loading || deleting || imageUploading) return;
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
    if (loading || deleting || imageUploading || listCreatorOpen || deleteConfirm) return;
    cleanupUploadedImages();
    onClose();
  };
  const cancelDelete = () => {
    if (deleting) return;
    setDeleteConfirm(false);
  };

  const fieldId = (name) => `wish-editor-${name}-${wish?.id || "new"}`;
  const editorContent = <>
        <ControlBar className="contents"><ShadcnButton data-control-icon type="button" variant="ghost" className="wish-editor-screen__close" size="icon" disabled={loading || deleting || imageUploading} onClick={requestClose}>
          <X />
          <span className="sr-only">Закрыть</span>
        </ShadcnButton></ControlBar>
        <form
          className={`wish-editor mx-auto flex w-full flex-col ${editing ? "wish-editor--edit" : "wish-editor--create"}`}
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

          <div className="wish-editor-screen__content px-4" aria-label="Поля желания">
            {requestedListName && listsError && <Alert variant="destructive" role="alert">
              <AlertDescription>Не удалось загрузить списки.</AlertDescription>
              <ShadcnButton type="button" variant="outline" onClick={() => void reloadDashboard().catch(() => {})}>Повторить</ShadcnButton>
            </Alert>}
            {requestedListName && data && !matchedList && <p className="m-0" role="status">
              {matchingLists.length ? `Есть несколько списков «${requestedListName}».` : `Список «${requestedListName}» не найден.`} Выберите список в форме или оставьте желание без списка.
            </p>}
            <div className="wish-editor__layout m-0 flex h-auto w-full flex-col gap-4 overflow-visible p-0 pr-3 max-[820px]:pr-0">
          <section className="wish-editor__media h-auto w-full gap-2" aria-label="Фотография желания">
            <div
              className={`wish-editor__image aspect-[4/3] h-auto min-h-0 rounded-lg ${formPreviewImageUrl ? "has-image" : "is-empty"} ${imageDropActive ? "is-dragging" : ""}`}
              aria-busy={imageUploading || undefined}
              role="button"
              tabIndex={imageUploading ? -1 : 0}
              aria-label={formPreviewImageUrl ? "Сменить фотографию желания" : "Добавить фотографию желания"}
              onClick={() => { if (!imageUploading) imageFileRef.current?.click(); }}
              onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !imageUploading) { event.preventDefault(); imageFileRef.current?.click(); } }}
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
                ? <img src={formPreviewImageUrl} alt={`Фото желания «${form.title || wish?.title || "Новое желание"}»`} referrerPolicy="strict-origin-when-cross-origin" onError={(event) => applyRetailerPreviewFallback(event, form.url)} />
                : <Empty className="wish-editor__image-empty h-full gap-3 rounded-[inherit] border bg-muted/30 p-4 transition-colors max-[380px]:gap-2 max-[380px]:p-3">
                  <EmptyHeader className="gap-1">
                    <EmptyMedia className="mb-1" variant="icon"><Image aria-hidden="true" /></EmptyMedia>
                    <EmptyTitle>{imageUploading ? "Загружаем изображение…" : "Добавить изображение"}</EmptyTitle>
                    <EmptyDescription id={fieldId("image-help")}>JPG, PNG или WEBP · до 8 МБ</EmptyDescription>
                  </EmptyHeader>
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
            </div>
            {imageError && <FieldError id={fieldId("image-error")}>{imageError}</FieldError>}
            {browserRetailer && <p className="text-sm leading-relaxed text-muted-foreground">Фото из «{browserRetailer.label}» загружается автоматически через помощник обычного браузера.</p>}
          </section>

          <section className="wish-editor__panel w-full overflow-visible p-0">
            <div className="wish-editor__scroll flex h-auto w-full flex-col gap-4 overflow-visible p-0 [scrollbar-gutter:auto]">
              <Field className="wish-editor__field">
                <FieldLabel htmlFor={fieldId("title")}>Название</FieldLabel>
                <ProductTitleInput id={fieldId("title")} enabled={effectiveSpace === "products"} disabled={loading || deleting} autoFocus={editing && canAutofocusForm()} required value={form.title} placeholder="Название желания" onValueChange={(value) => updateMetadataField("title", value)} />
              </Field>

              <WishParticipantField participants={participants} onChange={setParticipants} spaceLabel={SPACES.find(({ id }) => id === effectiveSpace)?.label} disabled={loading || deleting} />

              {isTransport && <div className="grid gap-4">
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
                {(vehicleCatalog.status === "loading" || vehicleCatalog.status === "unavailable" || ["loading", "unavailable"].includes(vehicleCatalog.modelsStatus)) && <p className="m-0 text-sm leading-relaxed text-muted-foreground" role="status" aria-live="polite">
                  {vehicleCatalog.status === "loading" && "Загружаем марки из базы «Авто»…"}
                  {vehicleCatalog.status === "unavailable" && "Справочник «Авто» сейчас недоступен — марку и модель можно ввести вручную."}
                  {vehicleCatalog.status === "ready" && vehicleCatalog.modelsStatus === "loading" && "Загружаем модели выбранной марки…"}
                  {vehicleCatalog.status === "ready" && vehicleCatalog.modelsStatus === "unavailable" && "Модели не загрузились — модель можно ввести вручную."}
                </p>}
              </div>}

              <Field className="wish-editor__field wish-editor__field--link grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto] items-center gap-2">
                <FieldLabel className="col-start-1 row-start-1" htmlFor={fieldId("url")}>{isPlaces ? "Ссылка из Яндекс Карт" : isFood ? "Ссылка на продукт" : "Ссылка"}</FieldLabel>
                <Input className="col-span-2 row-start-2" id={fieldId("url")} autoFocus={!editing && canAutofocusForm()} type="url" inputMode="url" value={form.url} placeholder={isPlaces ? "https://yandex.ru/maps/…" : isFood ? "https://lenta.com/product/…" : isTransport ? "https://auto.ru/cars/used/sale/…" : "https://…"} onChange={(event) => updateMetadataField("url", event.target.value)} />
                <ShadcnButton className="wish-editor__link-action col-start-2 row-start-1 justify-self-end" type="button" variant="ghost" disabled={!form.url.trim() || metadata.status === "loading"} onClick={() => recognize(form.url)}>
                  {metadata.status === "loading" ? <LoaderCircle className="spin" /> : <Sparkles />}
                  <span>{metadata.status === "loading" ? "Заполняем…" : "Заполнить по ссылке"}</span>
                </ShadcnButton>
                {isPlaces && <p className="wish-editor__link-hint col-span-2 row-start-3 m-0 flex items-center gap-1.5"><MapPin size={14} aria-hidden="true" /> Ссылка на место из Яндекс Карт — подставим название и адрес</p>}
                {isMedia && <p className="wish-editor__link-hint col-span-2 row-start-3 m-0 flex items-center gap-1.5"><Clapperboard size={14} aria-hidden="true" /> {isKinopoisk ? "Ссылка на фильм или сериал с Кинопоиска — подставим постер" : isKinopoiskSite ? "Нужна ссылка на карточку фильма или сериала, а не на поиск Кинопоиска" : isVideo ? `Ссылка на видео в ${videoProviderLabel} — подставим название и превью` : "Ссылка на книгу с Bookmate, Альпины или МИФа — подставим название и обложку"}</p>}
                {isFood && <p className="wish-editor__link-hint col-span-2 row-start-3 m-0 flex items-center gap-1.5"><UtensilsCrossed size={14} aria-hidden="true" /> {browserRetailer ? `${browserRetailer.label} — помощник браузера автоматически подставит название, фото и доступную цену` : "Подставим название, фото и цену для выбранного магазином региона"}</p>}
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
                <Input className="col-start-1 row-start-2" id={fieldId("price")} type="number" min="0" step="0.01" value={form.price} placeholder="0" onChange={(event) => updateMetadataField("price", event.target.value)} />
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
                <PlanningDatePicker id={fieldId("eventDate")} label="Дата события" clearable value={form.eventDate} onChange={(date) => setForm((current) => ({ ...current, eventDate: date }))} className="w-full justify-between" />
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

          <MobileFormFooter className="wish-editor-screen__footer">
            <ShadcnButton type="submit" disabled={loading || deleting || imageUploading || assistantListPending} aria-busy={loading || undefined} aria-label={editing ? "Обновить" : "Загадать желание"}>
              {loading && <Spinner />}{editing ? "Обновить" : "Загадать желание"}
            </ShadcnButton>
            {editing && <ShadcnButton ref={deleteTriggerRef} type="button" variant="destructive" size="icon" data-control-icon aria-label="Удалить желание" title="Удалить желание" disabled={loading || deleting || imageUploading} onClick={() => { if (!mutationRef.current && !loading && !deleting) setDeleteConfirm(true); }}><Trash2 aria-hidden="true" /></ShadcnButton>}
          </MobileFormFooter>
        </form>
    </>;
  const editorSurface = editing ? <FullscreenDialog
    className="wish-editor-screen"
    id={fieldId("dialog-content")}
    aria-labelledby={fieldId("dialog-title")}
    aria-describedby={fieldId("dialog-description")}
    busy={loading || deleting || imageUploading}
    suspended={listCreatorOpen || deleteConfirm}
    onClose={requestClose}
  >
    {editorContent}
  </FullscreenDialog> : <Drawer
    open
    onAfterClose={onAfterClose}
    modal={!listCreatorOpen}
    disablePointerDismissal={listCreatorOpen}
    showSwipeHandle={!isMobile}
    swipeDirection={isMobile ? "down" : "right"}
    onOpenChange={(nextOpen) => { if (!nextOpen) requestClose(); }}
  >
    <DrawerContent className="wish-editor-drawer app-mobile-screen rollapp-body app-drawer--form">
      <DrawerHeader className="pr-16 text-left!">
        <DrawerTitle>Добавить желание</DrawerTitle>
        <DrawerDescription>Добавьте изображение и заполните основную информацию.</DrawerDescription>
      </DrawerHeader>
      <section id={fieldId("dialog-content")} data-slot="wish-editor-content" className="wish-editor-screen wish-editor-screen--drawer">
        {editorContent}
      </section>
    </DrawerContent>
  </Drawer>;

  return <>
      {editorSurface}
      {editing && deleteConfirm && <WishDeleteAlert open wish={wish} busy={deleting} onOpenChange={cancelDelete} onConfirm={remove} />}
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
    <div className="app-page friends-page typeset typeset-rollapp">
      <div className="friends-layout not-typeset">
        <section className="friends-directory page-stack" aria-label={config.label}>
          <ToggleGroup
            className="friends-section-nav w-full flex-wrap gap-1 rounded-xl border bg-card p-1"
            aria-label="Разделы друзей"
            value={[section]}
            onValueChange={([nextSection]) => {
              if (nextSection && nextSection !== section) navigate(`/app/friends/${nextSection}`);
            }}
          >
            {Object.entries(friendSections).map(([key, item]) => {
              const Icon = item.icon;
              return <ToggleGroupItem key={key} value={key} className="h-12 grow gap-2 px-3 hover:bg-muted/50 aria-pressed:hover:bg-muted">
                <Icon aria-hidden="true" />
                {item.label}
              </ToggleGroupItem>;
            })}
          </ToggleGroup>
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
                      <ProfileMoodCaption level={person.publicMood} />
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

const BROWSER_WISHLIST_PROVIDERS = EXTERNAL_WISHLIST_PROVIDERS.filter(({ browserFavoritesUrl }) => browserFavoritesUrl);

function ProfileSettingsModal({ user, onClose, onSaved, onMoodSaved, onProfileUpdated, onWishlistsImported, finalFocus, diskSyncCallback }) {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const logout = useLogout();
  const initialForm = useMemo(() => ({
    name: user.name,
    username: user.username,
    bio: user.bio || "",
    birthday: user.birthday ? String(user.birthday).slice(0, 10) : "",
  }), [user]);
  const [form, setForm] = useState(initialForm);
  const [initialWishlistLinks, setInitialWishlistLinks] = useState(() => user.wishlistLinks || {});
  const [wishlistLinks, setWishlistLinks] = useState(initialWishlistLinks);
  const [validateWishlistLinks, setValidateWishlistLinks] = useState(false);
  const [importingWishlist, setImportingWishlist] = useState(false);
  const browserWishlistRequest = useRef(null);
  const [browserWishlistStatus, setBrowserWishlistStatus] = useState({});
  const [browserWishlistExtensionError, setBrowserWishlistExtensionError] = useState("");
  useEffect(() => () => browserWishlistRequest.current?.abort(), [user.id]);
  const [wishlistImportStatus, setWishlistImportStatus] = useState({});
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const [yandexEnabled, setYandexEnabled] = useState(null);
  const [yandexDiskBackupEnabled, setYandexDiskBackupEnabled] = useState(false);
  const [yandexDiskSyncEnabled, setYandexDiskSyncEnabled] = useState(false);
  const [yandexDiskProfileEnabled, setYandexDiskProfileEnabled] = useState(false);
  const [diskProfileSaving, setDiskProfileSaving] = useState(false);
  const [openRouterBusy, setOpenRouterBusy] = useState(false);
  const [accountsBusy, setAccountsBusy] = useState(false);
  const [mcpKeysBusy, setMcpKeysBusy] = useState(false);
  const [moodBusy, setMoodBusy] = useState(false);
  const [openRouterDraft, setOpenRouterDraft] = useState({ apiKey: "", modelId: null });
  const [section, setSection] = useState(diskSyncCallback ? "yandex" : null);
  const [rootOpen, setRootOpen] = useState(true);
  const pendingExit = useRef(null);
  const sectionTrigger = useRef(null);
  const sectionHeading = useRef(null);
  const scrollArea = useRef(null);
  const sections = [
    { id: "accounts", title: "Аккаунты", icon: Users },
    { id: "personal", title: "Персональная информация", icon: CircleUserRound },
    { id: "mood", title: "Настроение", icon: Smile },
    { id: "contact-card", title: "Визитка и QR-код", icon: QrCode },
    { id: "wishlists", title: "Внешние вишлисты", icon: Heart },
    ...(user.canInvite ? [{ id: "invites", title: "Инвайты", icon: UserPlus }] : []),
    { id: "openrouter", title: "OpenRouter", icon: LockKeyhole },
    { id: "mcp", title: "Ключи MCP", icon: LockKeyhole },
    { id: "yandex", title: "Yandex ID", icon: Fingerprint },
    { id: "rolls", title: "Финансы", icon: ROLLS_SERVICE.icon },
    { id: "gift-cards", title: "Подарочные карты", icon: Gift },
    { id: "orders", title: "Заказы", icon: PackageCheck, path: APP_ORDERS_PATH },
  ];
  const sectionTitle = sections.find(({ id }) => id === section)?.title;
  const yandexSettingsBlocked = Boolean(loading || imageUploading || loggingOut);
  useLayoutEffect(() => {
    if (isMobile) return;
    if (section) {
      scrollArea.current?.querySelector('[data-slot="scroll-area-viewport"]')?.scrollTo({ top: 0, behavior: "instant" });
      sectionHeading.current?.focus({ preventScroll: true });
    } else sectionTrigger.current?.focus();
  }, [isMobile, section]);
  const imageFileRef = useRef(null);
  const changedWishlists = EXTERNAL_WISHLIST_PROVIDERS.filter(({ id }) => (wishlistLinks[id]?.trim() || "") !== (initialWishlistLinks[id] || ""));
  const profileChanged = Object.keys(initialForm).some((key) => form[key] !== initialForm[key]);
  const changed = profileChanged || changedWishlists.length > 0;
  const sourceParams = new URLSearchParams(location.search);
  sourceParams.delete("formScreen");
  sourceParams.delete("diskSync");
  const yandexLinkNext = safeNextPath(`${location.pathname}${sourceParams.size ? `?${sourceParams}` : ""}`);
  const accountReturnPath = safeNextPath(`${location.pathname}${sourceParams.size ? `?${sourceParams}` : ""}${location.hash}`);
  const addAccountHref = `/login?${new URLSearchParams({ add_account: "1", next: accountReturnPath })}`;
  const yandexLinkHref = yandexAuthStartPath(yandexLinkNext, { link: true });
  const diskSync = useDiskSyncSettings({
    active: section === "yandex" && yandexDiskSyncEnabled && !yandexSettingsBlocked && !changed,
    ownerId: user.id, next: yandexLinkNext, callback: diskSyncCallback, onNavigate: (path) => leaveSettingsFor(path),
  });
  const busy = loading || importingWishlist || imageUploading || loggingOut || openRouterBusy || accountsBusy || mcpKeysBusy || diskProfileSaving || moodBusy || diskSync.busy;
  const yandexLinkBlocked = changed || yandexSettingsBlocked || diskProfileSaving || diskSync.busy;
  useEffect(() => {
    let active = true;
    api.get("/auth/yandex/config")
      .then((config) => {
        if (!active) return;
        setYandexEnabled(Boolean(config.enabled));
        setYandexDiskBackupEnabled(Boolean(config.diskBackupEnabled));
        setYandexDiskSyncEnabled(Boolean(config.diskSyncEnabled));
        setYandexDiskProfileEnabled(Boolean(config.diskProfileEnabled));
      })
      .catch(() => { if (active) setYandexEnabled(false); });
    return () => { active = false; };
  }, []);
  const uploadAvatar = async (file) => {
    if (!file || busy) return;
    if (imageFileRef.current) imageFileRef.current.value = "";
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
    let uploadId;
    try {
      const upload = await api.uploadImage(file);
      uploadId = upload.id;
      const result = await api.patch("/me", { avatarUrl: upload.imageUrl });
      onProfileUpdated(result.user);
      toast("Фото профиля обновлено");
    } catch (error) {
      // A lost response can hide a successful save. Only clean up a rejected upload reference.
      if (uploadId && (error.status === 400 || error.status === 409)) {
        await api.delete(`/uploads/images/${encodeURIComponent(uploadId)}`).catch(() => {});
      }
      setImageError(error.message || "Не удалось обновить фотографию.");
    } finally {
      setImageUploading(false);
    }
  };
  const backToSections = () => {
    if (!busy) setSection(null);
  };
  const close = () => {
    if (busy) return;
    onClose();
  };
  const exitSettings = (afterClose) => {
    if (!isMobile) {
      afterClose(onSaved);
      return;
    }
    // Unwind the native form entries before changing the profile or route.
    pendingExit.current = afterClose;
    if (section) setSection(null);
    else setRootOpen(false);
  };
  const leaveSettingsFor = (path) => exitSettings(() => {
    onClose();
    navigate(path);
  });
  const submit = async (event) => {
    event.preventDefault();
    if (busy || !profileChanged) return;
    const payload = {};
    Object.keys(initialForm).forEach((key) => {
      if (form[key] === initialForm[key]) return;
      payload[key] = key === "birthday" ? form[key] || null : form[key];
    });
    setLoading(true);
    try {
      const result = await api.patch("/me", payload);
      toast("Профиль обновлён");
      exitSettings((saveProfile) => saveProfile(result.user));
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };
  const importWishlists = async (providers) => {
    setImportingWishlist(true);
    const results = await Promise.all(providers.map(async ({ id }) => {
      const setStatus = (message) => setWishlistImportStatus((current) => ({ ...current, [id]: message }));
      setStatus("Загружаем список…");
      try {
        const { added, skipped, partial } = await api.post(`/me/wishlist-import/${id}`);
        const message = added ? `Добавлено в «Товары»: ${added}.` : skipped ? "Новых позиций среди прочитанных нет." : "Список пуст.";
        setStatus(partial ? `${message} Сервис отдал только первую страницу списка.` : message);
        return added;
      } catch (error) {
        setStatus(error.message);
        return 0;
      }
    }));
    if (results.some(Boolean)) onWishlistsImported?.();
    setImportingWishlist(false);
  };
  const importBrowserWishlist = async (provider) => {
    if (busy || browserWishlistRequest.current) return;
    const request = new AbortController();
    browserWishlistRequest.current = request;
    setImportingWishlist(true);
    const setStatus = (text, openStore = false) =>
      setBrowserWishlistStatus((current) => ({ ...current, [provider.id]: { text, openStore } }));
    setStatus("Читаем избранное и списки…");
    try {
      const { items } = await requestBrowserWishlist(provider.id, { signal: request.signal });
      request.signal.throwIfAborted();
      setBrowserWishlistExtensionError("");
      if (!items.length) {
        setStatus("В избранном и списках нет товаров.");
        return;
      }
      const { added, skipped } = await api.post(`/me/browser-wishlist-import/${provider.id}`, { ownerId: user.id, items });
      if (request.signal.aborted) return;
      setStatus(added ? `Добавлено в «Товары»: ${added}. Уже было в Rollapp: ${skipped}.` : "Все найденные товары уже в Rollapp.");
      if (added) onWishlistsImported?.();
    } catch (error) {
      if (!request.signal.aborted) {
        const missingExtension = error.code === "helper_unavailable";
        setBrowserWishlistExtensionError(missingExtension ? error.message : "");
        setStatus(missingExtension ? "" : error.message, error.code === "marketplace_access_required");
      }
    } finally {
      if (browserWishlistRequest.current === request) {
        browserWishlistRequest.current = null;
        if (!request.signal.aborted) setImportingWishlist(false);
      }
    }
  };
  const submitWishlists = async (event) => {
    event.preventDefault();
    if (busy || !changedWishlists.length) return;
    const invalidWishlist = changedWishlists.find((provider) => wishlistLinks[provider.id]?.trim()
      && !externalWishlistUrl(provider, wishlistLinks[provider.id]));
    if (invalidWishlist) {
      setValidateWishlistLinks(true);
      event.currentTarget.querySelector(`#settings-wishlist-${invalidWishlist.id}`)?.focus();
      return;
    }
    const links = Object.fromEntries(changedWishlists.map((provider) => [
      provider.id, externalWishlistUrl(provider, wishlistLinks[provider.id]),
    ]));
    setLoading(true);
    try {
      const { user: savedUser } = await api.patch("/me", { wishlistLinks: links });
      const savedLinks = savedUser.wishlistLinks || {};
      setInitialWishlistLinks(savedLinks);
      setWishlistLinks(savedLinks);
      setValidateWishlistLinks(false);
      onProfileUpdated(savedUser);
      toast("Внешние вишлисты сохранены");
      const imports = changedWishlists.filter(({ id, importsItems }) => importsItems && links[id] && savedLinks[id]);
      if (imports.length) await importWishlists(imports);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };
  const wishlistsFooter = section === "wishlists" && (
    <DrawerFooter className="mx-auto w-full max-w-full">
      <ShadcnButton type="submit" form="profile-wishlists-form" disabled={!changedWishlists.length || busy} aria-busy={loading || undefined}>
        {loading && <Spinner />}
        Сохранить
      </ShadcnButton>
    </DrawerFooter>
  );
  const menu = <div className="flex flex-col gap-4 px-4 pt-4 pb-1">
    <div className="flex flex-col gap-2" role="group" aria-label="Фото профиля">
      <ShadcnButton
        type="button"
        variant="ghost"
        size="icon"
        className="size-36 self-center cursor-pointer rounded-full border-0 p-0 hover:bg-transparent dark:hover:bg-transparent"
        aria-label="Изменить фото профиля"
        aria-busy={imageUploading || undefined}
        disabled={busy}
        onClick={() => imageFileRef.current?.click()}
      >
        <Avatar user={user} size="xl" className="!size-full" aria-hidden="true" />
      </ShadcnButton>
      <p className="w-full text-center font-semibold wrap-anywhere">{user.name}</p>
      <Input ref={imageFileRef} hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => uploadAvatar(event.target.files?.[0])} />
      {imageError && <FieldError>{imageError}</FieldError>}
    </div>
    <nav aria-label="Разделы профиля">
      <ul className="divide-y">
        {sections.map(({ id, title, icon: Icon, path }) => <li key={id}>
          <ShadcnButton
            type="button"
            variant="ghost"
            className="h-auto min-h-12 w-full justify-start gap-2 rounded-none px-0 py-3 text-start whitespace-normal hover:bg-transparent hover:text-inherit dark:hover:bg-transparent"
            disabled={busy || (changed && (Boolean(path) || id === "rolls" || id === "gift-cards"))}
            onClick={(event) => {
              if (path) leaveSettingsFor(path);
              else {
                sectionTrigger.current = event.currentTarget;
                setSection(id);
              }
            }}
          >
            <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1">{title}</span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </ShadcnButton>
        </li>)}
      </ul>
    </nav>
    {changed && <p className="text-xs text-muted-foreground">Сохраните изменения перед переходом в другой раздел приложения.</p>}
  </div>;
  const sectionBody = section === "personal" ? (
    <form id="profile-editor-form" className="flex flex-col gap-4 px-4 pt-4 pb-1" onSubmit={submit}>
      <FieldGroup className="gap-4">
        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="settings-profile-name">{user.accountType === "business" ? "Название бизнеса" : "Имя"}</FieldLabel>
            <Input id="settings-profile-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="settings-profile-address">Адрес профиля</FieldLabel>
            <InputGroup className="min-w-0">
              <InputGroupAddon align="inline-start" className="shrink-0">
                <InputGroupText className="text-rollapp-body!" aria-hidden="true">роллапп.рф/</InputGroupText>
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
          <FieldLabel htmlFor="settings-profile-bio">{user.accountType === "business" ? "Описание бизнеса" : "О себе"}</FieldLabel>
          <Textarea id="settings-profile-bio" rows={4} maxLength={300} value={form.bio} placeholder={user.accountType === "business" ? undefined : "Что вам нравится?"} onChange={(event) => setForm({ ...form, bio: event.target.value })} />
        </Field>
        <Field className="sm:max-w-[calc(50%-0.5rem)]">
          <FieldLabel htmlFor="settings-profile-birthday">День рождения</FieldLabel>
          <PlanningDatePicker id="settings-profile-birthday" label="День рождения" clearable max={localDateKey(new Date())} value={form.birthday} onChange={(date) => setForm({ ...form, birthday: date })} className="w-full justify-between" />
        </Field>
      </FieldGroup>
      <Card className="grid gap-2 p-4">
        <h3>Номер участника</h3>
        <p>{user.memberNumber ? `Ваш номер — #${user.memberNumber}` : "Ваш номер ещё не выбран."}</p>
        {!user.memberNumber && (yandexLinkBlocked
          ? <p>Сохраните или отмените изменения профиля перед выбором номера.</p>
          : <ShadcnButton type="button" variant="outline" className="min-h-(--layout-control-size) rounded-full" onClick={() => exitSettings(() => { onClose(); navigate("/app/member-number"); })}>Получить номер</ShadcnButton>)}
      </Card>
    </form>
  ) : section === "wishlists" ? (
    <form id="profile-wishlists-form" onSubmit={submitWishlists}>
      <section className="grid min-w-0 gap-6 p-4" aria-label={sectionTitle}>
        <section className="grid min-w-0 gap-4" aria-labelledby="settings-wishlist-links-heading">
          <header className="typeset typeset-rollapp">
            <h3 id="settings-wishlist-links-heading">Ссылки на вишлисты</h3>
            <p className="text-muted-foreground">Вставьте ссылки из меню «Поделиться».</p>
          </header>
          <FieldGroup className="gap-4">
            {EXTERNAL_WISHLIST_PROVIDERS.map((provider) => {
              const id = `settings-wishlist-${provider.id}`;
              const value = wishlistLinks[provider.id] || "";
              const invalid = validateWishlistLinks && Boolean(value.trim()) && !externalWishlistUrl(provider, value);
              const canReimport = provider.importsItems && initialWishlistLinks[provider.id];
              return (
                <Field key={provider.id} className="min-w-0" data-invalid={invalid || undefined}>
                  <FieldLabel htmlFor={id}>{provider.label}</FieldLabel>
                  <div className="flex min-w-0 items-center gap-2">
                    <Input
                      id={id}
                      className="min-w-0 flex-1"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={EXTERNAL_WISHLIST_URL_MAX_LENGTH}
                      placeholder="https://"
                      value={value}
                      disabled={busy}
                      aria-invalid={invalid || undefined}
                      aria-describedby={invalid ? `${id}-error` : undefined}
                      onChange={(event) => {
                        setWishlistLinks({ ...wishlistLinks, [provider.id]: event.target.value });
                        if (provider.importsItems) setWishlistImportStatus((current) => ({ ...current, [provider.id]: "" }));
                      }}
                    />
                    {canReimport && (
                      <ControlBar className="flex shrink-0">
                        <ShadcnButton
                          type="button"
                          variant="outline"
                          size="icon"
                          data-control-icon=""
                          aria-label={`Импортировать позиции · ${provider.label}`}
                          title={`Повторить импорт из ${provider.label}`}
                          disabled={busy || value.trim() !== initialWishlistLinks[provider.id]}
                          onClick={() => importWishlists([provider])}
                        >
                          <RotateCcw aria-hidden="true" />
                        </ShadcnButton>
                      </ControlBar>
                    )}
                  </div>
                  {invalid && <FieldError id={`${id}-error`}>Вставьте HTTPS-ссылку на вишлист {provider.label}.</FieldError>}
                  {canReimport && <p role="status" className={cn("text-xs text-muted-foreground", !wishlistImportStatus[provider.id] && "sr-only")}>{wishlistImportStatus[provider.id]}</p>}
                </Field>
              );
            })}
          </FieldGroup>
          <p className="text-xs text-muted-foreground">После сохранения списки OhMyWishes и Яндекс Маркета импортируются в «Товары» как приватные позиции.</p>
        </section>
        <Accordion className="min-w-0 rounded-xl border bg-card px-3">
          <AccordionItem value="browser-import">
            <AccordionTrigger headerAs="h3" className="min-h-(--layout-control-size) items-center gap-2 px-1 text-rollapp-body! hover:no-underline">
              Импорт из браузера
            </AccordionTrigger>
            <AccordionContent className="px-1 pb-4">
              <div className="grid min-w-0 gap-3">
                <div role="status" className="text-rollapp-body text-muted-foreground">
                  {browserWishlistExtensionError || "Войдите в магазин в Chrome или Comet с расширением Rollapp. Избранное и личные списки добавятся в «Товары» как приватные позиции."}
                </div>
                <ul className="flex flex-wrap gap-2">
                  {BROWSER_WISHLIST_PROVIDERS.map((provider) => (
                    <li key={provider.id}>
                      <PageActionButton
                        type="button"
                        variant="outline"
                        disabled={busy}
                        aria-label={`Импортировать все списки · ${provider.label}`}
                        onClick={() => importBrowserWishlist(provider)}
                      >
                        {provider.label}
                      </PageActionButton>
                    </li>
                  ))}
                </ul>
                {BROWSER_WISHLIST_PROVIDERS.map((provider) => {
                  const status = browserWishlistStatus[provider.id];
                  return (
                    <div key={provider.id} role="status" className={cn("rollapp-body grid min-w-0 gap-1 wrap-anywhere", !status?.text && "sr-only")}>
                      {status?.text && <>
                        <strong>{provider.label}</strong>
                        <span>{status.text}</span>
                        {status.openStore && <a href={provider.browserFavoritesUrl} target="_blank" rel="noopener noreferrer">
                          Открыть избранное в {provider.id === "yandex-market" ? "Яндекс Маркете" : provider.label}
                        </a>}
                      </>}
                    </div>
                  );
                })}
                <div className="grid gap-1">
                  <a className="w-fit rollapp-body" href="/rollapp-browser-extension.zip" download>Скачать расширение Rollapp</a>
                  <span className="text-xs text-muted-foreground">Распакуйте архив и загрузите папку на странице расширений в режиме разработчика.</span>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>
      {isMobile && wishlistsFooter}
    </form>
  ) : section === "rolls" ? <RollsWallet key={user.id} user={user} embedded onWishlistsImported={onWishlistsImported} />
    : section === "gift-cards" ? <ProfileGiftCards key={user.id} user={user} onNavigate={leaveSettingsFor} />
    : section === "invites" ? <ProfileInvites /> : section === "yandex" ? <div className="grid gap-3 px-4 pt-4">
    <Card className="grid gap-3 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{user.hasYandex ? "Подключён к аккаунту — можно входить без пароля." : "Подключите быстрый и безопасный вход через Яндекс."}</p>
        </div>
        {user.hasYandex && <Badge variant="secondary">Подключён</Badge>}
      </div>
      {!user.hasYandex && yandexEnabled === null && <p className="text-sm text-muted-foreground" role="status">Проверяем доступность Yandex ID…</p>}
      {!user.hasYandex && yandexEnabled === false && <p className="text-sm text-muted-foreground">Подключение Yandex ID сейчас недоступно.</p>}
      {!user.hasYandex && yandexEnabled && yandexLinkBlocked && <p className="text-sm text-muted-foreground">Сохраните или отмените изменения профиля перед подключением.</p>}
      {!user.hasYandex && yandexEnabled && yandexDiskSyncEnabled && !yandexLinkBlocked &&
        <a href={yandexLinkHref} className="underline underline-offset-4">Подключить Яндекс ID для входа</a>}
      {user.hasYandex && yandexDiskSyncEnabled && changed &&
        <p className="text-sm text-muted-foreground">Сохраните или отмените изменения профиля перед настройкой синхронизации.</p>}
      {yandexDiskBackupEnabled && (
        <p className="rollapp-body">Если вы разрешите доступ к Диску, Rollapp сохранит копию данных и загруженных файлов в папку ROLLAPP.</p>
      )}
      {user.hasYandex && yandexDiskBackupEnabled && yandexLinkBlocked && (
        <p className="rollapp-body">Сохраните или отмените изменения профиля перед копированием.</p>
      )}
    </Card>
    {yandexDiskSyncEnabled
      ? !changed && diskSync.body
      : !yandexLinkBlocked && <PrivateNotesLink onNavigate={leaveSettingsFor} />}
    {!changed && !yandexSettingsBlocked && (yandexDiskProfileEnabled || user.diskProfile) && <DiskProfileSettings ownerId={user.id} onProfileUpdated={onProfileUpdated} onBusyChange={setDiskProfileSaving} />}
  </div> : null;
  const openRouterSection = section === "openrouter" && (
    <OpenRouterSettings
      key={user.id}
      draft={openRouterDraft}
      onDraftChange={setOpenRouterDraft}
      disabled={loading || imageUploading || loggingOut}
      onBusyChange={setOpenRouterBusy}
    />
  );
  const personalFooter = section === "personal" && (
    <DrawerFooter className="mx-auto w-full max-w-full">
      <ShadcnButton
        type="submit"
        form="profile-editor-form"
        disabled={!profileChanged || busy}
        aria-busy={loading || undefined}
      >
        {loading && <Spinner />}
        Сохранить
      </ShadcnButton>
      <ShadcnButton
        data-control-icon=""
        type="button"
        variant="destructive"
        size="icon"
        aria-label="Выйти на этом устройстве"
        title="Выйти на этом устройстве"
        disabled={busy}
        aria-busy={loggingOut || undefined}
        onClick={async () => {
          if (busy) return;
          setLoggingOut(true);
          const loggedOut = await logout();
          if (!loggedOut) setLoggingOut(false);
        }}
      >
        {loggingOut ? <Spinner /> : <LogOut aria-hidden="true" />}
      </ShadcnButton>
    </DrawerFooter>
  );
  const yandexFooter = section === "yandex" && (
    <DrawerFooter>
      {!yandexDiskSyncEnabled && yandexEnabled && !yandexLinkBlocked && (!user.hasYandex || yandexDiskBackupEnabled) && (user.hasYandex
        ? <a data-slot="button" className={buttonVariants()} href={yandexLinkHref} aria-label="Создать резервную копию на Яндекс Диске">Сделать копию</a>
        : <a data-slot="button" className={buttonVariants()} href={yandexLinkHref} aria-label="Войти с Яндекс ID и подключить его к аккаунту">Подключить Яндекс ID</a>)}
      {yandexDiskSyncEnabled && !changed && !yandexSettingsBlocked && !diskProfileSaving && diskSync.actions}
    </DrawerFooter>
  );
  const desktopSection = !isMobile && section;
  const fullSection = (section === "accounts" && <ProfileAccounts Avatar={Avatar} addHref={addAccountHref} home={APP_HOME}
    changed={changed || Boolean(openRouterDraft.apiKey || openRouterDraft.modelId)}
    blocked={loading || importingWishlist || imageUploading || loggingOut || openRouterBusy}
    onBusyChange={setAccountsBusy} isMobile={isMobile} />)
    || openRouterSection
    || (section === "mood" && <ProfileMoodSettings user={user} onSaved={onMoodSaved} onBusyChange={setMoodBusy} />)
    || (section === "mcp" && <ProfileMcpKeys key={user.id} onBusyChange={setMcpKeysBusy} />)
    || (section === "contact-card" && <ContactCardContent key={user.username} profile={user} canSign />);
  const sectionOwnsScroll = Boolean(desktopSection && (fullSection || desktopSection === "rolls"));
  return <>
    <Drawer open={rootOpen} showSwipeHandle swipeDirection={isMobile ? "down" : "right"} onOpenChange={(open) => {
      if (!open) {
        if (desktopSection) backToSections();
        else close();
      }
    }} onAfterClose={() => {
      const exit = pendingExit.current;
      pendingExit.current = null;
      exit?.(onSaved);
    }}>
      <DrawerContent className="profile-settings-dialog rollapp-body app-drawer--form" finalFocus={finalFocus}>
        {!desktopSection && <DrawerClose
          render={<ShadcnButton variant="ghost" className="absolute top-2 right-2 z-10 size-12" size="icon-sm" />}
        >
          <X />
          <span className="sr-only">Закрыть</span>
        </DrawerClose>}
        {desktopSection ? <DrawerSectionHeader title={sectionTitle} titleRef={sectionHeading} borderless={desktopSection === "accounts"} startAction={
          <ShadcnButton data-control-icon="" type="button" variant="outline" size="icon" aria-label="Назад" disabled={busy} onClick={backToSections}>
            <ArrowLeft aria-hidden="true" />
          </ShadcnButton>
        } /> : <DrawerHeader className={cn("mx-auto w-full max-w-full", !isMobile && "h-14 p-0")}>
          {isMobile ? <DrawerTitle>Настройки профиля</DrawerTitle> : <DrawerTitle className="sr-only">Изменить профиль</DrawerTitle>}
          <DrawerDescription className="sr-only">Редактирование данных профиля.</DrawerDescription>
        </DrawerHeader>}
        <ScrollArea ref={scrollArea} hidden={sectionOwnsScroll} className="mx-auto min-h-0 w-full max-w-full flex-1">
          <div hidden={Boolean(desktopSection)}>{menu}</div>
          {desktopSection && !sectionOwnsScroll && sectionBody}
        </ScrollArea>
        {desktopSection ? fullSection || (desktopSection === "rolls" ? sectionBody : personalFooter || wishlistsFooter || yandexFooter) : isMobile && <DrawerFooter />}
      </DrawerContent>
    </Drawer>
    {isMobile && <Drawer open={Boolean(section)} onOpenChange={(open) => { if (!open) backToSections(); }} onAfterClose={() => {
      if (pendingExit.current) setRootOpen(false);
      else requestAnimationFrame(() => {
        const trigger = sectionTrigger.current;
        if (trigger && !trigger.closest("[hidden]")) trigger.focus({ preventScroll: true });
      });
    }}>
      <DrawerContent className="rollapp-body app-drawer--form">
        <DrawerSectionHeader title={sectionTitle} />
        {fullSection || <>
          {sectionBody}
          {section !== "wishlists" && section !== "rolls" && (personalFooter || yandexFooter || <DrawerFooter />)}
        </>}
      </DrawerContent>
    </Drawer>}
  </>;
}

function PublicWishGrid({ wishes, allWishes, groups = [], detailsOpen = false, initialGroupId = null, visibleLimit, ownerCollection, onReorder, onOpen, viewerId, ...cardProps }) {
  const [openedGroupId, setOpenedGroupId] = useState(initialGroupId);
  useEffect(() => { setOpenedGroupId(initialGroupId); }, [initialGroupId]);
  const openedGroup = groups.find((group) => group.id === openedGroupId);
  const toast = useToast();
  const { gridRef, orderedWishes, cardProps: dragProps, suppressClickRef, saving } = useWishReorder({
    wishes: allWishes,
    visibleWishes: wishes,
    enabled: ownerCollection && groups.length === 0,
    onSave: onReorder,
    onError: (error) => toast(error.message || "Не удалось сохранить порядок желаний", "error"),
  });
  const openedGroupWishes = openedGroup ? orderedWishes.filter((wish) => openedGroup.wishIds.includes(wish.id)) : [];
  const renderWish = (wish) => <WishCard
    key={wish.id}
    {...cardProps}
    {...dragProps(wish.id)}
    wish={wish}
    onOpen={(opener) => { if (!suppressClickRef.current) onOpen(wish.id, opener, openedGroupId); }}
    onEdit={ownerCollection ? () => cardProps.onEdit(wish.id) : undefined}
    onCreateList={ownerCollection ? () => cardProps.onCreateList(wish.id) : undefined}
  />;
  return <>
    <div className="wish-grid" ref={gridRef} aria-busy={saving || undefined}>
      {buildWishGroupGridItems({ wishes: orderedWishes, groups }).slice(0, visibleLimit).map((item) => item.type === "group"
        ? <WishGroupTile key={item.id} group={item.group} wishes={item.wishes} onOpen={() => setOpenedGroupId(item.id)} />
        : renderWish(item.wish))}
    </div>
    {openedGroup && <GroupDialog onClose={() => setOpenedGroupId(null)} suspended={detailsOpen} className="wish-group-open" aria-label={`Группа «${openedGroup.title}»`}>
      <WishGroupHeader
        group={openedGroup}
        viewerId={viewerId}
        shareToken={cardProps.shareToken}
        description={`${openedGroupWishes.length} ${wishCountNoun(openedGroupWishes.length)}`}
      />
      <div className="wish-grid">{openedGroupWishes.map(renderWish)}</div>
    </GroupDialog>}
  </>;
}

function PublicProfile({ shared = false }) {
  const params = useParams();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: sessionLoading } = useSession();
  const { openProfileEditor, wishlistVersion } = useProfileEditor();
  const toast = useToast();
  const globalShareRef = useGlobalShareHandler();
  const { setCollection } = useContext(CollectionNavigationContext);
  const endpoint = shared ? "/shared/" + params.token : "/profile/" + params.username;
  const viewerId = user?.id;
  const { data, loading, error, reload, updateData } = useAsync(async () => ({
    ...await api.get(endpoint), requestEndpoint: endpoint, viewerId,
  }), [endpoint, user, wishlistVersion]);
  const publication = profilePublicationSection(params.space);
  const publicationListId = publication ? location.state?.publicationListId : null;
  const selected = shared ? "all" : params.listId || publicationListId || (params.wishId ? location.state?.listId : null) || "all";
  const requestedSpace = (!publication && params.space) || new URLSearchParams(location.search).get("tab") || (params.wishId ? location.state?.collectionSpace : null);
  const defaultSpace = !shared && data?.profile?.accountType === "business" ? data.profile.sellerSpace : null;
  const selectedSpace = SPACE_IDS.includes(requestedSpace) ? requestedSpace : SPACE_IDS.includes(defaultSpace) ? defaultSpace : "products";
  const [selectedWishId, setSelectedWishId] = useState(params.wishId || null);
  const [editingWishId, setEditingWishId] = useState(null);
  const [listModal, setListModal] = useState(null);
  const listSettingsTriggerRef = useRef(null);
  const [wishModalOpen, setWishModalOpen] = useState(false);
  const [wishModalSpace, setWishModalSpace] = useState("products");
  const [visibleLimit, setVisibleLimit] = useState(20);
  const loadMoreRef = useRef(null);
  const lastWishOpenerRef = useRef(null);

  useEffect(() => { setSelectedWishId(params.wishId || null); }, [params.wishId, endpoint]);
  useEffect(() => { setVisibleLimit(20); }, [selected, selectedSpace, endpoint]);
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisibleLimit((value) => value + 20);
    }, { rootMargin: "500px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visibleLimit, data, selected, selectedSpace, publication]);

  useEffect(() => {
    const lists = shared ? [data?.list].filter(Boolean) : data?.lists || [];
    const list = lists.find((item) => item.id === (params.listId || publicationListId)) || (shared ? data?.list : null);
    const wish = [...(data?.wishes || []), ...(data?.sharedWishes || [])].find((item) => item.id === params.wishId);
    setCollection({ pathname: location.pathname, space: list ? listSpace(list) : wish ? wishSpaceId(wish, lists) : selectedSpace });
    return () => setCollection(null);
  }, [data, params.listId, params.wishId, publicationListId, shared, selectedSpace, location.pathname, setCollection]);

  useEffect(() => {
    if (shared || loading || data?.requestEndpoint !== endpoint || !data?.profile?.username || !params.username || params.username === data.profile.username) return;
    navigate(renamedProfileLocation(location, params.username, data.profile.username), { replace: true, state: location.state });
  }, [data?.profile?.username, data?.requestEndpoint, endpoint, loading, shared, params.username, location, navigate]);

  const renderCollectionState = ({ title, text, returnPath = APP_HOME, returnLabel = "В приложение", friendsContext = !shared }) => {
    const page = <div className="app-page wishes-page public-collection-page" data-public-collection-state>
      <div className="app-shell-chrome-spacer" aria-hidden="true" />
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

  if (loading || sessionLoading || (data && (data.requestEndpoint !== endpoint || data.viewerId !== viewerId))) return <LoadingScreen />;
  if (error && !data && publication) return <ProfilePublicationsPage key={publication} section={publication} username={params.username} user={user} />;
  if (error && !data) return renderCollectionState({ title: "Такой список не нашёлся", text: error.message });

  const lists = shared ? [data.list] : data.lists;
  const visibleWishes = data.isOwner
    ? data.wishes
    : data.wishes.filter((wish) => wish.status === "active");
  const sharedWishes = data.isOwner && !shared ? data.sharedWishes || [] : [];
  const detailWishes = [...visibleWishes, ...sharedWishes];
  const routeWish = params.wishId ? detailWishes.find((wish) => wish.id === params.wishId) : null;
  const routeList = lists.find((list) => list.id === selected) || (routeWish && !location.state?.collectionPath ? lists.find((list) => !isGeneralList(list) && routeWish.listIds.includes(list.id)) : null);
  const routeSelectedList = routeList && !isGeneralList(routeList) ? routeList : null;
  const activeSpace = routeSelectedList ? listSpace(routeSelectedList) : routeWish ? wishSpaceId(routeWish, lists) : selectedSpace;
  const spaceSharedWishes = sharedWishes.filter((wish) => wish.space === activeSpace);
  const navigationLists = shared ? lists : orderWishListsForNavigation(lists.filter((list) => !isGeneralList(list) && listSpace(list) === activeSpace));
  const listsById = new Map(lists.map((list) => [list.id, list]));
  const spaceWishes = shared ? visibleWishes : visibleWishes.filter((wish) => wishBelongsToSpace(wish, listsById, activeSpace));
  const unlistedWishes = shared ? spaceWishes : filterWishesWithoutList(spaceWishes, lists.filter((list) => !isGeneralList(list)));
  const ownerCollection = data.isOwner && !shared;
  const showAllCollection = shared || shouldShowUnsortedList(unlistedWishes.length) || navigationLists.length === 0;
  const selectedValue = resolveVisibleListSelection(routeSelectedList?.id || "all", navigationLists, showAllCollection);
  const selectedList = navigationLists.find((list) => list.id === selectedValue) || null;
  const wishes = shared
    ? visibleWishes
    : selectedValue === "all"
      ? unlistedWishes
      : spaceWishes.filter((wish) => wish.listIds.includes(selectedValue));
  const selectedWish = selectedWishId ? detailWishes.find((wish) => wish.id === selectedWishId) : null;
  const editingWish = editingWishId ? data.wishes.find((wish) => wish.id === editingWishId) : null;
  const invalidSelection = (params.space && !publication && !SPACE_IDS.includes(params.space)) || (!shared && params.listId && !routeList) || (params.wishId && !selectedWish);
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
    : params.wishId && location.state?.collectionPath?.startsWith(`${profileBasePath}/`)
      ? location.state.collectionPath
      : selectedList && (params.listId || params.wishId || publicationListId)
        ? publicListPath(data.profile.username, selectedList.id)
        : publicSpacePath(data.profile.username, activeSpace);

  const selectCollection = (value) => {
    setSelectedWishId(null);
    if (shared) return;
    navigate(value === "all" ? publicSpacePath(data.profile.username, activeSpace) : publicListPath(data.profile.username, value));
  };

  const openWish = (id, opener = null, groupId = null) => {
    lastWishOpenerRef.current = opener;
    setSelectedWishId(id);
    navigate(`${profileBasePath}/wishes/${encodeURIComponent(id)}`, { state: { listId: selectedList?.id, collectionSpace: activeSpace, collectionPath: currentCollectionPath, groupId } });
  };

  const closeWish = () => {
    const wishId = selectedWishId;
    const opener = lastWishOpenerRef.current;
    setSelectedWishId(null);
    const destination = location.state?.fromWishlistBoard ? `${APP_HOME}?tab=${activeSpace}` : currentCollectionPath;
    navigate(destination, { replace: true, state: { groupId: location.state?.groupId } });
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
    if (publication) {
      await navigator.clipboard.writeText(`${window.location.origin}${publication === "calendar" ? publicBookingPath(data.profile.username) : publicPublicationPath(data.profile.username, publication)}`);
      toast("Ссылка скопирована");
      return;
    }
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
    const editingList = Boolean(listModal?.id);
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
    await reload({ background: editingList });
    if (!editingList && saved?.id && attached && !shared) selectCollection(saved.id);
  };
  const openListSettings = (id, trigger) => {
    const list = navigationLists.find((entry) => entry.id === id);
    if (!list) return;
    listSettingsTriggerRef.current = trigger;
    setListModal(list);
  };
  const deleteProfileList = async () => {
    setListModal(null);
    if (selectedValue === listModal.id) selectCollection("all");
    await reload({ background: true });
  };

  const profileVisitor = !data.isOwner;
  const relationshipBlock = profileVisitor && !shared && <dl className="wishes-page__friend-links friend-profile-page__stats" aria-label="Связи профиля">
      <div><dt>Подписки</dt><dd>{data.followingCount}</dd></div>
      <div><dt>Подписчики</dt><dd>{data.followersCount}</dd></div>
    </dl>;
  const businessProfile = !shared && data.profile.accountType === "business";
  const businessStorefront = businessProfile && !params.listId && !params.wishId;
  const sellerProfile = businessStorefront && data.profile.businessCategory === "seller";
  const sellerSpace = activeSpace;
  const managesStorefront = sellerProfile && data.isOwner && user?.id === data.profile.id
    && canManageWishlistSpace(user, sellerSpace);
  const moodLevel = data.isOwner && data.profile.id === user?.id ? user.moodLevel ?? user.publicMood : data.profile.publicMood;
  const identity = (
    <div className="wishes-page__identity friend-profile-page__identity">
      {data.isOwner ? <ShadcnButton
        type="button"
        variant="ghost"
        className={cn("h-auto min-h-0 rounded-full p-0", !businessProfile && "persistent-profile-hero__avatar-button hover:bg-transparent dark:hover:bg-transparent active:translate-y-0")}
        aria-label={`Редактировать профиль ${data.profile.name}`}
        title={businessProfile ? undefined : "Редактировать профиль"}
        onClick={openProfileEditor}
      >
        <ProfilePortrait user={data.profile} moodLevel={moodLevel} />
      </ShadcnButton> : <ProfilePortrait user={data.profile} moodLevel={moodLevel} />}
      {businessProfile && <BusinessGiftAction business={data.profile} user={user} />}
      <div className="wishes-page__hero-copy">
        <h1 id="public-profile-name">{data.profile.name}</h1>
        {data.isOwner && <AppFriendsLink memberNumber={data.profile.memberNumber} />}
        <ProfileMoodCaption level={moodLevel} />
        {businessProfile && <span className="text-muted-foreground">Бизнес-аккаунт</span>}
        {businessProfile && data.profile.bio?.trim() && (
          <div className="typeset typeset-rollapp max-w-full">
            <p className="wrap-anywhere whitespace-pre-wrap text-muted-foreground">{data.profile.bio}</p>
          </div>
        )}
      </div>
    </div>
  );
  if (isMobile && selectedWish && !editingWish) {
    return <WishDetailsModal screen wish={selectedWish} owner={data.isOwner && !selectedWish.sharedBy} profile={data.profile} lists={lists} wishes={data.wishes} shareToken={shared ? params.token : ""} onChanged={() => reload({ background: true })} onEdit={ownerCollection ? () => editWish(selectedWish.id) : undefined} onCreateList={ownerCollection ? () => createListForWish(selectedWish.id) : undefined} onClose={closeWish} />;
  }
  const collectionPage = <div className={`app-page wishes-page public-collection-page ${profileVisitor ? "friend-profile-page" : ""}`} data-public-collection>
    <div className="app-shell-chrome-spacer" aria-hidden="true" />

    <section className={`wishes-page__hero public-collection-page__hero ${profileVisitor ? "friend-profile-page__hero" : ""}`} data-friend-profile={profileVisitor && !shared ? "" : undefined} aria-labelledby="public-profile-name">
      {identity}
      {relationshipBlock}
      <ControlBar className={`page-actions wishes-page__hero-actions ${!shared ? "horizontal-action-scroller" : ""} ${profileVisitor ? "friend-profile-page__actions" : ""}`} role="group" aria-label={businessStorefront ? "Действия с бизнес-профилем" : data.isOwner ? "Действия со списком желаний" : "Действия с профилем"}>
        {businessStorefront && data.isOwner ? <>
          <PageActionButton variant="outline" to="/app/business/access">Клиенты</PageActionButton>
        </> : ownerCollection ? null : data.isOwner && shared
          ? <PageActionButton onClick={() => navigate(publicListPath(data.profile.username, data.list.id))}>Открыть мой список</PageActionButton>
          : <PageActionButton
            variant={data.isFollowing ? "secondary" : "default"}
            className="min-w-[180px]"
            type="button"
            aria-pressed={data.isFollowing}
            onClick={follow}
          >{data.isFollowing ? "Отписаться" : "Подписаться"}</PageActionButton>}
        <ContactCardButton key={data.profile.username} profile={data.profile} canSign={data.isOwner} />
        {!shared && <ProfilePublicationLinks activeSection={publication}
          toSection={section => `${publicPublicationPath(data.profile.username, section)}?${new URLSearchParams({ tab: activeSpace })}`}
          state={{ publicationListId: routeSelectedList?.id }} />}
      </ControlBar>
    </section>

    {businessStorefront && !publication && <div className="page-stack">
      <BusinessGiftCertificates business={data.profile} user={user} />
      <section className="page-stack rollapp-body" aria-label="Товары и предложения бизнеса">
        {managesStorefront
          ? <WishlistBusinessManager user={user} space={sellerSpace} />
          : sellerProfile && <WishlistBusinessListing key={`${data.profile.username}:${sellerSpace}`} space={sellerSpace} business={data.profile.username} publicProfile />}
        <BusinessMarketplacePage key={`${data.profile.username}:${user?.id}`} user={user} businessUsername={data.profile.username} kind="store" hideEmpty={sellerProfile} />
      </section>
    </div>}

    {ownerCollection && !publication && !businessStorefront && <AddFab actions={[
      { label: "Добавить желание", onSelect: () => { setWishModalSpace(activeSpace); setWishModalOpen(true); } },
      { label: "Новый список", icon: ListPlus, onSelect: () => setListModal({}) },
    ]} />}
    {!publication && !businessStorefront && shouldShowListNavigation({ shared, listCount: navigationLists.length, unlistedCount: unlistedWishes.length }) && <WishListNavigation
      value={selectedValue}
      className={`public-collection-tabs ${profileVisitor ? "friend-profile-tabs" : ""}`}
      items={shared ? [] : navigationLists.map((list) => ({ id: list.id, title: listDisplayTitle(list), count: wishCountForList(list.id), privateList: ownerCollection && list.privacy === "private" }))}
      leadingItem={showAllCollection ? { title: shared ? listDisplayTitle(data.list) : UNSORTED_LIST_TITLE, count: unlistedWishes.length } : null}
      orderScope={ownerCollection && user?.id && data.profile.id === user.id ? `${user.id}:${activeSpace}` : null}
      onSelect={(id) => {
        if (id) selectCollection(id);
      }}
      onSettings={ownerCollection ? openListSettings : undefined}
      onOrderError={() => toast("Не удалось сохранить порядок списков", "error")}
    />}

    {publication && <ProfilePublicationsPage key={`${data.profile.username}:${user?.id || ""}:${publication}`}
      section={publication} username={data.profile.username} user={user} returnTo={currentCollectionPath} />}
    {!publication && !businessStorefront && (wishes.length
      ? <><PublicWishGrid
        key={`${endpoint}:${activeSpace}:${selectedValue}`}
        wishes={wishes}
        allWishes={data.wishes}
        detailsOpen={Boolean(selectedWish)}
        initialGroupId={location.state?.groupId || null}
        groups={filterWishGroups({ groups: data.groups, listId: shared ? data.list.id : selectedList?.id || lists.find(isGeneralList)?.id, selectedSpace: activeSpace, scopeBySpace: !selectedList, visibleWishIds: new Set(wishes.map((wish) => wish.id)) })}
        visibleLimit={visibleLimit}
        ownerCollection={ownerCollection}
        viewerId={user?.id}
        owner={data.isOwner}
        profile={data.profile}
        lists={lists}
        shareToken={shared ? params.token : ""}
        onChanged={() => reload({ background: true })}
        onOpen={openWish}
        onEdit={editWish}
        onCreateList={(wishId) => setListModal({ attachWishId: wishId })}
        onReorder={async (wishIds) => {
          await api.patch("/wishes/reorder", { wishIds });
          const positions = new Map(wishIds.map((id, index) => [id, index]));
          updateData((current) => ({ ...current, wishes: [...current.wishes].sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity)) }));
        }}
      />{visibleLimit < wishes.length && <div className="wish-load-more" ref={loadMoreRef}><LoaderCircle className="spin" /><span>Загружаем ещё желания…</span></div>}</>
      : !spaceSharedWishes.length && <EmptyState icon={Heart} title="В этом списке пока пусто" text={ownerCollection ? "Добавьте то, что действительно порадует." : "Загляните чуть позже — новая мечта наверняка появится."} />)}
    {!publication && !businessStorefront && <SharedWishes wishes={spaceSharedWishes} profile={data.profile} onOpen={openWish} onChanged={() => reload({ background: true })} />}
    {selectedWish && <WishDetailsModal wish={selectedWish} owner={data.isOwner && !selectedWish.sharedBy} profile={data.profile} lists={lists} wishes={data.wishes} shareToken={shared ? params.token : ""} onChanged={() => reload({ background: true })} onEdit={ownerCollection ? () => editWish(selectedWish.id) : undefined} onCreateList={ownerCollection ? () => createListForWish(selectedWish.id) : undefined} onClose={closeWish} />}
    {editingWish && <WishModal wish={editingWish} space={activeSpace} onClose={() => setEditingWishId(null)} onSaved={async () => { setEditingWishId(null); await reload(); }} onDeleted={async () => { setEditingWishId(null); await reload(); }} />}
    {listModal && <ListModal list={listModal.id ? listModal : null} listsCount={lists.length} space={activeSpace} onClose={() => setListModal(null)} onSaved={saveProfileList} onDeleted={deleteProfileList} returnFocusRef={listModal.id ? listSettingsTriggerRef : undefined} />}
    {wishModalOpen && <WishModal space={wishModalSpace} initialListId={selectedList?.id} onClose={() => setWishModalOpen(false)} onSaved={() => { setWishModalOpen(false); reload(); }} />}
  </div>;

  if (user) return <AppShell friendsContext={!data.isOwner && !shared} collectionChrome>{collectionPage}</AppShell>;
  return <div className="app-layout app-layout--dark public-collection-shell"><main className="app-main app-main--with-profile app-main--wishes">{collectionPage}</main></div>;
}

function NotFound() { return <div className="not-found rollapp-body"><Gift /><h1>Похоже, эта мечта потерялась</h1><p>Страница не существует или ссылка устарела.</p><Link to={APP_HOME} className={buttonVariants()}>В приложение</Link></div>; }

function PublicBookingPage() {
  const { username } = useParams();
  const { user, loading } = useSession();
  if (loading) return <LoadingScreen />;
  return <ProfilePublicationsPage key={`${username}:${user?.id || ""}`} section="calendar" username={username} user={user} />;
}

function ProfilePublicationsPage({ section, username, user, returnTo, showIntro }) {
  const location = useLocation();
  const endpoint = `/profile/${encodeURIComponent(username)}/${section}`;
  const { data, loading, error, reload } = useAsync(() => api.get(endpoint), [endpoint]);
  if (data && data.profile.username !== username && !returnTo) {
    return <Navigate to={renamedProfileLocation(location, username, data.profile.username)} replace />;
  }
  const page = <ProfilePublications {...{ section, endpoint, username, user, data, loading, error, reload, returnTo, showIntro }} />;
  if (returnTo) return page;
  return user
    ? <AppShell friendsContext={!data?.isOwner} collectionChrome>{page}</AppShell>
    : <div className="app-layout app-layout--dark"><main className="app-main app-main--with-profile">{page}</main></div>;
}

function LegacyProfileRedirect() {
  const params = useParams();
  const location = useLocation();
  const suffix = String(params["*"] || "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const target = `${publicProfilePath(params.username)}${suffix ? `/${suffix}` : ""}${location.search}${location.hash}`;
  return <Navigate to={target} replace />;
}

function CatalogBusinessDirectoryScope({ children }) {
  const { pathname, search } = useLocation();
  const { user } = useSession();
  const space = user && pathname === APP_WISH_CATALOG_PATH && isBrandCatalogSearch(search) ? wishlistSpace(search) : null;
  return <BusinessCatalogProvider space={space}>{children}</BusinessCatalogProvider>;
}

function AppPlanningSpaces({ children }) {
  const { user } = useSession();
  return <PlanningSpacesProvider enabled={Boolean(user)}>{children}</PlanningSpacesProvider>;
}

export default function App() {
  useVisualViewport();
  const { pathname, search } = useLocation();
  const linkingResult = pathname === "/login" && new URLSearchParams(search).get("auth_success") === "YANDEX_LINKED";
  return (
    <ToastProvider>
      <SessionProvider>
        <MobileFormPages>
        <ProfileEditorProvider>
          <CollectionNavigationProvider>
          <CatalogBusinessDirectoryScope>
          <AppPlanningSpaces>
          {!linkingResult && <GlobalAppChrome />}
          {!linkingResult && <PlanningFab />}
          <Routes>
            <Route path="/" element={<RootRoute />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<AuthPage recovery="forgot" />} />
            <Route path="/reset-password" element={<AuthPage recovery="reset" />} />
            <Route path="/ideas" element={<Navigate to={APP_HOME} replace />} />
            <Route path="/s/:token/wishes/:wishId" element={<PublicProfile shared />} />
            <Route path="/s/:token" element={<PublicProfile shared />} />
            <Route path={APP_CATALOG_ITEM_ROUTE_PATH} element={<CatalogItemPage />} />
            <Route element={<WishlistSectionLayout />}>
              <Route path={APP_HOME} element={<WishlistHomeRoute />} />
              <Route path={APP_WISH_CATALOG_PATH} element={<WishCatalogPage />} />
              <Route path={APP_STORE_PATH} element={<WishlistStoreRoute />} />
              <Route path={APP_ORDERS_PATH} element={<WishlistStoreRoute ordersOpen />} />
              <Route path={APP_WISH_OFFERS_PATH} element={<WishlistOffersRoute />} />
              <Route path={APP_WISH_SALES_PATH} element={<WishlistSalesRoute />} />
            </Route>
            <Route path={APP_CLASSIFIEDS_PATH} element={<LegacyClassifiedsRedirect />} />
            <Route path={APP_WISH_LISTINGS_PATH} element={<ProtectedWishlistBusiness listings />} />
            <Route path="/app/wishes/business" element={<ProtectedWishlistBusiness />} />
            <Route path={APP_ASSISTANT_PATH} element={<AssistantRoute />} />
            <Route path={APP_SHELL_ROUTE_PATH} element={<ProtectedApp />} />
            <Route path="/u/:username/*" element={<LegacyProfileRedirect />} />
            <Route path="/users/:username/*" element={<LegacyProfileRedirect />} />
            <Route path="/:username" element={<PublicProfile />} />
            <Route path="/:username/calendar/book" element={<PublicBookingPage />} />
            <Route path="/:username/:space" element={<PublicProfile />} />
            <Route path="/:username/lists/:listId" element={<PublicProfile />} />
            <Route path={PUBLIC_WISH_ROUTE_PATH} element={<PublicProfile />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </AppPlanningSpaces>
          </CatalogBusinessDirectoryScope>
          </CollectionNavigationProvider>
        </ProfileEditorProvider>
        </MobileFormPages>
      </SessionProvider>
    </ToastProvider>
  );
}
