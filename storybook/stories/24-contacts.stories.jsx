import { useState } from "react";
import { ContactsSpherePage, ContactCreateDrawer, ContactDetailDrawer } from "@/modules/contacts/contacts-page.jsx";
import { Button } from "@/components/ui/button";
import { Page, Scenario, person, hold, fixtureError, noop } from "../support.jsx";

export default { id: "rollapp-contacts", title: "РОЛЛАПП/Модули РОЛЛАПП/24 Контакты" };

const contact = { ...person, id: "contact-1", company: "Северная студия", role: "Дизайнер", favorite: true,
  links: [{ label: "Сайт", url: "https://example.test" }], notes: "Познакомились на проектной встрече." };
const all = [contact, { ...contact, id: "contact-2", name: "Софья Ветрова", company: "Мастерская", favorite: false }];
function Contacts({ state, mode, readOnly = false }) {
  const [open, setOpen] = useState(mode !== "list");
  const routes = {
    "GET /contacts": (path) => {
      if (state === "loading") return hold();
      if (state === "error") throw fixtureError("Адресная книга временно недоступна.");
      const query = new URL(path, "http://storybook.local").searchParams;
      const search = (query.get("search") || "").toLowerCase();
      const matches = state === "empty" ? [] : all.filter(item => item.name.toLowerCase().includes(search) && (!query.get("favorite") || item.favorite));
      return { contacts: matches, total: matches.length, favoriteTotal: 1, page: 1, pageSize: 24, hasMore: false, facets: { companies: all.map(item => item.company) } };
    },
    "GET /contacts/*": (path) => ({ contact: all.find(item => path.endsWith(item.id)) ?? contact, tasks: [], notes: [] }),
    "PATCH /contacts/*": (_, values) => ({ contact: { ...contact, ...values } }),
    "POST /contacts": (_, values) => ({ contact: { ...contact, ...values } }),
    "DELETE /contacts/*": {},
    RESOLVECONTACTAVATAR: {},
    UPLOADIMAGE: { id: "storybook-contact-image", url: "/art/plant.svg" },
  };
  return <Scenario path="/app/spheres/career?tab=contacts" routes={routes}><Page>
    {mode === "list" ? <ContactsSpherePage /> : <Button className="self-center" onClick={() => setOpen(true)}>Открыть контакт</Button>}
    {open && (mode === "new"
      ? <ContactCreateDrawer companies={["Северная студия"]} onClose={() => setOpen(false)} onCreated={noop} />
      : <ContactDetailDrawer contactId={contact.id} companies={["Северная студия"]} readOnly={readOnly} onClose={() => setOpen(false)} onUpdated={noop} onDeleted={noop} />)}
  </Page></Scenario>;
}
export const Directory = { name: "Адресная книга, поиск и избранное", render: Contacts, args: { mode: "list", state: "ready", readOnly: false } };
export const Empty = { ...Directory, name: "Контактов пока нет", args: { ...Directory.args, state: "empty" } };
export const Loading = { ...Directory, name: "Загрузка контактов", args: { ...Directory.args, state: "loading" } };
export const Error = { ...Directory, name: "Ошибка загрузки", args: { ...Directory.args, state: "error" } };
export const Detail = { ...Directory, name: "Редактор контакта", args: { ...Directory.args, mode: "edit" } };
export const Creation = { ...Directory, name: "Новый контакт", args: { ...Directory.args, mode: "new" } };
export const ReadOnly = { ...Detail, name: "Карточка только для чтения", args: { ...Detail.args, readOnly: true } };
