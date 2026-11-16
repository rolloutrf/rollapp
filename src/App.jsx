import { CAREER_TABS, IDENTITY_TABS, EDUCATION_TABS, HEALTH_TABS } from "../shared/modules/shell/sphere-tabs.js";
import { useLocation, Navigate, Outlet, useParams, Link, Route, Routes } from "react-router-dom";
import { TabbedSpherePage } from "./modules/shell/sphere-page.jsx";
import { ContactsSpherePage, LegacyContactsRedirect } from "./modules/contacts/contacts-page.jsx";
import { APP_HOME } from "./modules/shell/home-path.jsx";
import { SPACE_IDS, SPACES } from "./modules/categories/wish-spaces.jsx";
import { WishlistBusinessListing, wishlistSpace, WishSalesPage } from "@/modules/wishlist/wishlist-business.jsx";
import { canManageWishlistSpace } from "../shared/modules/wishlist/wishlist-business.js";
import { safeNextPath } from "./modules/auth/auth.js";
import { publicSpacePath, publicPublicationPath, profilePublicationSection } from "../shared/modules/profile/profile-links.js";
import { useSession, SessionProvider } from "./modules/auth/session.jsx";
import { LoadingScreen, NotFound } from "./modules/shell/page-feedback.jsx";
import { AppShell } from "./modules/shell/app-shell.jsx";
import { useState, useEffect } from "react";
import { WishesPage } from "./modules/wishlist/wishes-page.jsx";
import { WishModal } from "./modules/wishlist/wish-editor.jsx";
import { StorePage } from "./modules/checkout/store-page.jsx";
import { BusinessMarketplacePage } from "@/modules/catalog-marketplace/business-marketplace-page.jsx";
import {
  businessMarketplacePath,
  APP_ASSISTANT_PATH,
  APP_CATALOG_ITEM_ROUTE_PATH,
  APP_CLASSIFIEDS_PATH,
  APP_ORDERS_PATH,
  APP_SHELL_ROUTE_PATH,
  APP_STORE_PATH,
  APP_WISH_CATALOG_PATH,
  APP_WISH_LISTINGS_PATH,
  APP_WISH_OFFERS_PATH,
  APP_WISH_SALES_PATH,
  PUBLIC_WISH_ROUTE_PATH,
} from "./modules/shell/app-routing.js";
import { SPHERE_SERVICES, messagesHostPath } from "./modules/shell/service-menu.jsx";
import { PageActionButton } from "@/components/page-action-button";
import { ArrowLeft, Send, ShoppingBag } from "lucide-react";
import { ControlBar } from "@/components/control-bar";
import { PersonalOffers } from "@/components/personal-offers";
import { buttonVariants } from "@/components/ui/button";
import { BusinessCatalogList, BusinessCatalogProvider } from "@/modules/catalog-marketplace/catalog-brands.jsx";
import { sphereBusinessCatalogPath } from "../shared/modules/catalog-marketplace/business-accounts.js";
import { useSphereSharing } from "./modules/access/sphere-sharing.jsx";
import { sphereSectionPath } from "../shared/modules/access/sphere-sharing.js";
import { SphereSharePicker, BusinessAccessPage } from "./modules/access/sphere-access.jsx";
import { SPHERE_APPLICATIONS } from "../shared/modules/shell/applications.js";
import { RollsWallet } from "@/modules/payments/rolls-wallet.jsx";
import { MemberNumberPage } from "@/modules/profile/member-number-page.jsx";
import { PlanningSpace } from "@/modules/planning/planning-space.jsx";
import { PrivateNotes } from "@/components/private-notes";
import { PrivateSphereRoute } from "./modules/access/private-sphere-route.jsx";
import { FriendsPage } from "./modules/social/friends-page.jsx";
import { PlanningSpacesProvider } from "@/modules/planning/planning-space-switcher.jsx";
import { applicationRedirect } from "./applications/location.js";
import { MobileFormPages } from "@/components/mobile-form-pages";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { CollectionNavigationProvider } from "./modules/categories/collection-navigation.jsx";
import { ToastProvider } from "./modules/shell/toast.jsx";
import { ProfileEditorProvider } from "./modules/profile/profile-editor.jsx";
import { PlanningFab } from "./modules/planning/planning-fab.jsx";
import { GlobalAppChrome } from "./modules/shell/app-chrome.jsx";
import { RootRoute, RegisterPage, AuthPage } from "./modules/auth/auth-pages.jsx";
import { CatalogItemPage, WishCatalogPage } from "./modules/catalog-marketplace/wish-catalog.jsx";
import { PublicProfile } from "./modules/wishlist/public-wishlist.jsx";
import { PublicBookingPage } from "./modules/profile/public-pages.jsx";
import { LegacyProfileRedirect } from "./modules/profile/profile-redirect.jsx";
import { CatalogBusinessDirectoryScope } from "./modules/catalog-marketplace/catalog-scope.jsx";

