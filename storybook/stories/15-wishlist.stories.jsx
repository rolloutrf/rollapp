import { useState } from "react";
import { WishCard } from "@/modules/card/wish-card.jsx";
import { WishModal, ListModal } from "@/modules/wishlist/wish-editor.jsx";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/modules/shell/page-feedback.jsx";
import { Page, Scenario, owner, hold, fixtureError, noop } from "../support.jsx";
import { sampleWish } from "../samples.js";

export default { id: "rollapp-wishlist", title: "РОЛЛАПП/Модули/15 Вишлист" };

const sampleLists = [{ id: "gifts", title: "Подарки", space: "products", privacy: "private" }];
function Wishlist({ form, space, owned, state }) {
  const [open, setOpen] = useState(Boolean(form));
  const [wish, setWish] = useState({ ...sampleWish, space, status: state === "fulfilled" ? "fulfilled" : "active", listIds: ["gifts"] });
  const routes = {
    "GET /dashboard": state === "loading" ? hold : state === "error" ? () => { throw fixtureError("Не удалось загрузить списки."); } : { wishLists: sampleLists, lists: sampleLists, wishes: [wish] },
    "POST /wishes": (_, body) => ({ wish: { ...body, id: wish.id } }),
    "PATCH /wishes/storybook-wish": (_, body) => ({ wish: { ...body, id: wish.id } }),
    "DELETE /wishes/storybook-wish": {},
    "POST /lists": (_, body) => ({ list: { ...body, id: "new-list" } }),
  };
  return <Scenario user={owned ? owner : null} routes={routes}><Page title="Мои желания" className="wishes-page">
    {state === "empty" ? <EmptyState title="Желаний пока нет" /> : <div className="w-full max-w-sm">
      <WishCard wish={wish} owner={owned} profile={owner} lists={sampleLists} onOpen={() => setOpen(true)} onEdit={() => setOpen(true)} onChanged={noop} />
    </div>}
    {owned && <Button className="self-center" onClick={() => setOpen(true)}>{form === "list" ? "Создать список" : "Открыть форму желания"}</Button>}
    {open && (form === "list" ? <ListModal space={space} onClose={() => setOpen(false)} onSaved={() => setOpen(false)} />
      : <WishModal space={space} wish={form === "new" ? null : wish} onSaved={(value) => { if (value?.title) setWish(value); setOpen(false); }}
          onClose={() => setOpen(false)} onDeleted={() => setOpen(false)} />)}
  </Page></Scenario>;
}
export const Wishes = { name: "Желание в списке владельца", render: Wishlist, args: { form: "", space: "products", owned: true, state: "ready" } };
export const Guest = { ...Wishes, name: "Публичный вишлист", args: { ...Wishes.args, owned: false } };
export const Fulfilled = { ...Wishes, name: "Исполненное желание", args: { ...Wishes.args, state: "fulfilled" } };
export const Empty = { ...Wishes, name: "Пустой список", args: { ...Wishes.args, state: "empty" } };
export const New = { ...Wishes, name: "Создание товара", args: { ...Wishes.args, form: "new" } };
export const Event = { ...New, name: "Создание события с датой", args: { ...New.args, space: "events" } };
export const Place = { ...New, name: "Создание места", args: { ...New.args, space: "places" } };
export const Content = { ...New, name: "Создание медиа", args: { ...New.args, space: "media" } };
export const Food = { ...New, name: "Создание желания в еде", args: { ...New.args, space: "food" } };
export const Transport = { ...New, name: "Создание желания о транспорте", args: { ...New.args, space: "transport" } };
export const Edit = { ...Wishes, name: "Редактирование и удаление", args: { ...Wishes.args, form: "edit" } };
export const List = { ...New, name: "Имя и приватность списка", args: { ...New.args, form: "list" } };
