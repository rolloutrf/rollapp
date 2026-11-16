import { PROFILE_SPACES } from "../profile/profile-links.js";
import { SPHERE_APPLICATIONS } from "./applications.js";
import { internalPageSearch, internalPageUrl, localizedPageSearch, localizedPageUrl, localizedTabSegment } from "./page-urls.js";
import { SPHERE_TABS } from "./sphere-tabs.js";

const wishlistHome = SPHERE_APPLICATIONS.wishlist.home;
const defaultWishlistTab = { tab: ["products"] };
const sphereRoutes = {
  wishlist: [
    [wishlistHome, "/календарь", { publication: "calendar" }, defaultWishlistTab],
    [wishlistHome, "/публикации", { publication: "announcements" }, defaultWishlistTab],
    ...PROFILE_SPACES.slice(1).map(tab => [wishlistHome, `/${localizedTabSegment(tab)}`, { tab }]),
    [wishlistHome, "/", {}, defaultWishlistTab],
    [`${wishlistHome}/catalog`, "/каталог-брендов", { source: "brands" }, { ...defaultWishlistTab, source: ["brands", "ohmywishes"] }],
    [`${wishlistHome}/catalog`, "/каталог", {}, { ...defaultWishlistTab, source: ["community"] }],
    [`${wishlistHome}/catalog/item/:id`, "/товар/:id"],
    [`${wishlistHome}/offers`, "/предложения", {}, defaultWishlistTab],
    [`${wishlistHome}/sales`, "/продажи", {}, defaultWishlistTab],
    [`${wishlistHome}/listings`, "/объявления", {}, defaultWishlistTab],
    [`${wishlistHome}/business`, "/бизнес", {}, defaultWishlistTab],
    ["/app/store", "/магазин", {}, defaultWishlistTab],
    ["/app/orders", "/заказы"],
  ],
  ...Object.fromEntries(Object.entries(SPHERE_TABS).map(([application, tabs]) => {
    const { home } = SPHERE_APPLICATIONS[application];
    return [application, [
      ...tabs.slice(1).map(({ id: tab }) => [home, tab === "identity-reports" ? "/тесты" : `/${localizedTabSegment(tab)}`, { tab }]),
      [home, "/", {}, { tab: [tabs[0].id] }],
      [`${home}/business/catalog`, "/предложения", { view: "offers" }],
      [`${home}/business/catalog`, "/каталог-брендов"],
      [`${home}/business/store`, "/магазин"],
    ]];
  })),
};

const platformRoutes = [
  ["/app/assistant", "/помощник"],
  ["/app/messenger", "/сообщения"],
  ["/app/messenger/:id", "/сообщения/:id"],
  ["/app/planning", "/дела", { tab: "todo" }],
  ["/app/planning", "/календарь", { tab: "calendar" }],
  ["/app/planning", "/канбан", { tab: "kanban" }],
  ["/app/planning", "/заметки", { tab: "notes" }],
  ["/app/planning", "/планирование"],
  ["/app/private-notes", "/личные-заметки"],
  ["/app/rolls", "/роллы"],
  ["/app/member-number", "/номер-участника"],
  ["/app/business/access", "/доступ"],
  ["/app/friends", "/друзья"],
  ["/app/friends/subscriptions", "/друзья/подписки"],
  ["/app/friends/followers", "/друзья/подписчики"],
  ["/app/friends/search", "/друзья/поиск"],
  ["/app/settings", "/настройки"],
  // Telegram keeps the platform host. The first segment identifies the sphere
  // there, where the address otherwise lacks the subdomain context.
  ...Object.entries(sphereRoutes).flatMap(([id, entries]) => {
    const prefix = `/${SPHERE_APPLICATIONS[id].title.toLowerCase()}`;
    return entries.map(([route, short, ...options]) => [route, short === "/" ? prefix : prefix + short, ...options]);
  }),
];

const routes = { ...sphereRoutes, platform: platformRoutes };

const splitPath = path => /^([^?#]*)(\?[^#]*)?(#.*)?$/s.exec(path).slice(1);
const segments = path => path.replace(/^\/|\/$/g, "").split("/");
const searchText = params => params.size ? `?${params}` : "";

function matchPath(pattern, path) {
  const routeParts = segments(pattern);
  const pathParts = segments(path);
  if (routeParts.length !== pathParts.length) return null;
  const values = new Map();
  for (const [index, part] of routeParts.entries()) {
    const value = pathParts[index];
    if (part.startsWith(":") && value) values.set(part, value);
    else {
      // Match the public spelling whether it arrived encoded or as Unicode.
      try {
        if (decodeURIComponent(value).toLowerCase() !== part) return null;
      } catch {
        return null;
      }
    }
  }
  return values;
}

function renderPath(pattern, values, encode = false) {
  return `/${segments(pattern).map(part => values.get(part) ?? (encode ? encodeURIComponent(part) : part)).join("/")}`;
}

export function internalSpherePageUrl(path, application = "platform") {
  application ??= "platform";
  if (!Object.hasOwn(routes, application) || !path.startsWith("/") || path.startsWith("//")) return internalPageUrl(path);
  const [pathname, search = "", hash = ""] = splitPath(path);
  for (const [internal, compact, fields] of routes[application]) {
    const values = matchPath(compact, pathname);
    if (!values) continue;
    const internalSearch = internalPageSearch(search);
    if (!fields || !Object.keys(fields).length) return `${renderPath(internal, values)}${internalSearch}${hash}`;
    const params = new URLSearchParams(internalSearch);
    for (const [key, value] of Object.entries(fields)) params.set(key, value);
    return `${renderPath(internal, values)}${searchText(params)}${hash}`;
  }
  return internalPageUrl(path);
}

export function spherePageUrl(path, application = "platform") {
  application ??= "platform";
  if (!Object.hasOwn(routes, application) || !path.startsWith("/") || path.startsWith("//")) return localizedPageUrl(path);
  let [pathname, search = "", hash = ""] = splitPath(internalSpherePageUrl(path, application));
  const params = new URLSearchParams(search);
  if (["career", "platform"].includes(application) && pathname.replace(/\/$/, "") === "/app/spheres/contacts") {
    pathname = SPHERE_APPLICATIONS.career.home;
    params.set("tab", "contacts");
  }
  if (["wishlist", "platform"].includes(application) && pathname.replace(/\/$/, "") === "/app/classifieds") {
    pathname = wishlistHome;
    params.set("publication", "announcements");
  }
  const report = params.get("tab");
  if (["identity", "platform"].includes(application) && pathname.replace(/\/$/, "") === SPHERE_APPLICATIONS.identity.home
      && ["gallup", "hogan"].includes(report)) {
    if (!params.has("report")) params.set("report", report);
    params.set("tab", "identity-reports");
  }
  for (const [internal, compact, fields = {}, aliases = {}] of routes[application]) {
    const values = matchPath(internal, pathname);
    if (!values || !Object.entries(fields).every(([key, value]) => (aliases[key] || [value]).includes(params.get(key)))) continue;
    const result = new URLSearchParams(params);
    for (const key of new Set([...Object.keys(fields), ...Object.keys(aliases)])) {
      if (Object.hasOwn(fields, key) || aliases[key].includes(result.get(key))) result.delete(key);
    }
    return `${renderPath(compact, values, true)}${localizedPageSearch(searchText(result))}${hash}`;
  }
  return localizedPageUrl(path);
}

export function isSpherePageName(name) {
  return Object.values(routes).some(entries => entries.some(([, compact]) => segments(compact)[0] === name));
}
