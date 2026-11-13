import { AddFab } from "@/components/add-fab";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Folder, FolderPlus, MoreHorizontal, Pencil, Ungroup } from "lucide-react";
import { CardDragHandle } from "@/components/card-drag-handle";
import { ControlBar } from "@/components/control-bar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCardReorder } from "@/hooks/use-card-reorder";
import { addNoteToGroup, createNoteGroup, removeNotesFromGroup } from "@/lib/note-layout";
import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short", year: "numeric" });
const noteCount = new Intl.PluralRules("ru");
const menuClass = "w-(--layout-menu-width) max-w-(--available-width) rounded-2xl p-2";
const menuItemClass = "min-h-12 gap-2 rounded-xl px-3 text-rollapp-body whitespace-normal wrap-anywhere";

function updatedLabel(note) {
  const date = new Date(note.updatedAt || note.createdAt);
  return Number.isNaN(date.getTime()) ? "Заметка" : `Изменено ${dateFormat.format(date)}`;
}

function groupLabel(group) {
  const count = group.noteIds.length;
  const noun = { one: "заметка", few: "заметки", many: "заметок" }[noteCount.select(count)];
  return `${count} ${noun}`;
}

function TileContent({ icon: Icon, title, caption }) {
  return <>
    <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
    <span className="notes-tile__label">
      <span className="notes-tile__title text-rollapp-body font-medium" title={title}>{title}</span>
      <span className="text-xs text-muted-foreground">{caption}</span>
    </span>
  </>;
}

function NoteActions({ item, disabled, children }) {
  return <ControlBar className="notes-card__actions">
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button data-control-icon type="button" variant="outline" size="icon" disabled={disabled} />}
        aria-label={`Действия: ${item.title}`}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className={menuClass}>{children}</DropdownMenuContent>
    </DropdownMenu>
  </ControlBar>;
}

