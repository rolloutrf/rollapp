import { spherePageUrl } from "../../shared/modules/shell/sphere-page-urls.js";
import { PLATFORM_HOST, SPHERE_APPLICATIONS, spherePageOwner } from "../../shared/modules/shell/applications.js";
import { safeNextPath } from "../modules/auth/auth.js";

const platformOrigin = `https://${PLATFORM_HOST}`;

export function sphereLink(path, location) {
  if (location.hostname !== PLATFORM_HOST && !Object.values(SPHERE_APPLICATIONS).some(({ host }) => host === location.hostname)) {
    return path;
  }
  const url = new URL(path, platformOrigin);
  const owner = spherePageOwner(url.pathname);
  if (!owner) return path;
  const host = SPHERE_APPLICATIONS[owner].host;
  return location.hostname === host ? path : `https://${host}${spherePageUrl(`${url.pathname}${url.search}${url.hash}`, owner)}`;
}

export function platformLink(path, location) {
  return Object.values(SPHERE_APPLICATIONS).some(({ host }) => host === location.hostname)
    ? `${platformOrigin}${spherePageUrl(path)}`
    : path;
}

export function sharePageUrl(path, location = window.location) {
  const destination = sphereLink(path, location);
  if (destination !== path) return destination;
  // Public profiles stay on the platform. A sphere's own share links stay
  // with the sphere, including links copied from its standalone application.
  const pathname = new URL(path, platformOrigin).pathname;
  const owner = spherePageOwner(pathname);
  const application = SPHERE_APPLICATIONS[owner]?.host === location.hostname ? owner : null;
  const localized = spherePageUrl(path, application);
  return new URL(owner ? localized : platformLink(localized, location), location.origin).href;
}

export function applicationRedirect({ application, pathname, search, hash, hostname, telegram }) {
  const owner = spherePageOwner(pathname);
  const path = `${pathname}${search}${hash}`;
  if (!application) {
    return hostname === PLATFORM_HOST && owner && !telegram ? sphereLink(path, { hostname }) : null;
  }
  const { home } = SPHERE_APPLICATIONS[application];
  if (pathname === "/") return null;
  if (application === owner) return null;
  if (pathname === "/login") {
    const params = new URLSearchParams(search);
    const next = safeNextPath(params.get("next"), home);
    if (!params.has("add_account") && !params.has("auth_error") && !params.has("auth_success")) {
      return `${platformOrigin}/api/auth/sphere-session?next=${encodeURIComponent(next)}`;
    }
  }
  return owner ? sphereLink(path, { hostname }) : `${platformOrigin}${spherePageUrl(path)}`;
}
