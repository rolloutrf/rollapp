import {
  isKinopoiskUrl,
  kinopoiskContentUrlError,
  kinopoiskPosterUrl,
} from "../shared/kinopoisk.js";

const SUPPORTED_CURRENCIES = new Set(["RUB", "USD", "EUR", "KZT", "BYN"]);

const HTML_ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  laquo: "«",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: "\"",
  raquo: "»",
  rdquo: "”",
  rsquo: "’",
};

export function decodeHtmlEntities(value = "") {
  return String(value).replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (entity, code) => {
    if (code[0] !== "#") return HTML_ENTITIES[code.toLowerCase()] ?? entity;
    const hexadecimal = code[1]?.toLowerCase() === "x";
    const point = Number.parseInt(code.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    if (!Number.isFinite(point) || point < 0 || point > 0x10ffff) return entity;
    try {
      return String.fromCodePoint(point);
    } catch {
      return entity;
    }
  });
}

function cleanText(value, maxLength = Infinity) {
  if (value === undefined || value === null) return "";
  const text = decodeHtmlEntities(String(value))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\s\u00a0\u202f]+/g, " ")
    .trim();
  return text.slice(0, maxLength);
}

function parseAttributes(source = "") {
  const attributes = Object.create(null);
  const pattern = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    attributes[name] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function collectHtmlData(html) {
  const meta = [];
  const microdata = new Map();
  const scriptBodies = [];
  const openingTag = /<([a-z][\w:-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi;

  for (const match of html.matchAll(openingTag)) {
    const tag = match[1].toLowerCase();
    const attributes = parseAttributes(match[2]);

    if (tag === "meta") meta.push(attributes);

    if (attributes.itemprop) {
      let value = attributes.content || attributes.value || attributes.src || attributes.href || "";
      if (!value && !["area", "base", "br", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"].includes(tag)) {
        const rest = html.slice((match.index ?? 0) + match[0].length);
        const closingTag = new RegExp(`^([\\s\\S]*?)<\\/${tag}\\s*>`, "i").exec(rest);
        value = closingTag ? cleanText(closingTag[1], 2_000) : "";
      }
      for (const itemprop of attributes.itemprop.toLowerCase().split(/\s+/).filter(Boolean)) {
        const values = microdata.get(itemprop) || [];
        if (value) values.push(value);
        microdata.set(itemprop, values);
      }
    }
  }

  const script = /<script\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/script\s*>/gi;
  for (const match of html.matchAll(script)) {
    const attributes = parseAttributes(match[1]);
    if ((attributes.type || "").toLowerCase().split(";", 1)[0].trim() === "application/ld+json") {
      scriptBodies.push(match[2]);
    }
  }

  return { meta, microdata, scriptBodies };
}

function metaValue(meta, ...keys) {
  for (const key of keys) {
    const normalized = key.toLowerCase();
    for (const attributes of meta) {
      const identifier = (attributes.property || attributes.name || attributes.itemprop || "").toLowerCase();
      if (identifier === normalized && attributes.content) return attributes.content;
    }
  }
  return "";
}

function microdataValue(microdata, ...keys) {
  for (const key of keys) {
    const value = microdata.get(key.toLowerCase())?.find(Boolean);
    if (value) return value;
  }
  return "";
}

function parseJsonLd(scriptBodies) {
  const documents = [];
  for (const body of scriptBodies) {
    const source = body
      .trim()
      .replace(/^<!--/, "")
      .replace(/-->$/, "")
      .replace(/^<!\[CDATA\[/, "")
      .replace(/\]\]>$/, "")
      .replace(/;\s*$/, "")
      .trim();
    if (!source) continue;
    try {
      documents.push(JSON.parse(source));
      continue;
    } catch {
      // A few stores HTML-encode otherwise valid JSON-LD.
    }
    try {
      documents.push(JSON.parse(decodeHtmlEntities(source)));
    } catch {
      // Malformed analytics snippets must not prevent the remaining metadata from being used.
    }
  }
  return documents;
}

function collectJsonNodes(value, nodes = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonNodes(item, nodes);
    return nodes;
  }
  if (!value || typeof value !== "object") return nodes;
  nodes.push(value);
  for (const nested of Object.values(value)) collectJsonNodes(nested, nodes);
  return nodes;
}

function schemaTypes(node) {
  const values = Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]];
  return values
    .filter((value) => typeof value === "string")
    .map((value) => value.toLowerCase().split(/[\/#:]/).filter(Boolean).at(-1));
}

function firstScalar(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const scalar = firstScalar(item);
      if (scalar !== "") return scalar;
    }
    return "";
  }
  if (value === undefined || value === null) return "";
  if (["string", "number"].includes(typeof value)) return String(value);
  if (typeof value === "object") {
    return firstScalar(value.url ?? value.contentUrl ?? value.thumbnailUrl ?? value.value ?? value["@id"]);
  }
  return "";
}

function offerDetails(value) {
  const nodes = collectJsonNodes(value);
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const amount = firstScalar(node.price ?? node.lowPrice ?? node.highPrice ?? node.minPrice ?? node.value);
    if (!amount || normalizePrice(amount) === null) continue;
    return {
      amount,
      currency: firstScalar(node.priceCurrency ?? node.currency),
    };
  }
  return { amount: "", currency: "" };
}

function productDetails(documents) {
  const nodes = collectJsonNodes(documents);
  const products = nodes.filter((node) => schemaTypes(node).includes("product"));
  const standaloneOffers = nodes.filter((node) => schemaTypes(node).some((type) => ["offer", "aggregateoffer"].includes(type)));

  let best = null;
  for (const product of products) {
    const offer = offerDetails([product.offers, product.priceSpecification]);
    const offerUrl = firstScalar(collectJsonNodes(product.offers).map((offerNode) => offerNode?.url));
    const productName = firstScalar(product.name ?? product.headline);
    const productWeight = firstScalar(product.weight ?? product.size);
    const title = productName && productWeight && !productName.toLowerCase().includes(productWeight.toLowerCase())
      ? `${productName}, ${productWeight}`
      : productName;
    const candidate = {
      title,
      description: firstScalar(product.description),
      imageUrl: firstScalar(product.image ?? product.photo ?? product.thumbnailUrl),
      productUrl: firstScalar(product.url)
        || offerUrl
        || firstScalar(product.mainEntityOfPage)
        || firstScalar(product["@id"]),
      offerImageUrl: firstScalar(
        collectJsonNodes(product.offers).map((offerNode) => offerNode?.image),
      ),
      amount: offer.amount || firstScalar(product.price),
      currency: offer.currency || firstScalar(product.priceCurrency),
    };
    const score = Number(Boolean(candidate.title)) * 2
      + Number(Boolean(candidate.imageUrl || candidate.offerImageUrl)) * 2
      + Number(normalizePrice(candidate.amount) !== null) * 3
      + Number(Boolean(candidate.description));
    if (!best || score > best.score) best = { ...candidate, productFound: true, score };
  }

  if (best) return best;
  const offer = offerDetails(standaloneOffers);
  return {
    title: "",
    description: "",
    imageUrl: "",
    productUrl: "",
    amount: offer.amount,
    currency: offer.currency,
    productFound: false,
    score: 0,
  };
}

export function normalizePrice(value) {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (value === undefined || value === null) return null;

  const match = decodeHtmlEntities(String(value)).match(/\d[\d\s\u00a0\u202f.,'’]*/);
  if (!match) return null;
  let number = match[0].replace(/[\s\u00a0\u202f'’]/g, "");
  const separators = [...number.matchAll(/[.,]/g)];

  if (separators.length) {
    const decimal = separators.at(-1);
    const digitsAfter = number.length - (decimal.index ?? number.length) - 1;
    const useAsDecimal = digitsAfter > 0 && digitsAfter <= 2;
    if (useAsDecimal) {
      const whole = number.slice(0, decimal.index).replace(/[.,]/g, "");
      const fraction = number.slice((decimal.index ?? 0) + 1).replace(/[.,]/g, "");
      number = `${whole}.${fraction}`;
    } else {
      number = number.replace(/[.,]/g, "");
    }
  }

  const result = Number(number);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

export function normalizeCurrency(value = "", priceText = "") {
  const explicit = cleanText(value).toUpperCase().replace(/[.]/g, "").trim();
  if (SUPPORTED_CURRENCIES.has(explicit)) return explicit;
  if (explicit === "RUR" || explicit === "РУБ" || explicit === "РУБЛЬ" || explicit === "РУБЛЯ" || explicit === "РУБЛЕЙ") return "RUB";
  if (explicit === "BYR" || explicit === "BR" || explicit === "БР") return "BYN";

  const source = `${explicit} ${cleanText(priceText).toUpperCase()}`;
  if (/\b(?:BYN|BYR)\b|(?:^|\s)(?:BR|БР)(?:\s|$)|БЕЛОРУСС/.test(source)) return "BYN";
  if (/\bKZT\b|₸|\bТЕНГЕ\b|(?:^|\s)ТГ(?:\s|$)/.test(source)) return "KZT";
  if (/\bEUR\b|€|\bЕВРО\b/.test(source)) return "EUR";
  if (/\bUSD\b|US\$|\$|\bДОЛЛАР/.test(source)) return "USD";
  if (/\b(?:RUB|RUR)\b|₽|\bРУБ/.test(source)) return "RUB";
  return "RUB";
}

export function resolveImageUrl(value, pageUrl) {
  const candidate = decodeHtmlEntities(value).trim();
  if (!candidate) return "";
  try {
    const url = new URL(candidate, pageUrl);
    return ["http:", "https:"].includes(url.protocol) && url.href.length <= 2_000 ? url.href : "";
  } catch {
    return "";
  }
}

function hostnameMatches(value, expected) {
  let url;
  try {
    url = value instanceof URL ? value : new URL(String(value));
  } catch {
    return false;
  }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  return hostname === expected || hostname.endsWith(`.${expected}`);
}

function isMifUrl(value) {
  return hostnameMatches(value, "mann-ivanov-ferber.ru");
}

const BOOKMATE_CONTENT_PATH = /^\/(books|audiobooks|comicbooks)\/([a-z0-9_-]{1,64})(?:\/|$)/i;

function parseBookmateContentUrl(value) {
  let url;
  try {
    url = value instanceof URL ? value : new URL(String(value));
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol) || !hostnameMatches(url, "bookmate.com")) return null;
  const match = BOOKMATE_CONTENT_PATH.exec(url.pathname);
  if (!match) return null;
  return { type: match[1].toLowerCase(), id: match[2] };
}

export function isBookmateUrl(value) {
  return Boolean(parseBookmateContentUrl(value));
}

export function bookmateApiUrl(value) {
  const content = parseBookmateContentUrl(value);
  return content
    ? `https://api.bookmate.com/api/v5/${content.type}/${encodeURIComponent(content.id)}`
    : "";
}

const YANDEX_MAPS_HOSTS = new Set(["yandex.ru", "yandex.com", "yandex.kz", "yandex.by", "yandex.ua"]);
const YANDEX_MAPS_SHORT_HOSTS = new Set(["ya.ru"]);

export function isYandexMapsUrl(value) {
  let url;
  try {
    url = value instanceof URL ? value : new URL(String(value));
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(url.protocol)) return false;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.toLowerCase();
  const isMapsPath = path === "/maps" || path.startsWith("/maps/");
  if (!isMapsPath) return false;
  return YANDEX_MAPS_HOSTS.has(host) || YANDEX_MAPS_SHORT_HOSTS.has(host);
}

function stripYandexMapsTitleSuffix(title) {
  return String(title)
    .replace(/\s*[—–-]\s*(?:яндекс\s+карты|yandex\s+maps)\s*$/iu, "")
    .trim();
}

function yandexMapsFallbackTitle(pageUrl) {
  try {
    const text = new URL(pageUrl).searchParams.get("text");
    return cleanText(text, 160);
  } catch {
    return "";
  }
}

// Yandex Maps SPA shell always serves the same generic og:title; such a title
// carries no information about the actual place and must be ignored.
function yandexMapsPlaceTitle(value) {
  const raw = cleanText(value);
  if (!raw) return "";
  if (/^(?:яндекс\s+карты|yandex\s+maps)(?:\s*[—–-]|$)/iu.test(raw)) return "";
  const stripped = stripYandexMapsTitleSuffix(raw);
  if (!stripped) return "";
  if (/транспорт,?\s*навигация|transport,?\s*navigation/i.test(stripped)) return "";
  return cleanText(stripped, 160);
}

// The generic og:description of the maps shell ("Карты помогут найти нужное
// место…" and its English equivalent) is advertising copy, not a place summary.
function yandexMapsPlaceDescription(value) {
  const text = cleanText(value, 1_000);
  if (!text) return "";
  if (/карты помогут найти|yandex\s+maps\s+will\s+help/i.test(text)) return "";
  return text;
}

// Organization links embed a readable slug: /maps/org/peterburg_bagel_company/153670098251/
function yandexMapsOrgSlugTitle(pageUrl) {
  try {
    const match = /\/org\/([^/]+)\/\d+(?:\/|$)/i.exec(new URL(pageUrl).pathname);
    if (!match) return "";
    const decoded = decodeURIComponent(match[1]);
    const words = decoded.replace(/[_\-+]+/g, " ").replace(/\s+/g, " ").trim();
    if (!words) return "";
    return cleanText(
      words.split(" ").map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word)).join(" "),
      160,
    );
  } catch {
    return "";
  }
}

export function parseYandexMapsMetadata(source, pageUrl) {
  const html = String(source ?? "");
  const { meta } = collectHtmlData(html);

  const title = yandexMapsPlaceTitle(metaValue(meta, "og:title", "twitter:title"))
    || yandexMapsFallbackTitle(pageUrl)
    || yandexMapsOrgSlugTitle(pageUrl);
  const description = yandexMapsPlaceDescription(
    metaValue(meta, "og:description", "twitter:description", "description"),
  );
  const imageUrl = resolveImageUrl(
    metaValue(meta, "og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"),
    pageUrl,
  );

  return { title, description, imageUrl, price: null, currency: "", kind: "place" };
}

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "m.youtube-nocookie.com",
  "music.youtube-nocookie.com",
]);
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_ID_PATHS = new Set(["shorts", "embed", "live", "v"]);

export function parseYouTubeVideoId(value) {
  let url;
  try {
    url = value instanceof URL ? value : new URL(String(value));
  } catch {
    return "";
  }
  if (!["http:", "https:"].includes(url.protocol)) return "";

  const host = url.hostname.toLowerCase();
  let candidate = "";
  if (host === "youtu.be") {
    candidate = url.pathname.split("/").filter(Boolean)[0] || "";
  } else if (YOUTUBE_HOSTS.has(host)) {
    const segments = url.pathname.split("/").filter(Boolean);
    const section = (segments[0] || "").toLowerCase();
    if (section === "watch") {
      candidate = url.searchParams.get("v") || "";
    } else if (YOUTUBE_ID_PATHS.has(section)) {
      candidate = segments[1] || "";
    }
  } else {
    return "";
  }
  return YOUTUBE_VIDEO_ID_PATTERN.test(candidate) ? candidate : "";
}

export function isYouTubeUrl(value) {
  return Boolean(parseYouTubeVideoId(value));
}

export function youtubeThumbnailUrl(id) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function parseYouTubeMetadata(oembed, pageUrl) {
  const source = oembed && typeof oembed === "object" ? oembed : {};
  const videoId = parseYouTubeVideoId(pageUrl);
  const imageUrl = resolveImageUrl(source.thumbnail_url ?? "", pageUrl)
    || (videoId ? youtubeThumbnailUrl(videoId) : "");
  return {
    title: cleanText(source.title, 160),
    description: cleanText(source.author_name, 160),
    imageUrl,
    price: null,
    currency: "",
    kind: "video",
  };
}

export { isKinopoiskUrl, kinopoiskContentUrlError };

export function parseKinopoiskMetadata(pageUrl) {
  return {
    title: "",
    description: "",
    imageUrl: kinopoiskPosterUrl(pageUrl),
    price: null,
    currency: "",
    kind: "media",
  };
}

export function parseBookmateMetadata(payload, pageUrl) {
  const source = payload?.book ?? payload?.audiobook ?? payload?.comicbook ?? {};
  const authors = typeof source.authors === "string"
    ? source.authors
    : (Array.isArray(source.authors) ? source.authors : source.authors_objects || [])
      .map((author) => author?.name)
      .filter(Boolean)
      .join(", ");

  return {
    title: cleanText(source.title, 160),
    description: cleanText(source.annotation || source.editor_annotation || authors, 1_000),
    imageUrl: resolveImageUrl(source.cover?.large || source.cover?.small, pageUrl),
    price: null,
    currency: "",
    kind: "media",
  };
}

export function parseProductMetadata(source, pageUrl) {
  const html = String(source ?? "");
  const { meta, microdata, scriptBodies } = collectHtmlData(html);
  const structured = productDetails(parseJsonLd(scriptBodies));
  const documentTitle = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] || "";
  const twitterPrice = [1, 2]
    .map((index) => ({
      label: metaValue(meta, `twitter:label${index}`),
      amount: metaValue(meta, `twitter:data${index}`),
    }))
    .find(({ label, amount }) => amount && /price|цена|стоимость/i.test(label));

  const metadataPrice = {
    amount: metaValue(meta, "product:price:amount", "og:price:amount", "product:price", "price") || twitterPrice?.amount || "",
    currency: metaValue(meta, "product:price:currency", "og:price:currency", "price:currency"),
  };
  const microdataPrice = {
    amount: microdataValue(microdata, "price", "lowprice", "highprice"),
    currency: microdataValue(microdata, "pricecurrency"),
  };
  const priceSources = [metadataPrice, structured, microdataPrice];
  const selectedPrice = priceSources.find(({ amount }) => normalizePrice(amount) !== null) || { amount: "", currency: "" };

  const title = cleanText(
    metaValue(meta, "og:title", "twitter:title")
      || structured.title
      || microdataValue(microdata, "name", "headline")
      || documentTitle,
    160,
  );
  const description = cleanText(
    metaValue(meta, "og:description", "twitter:description", "description")
      || structured.description
      || microdataValue(microdata, "description"),
    1_000,
  );
  const metadataImageUrl = metaValue(meta, "og:image:secure_url", "og:image", "twitter:image", "twitter:image:src");
  const mifMetadataImageUrl = isMifUrl(pageUrl) && /^assets\//i.test(metadataImageUrl.trim())
    ? `/${metadataImageUrl.trim()}`
    : metadataImageUrl;
  const rawImageUrl = (isMifUrl(pageUrl) ? structured.offerImageUrl || structured.imageUrl : "")
    || mifMetadataImageUrl
    || structured.imageUrl
    || structured.offerImageUrl
    || microdataValue(microdata, "image", "thumbnailurl", "contenturl");

  return {
    title,
    description,
    imageUrl: resolveImageUrl(rawImageUrl, pageUrl),
    price: normalizePrice(selectedPrice.amount),
    currency: normalizeCurrency(
      selectedPrice.currency
        || metadataPrice.currency
        || structured.currency
        || microdataPrice.currency,
      selectedPrice.amount,
    ),
  };
}

