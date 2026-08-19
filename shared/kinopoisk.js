const KINOPOISK_CONTENT_PATHS = [
  /^\/(?:film|series)\/([1-9]\d{0,11})(?:\/|$)/i,
  /^\/(?:film|series)\/[^/]+-([1-9]\d{0,11})(?:\/|$)/i,
  /^\/level\/1\/film\/([1-9]\d{0,11})(?:\/|$)/i,
];

function parseKinopoiskUrl(value) {
  let url;
  try {
    url = value instanceof URL ? value : new URL(String(value));
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) return null;
  const hostname = url.hostname.toLowerCase();
  if (hostname !== "kinopoisk.ru" && !hostname.endsWith(".kinopoisk.ru")) return null;
  return url;
}

export function kinopoiskContentId(value) {
  const url = parseKinopoiskUrl(value);
  if (!url) return "";
  for (const pattern of KINOPOISK_CONTENT_PATHS) {
    const id = pattern.exec(url.pathname)?.[1];
    if (id) return id;
  }
  return "";
}

export function isKinopoiskUrl(value) {
  return Boolean(kinopoiskContentId(value));
}

export function kinopoiskPosterUrl(value) {
  const id = kinopoiskContentId(value);
  return id ? `https://st.kp.yandex.net/images/film_iphone/iphone360_${id}.jpg` : "";
}

export function wishPreviewImageUrl(wish) {
  return String(wish?.imageUrl || "").trim() || kinopoiskPosterUrl(wish?.url);
}
