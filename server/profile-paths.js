const RESERVED_PROFILE_USERNAMES = new Set([
  "api",
  "app",
  "login",
  "register",
  "ideas",
  "s",
  "u",
  "users",
  "assets",
  "art",
  "avatars",
]);

const segment = (value) => encodeURIComponent(String(value || ""));

export function isReservedProfileUsername(value) {
  return RESERVED_PROFILE_USERNAMES.has(String(value || "").trim().toLowerCase());
}

export function profileUsernameCandidates(base, limit = 20) {
  const candidates = [];
  for (let index = 0; index < limit; index += 1) {
    const candidate = index ? `${base}-${index + 1}` : base;
    if (!isReservedProfileUsername(candidate)) candidates.push(candidate);
  }
  return candidates;
}

export function publicProfilePath(username) {
  return `/${segment(username)}`;
}

export function publicListPath(username, listId) {
  return `${publicProfilePath(username)}/lists/${segment(listId)}`;
}

export function publicWishPath(username, wishId) {
  return `${publicProfilePath(username)}/wishes/${segment(wishId)}`;
}

export function legacyProfileTarget(params, originalUrl = "") {
  const path = params.listId
    ? publicListPath(params.username, params.listId)
    : params.wishId
      ? publicWishPath(params.username, params.wishId)
      : publicProfilePath(params.username);
  const queryIndex = originalUrl.indexOf("?");
  return `${path}${queryIndex >= 0 ? originalUrl.slice(queryIndex) : ""}`;
}

export function normalizePublicProfileHref(value) {
  return String(value || "").replace(/^\/(?:u|users)\//, "/");
}
