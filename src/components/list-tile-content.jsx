import { LockKeyhole } from "lucide-react";

// Geometry and typography belong to the shared list-tile rules in index.css.
export function ListTileContent({ title, count, detail, detailLines = 1, detailId, privateList = false }) {
  return <>
    <strong data-slot="list-tile-label">{title}</strong>{" "}
    <div data-slot="list-tile-meta" className={detailLines === 2 ? "max-w-full" : undefined}>
      {privateList && <LockKeyhole size={14} aria-hidden="true" />}
      {detail != null ? <span id={detailId} data-slot="list-tile-detail" className={`m-0 min-w-0 text-xs font-normal ${detailLines === 2 ? "line-clamp-2 text-start wrap-anywhere whitespace-normal" : "truncate"}`} title={detail}>{detail}</span> : <span data-slot="list-tile-count">{count}</span>}
    </div>
  </>;
}
