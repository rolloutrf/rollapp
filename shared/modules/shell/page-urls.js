import { PROFILE_SPACES } from "../profile/profile-links.js";

// Browser URLs are Russian. Route IDs, API contracts and opaque values keep
// their existing spelling inside the application.
const pageWords = {
  app: "приложение",
  spheres: "сферы",
  identity: "идентичность",
  health: "здоровье",
  career: "карьера",
  education: "образование",
  contacts: "контакты",
  wishes: "желания",
  lists: "списки",
  catalog: "каталог",
  item: "позиция",
  offers: "предложения",
  sales: "продажи",
  listings: "объявления",
  classifieds: "объявления",
  store: "магазин",
  orders: "заказы",
  business: "бизнес",
  access: "доступ",
  assistant: "помощник",
  messenger: "сообщения",
  planning: "планирование",
  "private-notes": "личные-заметки",
  rolls: "роллы",
  "member-number": "номер-участника",
  friends: "друзья",
  subscriptions: "подписки",
  followers: "подписчики",
  search: "поиск",
  settings: "настройки",
  login: "вход",
  register: "регистрация",
  "forgot-password": "восстановление-пароля",
  "reset-password": "новый-пароль",
  ideas: "идеи",
  s: "поделиться",
  products: "товары",
  places: "места",
  events: "события",
  media: "медиа",
  food: "еда",
  transport: "транспорт",
  calendar: "календарь",
  announcements: "публикации",
  book: "запись",
};

const publicSections = [...PROFILE_SPACES, "calendar", "announcements"];
const spherePages = ["identity", "health", "career", "education", "contacts"];
const patterns = [
  ...["login", "register", "forgot-password", "reset-password", "ideas", "app"].map(word => `/${word}`),
  ...[
    "assistant", "messenger", "messenger/:id", "planning", "private-notes", "rolls", "member-number",
    "business/access", "friends", "friends/subscriptions", "friends/followers", "friends/search", "settings",
    "wishes", "wishes/catalog", "wishes/catalog/item/:id", "wishes/offers", "wishes/sales",
    "wishes/listings", "wishes/business", "classifieds", "store", "orders",
  ].map(path => `/app/${path}`),
  ...spherePages.flatMap(sphere => ["", "/business/catalog", "/business/store"].map(suffix => `/app/spheres/${sphere}${suffix}`)),
  "/s/:id",
  "/s/:id/wishes/:id",
  ...publicSections.map(section => `/:username/${section}`),
  "/:username/calendar/book",
  "/:username/lists/:id",
  "/:username/wishes/:id",
].map(path => path.slice(1).split("/"));

const queryWords = {
  add_account: "добавить-аккаунт",
  auth_error: "ошибка-входа",
  auth_success: "вход-выполнен",
  backup: "резервная-копия",
  brand: "бренд",
  business: "компания",
  date: "дата",
  disk: "диск",
  diskSync: "синхронизация-диска",
  draft: "черновик",
  formScreen: "форма",
  next: "далее",
  note: "заметка",
  noteGroup: "группа-заметок",
  owner: "владелец",
  publication: "публикация",
  report: "отчёт",
  sections: "категории",
  slot: "время",
  source: "источник",
  space: "список",
  spaceKind: "тип-списка",
  tab: "раздел",
  view: "вид",
  wish: "желание",
  zone: "часовой-пояс",
};

const tabWords = {
  ...Object.fromEntries(publicSections.map(key => [key, pageWords[key]])),
  "four-questions": "четыре-вопроса",
  values: "ценности",
  character: "характер",
  "identity-reports": "отчёты",
  gallup: "галлап",
  hogan: "хоган",
  mission: "миссия",
  "ideal-state": "идеальное-состояние",
  "life-strategy": "жизненная-стратегия",
  "personal-development-plan": "личный-план-развития",
  theses: "тезисы",
  principles: "принципы",
  about: "о-себе",
  domain: "домен",
  cv: "резюме",
  performance: "результаты",
  "development-plan": "план-развития",
  contacts: pageWords.contacts,
  courses: "курсы",
  conferences: "конференции",
  coaching: "коучинг",
  "lab-results": "анализы",
  sport: "спорт",
  medications: "препараты",
  sleep: "сон",
  nutrition: "питание",
  kanban: "канбан",
  todo: "дела",
  notes: "заметки",
  wishlist: "вишлист",
};

