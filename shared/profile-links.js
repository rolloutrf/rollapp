export const PROFILE_SPACES = ["products", "places", "events", "media", "food", "transport"];
const segment = (value) => encodeURIComponent(String(value || ""));
export const publicProfilePath = (username) => `/${segment(username)}`;
export const publicSpacePath = (username, space = "products") => `${publicProfilePath(username)}/${PROFILE_SPACES.includes(space) ? space : "products"}`;
export const publicListPath = (username, listId) => `${publicProfilePath(username)}/lists/${segment(listId)}`;
export const publicWishPath = (username, wishId) => `${publicProfilePath(username)}/wishes/${segment(wishId)}`;

export function publicProfileRoute(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length || ["app", "s", "login", "register", "forgot-password", "reset-password", "ideas"].includes(parts[0])) return null;
  if (parts.length === 1 || (parts.length === 2 && PROFILE_SPACES.includes(parts[1])) || (parts.length === 3 && ["lists", "wishes"].includes(parts[1]))) {
    try { return { username: decodeURIComponent(parts[0]), space: PROFILE_SPACES.includes(parts[1]) ? parts[1] : null }; }
    catch { return null; }
  }
  return null;
}

export function renamedProfileLocation(location, previousUsername, username) {
  const route = publicProfileRoute(location.pathname);
  const pathname = route?.username.toLowerCase() === previousUsername.toLowerCase()
    ? `${publicProfilePath(username)}${location.pathname.slice(location.pathname.indexOf("/", 1) < 0 ? location.pathname.length : location.pathname.indexOf("/", 1))}`
    : location.pathname;
  const search = new URLSearchParams(location.search);
  if (search.get("owner") === previousUsername) search.set("owner", username);
  return `${pathname}${search.size ? `?${search}` : ""}${location.hash || ""}`;
}
