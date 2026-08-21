const RETAILERS = [
  {
    id: "lenta",
    label: "Лента",
    hosts: new Set(["lenta.com", "www.lenta.com"]),
    canonicalHost: "lenta.com",
    path: /^\/(?:product|item)\/[^/]+\/?$/i,
    imageUrl: "/retailer-previews/lenta.svg",
  },
  {
    id: "samokat",
    label: "Самокат",
    hosts: new Set(["samokat.ru", "www.samokat.ru"]),
    canonicalHost: "samokat.ru",
    path: /^\/product\/[^/]+\/?$/i,
    imageUrl: "/retailer-previews/samokat.svg",
  },
  {
    id: "lavka",
    label: "Яндекс Лавка",
    hosts: new Set(["lavka.yandex.ru"]),
    canonicalHost: "lavka.yandex.ru",
    path: /^\/good\/[^/]+\/?$/i,
    imageUrl: "/retailer-previews/lavka.svg",
  },
  {
    id: "bushe",
    label: "Буше",
    hosts: new Set(["bushe.ru", "www.bushe.ru"]),
    canonicalHost: "bushe.ru",
    path: /^\/products\/[^/]+\/?$/i,
    imageUrl: "/retailer-previews/bushe.svg",
  },
];

function parseRetailerUrl(value) {
  let url;
  try {
    url = value instanceof URL ? new URL(value.href) : new URL(String(value));
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) return null;
  if (url.username || url.password) return null;
  if (url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))) return null;
  return url;
}

function retailerForUrl(url) {
  return RETAILERS.find((candidate) => (
    candidate.hosts.has(url.hostname.toLowerCase()) && candidate.path.test(url.pathname)
  )) || null;
}

export function canonicalRetailerProductUrl(value) {
  const url = parseRetailerUrl(value);
  if (!url) return null;
  const retailer = retailerForUrl(url);
  if (!retailer) return null;

  url.protocol = "https:";
  url.hostname = retailer.canonicalHost;
  url.port = "";
  url.pathname = url.pathname.replace(/\/$/, "");
  if (retailer.id === "lenta") {
    url.pathname = url.pathname.replace(/^\/item\//i, "/product/");
  }
  if (retailer.id === "lavka" && url.pathname.toLowerCase().endsWith(":st-rt")) {
    const retailSlug = url.searchParams.get("retail_slug") || "";
    if (!/^[a-z0-9_-]{1,100}$/i.test(retailSlug)) return null;
    url.search = "";
    url.searchParams.set("retail_slug", retailSlug);
  } else if (retailer.id === "bushe") {
    const pointId = url.searchParams.get("pointId") || "";
    url.search = "";
    if (/^\d{1,12}$/.test(pointId)) url.searchParams.set("pointId", pointId);
  } else {
    url.search = "";
  }
  url.hash = "";
  return url;
}

export function retailerPreview(value) {
  const url = parseRetailerUrl(value);
  if (!url) return null;
  const retailer = retailerForUrl(url);
  if (!retailer) return null;
  return {
    id: retailer.id,
    label: retailer.label,
    imageUrl: retailer.imageUrl,
  };
}

export function retailerPreviewImageUrl(value) {
  return retailerPreview(value)?.imageUrl || "";
}

export function retailerSupportsAutomaticMetadata(value) {
  const id = retailerPreview(value)?.id;
  return id === "lavka" || id === "bushe";
}
