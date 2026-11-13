import { useLayoutEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { ControlBar } from "@/components/control-bar";
import { ListTileContent } from "@/components/list-tile-content";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useWishListDrag } from "@/hooks/use-wish-list-drag";
import { wishCountNoun } from "@/lib/list-navigation";
import { cn } from "@/lib/utils";

// Move only the list row; selecting a list must not scroll the page vertically.
function revealList(viewport, item) {
  if (!viewport || !item) return;
  const bounds = viewport.getBoundingClientRect();
  const target = item.getBoundingClientRect();
  const style = getComputedStyle(viewport);
  const start = bounds.left + (Number.parseFloat(style.scrollPaddingLeft) || 0);
  const end = bounds.right - (Number.parseFloat(style.scrollPaddingRight) || 0);
  const delta = target.left < start ? target.left - start : target.right > end ? target.right - end : 0;
  if (Math.abs(delta) > 1) viewport.scrollBy({ left: delta, behavior: "instant" });
}

function readOrder(key) {
  if (!key) return [];
  try {
    const order = JSON.parse(window.localStorage.getItem(key));
    return Array.isArray(order) ? order : [];
  } catch {
    return [];
  }
}

function ListTile({ id, title, displayTitle = title, count, detail, privateList, sortable, onSettings, settingsLabel, renderSettings, accessibleName, settingsDisabled }) {
  const label = accessibleName ?? (detail == null ? `${title}, ${count} ${wishCountNoun(count)}${privateList ? ", приватный список" : ""}` : title);
  const tile = (
    <ToggleGroupItem
      data-list-tile
      value={id}
      data-wish-list-tile={sortable ? id : undefined}
      aria-label={label}
      title={detail == null ? undefined : title}
      aria-keyshortcuts={sortable ? "Alt+ArrowLeft Alt+ArrowRight" : undefined}
    >
      <ListTileContent title={displayTitle} count={count} detail={detail} privateList={privateList} />
    </ToggleGroupItem>
  );
  if (!onSettings && !renderSettings) return tile;
  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="list-tabs__settings"
      aria-label={settingsLabel(title)}
      aria-haspopup={renderSettings ? "menu" : "dialog"}
      disabled={settingsDisabled}
      onClick={onSettings ? event => onSettings(id, event.currentTarget) : undefined}
    >
      <MoreHorizontal aria-hidden="true" />
    </Button>
  );
  return (
    <div className="list-tabs__editable-tile">
      {tile}
      <ControlBar className="contents">
        {renderSettings ? renderSettings(id, trigger) : trigger}
      </ControlBar>
    </div>
  );
}

export function WishListNavigation({ value, className, items, leadingItem, orderScope, onSelect, onSettings, onOrderError, label = "Списки желаний", settingsLabel = title => `Настройки списка «${title}»`, settingsDisabled, renderSettings }) {
  const viewportRef = useRef(null);
  const storageKey = orderScope ? `rollapp:wishlist-list-order:${orderScope}` : null;
  const [preference, setPreference] = useState(() => ({ key: storageKey, order: readOrder(storageKey) }));
  const [announcement, setAnnouncement] = useState("");
  const remaining = new Map(items.map(item => [item.id, item]));
  const ordered = [];
  for (const id of preference.key === storageKey ? preference.order : readOrder(storageKey)) {
    if (!remaining.has(id)) continue;
    ordered.push(remaining.get(id));
    remaining.delete(id);
  }
  ordered.push(...remaining.values());
  const sortable = Boolean(storageKey && ordered.length > 1);

  useLayoutEffect(() => {
    if (!storageKey) return;
    const sync = () => setPreference({ key: storageKey, order: readOrder(storageKey) });
    sync();
    const onStorage = (event) => {
      if (event.key === storageKey || event.key === null) sync();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  const suppressDragClick = useWishListDrag(viewportRef, {
    enabled: sortable,
    orderKey: JSON.stringify([Boolean(leadingItem), ...ordered.map(item => item.id)]),
    scope: storageKey,
    value,
    revealTile: revealList,
    onMove(from, to) {
      const order = ordered.map(item => item.id);
      order.splice(to, 0, ...order.splice(from, 1));
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(order));
      } catch {
        onOrderError?.();
        return false;
      }
      setPreference({ key: storageKey, order });
      setAnnouncement(`«${ordered[from].title}» перемещён на позицию ${to + 1} из ${order.length}`);
      return true;
    },
  });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const revealSelected = () => {
      if (viewport.hasAttribute("data-list-drag-active")) return;
      revealList(viewport, viewport.querySelector('[data-slot="toggle-group-item"][aria-pressed="true"]'));
    };
    revealSelected();
    const observer = new ResizeObserver(revealSelected);
    observer.observe(viewport);
    observer.observe(viewport.firstElementChild);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div
      ref={viewportRef}
      className={cn("list-tabs horizontal-tile-scroller", className)}
      data-wishlist-list-navigation
      aria-label={label}
      onClickCapture={suppressDragClick}
      onFocusCapture={(event) => {
        const button = event.target.closest("button");
        if (button?.matches(".list-tabs__settings:not(:focus-visible)")) return;
        const item = button?.closest(".list-tabs__editable-tile") ?? button;
        if (button?.matches("[data-wish-list-tile]:not(:focus-visible)") || viewportRef.current.hasAttribute("data-list-drag-active")) return;
        revealList(viewportRef.current, item);
      }}
    >
      <div className="list-tabs__track">
        <ToggleGroup className="contents" value={[value]} onValueChange={(values) => { onSelect?.(values[0]); }} aria-label={label}>
          {leadingItem && <ListTile {...leadingItem} id={leadingItem.id ?? "all"} />}
          {ordered.map(({ id, ...item }) => <ListTile key={id} id={id} {...item} sortable={sortable} onSettings={onSettings} settingsLabel={settingsLabel} settingsDisabled={settingsDisabled} renderSettings={renderSettings} />)}
        </ToggleGroup>
      </div>
      {sortable && <span className="visually-hidden" role="status">{announcement}</span>}
    </div>
  );
}
