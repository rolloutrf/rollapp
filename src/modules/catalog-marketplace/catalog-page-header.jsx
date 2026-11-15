import { canAccessPrivateSpheres } from "../shell/service-navigation.js";
import { sphereBusinessCatalogPath } from "../../../shared/modules/catalog-marketplace/business-accounts.js";
import { SPACES } from "../categories/wish-spaces.jsx";

export function ownedSphereCatalogPath(user, access, location) {
  const params = new URLSearchParams(location.search);
  if ((access.active && !access.isOwner) || access.error || user?.accountType !== "personal" || !canAccessPrivateSpheres(user)
    || params.has("owner") || location.pathname.includes("/business/")) return null;
  const identityReports = location.pathname === "/app/spheres/identity" && params.get("tab") === "identity-reports";
  return identityReports
    ? sphereBusinessCatalogPath("identity", "identity-reports")
    : sphereBusinessCatalogPath(access.sphere, access.section);
}

export function CatalogPageHeader({ selectedSpace, source, title, action }) {
  const heading = title || `${source === "brands" ? "Бренды" : "Лента"} · ${SPACES.find(space => space.id === selectedSpace)?.label || "Товары"}`;
  return (
    <header className="typeset typeset-rollapp flex flex-wrap items-center justify-between gap-2">
      <h2>{heading}</h2>
      {action}
    </header>
  );
}
