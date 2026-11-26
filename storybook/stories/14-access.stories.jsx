import { BusinessAccessPage } from "@/modules/access/sphere-access.jsx";
import { Page, Scenario, hold, person, fixtureError } from "../support.jsx";
import { seller } from "../samples.js";

export default { id: "rollapp-access", title: "РОЛЛАПП/Модули/14 Доступ и выдача прав" };

const sellerAccount = { ...seller, accountType: "business", businessCategory: "seller", sellerSpace: "products" };
const shares = [
  { owner: { ...person, id: "storybook-client-1" }, sphere: "wishlist", section: "products" },
  { owner: { id: "storybook-client-2", name: "Дарья Соколова", username: "storybook-client-2" }, sphere: "wishlist", section: "wishlist" },
];

function Access({ state }) {
  const incoming = state === "loading" ? hold
    : state === "error" ? () => { throw fixtureError("Не удалось загрузить ранее открытые разделы."); }
    : { shares: state === "empty" ? [] : shares };
  return <Scenario user={sellerAccount} routes={{ "GET /sphere-shares/incoming": incoming }}>
    <Page title="Доступ и выдача прав"><BusinessAccessPage embedded /></Page>
  </Scenario>;
}
export const Request = { name: "Клиенты бизнеса", render: Access, args: { state: "ready" } };
export const Empty = { ...Request, name: "Клиентов пока нет", args: { state: "empty" } };
export const Loading = { ...Request, name: "Загрузка разделов", args: { state: "loading" } };
export const Failure = { ...Request, name: "Ошибка загрузки", args: { state: "error" } };
