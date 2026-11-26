import { Avatar } from "@/modules/profile/profile-avatar.jsx";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { publicProfilePath } from "../../../shared/modules/profile/profile-links.js";
import { cn } from "@/lib/utils";
import { Avatar as ShadcnAvatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { merchantProductUrl } from "../../../shared/modules/catalog-marketplace/product-links.js";
import { Heart, CalendarDays, Car, ExternalLink, Gift, X, LayoutGrid } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button as ShadcnButton, buttonVariants } from "@/components/ui/button";
import { WishlistSnippet } from "@/modules/card/wishlist-snippet.jsx";
import { Spinner } from "@/components/ui/spinner";
import { wishPreviewImageUrl } from "../../../shared/modules/media-import/kinopoisk.js";
import { retailerPreviewImageUrl } from "../../../shared/modules/media-import/retailer-previews.js";
import { isVideoUrl } from "../../../shared/modules/media-import/video-links.js";
import { formatMoney } from "../card/price.jsx";
import { formatEventDate, isYandexMapsUrl } from "../wishlist/wish-form-data.jsx";
import { SPACES } from "../categories/wish-spaces.jsx";
import { ContentPageActions, ContentPage } from "@/components/content-page";
import { Card } from "@/components/ui/card";
import { MarketplaceOffers } from "@/modules/assistant/marketplace-offers.jsx";
import { DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, Drawer, DrawerClose, DrawerContent } from "@/components/form-surface";
import { useIsMobile } from "@/hooks/use-mobile";
import { applyRetailerPreviewFallback } from "../wishlist/wish-preview.jsx";
import { APP_WISH_CATALOG_PATH } from "../shell/app-routing.js";
import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../runtime/api.js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAsync } from "../shell/use-async.jsx";
import { useSession } from "../auth/session.jsx";
import { useToast } from "../shell/toast.jsx";
import { LoadingScreen, EmptyState } from "../shell/page-feedback.jsx";
import { wishlistSpace } from "@/modules/wishlist/wishlist-business.jsx";
import { isBrandCatalogSearch } from "../../../shared/modules/catalog-marketplace/catalog-links.js";
import { BusinessCatalogList } from "@/modules/catalog-marketplace/catalog-brands.jsx";
import { CatalogPageHeader } from "./catalog-page-header.jsx";
import { withWishReward } from "../loyalty/wish-reward.jsx";
import { scheduleDocumentScrollUnlock } from "../shell/document-scroll.jsx";

export const participantCountLabel = (count) => {
  const absolute = Math.abs(Number(count) || 0);
  const lastTwo = absolute % 100;
  const last = absolute % 10;
  if (last === 1 && lastTwo !== 11) return `${absolute} участник`;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${absolute} участника`;
  return `${absolute} участников`;
};

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
            to={publicProfilePath(owner)}
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

export function CatalogWishDetailsContent({ item, wishlistDisabled = false, wishlistPending = false, onToggleWishlist, screen = false }) {
  const isMobile = useIsMobile();
  const Title = screen ? "h1" : DrawerTitle;
  const Description = screen ? "p" : DrawerDescription;
  const space = SPACES.find((entry) => entry.id === item.space) || SPACES[0];
  const previewImageUrl = wishPreviewImageUrl(item);
  const eventDate = item.eventDate ? formatEventDate(String(item.eventDate).slice(0, 10)) : "";
  const description = String(item.description || "").trim();
  const marketplaceItem = catalogMarketplaceItem(item);
  const wishlistLabel = item.addedByMe
    ? `Убрать из вишлиста «${item.title}»`
    : `Добавить в вишлист «${item.title}»`;

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
              aria-label={wishlistPending ? `${item.addedByMe ? "Удаляем…" : "Добавляем…"} ${item.title}` : wishlistLabel}
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

export function CatalogWishDetailsDrawer({ item, wishlistDisabled = false, wishlistPending = false, onToggleWishlist, onClose, returnFocusRef }) {
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

export function CatalogItemPage() {
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

export function WishCatalogPage() {
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
