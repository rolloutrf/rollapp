import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BellRing, LocateFixed, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar } from "@/modules/profile/profile-avatar.jsx";
import { api } from "@/modules/runtime/api.js";
import { EmptyState, LoadingScreen } from "@/modules/shell/page-feedback.jsx";
import { useToast } from "@/modules/shell/toast.jsx";
import "./friend-map.css";

const REFRESH_INTERVAL_MS = 30_000;

function mapMarkerData(data, user) {
  if (!data) return [];
  const markers = data.favoritePlaces.map(place => ({
    id: place.id,
    kind: "place",
    title: place.title,
    imageUrl: place.imageUrl,
    coordinates: place.coordinates,
  }));
  for (const friend of data.friends) markers.push({
    id: `friend:${friend.id}`,
    kind: "friend",
    title: friend.name,
    imageUrl: friend.avatarUrl,
    coordinates: friend.coordinates,
  });
  if (data.selfLocation) markers.push({
    id: "self",
    kind: "self",
    title: `${user?.name || "Вы"}: ваша геопозиция`,
    coordinates: data.selfLocation.coordinates,
  });
  return markers;
}

function FriendMapCanvas({ apiKey, markers, onSelect }) {
  const frame = useRef(null);
  const ready = useRef(false);
  const firstRender = useRef(true);
  const [error, setError] = useState("");
  const send = useCallback(() => {
    if (!ready.current || !frame.current?.contentWindow) return;
    frame.current.contentWindow.postMessage({
      source: "rollapp",
      type: "friend-map",
      apiKey,
      markers,
      fit: firstRender.current,
    }, window.location.origin);
    firstRender.current = false;
  }, [apiKey, markers]);

  useEffect(() => {
    const receive = event => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.source !== "rollapp-friend-map") return;
      if (event.data.type === "ready") { ready.current = true; send(); }
      if (event.data.type === "select") onSelect(event.data.markerId);
      if (event.data.type === "error") setError(event.data.message || "Не удалось открыть карту");
      if (event.data.type === "rendered") setError("");
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onSelect, send]);

  useEffect(() => { send(); }, [send]);

  return <div className="friend-map-canvas">
    <iframe ref={frame} src="/map-frame.html" title="Избранные места и друзья на Яндекс Картах"
      onLoad={() => { ready.current = true; send(); }} />
    {error && <div className="absolute inset-x-4 bottom-4 rounded-xl border bg-background p-3 text-sm" role="alert">{error}</div>}
  </div>;
}

