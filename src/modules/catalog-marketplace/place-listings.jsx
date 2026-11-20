import { useContext, useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageActionButton } from "@/components/page-action-button";
import { BusinessCatalogContext } from "@/modules/catalog-marketplace/catalog-brands.jsx";
import { api } from "../runtime/api.js";

function PlaceListingCard({ place, space }) {
  const [waiting, setWaiting] = useState(place.isWaiting);
  const [waitCount, setWaitCount] = useState(place.waitCount || 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const name = place.name;
  const addresses = (place.addresses || []).filter(Boolean).join("; ");
  const meta = [place.subcategory || place.categoryLabel, addresses].filter(Boolean).join(" · ");
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
  return <li className="business-catalog-card">
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
    {typeof waiting === "boolean" && <footer className="business-catalog-card__footer">
      <PageActionButton type="button" variant={waiting ? "secondary" : "outline"} aria-pressed={waiting}
        aria-label={`${label} · ${name}`} aria-busy={busy || undefined} disabled={busy} onClick={change}>
        {label}{waitCount > 0 ? ` (${waitCount})` : ""}
      </PageActionButton>
      {error && <p role="alert" className="w-full text-xs text-destructive wrap-anywhere">{error}</p>}
    </footer>}
  </li>;
}

export function PlaceListingsList() {
  const context = useContext(BusinessCatalogContext);
  const space = context?.space || null;
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
  if (!space || !result || result.space !== space) return null;
  if (result.error) return <div className="flex justify-center">
    <PageActionButton type="button" variant="outline" onClick={() => setRevision(value => value + 1)}>Повторить</PageActionButton>
  </div>;
  if (!result.places.length) return null;
  return <ul className="business-catalog-grid rollapp-body mx-auto grid w-full max-w-(--layout-collection-width) gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list" aria-label="Места рядом">
    {result.places.map(place => <PlaceListingCard key={`${space}:${place.slug}`} place={place} space={space} />)}
  </ul>;
}
