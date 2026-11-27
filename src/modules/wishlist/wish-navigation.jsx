import { APP_HOME } from "../shell/home-path.jsx";
import { wishSalesPath, wishlistSpace } from "@/modules/wishlist/wishlist-business.jsx";
import { canManageWishSales, canManageWishlistSpace } from "../../../shared/modules/wishlist/wishlist-business.js";
import { isBrandCatalogSearch } from "../../../shared/modules/catalog-marketplace/catalog-links.js";
import { useLocation } from "react-router-dom";
import { Gift, Newspaper, Send, ShoppingBag, Store, Tag } from "lucide-react";
import { ControlBar } from "@/components/control-bar";
import { ProfileSectionNavigation } from "../shell/profile-section-navigation.jsx";
import { ProfilePublicationLinks } from "@/modules/profile/profile-publications.jsx";
import { brandCatalogPath } from "@/modules/catalog-marketplace/catalog-brands.jsx";
import { APP_ORDERS_PATH, APP_STORE_PATH, APP_WISH_CATALOG_PATH, APP_WISH_OFFERS_PATH, APP_WISH_SALES_PATH } from "../shell/app-routing.js";
import { useSphereSharing } from "../access/sphere-sharing.jsx";
import { profilePublicationSection, publicSpacePath } from "../../../shared/modules/profile/profile-links.js";
import { PageActionButton } from "@/components/page-action-button";
import { useSession } from "../auth/session.jsx";

export function wishlistPublicationPath(space, publication) {
  const search = new URLSearchParams({ tab: space });
  if (publication) search.set("publication", publication);
  return `${APP_HOME}?${search}`;
}

export function WishlistSectionNavigation({ user }) {
  const { pathname, search } = useLocation();
  const { isOwner } = useSphereSharing();
  const path = pathname.replace(/\/+$/, "").toLowerCase();
  const space = wishlistSpace(search);
  const tab = new URLSearchParams({ tab: space });
  const brands = isBrandCatalogSearch(search);
  const publication = path === APP_HOME ? profilePublicationSection(new URLSearchParams(search).get("publication")) : null;
  const marketplaceSpace = space === "products";
  const links = [
    { to: wishlistPublicationPath(space), active: path === APP_HOME && !publication, label: "Вишлист", title: "Вишлист", icon: Gift },
    { to: `${APP_WISH_CATALOG_PATH}?${tab}`, active: path === APP_WISH_CATALOG_PATH && !brands, label: "Открыть ленту", title: "Лента", icon: Newspaper },
    { to: brandCatalogPath(space), active: path === APP_WISH_CATALOG_PATH && brands, label: "Открыть каталог брендов", title: "Каталог брендов", icon: ShoppingBag },
    ...(marketplaceSpace ? [{ to: `${APP_STORE_PATH}?${tab}`, active: path === APP_STORE_PATH || path === APP_ORDERS_PATH, label: "Открыть магазин", title: "Магазин", icon: Store }] : []),
    { to: `${APP_WISH_OFFERS_PATH}?${tab}`, active: path === APP_WISH_OFFERS_PATH, label: "Открыть предложения", title: "Предложения", icon: Send },
  ];
  if (marketplaceSpace && canManageWishSales(user, space)) {
    links.push({ to: wishSalesPath(space), active: path === APP_WISH_SALES_PATH, label: "Мои продажи", title: "Мои продажи", icon: Tag });
  }
  return (
    <ProfileSectionNavigation label="Разделы Вишлиста" links={links} className="wishlist-section-navigation">
      {isOwner && user.username && <ProfilePublicationLinks activeSection={publication}
        toSection={section => wishlistPublicationPath(space, section)}
        manageCalendar={user.accountType === "business"}
        onlySections={marketplaceSpace ? null : ["calendar"]} />}
    </ProfileSectionNavigation>
  );
}

export function WishesProfileControls({ selectedSpace }) {
  const { user } = useSession();
  if (!canManageWishlistSpace(user, selectedSpace)) return null;
  return (
    <section className="wishes-page__profile-controls" aria-label="Управление Вишлистом">
      <ControlBar className="page-actions wishes-page__hero-actions horizontal-action-scroller" role="group" aria-label="Действия со списком желаний">
        {canManageWishlistSpace(user, selectedSpace) && <PageActionButton variant="outline" to={publicSpacePath(user, selectedSpace)}>Моя страница</PageActionButton>}
      </ControlBar>
    </section>
  );
}
