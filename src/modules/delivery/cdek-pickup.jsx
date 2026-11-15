import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { api } from "@/modules/runtime/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";


const CDEK_PAGE_SIZE = 3;

export function PointDetails({ point }) {
  return <div className="flex min-w-0 flex-col gap-1">
    <span className="font-medium">{point.city}, {point.address}</span>
    <span className="text-xs text-muted-foreground">{point.region} · CDEK {point.code}</span>
    {point.workTime && <span className="text-xs text-muted-foreground">{point.workTime}</span>}
    {point.metro && <span className="text-xs text-muted-foreground">Метро: {point.metro}</span>}
  </div>;
}

export function PickupPointMap({ point }) {
  if (!point.coordinates) return null;
  const { latitude, longitude } = point.coordinates;
  const search = new URLSearchParams({
    ll: `${longitude},${latitude}`,
    pt: `${longitude},${latitude},pm2rdm`,
    z: "16",
    l: "map",
    lang: "ru_RU",
  });
  return <iframe
    className="block h-40 max-w-full min-w-0 w-full rounded-lg border-0 bg-muted sm:h-64"
    src={`https://yandex.ru/map-widget/v1/?${search}`}
    title={`Карта пункта CDEK: ${point.city}, ${point.address}`}
    loading="eager"
    referrerPolicy="strict-origin-when-cross-origin"
    sandbox="allow-scripts allow-same-origin allow-popups"
    allowFullScreen
  />;
}

export function useCdekPickup({ enabled, initialCityCode, onPointChange }) {
  const [query, setQuery] = useState("");
  const [cityCode, setCityCode] = useState(initialCityCode || null);
  const [cities, setCities] = useState([]);
  const [citiesLoading, setCitiesLoading] = useState(true);
  const [citiesError, setCitiesError] = useState("");
  const [citiesRetry, setCitiesRetry] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [retry, setRetry] = useState(0);
  const [offset, setOffset] = useState(0);
  const cityAnchor = useRef(null);
  const requestVersion = useRef(0);
  const trimmedQuery = query.trim();
  const selectedCity = cities.find((city) => city.code === cityCode) || null;

  function selectCity(city) {
    const nextCode = city?.code || null;
    if (nextCode === cityCode) return;
    requestVersion.current += 1;
    setCityCode(nextCode); setQuery(""); onPointChange(null); setOffset(0); setResult(null); setSearchError("");
  }

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setCitiesLoading(true);
    setCitiesError("");
    api.get("/delivery/cdek/cities").then((data) => {
      if (active) setCities(data.cities);
    }).catch((failure) => {
      if (active) setCitiesError(failure.message);
    }).finally(() => { if (active) setCitiesLoading(false); });
    return () => { active = false; };
  }, [citiesRetry, enabled]);

  useEffect(() => {
    const version = ++requestVersion.current;
    setSearchError("");
    if (!cityCode || !enabled) { setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await api.get(`/delivery/cdek/points?cityCode=${encodeURIComponent(cityCode)}&q=${encodeURIComponent(trimmedQuery)}&offset=${offset}&limit=${CDEK_PAGE_SIZE}`);
        if (version === requestVersion.current) setResult(data);
      } catch (failure) {
        if (version === requestVersion.current) setSearchError(failure.message);
      } finally { if (version === requestVersion.current) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); requestVersion.current += 1; };
  }, [cityCode, trimmedQuery, offset, retry, enabled]);

  function changeQuery(value) {
    requestVersion.current += 1;
    setQuery(value);
    onPointChange(null);
    setOffset(0);
    setResult(null);
    setSearchError("");
  }

  function refresh() {
    setResult(null);
    setRetry((value) => value + 1);
  }

  return {
    cities, citiesLoading, citiesError, cityCode, selectedCity, cityAnchor,
    selectCity, retryCities: () => setCitiesRetry((value) => value + 1),
    query, changeQuery, loading, searchError, result,
    retrySearch: () => setRetry((value) => value + 1), refresh,
    selectPoint: (code) => onPointChange(result.points.find((item) => item.code === code)),
    offset, setOffset,
  };
}

