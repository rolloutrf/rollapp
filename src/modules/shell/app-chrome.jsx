import { isBrandCatalogSearch } from "../../../shared/modules/catalog-marketplace/catalog-links.js";
import { useContext } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Share2 } from "lucide-react";
import { TELEGRAM_WAITLIST_ENABLED } from "../../../shared/modules/identification/telegram-waitlist.js";
import { ControlBar } from "@/components/control-bar";
import { PlanningSpaceSwitcher } from "@/modules/planning/planning-space-switcher.jsx";
import { cn } from "@/lib/utils";
import { Button as ShadcnButton } from "@/components/ui/button";
import { BusinessCatalogSelect } from "@/modules/catalog-marketplace/catalog-brands.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { canAccessPrivateSpheres } from "./service-navigation.js";
import { isPublicWishDetailPath, APP_WISH_CATALOG_PATH } from "./app-routing.js";
import { publicSpacePath, publicProfileRoute } from "../../../shared/modules/profile/profile-links.js";
import { CollectionNavigationContext } from "../categories/collection-navigation.jsx";
import { APP_HOME } from "./home-path.jsx";
import { useSession } from "../auth/session.jsx";
import { useToast } from "./toast.jsx";
import { PLANNING_SERVICE, isFriendsDirectoryPath, serviceChromeFromPath, isAssistantPath } from "./service-menu.jsx";
import { SphereSwitcher, AppBrand } from "./brand.jsx";

export function GlobalAppChrome() {
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

export function AppBrandSpacer() {
  return <span className="app-brand-spacer" aria-hidden="true" />;
}
