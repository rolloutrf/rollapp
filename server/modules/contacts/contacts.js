export const CONTACTS_PAGE_SIZE = 48;

function parseLinks(value) {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

export function contactFromOverride(row) {
  if (!row) return null;
  const id = row.contactId ?? row.contact_id;
  if (!id) return null;
  return {
    id, name: row.name || "", company: row.company || "", role: row.role || "",
    category: row.category || "", status: row.status || "",
    avatarUrl: row.avatarUrl ?? row.avatar_url ?? "",
    links: parseLinks(row.links ?? row.linksJson ?? row.links_json), notes: row.notes || "",
    deletedAt: row.deletedAt ?? row.deleted_at ?? null,
    updatedAt: row.updatedAt ?? row.updated_at ?? null,
  };
}

export function contactAvatarPath(contact) {
  if (!contact?.avatarUrl && !contact?.links?.some(link => link.label === "Facebook")) return "";
  const url = `/api/contacts/${encodeURIComponent(contact.id)}/avatar`;
  return contact.updatedAt ? `${url}?v=${encodeURIComponent(new Date(contact.updatedAt).getTime())}` : url;
}

function facetCounts(contacts, field) {
  const counts = new Map();
  for (const contact of contacts) {
    const value = String(contact[field] || "").trim();
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ [field]: value, count }))
    .sort((left, right) => right.count - left.count || left[field].localeCompare(right[field], "ru"));
}

// Rows have already been scoped to the authenticated owner by the API query.
// No shared contacts or fallback content are available to another account.
export function listContacts({ search = "", company = "", category = "", favoriteOnly = false, order = "favorites", page = 1, pageSize = CONTACTS_PAGE_SIZE } = {}, rows = [], favoriteIds = []) {
  const favorites = new Set(favoriteIds);
  const contacts = rows.map(contactFromOverride).filter(contact => contact && !contact.deletedAt)
    .map(contact => ({ ...contact, favorite: favorites.has(contact.id) }));
  const normalizedSearch = String(search).trim().normalize("NFKC").toLocaleLowerCase("ru");
  const matches = contacts.filter(contact => (
    (!normalizedSearch || [contact.name, contact.company, contact.role, contact.category, contact.status, contact.notes].join(" ").normalize("NFKC").toLocaleLowerCase("ru").includes(normalizedSearch))
    && (!company || contact.company === String(company).trim())
    && (!category || contact.category === String(category).trim())
    && (!favoriteOnly || contact.favorite)
  )).sort((left, right) => order === "source" ? 0 : Number(right.favorite) - Number(left.favorite));
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safePageSize = Math.min(96, Math.max(12, Number.parseInt(pageSize, 10) || CONTACTS_PAGE_SIZE));
  const start = (safePage - 1) * safePageSize;
  return {
    contacts: matches.slice(start, start + safePageSize).map(({ notes, deletedAt: ignoredDeleted, ...contact }) => ({ ...contact, avatarUrl: contactAvatarPath(contact), hasNotes: Boolean(notes) })),
    allTotal: contacts.length, favoriteTotal: contacts.filter(contact => contact.favorite).length,
    total: matches.length, page: safePage, pageSize: safePageSize, hasMore: start + safePageSize < matches.length,
    facets: { companies: facetCounts(contacts, "company"), categories: facetCounts(contacts, "category") },
  };
}
