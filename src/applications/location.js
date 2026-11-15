import { PLATFORM_HOST, SPHERE_APPLICATIONS, spherePageOwner } from "../../shared/applications.js";
import { safeNextPath } from "../lib/auth.js";

const platformOrigin = `https://${PLATFORM_HOST}`;

export function sphereLink(path, location) {
  if (location.hostname !== PLATFORM_HOST && !Object.values(SPHERE_APPLICATIONS).some(({ host }) => host === location.hostname)) {
    return path;
  }
  const url = new URL(path, platformOrigin);
  const owner = spherePageOwner(url.pathname);
  if (!owner) return path;
  const host = SPHERE_APPLICATIONS[owner].host;
  return location.hostname === host ? path : `https://${host}${url.pathname}${url.search}${url.hash}`;
}

export function platformLink(path, location) {
  return Object.values(SPHERE_APPLICATIONS).some(({ host }) => host === location.hostname)
    ? `${platformOrigin}${path}`
    : path;
}

export function applicationRedirect({ application, pathname, search, hash, hostname, telegram }) {
  const owner = spherePageOwner(pathname);
  const path = `${pathname}${search}${hash}`;
  if (!application) {
    return hostname === PLATFORM_HOST && owner && !telegram ? sphereLink(path, { hostname }) : null;
  }
  const { home } = SPHERE_APPLICATIONS[application];
  if (pathname === "/") return `${home}${search}${hash}`;
  if (application === owner) return null;
  if (pathname === "/login") {
    const params = new URLSearchParams(search);
    const next = safeNextPath(params.get("next"), home);
    if (!params.has("add_account") && !params.has("auth_error") && !params.has("auth_success")) {
      return `${platformOrigin}/api/auth/sphere-session?next=${encodeURIComponent(next)}`;
    }
  }
  return owner ? sphereLink(path, { hostname }) : `${platformOrigin}${path}`;
}
