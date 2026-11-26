export const PROFILE_SPACES = ["products", "places", "events", "media", "food", "transport"];
const PROFILE_PUBLICATIONS = ["calendar", "announcements"];
export const profilePublicationSection = (value) => PROFILE_PUBLICATIONS.includes(value) ? value : null;
const segment = (value) => encodeURIComponent(String(value || ""));
export const publicProfileAddress = profile => typeof profile === "string" ? profile : profile?.profileSlug || profile?.username;
export const matchesProfileAddress = (profile, address) =>
  Boolean(address) && [publicProfileAddress(profile), profile?.username].includes(address);
export const publicProfilePath = profile => `/${segment(publicProfileAddress(profile))}`;
export const publicSpacePath = (profile, space = "products") => `${publicProfilePath(profile)}/${PROFILE_SPACES.includes(space) ? space : "products"}`;
export const publicListPath = (profile, listId) => `${publicProfilePath(profile)}/lists/${segment(listId)}`;
export const publicWishPath = (profile, wishId) => `${publicProfilePath(profile)}/wishes/${segment(wishId)}`;
export const publicPublicationPath = (profile, section) => `${publicProfilePath(profile)}/${segment(section)}`;
export const publicBookingPath = (profile) => `${publicPublicationPath(profile, "calendar")}/book`;

export function publicProfileRoute(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length || ["app", "s", "login", "register", "forgot-password", "reset-password", "ideas"].includes(parts[0])) return null;
  const booking = parts.length === 3 && parts[1] === "calendar" && parts[2] === "book";
  const publication = booking ? "calendar" : parts.length === 2 ? profilePublicationSection(parts[1]) : null;
  if (publication || parts.length === 1 || (parts.length === 2 && PROFILE_SPACES.includes(parts[1])) || (parts.length === 3 && ["lists", "wishes"].includes(parts[1]))) {
    try {
      const profile = { username: decodeURIComponent(parts[0]), space: PROFILE_SPACES.includes(parts[1]) ? parts[1] : null };
      return publication ? { ...profile, publication } : profile;
    }
    catch { return null; }
  }
  return null;
}

export function renamedProfileLocation(location, previousProfile, profile) {
  const route = publicProfileRoute(location.pathname);
  const legacy = typeof previousProfile === "object" ? previousProfile?.username : previousProfile;
  const current = publicProfileAddress(previousProfile);
  const next = publicProfileAddress(profile);
  const isPrevious = value => Boolean(value && [current, legacy].some(old => old && old.toLowerCase() === value.toLowerCase()));
  if (!next) return `${location.pathname}${location.search || ""}${location.hash || ""}`;
  const pathname = isPrevious(route?.username) && route.username !== next
    ? `${publicProfilePath(next)}${location.pathname.slice(location.pathname.indexOf("/", 1) < 0 ? location.pathname.length : location.pathname.indexOf("/", 1))}`
    : location.pathname;
  const search = new URLSearchParams(location.search);
  const owner = search.get("owner");
  const replaceOwner = isPrevious(owner) && owner !== next;
  if (replaceOwner) search.set("owner", next);
  const searchText = replaceOwner ? `?${search}` : location.search || "";
  return `${pathname}${searchText}${location.hash || ""}`;
}
