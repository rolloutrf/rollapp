import { CalendarDays, Car, Clapperboard, MapPin, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { isGeneralList } from "./list-navigation.js";

export const SPACES = [
  { id: "products", label: "Товары", icon: ShoppingBag },
  { id: "places", label: "Места", icon: MapPin },
  { id: "events", label: "События", icon: CalendarDays },
  { id: "media", label: "Медиа", icon: Clapperboard },
  { id: "food", label: "Еда", icon: UtensilsCrossed },
  { id: "transport", label: "Транспорт", icon: Car },
];

export const SPACE_IDS = SPACES.map((space) => space.id);

export const listSpace = (list) => (SPACE_IDS.includes(list?.space) ? list.space : "products");

export const wishBelongsToSpace = (wish, listsById, space) => {
  const categoryListIds = (wish?.listIds || []).filter((id) => {
    const list = listsById.get(id);
    return list && !isGeneralList(list);
  });
  if (SPACE_IDS.includes(wish?.space)) {
    return wish.space === space || categoryListIds.some((id) => listSpace(listsById.get(id)) === space);
  }
  if (categoryListIds.length === 0) return space === "products";
  return categoryListIds.some((id) => listSpace(listsById.get(id)) === space);
};

export const wishSpaceId = (wish, lists = []) => {
  if (SPACE_IDS.includes(wish?.space)) return wish.space;
  const listsById = new Map(lists.map((list) => [list.id, list]));
  const spaceId = (wish?.listIds || [])
    .map((id) => listsById.get(id))
    .filter((list) => list && !isGeneralList(list))
    .map((list) => listSpace(list))
    .find((id) => SPACE_IDS.includes(id));
  return spaceId || "products";
};
