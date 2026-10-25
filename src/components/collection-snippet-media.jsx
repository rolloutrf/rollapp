import { useState } from "react";
import { Badge } from "@/components/ui/badge";

// Each source list owns its loading/fallback state; a new list starts at its first image.
function CollectionSnippetImage({ candidates, icon: Icon }) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [loadedCandidate, setLoadedCandidate] = useState(null);
  const candidate = candidates[candidateIndex];
  const loaded = candidate && loadedCandidate === candidate;
  return <>
    {!loaded && <span className="collection-snippet__placeholder" aria-hidden="true">{Icon && <Icon />}</span>}
    {candidate && <img
      key={candidate}
      className={`absolute inset-0 min-h-0 min-w-0 ${loaded ? "opacity-100" : "opacity-0"}`}
      src={candidate}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={() => setLoadedCandidate(candidate)}
      onError={() => setCandidateIndex(index => index + 1)}
    />}
  </>;
}

// Portrait media shared by collection snippets in the education and health spheres.
export function CollectionSnippetMedia({ src = "", sources, icon, children }) {
  const candidates = sources || (src ? [src] : []);
  return <div className="collection-snippet__media">
    <CollectionSnippetImage key={JSON.stringify(candidates)} candidates={candidates} icon={icon} />
    {children}
  </div>;
}

// Keep long status labels inside narrow media without hiding their first letters.
export function CollectionSnippetBadge({ variant, icon: Icon, children }) {
  return <Badge variant={variant} className="collection-snippet__badge h-auto whitespace-normal" title={typeof children === "string" ? children : undefined}>
    {Icon && <Icon className="shrink-0" data-icon="inline-start" aria-hidden="true" />}
    <span className="min-w-0 wrap-anywhere">{children}</span>
  </Badge>;
}
