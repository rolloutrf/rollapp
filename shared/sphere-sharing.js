export const SPHERE_SECTIONS = {
  wishlist: ["wishlist"],
  identity: ["four-questions", "values", "character", "gallup", "hogan", "mission", "life-strategy", "theses", "principles"],
  career: ["about", "domain", "cv", "performance", "development-plan", "contacts"],
  education: ["courses", "conferences", "coaching"],
  health: ["lab-results", "sport", "medications"],
  contacts: ["contacts"],
};

export const SPHERE_SECTION_LABELS = {
  wishlist: "Вишлист",
  "four-questions": "4 вопроса",
  values: "Ценности",
  character: "Характер",
  gallup: "Gallup",
  hogan: "Hogan",
  mission: "Миссия",
  "life-strategy": "Жизненная стратегия",
  theses: "Тезисы",
  principles: "Принципы",
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

export function canonicalSphereSection(sphere, section) {
  return { sphere: sphere === "contacts" && section === "contacts" ? "career" : sphere, section };
}

// Keep existing contact grants and pending requests in their original scope.
// Moving the navigation must not reset access or grant access to other career spaces.
export function sphereSectionStorageScope(sphere, section) {
  return { sphere: sphere === "career" && section === "contacts" ? "contacts" : sphere, section };
}

export function sphereSectionPath({ ownerUsername = "", sphere, section }) {
  ({ sphere, section } = canonicalSphereSection(sphere, section));
  const pathname = sphere === "wishlist"
    ? ownerUsername ? `/u/${encodeURIComponent(ownerUsername)}` : "/app/wishes"
    : `/app/spheres/${encodeURIComponent(sphere)}`;
  const search = new URLSearchParams();
  if (sphere !== "wishlist") search.set("tab", section);
  if (ownerUsername && sphere !== "wishlist") search.set("owner", ownerUsername);
  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}
