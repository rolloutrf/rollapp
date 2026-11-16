import { SPACES } from "../categories/wish-spaces.jsx";

export function CatalogPageHeader({ selectedSpace, source, title, action }) {
  const heading = title || `${source === "brands" ? "Бренды" : "Лента"} · ${SPACES.find(space => space.id === selectedSpace)?.label || "Товары"}`;
  return (
    <header className="typeset typeset-rollapp flex flex-wrap items-center justify-between gap-2">
      <h2>{heading}</h2>
      {action}
    </header>
  );
}