function CareerSpherePage() {
  const location = useLocation();
  return new URLSearchParams(location.search).get("tab") === "contacts"
    ? <ContactsSpherePage />
    : <TabbedSpherePage sphereId="career" tabs={CAREER_TABS} />;
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
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(safeNextPath(`${location.pathname}${location.search}${location.hash}`))}`} replace />;
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
  return <Navigate to={canManageWishlistSpace(user, space) ? publicSpacePath(user, space) : APP_HOME} replace />;
}

function WishlistSectionLayout() {
  const location = useLocation();
  const { user, loading } = useSession();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(safeNextPath(`${location.pathname}${location.search}${location.hash}`))}`} replace />;
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
      ? `${publicPublicationPath(user, publication)}?${new URLSearchParams({ tab: space })}`
      : publicSpacePath(user, space);
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
  const { user } = useSession();
  const space = wishlistSpace(search);
  const label = SPACES.find((entry) => entry.id === space)?.label;
  return <section className="app-page page-stack rollapp-body" aria-label={`Предложения: ${label}`}>
    <WishlistBusinessListing key={`${user.id}:${space}`} space={space} offers viewerId={user.id} />
  </section>;
}

function WishlistSalesRoute() {
  const { user } = useSession();
  return <WishSalesPage user={user} />;
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
      {offers ? <PersonalOffers key={`${user.id}:${sphere}`} user={user} sphere={sphere} /> : <>
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

const privateSpherePages = {
  identity: () => <TabbedSpherePage sphereId="identity" tabs={IDENTITY_TABS} />,
  career: CareerSpherePage,
  education: () => <TabbedSpherePage sphereId="education" tabs={EDUCATION_TABS} />,
  health: () => <TabbedSpherePage sphereId="health" tabs={HEALTH_TABS} />,
};

function ProtectedApp({ application }) {
  const location = useLocation();
  const { user, loading, refresh } = useSession();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(safeNextPath(`${location.pathname}${location.search}${location.hash}`))}`} replace />;
  const pages = application ? [[application, privateSpherePages[application]]] : Object.entries(privateSpherePages);
  const home = application ? SPHERE_APPLICATIONS[application].home : APP_HOME;
  return (
    <AppShell>
      <Routes>
        <Route index element={<Navigate to={home} replace />} />
        {!application && <>
          <Route path="messenger/:conversationId?" element={<MessengerRoute user={user} />} />
          <Route path="planning" element={<PlanningSpace key={user.id} />} />
          <Route path="private-notes" element={<PrivateNotes key={user.id} ownerId={user.id} />} />
          <Route path="rolls" element={<RollsWallet key={user.id} user={user} />} />
          <Route path="member-number" element={<MemberNumberPage key={user.id} user={user} onDrawn={refresh} />} />
          <Route path="business/access" element={<BusinessAccessPage />} />
          <Route path="friends" element={<Navigate to="/app/friends/subscriptions" replace />} />
          <Route path="friends/:section" element={<FriendsPage />} />
          <Route path="settings" element={<Navigate to={APP_HOME} replace />} />
        </>}
        <Route path="spheres/:sphereId/business/catalog" element={<PrivateSphereRoute><SphereBusinessCatalogRoute /></PrivateSphereRoute>} />
        <Route path="spheres/:sphereId/business/store" element={<PrivateSphereRoute><BusinessMarketplaceRoute /></PrivateSphereRoute>} />
        {pages.map(([id, Page]) => (
          <Route key={id} path={`spheres/${id}`} element={<PrivateSphereRoute><Page /></PrivateSphereRoute>} />
        ))}
        {(!application || application === "career") && <Route path="spheres/contacts" element={<LegacyContactsRedirect />} />}
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </AppShell>
  );
}

function AppPlanningSpaces({ children }) {
  const { user } = useSession();
  return <PlanningSpacesProvider enabled={Boolean(user)}>{children}</PlanningSpacesProvider>;
}

function ApplicationRedirect({ to }) {
  useEffect(() => { window.location.replace(to); }, [to]);
  return <LoadingScreen />;
}

export default function App({ application = null }) {
  useVisualViewport();
  const { pathname, search, hash } = useLocation();
  const redirect = applicationRedirect({
    application, pathname, search, hash,
    hostname: window.location.hostname,
    telegram: Boolean(window.Telegram?.WebApp?.initData),
  });
  const linkingResult = pathname === "/login" && new URLSearchParams(search).get("auth_success") === "YANDEX_LINKED";
  if (redirect) return <ApplicationRedirect to={redirect} />;
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
            {!application && <>
              <Route path="/" element={<RootRoute />} />
              <Route path="/login" element={<AuthPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<AuthPage recovery="forgot" />} />
              <Route path="/reset-password" element={<AuthPage recovery="reset" />} />
              <Route path="/ideas" element={<Navigate to={APP_HOME} replace />} />
              <Route path={APP_ASSISTANT_PATH} element={<AssistantRoute />} />
              <Route path="/u/:username/*" element={<LegacyProfileRedirect />} />
              <Route path="/users/:username/*" element={<LegacyProfileRedirect />} />
              <Route path="/:username" element={<PublicProfile />} />
              <Route path="/:username/calendar/book" element={<PublicBookingPage />} />
              <Route path="/:username/:space" element={<PublicProfile />} />
              <Route path="/:username/lists/:listId" element={<PublicProfile />} />
              <Route path={PUBLIC_WISH_ROUTE_PATH} element={<PublicProfile />} />
            </>}
            {(!application || application === "wishlist") && <>
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
            </>}
            {application !== "wishlist" && <Route path={APP_SHELL_ROUTE_PATH} element={<ProtectedApp application={application} />} />}
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