export function FriendMapPage({ user }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const geolocationAvailable = typeof navigator !== "undefined" && Boolean(navigator.geolocation);

  const load = useCallback(async ({ quiet = false } = {}) => {
    try {
      const result = await api.get("/friend-map");
      setData(result);
      setError("");
    } catch (failure) {
      if (!quiet) setError(failure.message);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load({ quiet: true });
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const location = event => {
      setLocationError("");
      setData(current => current ? { ...current, selfLocation: event.detail?.location || current.selfLocation } : current);
      void load({ quiet: true });
    };
    const locationError = event => setLocationError(event.detail?.message || "Не удалось получить геопозицию.");
    window.addEventListener("rollapp:friend-map-location", location);
    window.addEventListener("rollapp:friend-map-location-error", locationError);
    return () => {
      window.removeEventListener("rollapp:friend-map-location", location);
      window.removeEventListener("rollapp:friend-map-location-error", locationError);
    };
  }, [load]);

  const savePreferences = async preferences => {
    setBusy(true);
    try {
      const result = await api.patch("/friend-map/preferences", preferences);
      setData(current => ({ ...current, preferences: result.preferences,
        ...(!result.preferences.shareLocation ? { selfLocation: null, friends: [] } : {}) }));
      window.dispatchEvent(new CustomEvent("rollapp:friend-map-preferences", { detail: result.preferences }));
      setLocationError("");
      toast(result.preferences.shareLocation ? "Геопозиция доступна только взаимным друзьям" : "Передача геопозиции выключена");
    } catch (failure) {
      toast(failure.message, "error");
    } finally { setBusy(false); }
  };

  const markers = useMemo(() => mapMarkerData(data, user), [data, user]);
  const items = useMemo(() => data ? [
    ...data.friends.map(friend => ({
      id: `friend:${friend.id}`, title: friend.name, subtitle: `@${friend.username} · обновлено недавно`,
      imageUrl: friend.avatarUrl, kind: "friend",
    })),
    ...data.favoritePlaces.map(place => ({ ...place, kind: "place" })),
  ] : [], [data]);

  if (!data && !error) return <LoadingScreen compact />;
  if (!data) return <div className="grid justify-items-center gap-3">
    <EmptyState icon={MapPin} title="Карта пока недоступна" text={error} />
    <Button type="button" variant="outline" onClick={() => void load()}>Повторить</Button>
  </div>;

  return <section className="friend-map-page" aria-label="Карта друзей и мест">
    <div className="friend-map-settings">
      <label className="friend-map-setting">
        <span className="friend-map-setting__copy">
          <strong className="flex items-center gap-2"><LocateFixed className="size-5" aria-hidden="true" />Показывать меня взаимным друзьям</strong>
          <small className="text-muted-foreground">Координаты видны только при взаимной подписке и исчезают через {data.locationTtlMinutes} минут без обновления.</small>
        </span>
        <Switch checked={data.preferences.shareLocation} disabled={busy || !geolocationAvailable}
          onCheckedChange={shareLocation => void savePreferences({ shareLocation, nearbyNotifications: shareLocation ? data.preferences.nearbyNotifications : false })} />
      </label>
      <label className="friend-map-setting">
        <span className="friend-map-setting__copy">
          <strong className="flex items-center gap-2"><BellRing className="size-5" aria-hidden="true" />Оповещать, когда друг ближе километра</strong>
          <small className="text-muted-foreground">Новое оповещение создаётся при входе в радиус, а не при каждом обновлении координат.</small>
        </span>
        <Switch checked={data.preferences.nearbyNotifications}
          disabled={busy || !data.preferences.shareLocation || !data.notificationsConfigured}
          onCheckedChange={nearbyNotifications => void savePreferences({ shareLocation: true, nearbyNotifications })} />
      </label>
      {!data.notificationsConfigured && <p className="text-sm text-muted-foreground">Серверные оповещения ещё не подключены.</p>}
      {!geolocationAvailable && <p role="alert" className="text-sm text-destructive">Этот браузер не поддерживает геопозицию.</p>}
      {locationError && <p role="alert" className="text-sm text-destructive">{locationError}</p>}
    </div>

    {!data.configured ? <EmptyState icon={MapPin} title="Нужен ключ Яндекс Карт"
      text="Добавьте API-ключ с ограничением по HTTP Referer в конфигурацию сервера." /> : <>
      <FriendMapCanvas apiKey={data.mapsApiKey} markers={markers} onSelect={setSelectedId} />
      <div className="friend-map-legend" aria-label="Обозначения карты">
        <span><i />Избранные места</span>
        <span><i className="friend-map-legend__friend" />Друзья</span>
        <span><i className="friend-map-legend__self" />Вы</span>
      </div>
    </>}

    {data.unmappedFavoriteCount > 0 && <p className="text-sm text-muted-foreground">
      Для {data.unmappedFavoriteCount} избранных мест пока нет подтверждённых координат Яндекс Карт.
    </p>}
    {items.length > 0 ? <ul className="friend-map-items" aria-label="Объекты на карте">
      {items.map(item => <li key={item.id} className="friend-map-item" data-selected={selectedId === item.id || undefined}>
        <div className="flex min-w-0 items-center gap-3">
          {item.kind === "friend" ? <Avatar user={{ name: item.title, avatarUrl: item.imageUrl }} size="sm" aria-hidden="true" />
            : <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><MapPin className="size-5" aria-hidden="true" /></span>}
          <span className="grid min-w-0 gap-1"><strong className="truncate">{item.title}</strong><small className="text-muted-foreground wrap-anywhere">{item.subtitle}</small></span>
        </div>
        {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="text-sm text-primary underline-offset-4 hover:underline">Открыть в Яндекс Картах</a>}
      </li>)}
    </ul> : <EmptyState icon={Users} title="На карте пока никого нет"
      text="Добавьте место в избранное или попросите взаимного друга включить геопозицию." />}
  </section>;
}
