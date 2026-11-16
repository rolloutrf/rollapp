import { useRef } from "react";
import { FriendsPage } from "@/modules/social/friends-page.jsx";
import { Page, Scenario, person, hold, fixtureError } from "../support.jsx";

export default { id: "rollapp-social", title: "РОЛЛАПП/Модули/17 Друзья и подписки" };

function Friends({ section, state }) {
  const following = useRef(section === "subscriptions");
  const routes = {
    "GET /people": (path) => {
      if (state === "loading") return hold();
      if (state === "error") throw fixtureError("Не удалось загрузить список людей.");
      const query = new URL(path, "http://storybook.local").searchParams.get("search");
      return { people: state === "empty" || (query && !person.name.toLowerCase().includes(query.toLowerCase())) ? []
        : [{ ...person, following: following.current, followersCount: 12, birthday: "1991-12-01" }] };
    },
    "POST /profile/storybook-member/follow": () => ({ following: (following.current = !following.current) }),
  };
  return <Scenario key={section} path={`/app/friends/${section}`} route="/app/friends/:section" routes={routes}>
    <Page><FriendsPage /></Page>
  </Scenario>;
}
export const Following = { name: "Подписки", render: Friends, args: { section: "subscriptions", state: "ready" } };
export const Followers = { ...Following, name: "Подписчики", args: { ...Following.args, section: "followers" } };
export const Search = { ...Following, name: "Поиск людей и подписка", args: { ...Following.args, section: "search" } };
export const Empty = { ...Following, name: "Пустой результат", args: { ...Search.args, state: "empty" } };
export const Loading = { ...Following, name: "Загрузка подписок", args: { ...Following.args, state: "loading" } };
export const Error = { ...Following, name: "Ошибка и повтор", args: { ...Following.args, state: "error" } };
