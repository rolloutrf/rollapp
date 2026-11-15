import { FolderInput, Gift, GripVertical, MoreHorizontal, Pencil, Ungroup } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listDisplayTitle, wishCountNoun } from "../categories/list-navigation.js";
import { useRef, useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { wishPreviewImageUrl } from "../../../shared/modules/media-import/kinopoisk.js";
import { applyRetailerPreviewFallback } from "./wish-preview.jsx";
import { GroupDialog } from "@/components/group-dialog";
import { WishGroupHeader } from "@/components/wish-group-fundraiser";

function WishGroupMoveSubmenu({ lists, busy, onMove }) {
  return <DropdownMenuSub>
    <DropdownMenuSubTrigger className="min-h-12 gap-3 rounded-xl px-3 text-base whitespace-nowrap" disabled={busy || lists.length === 0}><FolderInput />Переместить в список</DropdownMenuSubTrigger>
    <DropdownMenuSubContent className="w-(--layout-menu-width) max-w-(--available-width) rounded-2xl p-2">
      {lists.map((list) => <DropdownMenuItem key={list.id} className="min-h-12 rounded-xl px-3 text-base" disabled={busy} onClick={() => onMove(list)}>{listDisplayTitle(list)}</DropdownMenuItem>)}
    </DropdownMenuSubContent>
  </DropdownMenuSub>;
}

export function WishGroupTile({
  group,
  wishes,
  moveTargets = [],
  draggable = false,
  nativeDraggable = false,
  onOpen,
  onRename,
  onMove,
  onDisband,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onPointerDown,
  isDragging = false,
  isDropTarget,
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(group.title);
  const [busy, setBusy] = useState(false);
  const [disbandOpen, setDisbandOpen] = useState(false);
  const renamingFromMenuRef = useRef(false);
  const beginEditing = () => {
    renamingFromMenuRef.current = true;
    setTitle(group.title);
    setEditing(true);
  };
  const finishEditing = () => {
    renamingFromMenuRef.current = false;
    setEditing(false);
  };
  const resolveMenuFinalFocus = () => {
    const skipReturnFocus = renamingFromMenuRef.current;
    renamingFromMenuRef.current = false;
    return !skipReturnFocus;
  };
  const saveTitle = async () => {
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === group.title) { setTitle(group.title); finishEditing(); return; }
    setBusy(true);
    const saved = await onRename(nextTitle);
    setBusy(false);
    if (saved) finishEditing();
  };
  const disband = async () => {
    setBusy(true);
    const disbanded = await onDisband();
    setBusy(false);
    if (disbanded) setDisbandOpen(false);
  };
  const move = async (targetList) => {
    setBusy(true);
    await onMove(targetList);
    setBusy(false);
  };
  return <>
  <div data-group-id={group.id} draggable={nativeDraggable} className={`wish-group-tile ${draggable ? "is-draggable" : ""} ${isDragging ? "is-dragging" : ""} ${isDropTarget ? "is-drop-target" : ""}`} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onPointerDown={onPointerDown}>
    <ShadcnButton type="button" draggable={nativeDraggable} variant="ghost" className="wish-group-tile__open" onClick={onOpen} aria-label={`Открыть группу «${group.title}», ${wishes.length} ${wishCountNoun(wishes.length)}`} title={draggable ? "Нажмите, чтобы открыть. Перетащите, чтобы изменить порядок" : undefined} />
    <span className="wish-group-tile__preview">
      {wishes.slice(0, 4).map((wish) => {
        const previewImageUrl = wishPreviewImageUrl(wish);
        return <span key={wish.id}>{previewImageUrl ? <img src={previewImageUrl} alt="" referrerPolicy="strict-origin-when-cross-origin" onError={(event) => applyRetailerPreviewFallback(event, wish.url)} /> : <Gift />}</span>;
      })}
    </span>
    {draggable && <span className="wish-card__drag-handle wish-group-tile__drag-handle" data-wish-group-drag-handle draggable={nativeDraggable} aria-hidden="true"><GripVertical /></span>}
    <div className="wish-card__body wish-group-tile__meta">
      {editing ? <Input autoFocus value={title} disabled={busy} maxLength={60} aria-label="Название группы" onFocus={(event) => event.currentTarget.select()} onChange={(event) => setTitle(event.target.value)} onBlur={saveTitle} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.blur(); } if (event.key === "Escape") { event.preventDefault(); setTitle(group.title); finishEditing(); } }} /> : <h3 className="wish-card__title"><ShadcnButton type="button" variant="ghost" className="wish-group-tile__title justify-start" title={group.title} onClick={onOpen}><span className="min-w-0 flex-1 truncate">{group.title}</span></ShadcnButton></h3>}
      <div className="wish-card__top">
        <span>{wishes.length} {wishCountNoun(wishes.length)}</span>
        {!editing && onRename && <DropdownMenu><DropdownMenuTrigger render={<ShadcnButton type="button" variant="ghost" size="icon" className="wish-card__menu-trigger wish-group-tile__menu size-9 active:translate-y-0" />} aria-label={`Опции группы «${group.title}»`}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent finalFocus={resolveMenuFinalFocus} align="end" sideOffset={8} className="wish-group-actions-menu w-(--layout-menu-width) max-w-(--available-width) rounded-2xl p-2"><DropdownMenuItem className="min-h-12 gap-3 rounded-xl px-3 text-base whitespace-nowrap" disabled={busy} onClick={beginEditing}><Pencil />Переименовать</DropdownMenuItem><WishGroupMoveSubmenu lists={moveTargets} busy={busy} onMove={move} /><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" className="app-destructive-menu-item min-h-12 gap-3 rounded-xl px-3 text-base whitespace-nowrap" disabled={busy} aria-haspopup="dialog" onClick={() => setDisbandOpen(true)}><Ungroup />Расформировать</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
      </div>
    </div>
  </div>
  {disbandOpen && <AlertDialog open={disbandOpen} onOpenChange={(open) => { if (!busy) setDisbandOpen(open); }}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Расформировать группу «{group.title}»?</AlertDialogTitle><AlertDialogDescription>Желания останутся в списке и снова будут показаны отдельно.{group.space === "products" && " Сбор закроется, а внесённые роллы останутся в кошельке владельца."}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} aria-busy={busy || undefined} onClick={disband}>{busy ? <Spinner data-icon="inline-start" /> : <Ungroup data-icon="inline-start" aria-hidden="true" />}Расформировать</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>}
  </>;
}

