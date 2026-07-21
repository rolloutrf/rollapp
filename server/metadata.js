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
    const candidate = {
      title: firstScalar(product.name ?? product.headline),
      description: firstScalar(product.description),
      imageUrl: firstScalar(product.image ?? product.photo ?? product.thumbnailUrl),
      amount: offer.amount || firstScalar(product.price),
      currency: offer.currency || firstScalar(product.priceCurrency),
    };
    const score = Number(Boolean(candidate.title)) * 2
      + Number(Boolean(candidate.imageUrl)) * 2
      + Number(normalizePrice(candidate.amount) !== null) * 3
      + Number(Boolean(candidate.description));
    if (!best || score > best.score) best = { ...candidate, score };
  }

  if (best) return best;
  const offer = offerDetails(standaloneOffers);
  return { title: "", description: "", imageUrl: "", amount: offer.amount, currency: offer.currency, score: 0 };
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
  const rawImageUrl = metaValue(meta, "og:image:secure_url", "og:image", "twitter:image", "twitter:image:src")
    || structured.imageUrl
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
