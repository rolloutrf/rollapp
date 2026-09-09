const GOOGLE_FAVICON_ENDPOINT = "https://www.google.com/s2/favicons";

const COURSE_PROVIDER_LOGOS = [
  {
    key: "gopractice",
    aliases: ["go practice", "gopractice", "go practive"],
    hosts: ["gopractice.ru", "gopractice.io"],
    homepage: "https://gopractice.ru",
  },
  {
    key: "productstar",
    aliases: ["product star", "productstar"],
    hosts: ["productstar.ru"],
    homepage: "https://productstar.ru",
  },
];

function webHostname(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.hostname.toLocaleLowerCase("en-US").replace(/\.$/, "");
  } catch {
    return "";
  }
}

function normalizedEducationName(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function matchesProviderAlias(value, alias) {
  const words = normalizedEducationName(value).split(/\s+/).filter(Boolean);
  const aliasWords = normalizedEducationName(alias).split(/\s+/).filter(Boolean);
  if (!words.length || !aliasWords.length || aliasWords.length > words.length) return false;
  const compactValue = words.join("");
  const compactAlias = aliasWords.join("");
  if (compactValue === compactAlias) return true;
  return words.some((_, index) => words.slice(index, index + aliasWords.length).join("") === compactAlias);
}

function providerFromHostname(hostname) {
  if (!hostname) return null;
  return COURSE_PROVIDER_LOGOS.find((provider) => provider.hosts.some((host) => (
    hostname === host || hostname.endsWith(`.${host}`)
  ))) || null;
}

function providerFromCourse(course = {}) {
  const providerKey = courseProviderLogoKey(course);
  return COURSE_PROVIDER_LOGOS.find((provider) => provider.key === providerKey) || null;
}

function publicCoursePageUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

export function siteLogoUrl(resourceUrl) {
  try {
    const url = new URL(String(resourceUrl || "").trim());
    if (!["http:", "https:"].includes(url.protocol)) return "";

    const params = new URLSearchParams({
      domain_url: url.origin,
      sz: "128",
    });
    return `${GOOGLE_FAVICON_ENDPOINT}?${params.toString()}`;
  } catch {
    return "";
  }
}

export function courseProviderLogoKey({ url = "", provider = "", title = "" } = {}) {
  const linkedProvider = providerFromHostname(webHostname(url));
  if (linkedProvider) return linkedProvider.key;

  for (const candidate of [provider, title]) {
    const match = COURSE_PROVIDER_LOGOS.find((knownProvider) => (
      knownProvider.aliases.some((alias) => matchesProviderAlias(candidate, alias))
    ));
    if (match) return match.key;
  }
  return "";
}

export function automaticCourseLogoUrl(course = {}) {
  return courseLogoUrls({ ...course, logoUrl: "" })[0] || "";
}

export function resolvedCourseLogoUrl(course = {}) {
  return courseLogoUrls(course)[0] || "";
}

export function courseLogoUrls(course = {}) {
  const urls = [];
  const add = (value) => {
    const url = String(value || "").trim();
    if (url && !urls.includes(url)) urls.push(url);
  };

  add(course.logoUrl);

  const coursePageUrl = publicCoursePageUrl(course.url);
  if (coursePageUrl) {
    add(`/api/education/course-logo?url=${encodeURIComponent(coursePageUrl)}`);
  }

  const provider = providerFromCourse(course);
  if (provider) add(`/api/education/provider-logos/${encodeURIComponent(provider.key)}`);

  add(siteLogoUrl(coursePageUrl));
  if (provider) add(siteLogoUrl(provider.homepage));

  return urls;
}

export function logoUrlAfterResourceChange({ currentLogoUrl, previousResourceUrl, resourceUrl }) {
  const currentLogo = String(currentLogoUrl || "").trim();
  const previousAutomaticLogo = siteLogoUrl(previousResourceUrl);
  const nextAutomaticLogo = siteLogoUrl(resourceUrl);

  if (currentLogo && currentLogo !== previousAutomaticLogo) return currentLogo;
  return nextAutomaticLogo;
}