export function WishGroupDialog({ group, count, moveTargets, onRename, onMove, onDisband, viewerId, busy: itemBusy, children, ...props }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(group.title);
  const [saving, setSaving] = useState(false);
  const [disbandOpen, setDisbandOpen] = useState(false);
  const renamingFromMenuRef = useRef(false);
  const busy = itemBusy || saving;
  useEffect(() => { if (!editing) setTitle(group.title); }, [editing, group.title]);
  const saveTitle = async () => {
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === group.title) { setTitle(group.title); setEditing(false); return; }
    setSaving(true);
    const saved = await onRename(nextTitle);
    setSaving(false);
    if (saved) setEditing(false);
  };
  const move = async (list) => { setSaving(true); await onMove(list); setSaving(false); };
  const disband = async () => {
    setSaving(true);
    const removed = await onDisband();
    setSaving(false);
    if (removed) setDisbandOpen(false);
  };
  return <GroupDialog {...props} className="wish-group-open" busy={busy || editing} aria-label={`Группа «${group.title}»`}>
    <WishGroupHeader
      group={group}
      viewerId={viewerId}
      busy={busy || editing}
      title={editing ? <Input
        autoFocus value={title} disabled={busy} maxLength={60} aria-label="Название группы"
        className="min-h-12 w-full min-w-0 max-w-sm text-base font-semibold"
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={saveTitle}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.blur(); }
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setTitle(group.title); setEditing(false); }
        }}
      /> : group.title}
      description={`${count} ${wishCountNoun(count)}`}
      actions={!editing && <DropdownMenu>
        <DropdownMenuTrigger render={<ShadcnButton data-control-icon type="button" variant="outline" size="icon" className="rounded-full bg-card" disabled={busy} />} aria-label={`Опции группы «${group.title}»`}><MoreHorizontal /></DropdownMenuTrigger>
        <DropdownMenuContent
          align="end" sideOffset={8} className="wish-group-actions-menu w-(--layout-menu-width) max-w-(--available-width) rounded-2xl p-2"
          finalFocus={() => { const restore = !renamingFromMenuRef.current; renamingFromMenuRef.current = false; return restore; }}
        >
          <DropdownMenuItem className="min-h-12 gap-3 rounded-xl px-3 text-base" disabled={busy} onClick={() => { renamingFromMenuRef.current = true; setTitle(group.title); setEditing(true); }}><Pencil />Переименовать</DropdownMenuItem>
          <WishGroupMoveSubmenu lists={moveTargets} busy={busy} onMove={move} />
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" className="app-destructive-menu-item min-h-12 gap-3 rounded-xl px-3 text-base" disabled={busy} aria-haspopup="dialog" onClick={() => setDisbandOpen(true)}><Ungroup />Расформировать</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>}
    />
    {children}
    {disbandOpen && <AlertDialog open onOpenChange={(open) => { if (!busy) setDisbandOpen(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Расформировать группу «{group.title}»?</AlertDialogTitle><AlertDialogDescription>Желания останутся в списке и снова будут показаны отдельно.{group.space === "products" && " Сбор закроется, а внесённые роллы останутся в кошельке владельца."}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} aria-busy={busy || undefined} onClick={disband}>{busy ? <Spinner data-icon="inline-start" /> : <Ungroup data-icon="inline-start" aria-hidden="true" />}Расформировать</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
  </GroupDialog>;
}