export function parseStructuredProductMetadata(source, pageUrl) {
  const html = String(source ?? "");
  const { scriptBodies } = collectHtmlData(html);
  const structured = productDetails(parseJsonLd(scriptBodies));
  const price = normalizePrice(structured.amount);
  return {
    productFound: structured.productFound === true,
    title: cleanText(structured.title, 160),
    description: cleanText(structured.description, 1_000),
    imageUrl: resolveImageUrl(structured.imageUrl || structured.offerImageUrl, pageUrl),
    productUrl: resolveImageUrl(structured.productUrl, pageUrl),
    price,
    currency: price === null ? "" : normalizeCurrency(structured.currency, structured.amount),
  };
}

export function parseLavkaMetadata(source, pageUrl) {
  const html = String(source ?? "");
  const generic = parseProductMetadata(html, pageUrl);
  const structured = parseStructuredProductMetadata(html, pageUrl);

  return {
    title: cleanText(structured.title, 160) || generic.title,
    description: cleanText(structured.description, 1_000) || generic.description,
    imageUrl: structured.imageUrl || generic.imageUrl,
    price: structured.price ?? generic.price,
    currency: structured.price === null
      ? generic.currency
      : structured.currency,
  };
}

function nextImageSource(value, pageUrl) {
  const resolved = resolveImageUrl(value, pageUrl);
  if (!resolved) return "";
  try {
    const url = new URL(resolved);
    if (url.pathname !== "/_next/image") return url.href;
    return resolveImageUrl(url.searchParams.get("url") || "", pageUrl);
  } catch {
    return "";
  }
}

