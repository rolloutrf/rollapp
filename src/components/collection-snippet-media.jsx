import { useState } from "react";

// Portrait media shared by collection snippets in the education and health spheres.
export function CollectionSnippetMedia({ src = "", sources, icon: Icon, children }) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const candidates = sources || (src ? [src] : []);
  const candidate = candidates[candidateIndex];
  return (
    <div className="collection-snippet__media">
      {candidate ? (
        <img
          key={candidate}
          className="absolute inset-0 min-h-0 min-w-0"
          src={candidate}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setCandidateIndex((index) => index + 1)}
        />
      ) : (
        <span className="collection-snippet__placeholder" aria-hidden="true">{Icon && <Icon />}</span>
      )}
      {children}
    </div>
  );
}
