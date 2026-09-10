export const SPHERE_SECTIONS = {
  wishlist: ["wishlist"],
  identity: ["four-questions", "values", "gallup", "hogan", "mission", "life-strategy", "theses"],
  career: ["about", "domain", "cv", "performance", "development-plan"],
  education: ["courses", "conferences", "coaching"],
  health: ["lab-results", "sport", "medications"],
  contacts: ["contacts"],
};

export const SPHERE_SECTION_LABELS = {
  wishlist: "Вишлист",
  "four-questions": "4 вопроса",
  values: "Ценности",
  gallup: "Gallup",
  hogan: "Hogan",
  mission: "Миссия",
  "life-strategy": "Жизненная стратегия",
  theses: "Тезисы",
  about: "О себе",
  domain: "Домен",
  cv: "CV",
  performance: "Перфоманс",
  "development-plan": "ИПР",
  courses: "Курсы",
  conferences: "Конференции",
  coaching: "Коучинг",
  "lab-results": "Анализы",
  sport: "Спорт",
  medications: "Препараты",
  contacts: "Контакты",
};

export function isSphereSection(sphere, section) {
  return Boolean(SPHERE_SECTIONS[sphere]?.includes(section));
}

export function sphereSectionPath({ ownerUsername = "", sphere, section }) {
  const pathname = sphere === "wishlist"
    ? ownerUsername ? `/u/${encodeURIComponent(ownerUsername)}` : "/app/wishes"
    : sphere === "contacts"
    ? "/app/spheres/contacts"
    : `/app/spheres/${encodeURIComponent(sphere)}`;
  const search = new URLSearchParams();
  if (!["contacts", "wishlist"].includes(sphere)) search.set("tab", section);
  if (ownerUsername && sphere !== "wishlist") search.set("owner", ownerUsername);
  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}
