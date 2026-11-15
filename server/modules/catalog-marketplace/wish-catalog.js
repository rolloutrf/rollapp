const TRACKING_QUERY_PARAM = /^(?:utm_.+|yclid|gclid|fbclid|ref|referrer|source|from)$/i;

const normalizeText = (value = "") => String(value)
  .normalize("NFKC")
  .toLocaleLowerCase("ru-RU")
  .replace(/[«»“”„"'`]/g, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim()
  .replace(/\s+/g, " ");

export function canonicalCatalogUrl(value = "") {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_QUERY_PARAM.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return "";
  }
}

export function catalogIdentityKey(row = {}) {
  const space = row.space || "products";
  const vehicleMake = row.vehicle_make ?? row.vehicleMake ?? "";
  const vehicleModel = row.vehicle_model ?? row.vehicleModel ?? "";
  const vehicle = normalizeText(`${vehicleMake} ${vehicleModel}`);
  if (space === "transport" && vehicle) return `${space}:vehicle:${vehicle}`;

  const title = normalizeText(row.title);
  if (title) return `${space}:title:${title}`;

  const url = canonicalCatalogUrl(row.url);
  if (url) return `${space}:url:${url}`;

  return `${space}:wish:${row.source_wish_id ?? row.sourceWishId ?? row.id}`;
}

export function externalCatalogReference(value = "") {
  const itemId = String(value);
  if (!itemId.startsWith("external:")) return null;
  const sourceEnd = itemId.indexOf(":", "external:".length);
  if (sourceEnd < 0) return null;
  try {
    const source = decodeURIComponent(itemId.slice("external:".length, sourceEnd));
    const externalId = decodeURIComponent(itemId.slice(sourceEnd + 1));
    return source && externalId ? { source, externalId } : null;
  } catch {
    return null;
  }
}

export function externalCatalogItemId(source, externalId) {
  return `external:${encodeURIComponent(String(source))}:${encodeURIComponent(String(externalId))}`;
}

export function catalogActionKey(item = {}) {
  const externalReference = externalCatalogReference(item.id);
  return externalReference ? String(item.id) : `native:v1:${catalogIdentityKey(item)}`;
}

const ownerFromRow = (row) => ({
  id: row.owner_id,
  username: row.owner_username,
  name: row.owner_name,
  avatarUrl: row.owner_avatar_url || "",
});

const populated = (row, field) => {
  const value = row?.[field];
  return value !== null && value !== undefined && String(value).trim() !== "";
};

const catalogTimestamp = (value) => {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
};

// Preserve only public card content, never the former owner's private state.
export function preservedCatalogRow(row) {
  const fields = ["id", "title", "description", "url", "image_url", "fundraising_url",
    "vehicle_make", "vehicle_model", "price", "currency", "event_date", "space", "created_at"];
  return { ...Object.fromEntries(fields.map((field) => [field, row[field] ?? null])),
    space: row.space || "products", _catalogSnapshot: true };
}

export function groupCatalogRows(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const key = catalogIdentityKey(row);
    let group = groups.get(key);
    if (!group) {
      group = {
        id: row.id,
        title: row.title,
        description: row.description || "",
        url: row.url || "",
        imageUrl: row.image_url || "",
        fundraisingUrl: row.fundraising_url || "",
        vehicleMake: row.vehicle_make || "",
        vehicleModel: row.vehicle_model || "",
        price: row.price === null || row.price === undefined ? null : Number(row.price),
        currency: row.currency || "RUB",
        eventDate: row.event_date || null,
        space: row.space || "products",
        createdAt: row.created_at,
        owners: [],
        ownerCount: 0,
        wishCount: 0,
        _ownerIds: new Set(),
        _identityKey: key,
        _representativeTime: catalogTimestamp(row.created_at),
      };
      groups.set(key, group);
    }

    const rowTime = catalogTimestamp(row.created_at);
    if (rowTime < group._representativeTime
      || (rowTime === group._representativeTime && String(row.id).localeCompare(String(group.id)) < 0)) {
      group.id = row.id;
      group.createdAt = row.created_at;
      group._representativeTime = rowTime;
    }

    if (!row._catalogSnapshot) group.wishCount += 1;
    if (row.owner_id && !group._ownerIds.has(row.owner_id)) {
      group._ownerIds.add(row.owner_id);
      group.owners.push(ownerFromRow(row));
    }

    // Rows arrive newest first. Keep their primary data, but fill any missing
    // preview fields from another public copy of the same catalog position.
    if (!group.imageUrl && populated(row, "image_url")) group.imageUrl = row.image_url;
    if (!group.url && populated(row, "url")) group.url = row.url;
    if (!group.description && populated(row, "description")) group.description = row.description;
    if (group.price === null && row.price !== null && row.price !== undefined) {
      group.price = Number(row.price);
      group.currency = row.currency || group.currency;
    }
  }

  return [...groups.values()]
    .sort((first, second) => (
      second._representativeTime - first._representativeTime
      || first._identityKey.localeCompare(second._identityKey)
    ))
    .map((group) => {
      group.ownerCount = group.owners.length;
      delete group._ownerIds;
      delete group._identityKey;
      delete group._representativeTime;
      return group;
    });
}