export function CdekPickupPicker({ pickup, idPrefix = "cdek" }) {
  const {
    cities, citiesLoading, citiesError, cityCode, selectedCity, cityAnchor,
    selectCity, retryCities, query, changeQuery, loading, searchError,
    result, retrySearch, selectPoint, offset, setOffset,
  } = pickup;
  return <>
    <Field>
      <FieldLabel htmlFor={`${idPrefix}-city`}>Город</FieldLabel>
      <Combobox
        items={cities}
        value={selectedCity}
        onValueChange={selectCity}
        itemToStringLabel={(city) => city.label}
        itemToStringValue={(city) => city.code}
        isItemEqualToValue={(a, b) => a.code === b.code}
        disabled={citiesLoading || Boolean(citiesError)}
      >
        <div ref={cityAnchor} className="min-w-0">
          <ComboboxInput id={`${idPrefix}-city`} className="w-full min-w-0 [&>[data-slot=input-group-addon]]:!mr-0" placeholder={citiesLoading ? "Загружаем города…" : "Начните вводить город"} showClear={Boolean(selectedCity)} />
        </div>
        <ComboboxContent anchor={cityAnchor} className="rollapp-body min-w-0 w-(--anchor-width)">
          <ComboboxEmpty>Город не найден</ComboboxEmpty>
          <ComboboxList>{(city) => <ComboboxItem key={city.code} value={city} className="min-h-12 px-3 py-2 pr-8 text-base">
            <span className="min-w-0 whitespace-normal">{city.label}</span>
          </ComboboxItem>}</ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
    {citiesError && <Alert variant="destructive"><AlertDescription className="flex flex-col gap-2">{citiesError}<Button variant="outline" onClick={retryCities}>Загрузить города повторно</Button></AlertDescription></Alert>}
    <Field>
      <FieldLabel htmlFor={`${idPrefix}-search`}>Адрес пункта выдачи</FieldLabel>
      <InputGroup><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon><InputGroupInput id={`${idPrefix}-search`} value={query} disabled={!cityCode} maxLength={120} autoComplete="off" placeholder="Улица и номер дома" onChange={(event) => changeQuery(event.target.value)} /></InputGroup>
    </Field>
    <div aria-live="polite" role="status">
      {loading ? <span className="flex items-center gap-2 text-muted-foreground"><Spinner />Ищем пункты CDEK…</span>
        : !cityCode ? <span className="text-muted-foreground">Сначала выберите город, затем уточните адрес.</span>
        : !searchError && result && <span className="text-xs text-muted-foreground">{result.total ? `Найдено пунктов: ${result.total}` : "Пункты не найдены. Попробуйте другую улицу или номер дома."}</span>}
    </div>
    {searchError && <Alert variant="destructive"><AlertDescription className="flex flex-col gap-2">{searchError}<Button variant="outline" onClick={retrySearch}>Повторить поиск</Button></AlertDescription></Alert>}
    {!loading && !searchError && result?.stale && <p className="text-xs text-muted-foreground">CDEK временно не отвечает. Показан справочник от {new Date(result.syncedAt).toLocaleDateString("ru-RU")}.</p>}
    {!loading && !searchError && result?.points.length > 0 && <RadioGroup className="min-w-0" aria-label="Пункты выдачи CDEK" value="" onValueChange={selectPoint}>
      {result.points.map((item) => <label key={item.code} className="flex min-w-0 max-w-full cursor-pointer items-start gap-3 rounded-xl border p-4 hover:bg-muted/50">
        <RadioGroupItem value={item.code} aria-label={`${item.city}, ${item.address}, ${item.code}`} className="mt-1" />
        <PointDetails point={item} />
      </label>)}
    </RadioGroup>}
    {!loading && !searchError && result && (offset > 0 || result.nextOffset != null) && <div className="flex justify-between gap-2">
      <Button variant="outline" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - CDEK_PAGE_SIZE))}>Предыдущие</Button>
      <Button variant="outline" disabled={result.nextOffset == null} onClick={() => setOffset(result.nextOffset)}>Следующие</Button>
    </div>}
  </>;
}