function NoteLayoutDialog({ action, busy, error, onClose, onSave }) {
  const [title, setTitle] = useState(action.title);
  const titleId = useId();
  const disband = action.type === "disband";
  const failure = error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>;
  const onOpenChange = (open, details) => {
    if (open) return;
    if (busy) details.cancel();
    else onClose();
  };
  if (disband) return <AlertDialog open onOpenChange={onOpenChange}>
    <AlertDialogContent className="rollapp-body">
      <AlertDialogHeader>
        <AlertDialogTitle>Расформировать группу?</AlertDialogTitle>
        <AlertDialogDescription>Заметки из «{action.title}» снова будут показаны отдельно.</AlertDialogDescription>
      </AlertDialogHeader>
      {failure}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
        <Button variant="destructive" disabled={busy} onClick={() => onSave(action)}>Расформировать</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
  return <Dialog open onOpenChange={onOpenChange}>
    <DialogContent className="rollapp-body overflow-y-auto" showCloseButton={false}>
      <DialogHeader><DialogTitle>Переименовать группу</DialogTitle><DialogDescription>Название будет видно на плитке группы.</DialogDescription></DialogHeader>
      <form className="grid gap-4" onSubmit={event => { event.preventDefault(); onSave({ ...action, title: title.trim() }); }}>
        <div className="grid gap-2">
          <label htmlFor={titleId}>Название группы</label>
          <Input id={titleId} value={title} onChange={event => setTitle(event.target.value)} autoFocus required maxLength={60} disabled={busy} />
        </div>
        {failure}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Отмена</Button>
          <Button type="submit" disabled={busy || !title.trim()}>Сохранить</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export function NotesLibrary({ library, group, loading, error, creating, onCreate, onSaveLayout, errorContent }) {
  const { layout, notesById } = library;
  const [preview, setPreview] = useState(null);
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [layoutError, setLayoutError] = useState("");
  const pending = useRef(false);
  const items = group ? group.noteIds.map(id => notesById.get(id)) : library.items;

  const save = async next => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setLayoutError("");
    try {
      await onSaveLayout(next);
      setAction(null);
    } catch (cause) {
      setLayoutError(cause.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const add = (noteId, groupId) => save(addNoteToGroup(layout, noteId, groupId));
  const create = noteIds => save(createNoteGroup(layout, { id: crypto.randomUUID(), title: "Новая группа" }, noteIds));
  const show = next => { setLayoutError(""); setAction(next); };
  const scope = `${group?.id || ""}:${layout.revision}:${items.map(item => item.id).join(",")}`;
  const drag = useCardReorder({
    items: preview?.scope === scope ? preview.items : items,
    onItemsChange: next => setPreview({ scope, items: next }),
    scopeKey: scope,
    disabled: busy || Boolean(action) || creating || loading || Boolean(error),
    collectionLabel: "заметок",
    movedVerb: group ? "перемещена" : "перемещено",
    getItemLabel: item => item.title,
    groupingEnabled: !group,
    sortGroupTiles: !group,
    onCreateGroup: (sourceId, targetId) => create([targetId, sourceId]),
    onAddToGroup: add,
    persistOrder: order => onSaveLayout(group ? {
      ...layout, groups: layout.groups.map(item => item.id === group.id ? { ...item, noteIds: order } : item),
    } : { ...layout, order }),
  });
  useLayoutEffect(() => {
    if (!drag.draggedId && !drag.orderBusy && preview) setPreview(null);
  }, [drag.draggedId, drag.orderBusy, preview]);
  const orderedItems = preview?.scope === scope ? preview.items : items;
  const disabled = busy || drag.orderBusy || creating || loading || Boolean(error);
  const actionsDisabled = disabled || Boolean(drag.draggedId);
  const close = () => { setAction(null); setLayoutError(""); };
  const apply = ({ type, id, title }) => {
    const target = layout.groups.find(group => group.id === id);
    if (type === "rename" && target) {
      return save({ ...layout, groups: layout.groups.map(group => group.id === id ? { ...group, title } : group) });
    }
    if (type === "disband" && target) return save(removeNotesFromGroup(layout, target, target.noteIds));
    setLayoutError("Список заметок изменился. Откройте меню и повторите действие.");
  };
  const noteUrl = item => {
    const search = new URLSearchParams({ tab: "notes" });
    if (group) search.set("noteGroup", group.id);
    search.set(item.noteIds ? "noteGroup" : "note", item.id);
    return `?${search}`;
  };
  return <>
    {errorContent}
    {!action && (layoutError || drag.orderError) && <Alert variant="destructive"><AlertDescription>{layoutError || drag.orderError}</AlertDescription></Alert>}
    {loading && <p role="status" className="sr-only">Загружаем заметки…</p>}
    {creating && <p role="status" className="sr-only">Создаём заметку…</p>}
    {group && <header className="notes-group-header">
      <div className="min-w-0">
        <h1 className="truncate font-heading text-2xl font-semibold" title={group.title}>{group.title}</h1>
        <p className="text-xs text-muted-foreground">{groupLabel(group)}</p>
      </div>
      <NoteActions item={group} disabled={actionsDisabled}>
        <DropdownMenuItem className={menuItemClass} onClick={() => show({ type: "rename", id: group.id, title: group.title })}><Pencil />Переименовать</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" className={menuItemClass} onClick={() => show({ type: "disband", id: group.id, title: group.title })}><Ungroup />Расформировать</DropdownMenuItem>
      </NoteActions>
    </header>}
    <div className="notes-grid" ref={drag.listRef}>
      {!group && <AddFab actions={[{ label: "Создать заметку", disabled: actionsDisabled, onSelect: onCreate }]} />}
      {loading ? [0, 1, 2].map(index => <Skeleton key={index} className="notes-grid__skeleton" aria-hidden="true" />) : !error && orderedItems.map((item, index) => {
        const isGroup = Boolean(item.noteIds);
        const targeted = drag.groupTarget === `${isGroup ? "group" : "card"}:${item.id}`;
        return <div key={item.id} className={cn("notes-card", isGroup && "notes-card--group", drag.draggedId === item.id && "is-dragging", targeted && "is-group-target")}
          data-sortable-card-id={item.id} data-sortable-group-id={isGroup ? item.id : undefined}
          onPointerDown={event => {
            if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) drag.beginPointerDrag(event, item.id);
          }}>
          <Link className={cn(buttonVariants({ variant: "outline" }), "notes-tile")} aria-label={item.title}
            data-card-drag-trigger data-card-drag-mouse-only draggable={false} to={noteUrl(item)}
            onClick={event => { if (drag.shouldSuppressClick()) event.preventDefault(); }}>
            <TileContent icon={isGroup ? Folder : FileText} title={item.title} caption={isGroup ? groupLabel(item) : updatedLabel(item)} />
          </Link>
          <CardDragHandle title={item.title} disabled={disabled} />
          <NoteActions item={item} disabled={actionsDisabled}>
            {isGroup && <>
              <DropdownMenuItem className={menuItemClass} onClick={() => show({ type: "rename", id: item.id, title: item.title })}><Pencil />Переименовать</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" className={menuItemClass} onClick={() => show({ type: "disband", id: item.id, title: item.title })}><Ungroup />Расформировать</DropdownMenuItem>
            </>}
            {group && <DropdownMenuItem className={menuItemClass}
              onClick={() => save(removeNotesFromGroup(layout, group, [item.id]))}><Ungroup />Убрать из группы</DropdownMenuItem>}
            {!group && !isGroup && <>
              <DropdownMenuItem className={menuItemClass} onClick={() => create([item.id])}><FolderPlus />Создать группу</DropdownMenuItem>
              {layout.groups.map(target => <DropdownMenuItem key={target.id} className={menuItemClass}
                onClick={() => add(item.id, target.id)}><Folder /><span>Добавить в «{target.title}»</span></DropdownMenuItem>)}
            </>}
            {items.length > 1 && <DropdownMenuSeparator />}
            {index > 0 && <DropdownMenuItem className={menuItemClass} onClick={() => drag.moveByOffset(item.id, -1)}>Переместить раньше</DropdownMenuItem>}
            {index < items.length - 1 && <DropdownMenuItem className={menuItemClass} onClick={() => drag.moveByOffset(item.id, 1)}>Переместить позже</DropdownMenuItem>}
          </NoteActions>
        </div>;
      })}
    </div>
    <p role="status" className="sr-only">{drag.announcement}</p>
    {action && <NoteLayoutDialog action={action} busy={busy} error={layoutError} onClose={close} onSave={apply} />}
  </>;
}
