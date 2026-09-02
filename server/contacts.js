import { CONTACT_CATEGORIES, CONTACT_COMPANIES, CONTACTS } from "./contacts-data.js";
import { STATIC_CONTACT_AVATAR_IDS } from "./contact-avatar-data.js";

export const CONTACTS_PAGE_SIZE = 48;

const CONFIRMED_CONTACT_AVATARS = new Map([
  ["78263f44640e0e30e5f1", "/contact-avatars/78263f44640e0e30e5f1.png"],
]);

const indexedContacts = CONTACTS.map((contact) => ({
  contact,
  searchText: [contact.name, contact.company, contact.role, contact.category, contact.status, contact.notes]
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase("ru"),
}));
const contactsById = new Map(CONTACTS.map((contact) => [contact.id, contact]));

function parseOverrideLinks(value, fallback) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function mergeContactOverride(contact, override) {
  if (!contact || !override) return contact;
  return {
    ...contact,
    name: override.name ?? contact.name,
    company: override.company ?? contact.company,
    role: override.role ?? contact.role,
    category: override.category ?? contact.category,
    status: override.status ?? contact.status,
    avatarUrl: override.avatarUrl ?? override.avatar_url ?? contact.avatarUrl ?? "",
    links: parseOverrideLinks(override.links ?? override.linksJson ?? override.links_json, contact.links),
    notes: override.notes ?? contact.notes,
    deletedAt: override.deletedAt ?? override.deleted_at ?? null,
    updatedAt: override.updatedAt ?? override.updated_at ?? null,
  };
}

export function contactFromOverride(override) {
  if (!override) return null;
  const id = override.contactId ?? override.contact_id;
  if (!id) return null;
  return {
    id,
    name: override.name || "",
    company: override.company || "",
    role: override.role || "",
    category: override.category || "",
    status: override.status || "",
    avatarUrl: override.avatarUrl ?? override.avatar_url ?? "",
    links: parseOverrideLinks(override.links ?? override.linksJson ?? override.links_json, []),
    notes: override.notes || "",
    deletedAt: override.deletedAt ?? override.deleted_at ?? null,
    updatedAt: override.updatedAt ?? override.updated_at ?? null,
  };
}

function listContact(contact) {
  const { notes: _notes, deletedAt: _deletedAt, ...summary } = contact;
  return { ...summary, avatarUrl: contactAvatarPath(contact), hasNotes: Boolean(contact.notes) };
}

export function contactAvatarPath(contact) {
  const confirmedAvatar = CONFIRMED_CONTACT_AVATARS.get(contact?.id);
  if (!contact?.avatarUrl && confirmedAvatar) return confirmedAvatar;
  if (!contact?.avatarUrl && !STATIC_CONTACT_AVATAR_IDS.has(contact?.id) && !contact?.links?.some((link) => link.label === "Facebook")) return "";
  const path = `/api/contacts/${encodeURIComponent(contact.id)}/avatar`;
  return contact.updatedAt ? `${path}?v=${encodeURIComponent(new Date(contact.updatedAt).getTime())}` : path;
}

export function findContact(contactId) {
  return contactsById.get(contactId) || null;
}

function facetCounts(contacts, field, label) {
  const counts = new Map();
  for (const contact of contacts) {
    const value = String(contact[field] || "").trim();
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ [label]: value, count }))
    .sort((left, right) => right.count - left.count || left[label].localeCompare(right[label], "ru"));
}

export function listContacts({
  search = "",
  company = "",
  category = "",
  favoriteOnly = false,
  page = 1,
  pageSize = CONTACTS_PAGE_SIZE,
} = {}, overrides = [], favoriteIds = []) {
  const normalizedSearch = String(search).trim().normalize("NFKC").toLocaleLowerCase("ru");
  const normalizedCompany = String(company).trim();
  const normalizedCategory = String(category).trim();
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safePageSize = Math.min(96, Math.max(12, Number.parseInt(pageSize, 10) || CONTACTS_PAGE_SIZE));
  const overrideMap = new Map(overrides.map((override) => [override.contactId ?? override.contact_id, override]));
  const favoriteSet = new Set(favoriteIds);
  const customContacts = overrides
    .filter((override) => (
      !contactsById.has(override.contactId ?? override.contact_id)
      && !(override.deletedAt ?? override.deleted_at)
    ))
    .map(contactFromOverride)
    .filter(Boolean);
  const importedContacts = CONTACTS.flatMap((contact, index) => {
    const override = overrideMap.get(contact.id);
    if (override?.deletedAt ?? override?.deleted_at) return [];
    const merged = overrideMap.size ? mergeContactOverride(contact, override) : contact;
    return {
      contact: { ...merged, favorite: favoriteSet.has(contact.id) },
      searchText: overrideMap.size
        ? [merged.name, merged.company, merged.role, merged.category, merged.status, merged.notes]
          .join(" ")
          .normalize("NFKC")
          .toLocaleLowerCase("ru")
        : indexedContacts[index].searchText,
      sourceIndex: index,
    };
  });
  const searchableContacts = [
    ...customContacts.map((contact, index) => ({
      contact: { ...contact, favorite: favoriteSet.has(contact.id) },
      searchText: [contact.name, contact.company, contact.role, contact.category, contact.status, contact.notes]
        .join(" ")
        .normalize("NFKC")
        .toLocaleLowerCase("ru"),
      sourceIndex: index - customContacts.length,
    })),
    ...importedContacts,
  ];
  const matches = searchableContacts.filter(({ contact, searchText }) => (
    (!normalizedSearch || searchText.includes(normalizedSearch))
    && (!normalizedCompany || contact.company === normalizedCompany)
    && (!normalizedCategory || contact.category === normalizedCategory)
    && (!favoriteOnly || contact.favorite)
  )).sort((left, right) => Number(right.contact.favorite) - Number(left.contact.favorite) || left.sourceIndex - right.sourceIndex);
  const start = (safePage - 1) * safePageSize;
  return {
    contacts: matches.slice(start, start + safePageSize).map(({ contact }) => listContact(contact)),
    allTotal: searchableContacts.length,
    favoriteTotal: favoriteSet.size,
    total: matches.length,
    page: safePage,
    pageSize: safePageSize,
    hasMore: start + safePageSize < matches.length,
    facets: {
      companies: overrideMap.size ? facetCounts(searchableContacts.map(({ contact }) => contact), "company", "company") : CONTACT_COMPANIES,
      categories: overrideMap.size ? facetCounts(searchableContacts.map(({ contact }) => contact), "category", "category") : CONTACT_CATEGORIES,
    },
  };
}
