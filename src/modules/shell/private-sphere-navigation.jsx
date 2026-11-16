import { useLocation } from "react-router-dom";
import { Send, ShoppingBag, Store } from "lucide-react";
import { sphereSectionPath } from "../../../shared/modules/access/sphere-sharing.js";
import { sphereBusinessCatalogPath } from "../../../shared/modules/catalog-marketplace/business-accounts.js";
import { businessMarketplacePath } from "../../../shared/modules/catalog-marketplace/business-marketplace.js";
import { useSphereSharing } from "../access/sphere-sharing.jsx";
import { canAccessPrivateSpheres } from "./service-navigation.js";
import { SPHERE_SERVICES } from "./service-menu.jsx";
import { ProfileSectionNavigation } from "./profile-section-navigation.jsx";

export function PrivateSphereNavigation({ user }) {
  const { pathname, search } = useLocation();
  const access = useSphereSharing();
  const path = pathname.replace(/\/+$/, "");
  const params = new URLSearchParams(search);
  if (params.has("owner") || !access.isOwner || access.readOnly || access.error || !canAccessPrivateSpheres(user)) return null;
  // The combined reports tab is a screen, not a new shareable section.
  const identityReports = (path === "/app/spheres/identity" || path === "/app/spheres/identity/business/catalog")
    && ["identity-reports", "gallup", "hogan"].includes(params.get("tab"));
  const service = SPHERE_SERVICES.find(({ id }) => id === (identityReports ? "identity" : access.sphere));
  if (!service) return null;
  const { id: sphere, label, icon } = service;
  const section = identityReports ? "identity-reports" : access.section;
  const home = sphereSectionPath({ sphere, section });
  const catalog = user.accountType === "personal" && sphereBusinessCatalogPath(sphere, section);
  const [catalogPath] = catalog ? catalog.split("?") : [null];
  const store = businessMarketplacePath(sphere);
  const onCatalog = path === catalogPath;
  const onStore = path === store;
  const onOffers = onCatalog && params.get("view") === "offers";
  if (!catalog && !store) return null;
  const links = [
    { to: home, label: onCatalog || onStore ? `К сфере «${label}»` : label, title: label, icon, active: !onCatalog && !onStore },
  ];
  if (catalog) links.push({ to: catalog, label: "Открыть каталог брендов", title: "Каталог брендов", icon: ShoppingBag, active: onCatalog && !onOffers });
  if (store) links.push({ to: `${store}?${new URLSearchParams({ tab: section })}`, label: "Открыть магазин за роллы", title: "Магазин за роллы", icon: Store, active: onStore });
  if (catalog) {
    const offers = new URLSearchParams({ tab: section, view: "offers" });
    links.push({ to: `${catalogPath}?${offers}`, label: "Предложения", icon: Send, active: onOffers });
  }
  return <ProfileSectionNavigation label={`Разделы сферы «${label}»`} links={links} />;
}
