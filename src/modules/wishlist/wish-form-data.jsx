import { initialWishListIds } from "./wish-lists.js";
import { publicWishPath } from "../../../shared/modules/profile/profile-links.js";

export const WISH_CURRENCIES = ["RUB", "USD", "EUR", "KZT", "BYN"];

export const WISH_CURRENCY_SYMBOLS = { RUB: "₽", USD: "$", EUR: "€", KZT: "₸", BYN: "Br" };

export const isProductUrl = (value) => { try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } };

const YANDEX_MAPS_HOSTS = ["yandex.ru", "yandex.com", "yandex.kz", "yandex.by", "yandex.ua", "ya.ru"];

export const isYandexMapsUrl = (value) => {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase().replace(/^(www\.|maps\.)/, "");
    if (!YANDEX_MAPS_HOSTS.includes(host)) return false;
    return parsed.pathname.startsWith("/maps");
  } catch { return false; }
};

export const uploadedImageIdFromUrl = (value = "") => /^\/api\/media\/([0-9a-f-]{36})$/i.exec(value)?.[1] || "";

export const wishFormFrom = (wish, initialListId = "") => ({
  title: wish?.title || "",
  description: wish?.description || "",
  url: wish?.url || "",
  fundraisingUrl: wish?.fundraisingUrl || "",
  vehicleMake: wish?.vehicleMake || "",
  vehicleModel: wish?.vehicleModel || "",
  imageUrl: wish?.imageUrl || "",
  price: wish?.price == null ? "" : String(wish.price),
  currency: WISH_CURRENCIES.includes(wish?.currency) ? wish.currency : "RUB",
  priority: wish?.priority || 2,
  privacy: wish?.privacy || "inherit",
  allowMultiple: Boolean(wish?.allowMultiple),
  listIds: initialWishListIds(wish, initialListId),
  eventDate: wish?.eventDate || "",
});

export const formatEventDate = (value) => {
  const [year, month, day] = String(value || "").split("-");
  return year && month && day ? `${day}.${month}.${year}` : "";
};

export const attachWishesToDashboardList = (dashboard, listId, wishIds) => {
  const ids = new Set(wishIds);
  let addedActiveCount = 0;
  const wishes = dashboard.wishes.map((wish) => {
    if (!ids.has(wish.id) || wish.listIds?.includes(listId)) return wish;
    if (wish.status === "active") addedActiveCount += 1;
    return { ...wish, listIds: [...(wish.listIds || []), listId] };
  });
  if (!addedActiveCount && wishes.every((wish, index) => wish === dashboard.wishes[index])) return dashboard;
  const lists = addedActiveCount
    ? dashboard.lists.map((list) => list.id === listId
      ? { ...list, wishCount: Number(list.wishCount || 0) + addedActiveCount }
      : list)
    : dashboard.lists;
  return { ...dashboard, wishes, lists };
};

export const isWishSecret = (wish, lists = []) => wish?.privacy === "private" || lists.some((list) => (
  list.privacy === "private" && wish?.listIds?.includes(list.id)
));

export const wishSharePath = ({ wish, profile, lists = [], shareToken = "" }) => {
  if (shareToken) return `/s/${encodeURIComponent(shareToken)}/wishes/${encodeURIComponent(wish.id)}`;
  const linkedLists = lists.filter((list) => wish.listIds?.includes(list.id));
  const linkList = linkedLists.find((list) => list.privacy === "link" && list.shareToken);
  const publiclyReachable = linkedLists.some((list) => list.privacy === "public");
  if (!publiclyReachable && linkList) return `/s/${encodeURIComponent(linkList.shareToken)}/wishes/${encodeURIComponent(wish.id)}`;
  return publicWishPath(profile, wish.id);
};
