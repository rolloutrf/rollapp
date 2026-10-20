import { api } from "@/api";
import { resolvedCourseLogoUrl, siteLogoUrl } from "@/lib/education-logo";
import { wishPreviewImageUrl } from "../../shared/kinopoisk.js";

export const RELATED_KINDS = [
  { id: "wishlist", label: "Вишлист" },
  { id: "workout", label: "Здоровье · тренировки" },
  { id: "medication", label: "Здоровье · лекарства" },
  { id: "lab-result", label: "Здоровье · анализы" },
  { id: "course", label: "Образование · курсы" },
  { id: "conference", label: "Образование · конференции" },
  { id: "coaching", label: "Образование · коучинг" },
  { id: "contact", label: "Контакты" },
];

const sources = [
  ["wishlist", "/dashboard", "wishes", (item) => item.title, (item) => item.description, (item) => wishPreviewImageUrl(item)],
  ["workout", "/health/workouts", "workouts", (item) => item.title, (item) => item.notes || item.workoutType],
  ["medication", "/health/medications", "medications", (item) => item.name, (item) => item.purpose || item.instructions || item.notes || [item.dosage, item.frequency].filter(Boolean).join(" · ")],
  ["lab-result", "/health/lab-results", "reports", (item) => `${item.dateLabel || item.date || "Анализы"}${item.lab ? ` · ${item.lab}` : ""}`, (item) => item.note],
  ["course", "/education/courses", "courses", (item) => item.title, (item) => item.description || item.provider, (item) => resolvedCourseLogoUrl(item)],
  ["conference", "/education/conferences", "conferences", (item) => item.title, (item) => item.description || [item.role, item.location].filter(Boolean).join(" · "), (item) => item.logoUrl || siteLogoUrl(item.url)],
  ["coaching", "/education/coaching-sessions", "sessions", (item) => item.title, (item) => item.description || [item.coach, item.location].filter(Boolean).join(" · ")],
];

function snippetText(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, " ").replace(/[#*_`>~]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
}

function priceLabel(item) {
  if (item.price == null || !Number.isFinite(Number(item.price))) return "";
  try { return new Intl.NumberFormat("ru-RU", { style: "currency", currency: item.currency || "RUB", maximumFractionDigits: 0 }).format(Number(item.price)); }
  catch { return ""; }
}

export async function loadRelatedContacts(search = "") {
  const items = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const params = new URLSearchParams({ pageSize: "96", page: String(page) });
    if (search.trim()) params.set("search", search.trim());
    const payload = await api.get(`/contacts?${params}`);
    items.push(...(payload.contacts || []).filter(({ id, name }) => id && name).map(({ id, name, role, company, category, avatarUrl }) => ({ kind: "contact", id: String(id), title: String(name).slice(0, 200), snippet: snippetText([role, company, category].filter(Boolean).join(" · ")), imageUrl: avatarUrl || "" })));
    hasMore = Boolean(payload.hasMore);
    page += 1;
  }
  return items;
}

export async function loadRelatedItems() {
  const settled = await Promise.allSettled([...sources.map(async ([kind, path, key, title, snippet, image]) => {
    const payload = await api.get(path);
    return (payload[key] || []).filter((item) => item.id && title(item)).map((item) => ({ kind, id: String(item.id), title: String(title(item)).slice(0, 200), snippet: snippetText(snippet(item)), imageUrl: image?.(item) || "", priceLabel: kind === "wishlist" ? priceLabel(item) : "" }));
  }), loadRelatedContacts()]);
  return {
    items: settled.flatMap((result) => result.status === "fulfilled" ? result.value : []),
    failedKinds: settled.flatMap((result, index) => result.status === "rejected" ? [sources[index]?.[0] || "contact"] : []),
  };
}

export const relatedKindLabel = (kind) => RELATED_KINDS.find((item) => item.id === kind)?.label || kind;
