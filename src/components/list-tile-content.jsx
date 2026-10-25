import { LockKeyhole } from "lucide-react";

// Geometry and typography belong to the shared list-tile rules in index.css.
export function ListTileContent({ title, count, privateList = false }) {
  return <>
    <strong data-slot="list-tile-label">{title}</strong>
    <div data-slot="list-tile-meta">
      {privateList && <LockKeyhole size={14} aria-hidden="true" />}
      <span data-slot="list-tile-count">{count}</span>
    </div>
  </>;
}
