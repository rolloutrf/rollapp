import { useState } from "react";
import { WishListNavigation } from "@/modules/categories/wish-list-navigation.jsx";
import { SPACES } from "@/modules/categories/wish-spaces.jsx";
import { Page, Scenario, noop } from "../support.jsx";

export default { id: "rollapp-categories", title: "РОЛЛАПП/Модули РОЛЛАУТ/04 Категории" };

function Lists({ count, long, locked }) {
  const [value, setValue] = useState("all");
  const items = Array.from({ length: count }, (_, index) => ({
    id: `list-${index}`, title: long ? `Длинное название списка желаний ${index + 1}` : `Список ${index + 1}`,
  }));
  return <Scenario><Page title="Списки желаний">
    <WishListNavigation value={value} items={items} leadingItem={{ id: "all", title: "Все" }} onSelect={setValue} onSettings={noop} settingsDisabled={locked} />
  </Page></Scenario>;
}
export const Spaces = { name: "Шесть пространств", render: () => <Scenario><Page title="Категории"><WishListNavigation value="products" items={SPACES.map(space => ({ ...space, title: space.title ?? space.label }))} onSelect={noop} /></Page></Scenario> };
export const ListsWithOverflow = { name: "Длинные имена и прокрутка", render: Lists, args: { count: 12, long: true, locked: false } };
export const Empty = { name: "Списков ещё нет", render: Lists, args: { count: 0, long: false, locked: true } };
