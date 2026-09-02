function parseCategories(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function externalCatalogItemFromRow(row) {
  const source = String(row.source || "external");
  const externalId = String(row.external_id || "");
  return {
    id: `external:${source}:${externalId}`,
    title: String(row.title || ""),
    description: String(row.description || ""),
    url: String(row.url || ""),
    imageUrl: String(row.image_url || ""),
    price: row.price == null ? null : Number(row.price),
    currency: String(row.currency || "RUB"),
    space: String(row.space || "products"),
    eventDate: null,
    owners: [],
    ownerCount: 0,
    wishCount: 0,
    categories: parseCategories(row.categories_json),
    source: {
      id: source,
      label: String(row.source_label || source),
      homeUrl: String(row.source_home_url || ""),
      logoUrl: String(row.source_logo_url || ""),
    },
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}
