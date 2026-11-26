import { useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MapPin } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button as ShadcnButton, buttonVariants } from "@/components/ui/button";
import { ContentPage } from "@/components/content-page";
import { PageActionButton } from "@/components/page-action-button";
import { BusinessCatalogContext } from "@/modules/catalog-marketplace/catalog-brands.jsx";
import { LoadingScreen, EmptyState } from "../shell/page-feedback.jsx";
import { api } from "../runtime/api.js";

const PLACE_LINK_LABELS = { telegram: "Telegram", site: "Сайт", instagram: "Instagram" };
const placeLinkLabel = (link) => PLACE_LINK_LABELS[link?.type] || "Ссылка";

export function usePlaceListings(space) {
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!space) return undefined;
    let active = true;
    api.get(`/wishlist-business/${encodeURIComponent(space)}/places`)
      .then(({ places }) => { if (active) setResult({ space, places: Array.isArray(places) ? places : [], error: null }); })
      .catch((error) => { if (active) setResult({ space, places: [], error }); });
    return () => { active = false; };
  }, [space, revision]);
  return { result, retry: () => setRevision(value => value + 1) };
}

function PlaceWaitButton({ place, space }) {
  const [waiting, setWaiting] = useState(place.isWaiting);
  const [waitCount, setWaitCount] = useState(place.waitCount || 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const label = waiting ? "Ждёте на Роллапп" : "Жду на Роллапп";
  const change = async () => {
    if (lock.current) return;
    lock.current = true;
    const next = !waiting;
    setWaiting(next);
    setWaitCount(count => Math.max(0, count + (next ? 1 : -1)));
    setBusy(true);
    setError("");
    try {
      const result = await api.post(`/wishlist-business/${encodeURIComponent(space)}/places/${encodeURIComponent(place.slug)}/wait`, { waiting: next });
      setWaiting(result.waiting);
      setWaitCount(result.waitCount);
    } catch (failure) {
      setWaiting(!next);
      setWaitCount(count => Math.max(0, count + (next ? -1 : 1)));
      setError(failure.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return <>
    <PageActionButton type="button" variant={waiting ? "secondary" : "outline"} aria-pressed={waiting}
      aria-label={`${label} · ${place.name}`} aria-busy={busy || undefined} disabled={busy} onClick={change}>
      {label}{waitCount > 0 ? ` (${waitCount})` : ""}
    </PageActionButton>
    {error && <p role="alert" className="w-full text-xs text-destructive wrap-anywhere">{error}</p>}
  </>;
}

function useOpenPlace(place) {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    const search = new URLSearchParams(location.search);
    search.set("place", place.slug);
    navigate({ pathname: location.pathname, search: `?${search}` });
  };
}

function PlaceListingCard({ place, space }) {
  const open = useOpenPlace(place);
  const name = place.name;
  const addresses = (place.addresses || []).filter(Boolean).join("; ");
  const meta = [place.subcategory || place.categoryLabel, addresses].filter(Boolean).join(" · ");
  return <li className="business-catalog-card">
    <ShadcnButton type="button" variant="ghost" className="contact-card__open" aria-label={`Открыть карточку места ${name}`} onClick={open} />
    <div className="business-catalog-card__profile">
      <Avatar className="business-catalog-card__avatar size-(--contact-avatar-size)">
        <AvatarFallback><MapPin aria-hidden="true" className="size-1/2" /></AvatarFallback>
      </Avatar>
      <span className="business-catalog-card__identity">
        <strong>{name}</strong>
        {meta && <span className="text-xs text-muted-foreground wrap-anywhere">{meta}</span>}
        {place.description && <span className="text-xs text-muted-foreground wrap-anywhere line-clamp-3 text-pretty">{place.description}</span>}
      </span>
    </div>
    {typeof place.isWaiting === "boolean" && <footer className="business-catalog-card__footer">
      <PlaceWaitButton place={place} space={space} />
    </footer>}
  </li>;
}

export function PlaceListingDetailsPage({ space, slug }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { result, retry } = usePlaceListings(space);
  const back = () => {
    const search = new URLSearchParams(location.search);
    search.delete("place");
    navigate({ pathname: location.pathname, search: search.size ? `?${search}` : "" }, { replace: true });
  };
  if (!result || result.space !== space) return <ContentPage title="Место рядом" onBack={back}><LoadingScreen /></ContentPage>;
  if (result.error) return <ContentPage title="Место рядом" onBack={back}>
    <EmptyState icon={MapPin} title="Не удалось загрузить место" text={result.error.message} />
    <div className="flex justify-center"><PageActionButton type="button" variant="outline" onClick={retry}>Повторить</PageActionButton></div>
  </ContentPage>;
  const place = result.places.find(candidate => candidate.slug === slug);
  if (!place) return <ContentPage title="Место рядом" onBack={back}>
    <EmptyState icon={MapPin} title="Место не найдено" text="Возможно, карточку уже убрали из каталога." />
  </ContentPage>;
  const links = (place.links || []).filter(link => link?.url);
  return <ContentPage title={place.name} onBack={back} className="place-listing-page">
    <div className="app-page page-stack rollapp-body">
      <header className="typeset typeset-rollapp">
        <p className="text-xs text-muted-foreground">{place.categoryLabel}{place.subcategory && place.subcategory.toLowerCase() !== place.categoryLabel.toLowerCase() ? ` · ${place.subcategory}` : ""}</p>
        {place.description && <p className="text-pretty">{place.description}</p>}
      </header>
      {(place.addresses || []).filter(Boolean).length > 0 && <section aria-label="Адреса" className="grid gap-2">
        {(place.addresses || []).filter(Boolean).map(address => <p key={address} className="flex min-w-0 items-start gap-2 text-sm wrap-anywhere">
          <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />{address}
        </p>)}
      </section>}
      {links.length > 0 && <section aria-label="Ссылки" className="flex flex-wrap gap-2">
        {links.map(link => <a key={link.url} href={link.url} target="_blank" rel="noreferrer" data-slot="button"
          className={buttonVariants({ variant: "outline" })} aria-label={`${placeLinkLabel(link)}: ${place.name}`}>
          {placeLinkLabel(link)}
        </a>)}
      </section>}
      {typeof place.isWaiting === "boolean" && <footer className="flex flex-wrap items-center gap-3">
        <PlaceWaitButton key={`${place.slug}:${place.isWaiting}`} place={place} space={space} />
      </footer>}
    </div>
  </ContentPage>;
}

export function PlaceListingsList({ listings } = {}) {
  const context = useContext(BusinessCatalogContext);
  const space = context?.space || null;
  const own = usePlaceListings(space);
  const { result, retry } = listings || own;
  if (!space || !result || result.space !== space) return null;
  if (result.error) return <div className="flex justify-center">
    <PageActionButton type="button" variant="outline" onClick={retry}>Повторить</PageActionButton>
  </div>;
  if (!result.places.length) return null;
  return <ul className="business-catalog-grid rollapp-body mx-auto grid w-full max-w-(--layout-collection-width) gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list" aria-label="Места рядом">
    {result.places.map(place => <PlaceListingCard key={`${space}:${place.slug}`} place={place} space={space} />)}
  </ul>;
}
