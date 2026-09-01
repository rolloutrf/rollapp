import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FolderInput, Layers3, MoreHorizontal, Pencil, Ungroup, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { educationApiListId, UNLISTED_EDUCATION_LIST_ID } from "@/lib/education-lists";

export function russianCountLabel(count, one, few, many) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} ${many}`;
  if (mod10 === 1) return `${count} ${one}`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} ${few}`;
  return `${count} ${many}`;
}

export function applyEducationGroupChange(groups = [], change) {
  if (!change?.groupId) return groups;
  return groups.flatMap((group) => {
    if (group.id !== change.groupId) return [group];
    if (change.dissolved) return [];
    return [{ ...group, itemIds: change.itemIds || group.itemIds }];
  });
}

function EducationGroupMoveSubmenu({ currentListId, lists, busy, onMove }) {
  const targets = [
    { id: UNLISTED_EDUCATION_LIST_ID, title: "Не отсортированные" },
    ...lists.map((list) => ({ id: list.id, title: list.title })),
  ].filter((list) => educationApiListId(list.id) !== (currentListId || ""));
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="min-h-12 gap-3 rounded-xl px-3 text-base" disabled={busy || targets.length === 0}>
        <FolderInput aria-hidden="true" />
        Переместить в список
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="rollapp-body w-72 max-w-[calc(100vw-24px)] rounded-2xl p-2">
        {targets.map((list) => (
          <DropdownMenuItem className="min-h-12 rounded-xl px-3 text-base" key={list.id} disabled={busy} onClick={() => onMove(list)}>
            {list.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function EducationGroupActions({ group, lists, busy, onBeginRename, onDisband, onMove }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button className="pointer-events-auto relative z-20 size-9 rounded-full" variant="ghost" size="icon-lg" type="button" disabled={busy} />}
        aria-label={`Опции группы «${group.title}»`}
      >
        {busy ? <Spinner aria-hidden="true" /> : <MoreHorizontal aria-hidden="true" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="rollapp-body w-72 max-w-[calc(100vw-24px)] rounded-2xl p-2" align="end" sideOffset={8}>
        <DropdownMenuItem className="min-h-12 gap-3 rounded-xl px-3 text-base" disabled={busy} onClick={onBeginRename}>
          <Pencil aria-hidden="true" />
          Переименовать
        </DropdownMenuItem>
        <EducationGroupMoveSubmenu currentListId={group.listId} lists={lists} busy={busy} onMove={onMove} />
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" className="app-destructive-menu-item min-h-12 gap-3 rounded-xl px-3 text-base" disabled={busy} onClick={onDisband}>
          <Ungroup aria-hidden="true" />
          Расформировать
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DisbandDialog({ group, busy, itemsStayLabel, onOpenChange, onDisband }) {
  return (
    <AlertDialog open onOpenChange={(open) => !busy && onOpenChange(open)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Расформировать группу «{group.title}»?</AlertDialogTitle>
          <AlertDialogDescription>{itemsStayLabel} останутся в списке и снова будут показаны отдельно.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} aria-busy={busy || undefined} onClick={onDisband}>
            {busy ? <Spinner data-icon="inline-start" /> : <Ungroup data-icon="inline-start" aria-hidden="true" />}
            Расформировать
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function EducationItemGroupTile({
  group, items, lists, isDropTarget, ItemIcon, countLabel, itemsStayLabel,
  onOpen, onRename, onMove, onDisband,
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(group.title);
  const [busy, setBusy] = useState(false);
  const [disbandOpen, setDisbandOpen] = useState(false);

  useEffect(() => { if (!editing) setTitle(group.title); }, [editing, group.title]);

  const saveTitle = async () => {
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === group.title) {
      setTitle(group.title);
      setEditing(false);
      return;
    }
    setBusy(true);
    const saved = await onRename(nextTitle);
    setBusy(false);
    if (saved) setEditing(false);
  };
  const move = async (list) => {
    setBusy(true);
    await onMove(list);
    setBusy(false);
  };
  const disband = async () => {
    setBusy(true);
    const removed = await onDisband();
    setBusy(false);
    if (removed) setDisbandOpen(false);
  };

  return (
    <>
      <li
        className={`education-course-group min-w-0 ${isDropTarget ? "is-drop-target" : ""}`}
        data-sortable-group-id={group.id}
      >
        <Card className="relative h-full min-h-44 overflow-hidden transition-colors">
          <Button
            className="absolute inset-0 z-10 h-full w-full rounded-xl bg-transparent p-0 hover:bg-transparent active:translate-y-0"
            variant="ghost"
            type="button"
            aria-label={`Открыть группу «${group.title}», ${countLabel(items.length)}`}
            onClick={onOpen}
          />
          <CardHeader className="gap-3">
            <div className="flex h-20 items-center gap-4 overflow-hidden pr-12" aria-hidden="true">
              {items.slice(0, 4).map((item) => (
                <span className="grid size-14 shrink-0 place-items-center overflow-hidden text-muted-foreground" key={item.id}>
                  <ItemIcon className="size-7" />
                </span>
              ))}
            </div>
            <CardTitle className="relative z-20 min-w-0 pr-10">
              {editing ? (
                <Input
                  autoFocus
                  className="pointer-events-auto min-h-10 text-base"
                  maxLength={60}
                  aria-label="Название группы"
                  disabled={busy}
                  value={title}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setTitle(event.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.blur(); }
                    if (event.key === "Escape") { event.preventDefault(); setTitle(group.title); setEditing(false); }
                  }}
                />
              ) : <h3 className="m-0 truncate font-heading text-base leading-snug font-medium">{group.title}</h3>}
            </CardTitle>
            {!editing && (
              <CardAction className="pointer-events-auto relative z-20">
                <EducationGroupActions
                  group={group}
                  lists={lists}
                  busy={busy}
                  onBeginRename={() => { setTitle(group.title); setEditing(true); }}
                  onMove={move}
                  onDisband={() => setDisbandOpen(true)}
                />
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="mt-auto text-sm text-muted-foreground">{countLabel(items.length)}</CardContent>
        </Card>
      </li>
      {disbandOpen && (
        <DisbandDialog group={group} busy={busy} itemsStayLabel={itemsStayLabel} onOpenChange={setDisbandOpen} onDisband={disband} />
      )}
    </>
  );
}

export function EducationItemGroupOverlay({
  group, items, lists, countLabel, itemsStayLabel, moveItemId, renderItem,
  onClose, onRename, onMove, onDisband,
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(group.title);
  const [busy, setBusy] = useState(false);
  const [disbandOpen, setDisbandOpen] = useState(false);

  useEffect(() => { if (!editing) setTitle(group.title); }, [editing, group.title]);
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !editing && !disbandOpen) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [disbandOpen, editing, onClose]);

  const saveTitle = async () => {
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === group.title) {
      setTitle(group.title);
      setEditing(false);
      return;
    }
    setBusy(true);
    const saved = await onRename(nextTitle);
    setBusy(false);
    if (saved) setEditing(false);
  };
  const move = async (list) => {
    setBusy(true);
    await onMove(list);
    setBusy(false);
  };
  const disband = async () => {
    setBusy(true);
    const removed = await onDisband();
    setBusy(false);
    if (removed) setDisbandOpen(false);
  };

  return createPortal(
    <section className="education-group-overlay rollapp-body" role="dialog" aria-modal="true" aria-label={`Группа «${group.title}»`}>
      <header className="mx-auto flex min-h-24 w-full max-w-5xl items-center justify-between gap-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Layers3 className="size-5" aria-hidden="true" /></span>
          <span className="grid min-w-0 gap-0.5">
            {editing ? (
              <Input
                autoFocus
                className="min-h-10 w-[min(24rem,55vw)] text-base font-semibold"
                maxLength={60}
                aria-label="Название группы"
                disabled={busy}
                value={title}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={saveTitle}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.blur(); }
                  if (event.key === "Escape") { event.preventDefault(); setTitle(group.title); setEditing(false); }
                }}
              />
            ) : <strong className="truncate text-base font-semibold">{group.title}</strong>}
            <small className="text-sm text-muted-foreground">{countLabel(items.length)}</small>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!editing && (
            <EducationGroupActions
              group={group}
              lists={lists}
              busy={busy}
              onBeginRename={() => { setTitle(group.title); setEditing(true); }}
              onMove={move}
              onDisband={() => setDisbandOpen(true)}
            />
          )}
          <Button className="size-11 rounded-full" variant="ghost" size="icon" type="button" disabled={busy} aria-label="Закрыть группу" onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </div>
      </header>
      <ul className="mx-auto grid w-full max-w-5xl list-none gap-4 sm:grid-cols-2" aria-label={`Элементы группы «${group.title}»`}>
        {items.map((item) => (
          <li className="min-w-0" key={item.id}>
            {renderItem(item, { busy, removeBusy: moveItemId === item.id })}
          </li>
        ))}
      </ul>
      {disbandOpen && (
        <DisbandDialog group={group} busy={busy} itemsStayLabel={itemsStayLabel} onOpenChange={setDisbandOpen} onDisband={disband} />
      )}
    </section>,
    document.body,
  );
}
