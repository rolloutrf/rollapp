import { localizedPageUrl } from "../../../shared/modules/shell/page-urls.js";
import { PLATFORM_HOST, SPHERE_APPLICATIONS, spherePageOwner } from "../../../shared/modules/shell/applications.js";
import { savedSessionsCookie, sessionCookie } from "./account-sessions.js";

const domainCookies = {
  active: "__Secure-rollapp-session",
  saved: "__Secure-rollapp-saved-sessions",
};

// Legacy cookies were host-only. Use different names for shared cookies so a
// stale legacy value cannot shadow a newer account switch or logout.
export function applicationSessionCookies(environment) {
  const domain = environment.ROLLAPP_SESSION_DOMAIN;
  if (!domain) return null;
  if (domain !== PLATFORM_HOST || environment.NODE_ENV !== "production" || environment.COOKIE_SECURE === "false") {
    throw new Error("Rollapp domain sessions require the production domain and HTTPS");
  }
  return { domain, ...domainCookies };
}

export function readBrowserSessionCookies(cookies) {
  return (req, _res, next) => {
    const active = req.cookies[cookies.active];
    const saved = req.cookies[cookies.saved];
    const legacyHost = req.hostname === PLATFORM_HOST && req.protocol === "https";
    const allowLegacy = legacyHost && !active;
    req.cookies[sessionCookie] = active || (allowLegacy ? req.cookies[sessionCookie] : undefined);
    req.cookies[savedSessionsCookie] = saved || (allowLegacy ? req.cookies[savedSessionsCookie] : undefined);
    next();
  };
}

export function sphereSessionDestination(path) {
  const platform = `https://${PLATFORM_HOST}`;
  const destination = new URL(path, platform);
  if (destination.origin !== platform) return null;
  const id = spherePageOwner(destination.pathname);
  if (!id) return null;
  return `https://${SPHERE_APPLICATIONS[id].host}${localizedPageUrl(`${destination.pathname}${destination.search}${destination.hash}`)}`;
}
