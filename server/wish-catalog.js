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

export function catalogIdentityKey(row) {
  const space = row.space || "products";
  const vehicle = normalizeText(`${row.vehicle_make || ""} ${row.vehicle_model || ""}`);
  if (space === "transport" && vehicle) return `${space}:vehicle:${vehicle}`;

  const title = normalizeText(row.title);
  if (title) return `${space}:title:${title}`;

  const url = canonicalCatalogUrl(row.url);
  if (url) return `${space}:url:${url}`;

  return `${space}:wish:${row.source_wish_id || row.id}`;
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
      };
      groups.set(key, group);
    }

    group.wishCount += 1;
    if (!group._ownerIds.has(row.owner_id)) {
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

  return [...groups.values()].map((group) => {
    group.ownerCount = group.owners.length;
    delete group._ownerIds;
    return group;
  });
}
