import { internalPageUrl } from "./page-urls.js";

export const PLATFORM_HOST = "xn--80avakiab.xn--p1ai";

export const SPHERE_APPLICATIONS = Object.freeze({
  identity: {
    title: "Идентичность",
    host: `xn--d1achcybhyfe5cwd.${PLATFORM_HOST}`,
    home: "/app/spheres/identity",
    api: ["/api/identity"],
  },
  health: {
    title: "Здоровье",
    host: `xn--b1adef0ban2h.${PLATFORM_HOST}`,
    home: "/app/spheres/health",
    api: ["/api/health"],
  },
  career: {
    title: "Карьера",
    host: `xn--80aaos5ab6f.${PLATFORM_HOST}`,
    home: "/app/spheres/career",
    api: ["/api/career", "/api/contacts"],
  },
  education: {
    title: "Образование",
    host: `xn--80aabfqjj3bddt.${PLATFORM_HOST}`,
    home: "/app/spheres/education",
    api: ["/api/education"],
  },
  wishlist: {
    title: "Вишлист",
    host: `xn--b1amal5ag2b.${PLATFORM_HOST}`,
    home: "/app/wishes",
    api: [
      "/api/wishes", "/api/wish-groups", "/api/lists", "/api/dashboard",
      "/api/catalog", "/api/gift-suggestions", "/api/shared", "/api/wishlist-business",
      "/api/vehicle-catalog", "/api/metadata", "/api/me/wishlist-import",
      "/api/me/browser-wishlist-import",
    ],
  },
});

function matchesPath(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function sphereApiOwner(pathname) {
  const path = pathname.toLowerCase();
  return Object.keys(SPHERE_APPLICATIONS).find(id =>
    SPHERE_APPLICATIONS[id].api.some(prefix => matchesPath(path, prefix))) || null;
}

export function spherePageOwner(pathname) {
  const path = internalPageUrl(pathname).toLowerCase().replace(/\/$/, "");
  if (matchesPath(path, "/app/spheres/contacts")) return "career";
  if (["/app/store", "/app/orders", "/app/classifieds"].includes(path) || path.startsWith("/s/")) return "wishlist";
  return Object.keys(SPHERE_APPLICATIONS).find(id => matchesPath(path, SPHERE_APPLICATIONS[id].home)) || null;
}