const valueWords = {
  tab: tabWords,
  publication: { calendar: pageWords.calendar, announcements: pageWords.announcements },
  report: { gallup: tabWords.gallup, hogan: tabWords.hogan },
  view: { day: "день", week: "неделя", month: "месяц", year: "год", list: "список", offers: pageWords.offers },
  source: { brands: "бренды", community: "сообщество" },
  space: { ...Object.fromEntries(PROFILE_SPACES.map(key => [key, pageWords[key]])), main: "основной" },
  spaceKind: { todo: tabWords.todo, calendar: pageWords.calendar, kanban: tabWords.kanban },
};

const inviteFragment = { invite: "приглашение" };
const passwordFragment = { token: "ключ" };

function decode(value, form = false) {
  try {
    return decodeURIComponent(form ? value.replaceAll("+", " ") : value);
  } catch {
    return value;
  }
}

function translateWord(words, value, localize) {
  if (!words) return value;
  if (localize) return Object.hasOwn(words, value) ? words[value] : value;
  return Object.keys(words).find(key => words[key] === value) ?? value;
}

function pagePathname(pathname, localize) {
  if (pathname === "/") return pathname;
  const trailingSlash = pathname.endsWith("/") ? "/" : "";
  const segments = pathname.slice(1, trailingSlash ? -1 : undefined).split("/");
  const decoded = segments.map(segment => decode(segment).toLowerCase());
  if (["api", "assets", "art", "avatars"].includes(decoded[0])) return null;
  const pattern = patterns.find(parts => parts.length === segments.length && parts.every((part, index) => {
    if (part === ":username") return /^[\p{L}0-9-]+$/u.test(decoded[index]);
    if (part === ":id") return Boolean(segments[index]);
    return decoded[index] === part || decoded[index] === pageWords[part];
  }));
  if (!pattern) return null;
  return `/${pattern.map((part, index) => part.startsWith(":")
    ? segments[index]
    : localize ? encodeURIComponent(pageWords[part]) : part).join("/")}${trailingSlash}`;
}

function pageParams(text, words, localize, depth) {
  return text.split("&").map(entry => {
    const separator = entry.indexOf("=");
    const key = separator < 0 ? entry : entry.slice(0, separator);
    const decodedKey = decode(key, true);
    const internalKey = translateWord(words, decodedKey, false);
    if (!Object.hasOwn(words, internalKey)) return entry;
    const nextKey = encodeURIComponent(translateWord(words, internalKey, localize));
    if (separator < 0) return nextKey;
    const raw = entry.slice(separator + 1);
    const value = decode(raw, true);
    let next = value;
    if (internalKey === "next" && depth < 3) {
      next = pageUrl(value, localize, depth + 1);
    } else if (words === queryWords) {
      const choices = Object.hasOwn(valueWords, internalKey) ? valueWords[internalKey] : null;
      const internalValue = translateWord(choices, value, false);
      next = translateWord(choices, internalValue, localize);
    }
    return `${nextKey}=${next === value ? raw : encodeURIComponent(next)}`;
  }).join("&");
}

function pageUrl(path, localize, depth = 0) {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const [, pathname, search, hash] = /^(\/[^?#]*)(\?[^#]*)?(#.*)?$/s.exec(path);
  const translatedPath = pagePathname(pathname, localize);
  if (!translatedPath) return path;
  const internalPath = pagePathname(pathname, false).replace(/\/$/, "");
  const fragmentWords = internalPath === "/register" ? inviteFragment : internalPath === "/reset-password" ? passwordFragment : null;
  const fragment = hash && fragmentWords ? `#${pageParams(hash.slice(1), fragmentWords, localize, depth)}` : hash || "";
  return `${translatedPath}${search ? `?${pageParams(search.slice(1), queryWords, localize, depth)}` : ""}${fragment}`;
}

export const localizedPageUrl = path => pageUrl(path, true);
export const internalPageUrl = path => pageUrl(path, false);

export function internalPageSearch(search) {
  return search.startsWith("?") ? `?${pageParams(search.slice(1), queryWords, false, 0)}` : search;
}
