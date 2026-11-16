import { useRef, useState } from "react";
import { CdekPickupPicker, PointDetails } from "@/modules/delivery/cdek-pickup.jsx";
import { Page, noop } from "../support.jsx";
import { cities, points } from "../samples.js";

export default { id: "rollapp-delivery", title: "РОЛЛАПП/Модули/06 Доставка" };

function Pickup({ state }) {
  const [city, setCity] = useState(state === "city" ? null : cities[0]);
  const [query, setQuery] = useState("");
  const [point, setPoint] = useState(null);
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(false);
  const cityAnchor = useRef(null);
  const list = points.filter(item => item.city === city?.name && item.address.toLowerCase().includes(query.toLowerCase()));
  return <Page title="Пункт выдачи СДЭК"><div className="grid max-w-xl gap-4">
    <CdekPickupPicker pickup={{
      cities, cityAnchor, cityCode: city?.code, selectedCity: city, selectCity: (value) => { setCity(value); setQuery(""); setPoint(null); },
      query, changeQuery: setQuery, offset, setOffset, retryCities: () => setRetry(true), retrySearch: () => setRetry(true),
      citiesLoading: state === "cities-loading", citiesError: state === "cities-error" && !retry ? "Не удалось загрузить список городов." : "",
      loading: state === "loading", searchError: state === "error" && !retry ? "Не удалось найти пункты выдачи." : "",
      result: city && { total: state === "empty" ? 0 : list.length, points: state === "empty" ? [] : list, stale: state === "stale", syncedAt: "2026-11-12T10:00:00Z" },
      selectPoint: (code) => setPoint(points.find(item => item.code === code)),
    }} />
    {point && <div className="rounded-xl border p-4"><PointDetails point={point} /></div>}
  </div></Page>;
}
const render = (args) => <Pickup key={args.state} {...args} />;
export const City = { name: "Сначала выбрать город", render, args: { state: "city" } };
export const Results = { name: "Пункты выдачи", render, args: { state: "ready" } };
export const Searching = { name: "Поиск адреса", render, args: { state: "loading" } };
export const Empty = { name: "Ничего не найдено", render, args: { state: "empty" } };
export const Stale = { name: "Справочник устарел", render, args: { state: "stale" } };
export const Failed = { name: "Ошибка поиска и повтор", render, args: { state: "error" } };
export const CityError = { name: "Ошибка загрузки городов", render, args: { state: "cities-error" } };