function busheRscProduct(html) {
  const escaped = /\\"product\\":\{\\"id\\":\d+,\\"name\\":\\"([^"\\]+)\\"[\s\S]{0,20000}?\\"prices\\":\{\\"deliveryPrice\\":([0-9.]+|null),\\"price\\":([0-9.]+|null)/i.exec(html);
  const plain = /"product":\{"id":\d+,"name":"([^"]+)"[\s\S]{0,20000}?"prices":\{"deliveryPrice":([0-9.]+|null),"price":([0-9.]+|null)/i.exec(html);
  const match = escaped || plain;
  if (!match) return { title: "", price: null };
  return {
    title: cleanText(match[1], 160),
    price: normalizePrice(match[2] === "null" ? match[3] : match[2]),
  };
}

export function parseBusheMetadata(source, pageUrl) {
  const html = String(source ?? "");
  const titleMatch = /<(h[1-6])\b[^>]*class=["'][^"']*ProductContent_title__[^"']*["'][^>]*>([\s\S]*?)<\/\1\s*>/i.exec(html);
  const weightMatch = /<span\b[^>]*class=["'][^"']*ProductContent_weight__[^"']*["'][^>]*>([\s\S]*?)<\/span\s*>/i.exec(html);
  const descriptionMatch = /<p\b[^>]*class=["'][^"']*ProductContent_description__[^"']*["'][^>]*>([\s\S]*?)<\/p\s*>/i.exec(html);
  const galleryStart = /<[^>]+class=["'][^"']*DetailProduct_gallery__[^"']*["'][^>]*>/i.exec(html);
  const galleryHtml = galleryStart
    ? html.slice((galleryStart.index ?? 0) + galleryStart[0].length, (galleryStart.index ?? 0) + galleryStart[0].length + 100_000)
    : "";
  const imageTag = /<img\b((?:"[^"]*"|'[^']*'|[^'">])*)>/i.exec(galleryHtml);
  const imageSource = imageTag ? parseAttributes(imageTag[1]).src || "" : "";
  const rsc = busheRscProduct(html);
  const shortTitle = cleanText(titleMatch?.[2], 160);
  const weight = cleanText(weightMatch?.[1], 40);
  const titleWithWeight = shortTitle && weight && !shortTitle.toLowerCase().includes(weight.toLowerCase())
    ? `${shortTitle} ${weight}`
    : shortTitle;

  return {
    title: rsc.title || cleanText(titleWithWeight, 160),
    description: cleanText(descriptionMatch?.[1], 1_000),
    imageUrl: nextImageSource(imageSource, pageUrl),
    price: rsc.price,
    currency: rsc.price === null ? "" : "RUB",
  };
}
