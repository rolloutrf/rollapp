import { useEffect, useId, useState } from "react";
import { FolderInput, ListPlus, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import { api } from "@/api";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  educationListItemCount,
  UNLISTED_EDUCATION_LIST_ID,
} from "@/lib/education-lists";

const LIST_TILE_STYLE = {
  width: 130,
  minWidth: 130,
  height: 100,
  minHeight: 100,
  padding: 12,
  flex: "0 0 130px",
  borderRadius: 18,
  fontSize: 16,
  lineHeight: "19px",
};

function ListTileContent({ title, count }) {
  return (
    <>
      <strong data-slot="list-tile-label" style={{ fontSize: 16, lineHeight: "19px" }}>{title}</strong>
      <div data-slot="list-tile-meta">
        <span data-slot="list-tile-count" style={{ fontSize: 24, lineHeight: "29px", fontWeight: 600 }}>{count}</span>
      </div>
    </>
  );
}

export function EducationItemListMenu({
  currentListId,
  disabled = false,
  itemLabel,
  itemTitle,
  lists,
  moving = false,
  onCreateList,
  onMove,
}) {
  const selectedListId = currentListId || UNLISTED_EDUCATION_LIST_ID;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(
          <Button
            className="pointer-events-auto relative z-20 size-9 rounded-full"
            variant="ghost"
            size="icon-lg"
            type="button"
            disabled={disabled}
          />
        )}
        aria-label={`Переместить ${itemLabel} «${itemTitle}» в другой список`}
      >
        {moving ? <Spinner aria-hidden="true" /> : <MoreHorizontal aria-hidden="true" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="rollapp-body w-80 max-w-[calc(100vw-24px)] rounded-3xl p-3"
        align="end"
        sideOffset={8}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-2 text-base">Списки</DropdownMenuLabel>
          {onCreateList && (
            <DropdownMenuItem
              className="min-h-14 gap-3 rounded-2xl px-2 py-2 text-base"
              disabled={moving}
              onClick={onCreateList}
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-muted text-muted-foreground" aria-hidden="true">
                <ListPlus className="size-6" />
              </span>
              Новый список
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        {onCreateList && <DropdownMenuSeparator className="my-2" />}
        <DropdownMenuRadioGroup
          className="max-h-[22.75rem] overflow-y-auto overscroll-contain"
          value={selectedListId}
          onValueChange={(listId) => listId !== selectedListId && onMove(listId)}
        >
          <DropdownMenuRadioItem
            className="min-h-14 gap-3 rounded-2xl px-2 py-2 pr-10 text-base"
            value={UNLISTED_EDUCATION_LIST_ID}
            disabled={moving}
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-muted text-muted-foreground" aria-hidden="true">
              <FolderInput className="size-6" />
            </span>
            <span className="min-w-0 flex-1 truncate">Не отсортированные</span>
          </DropdownMenuRadioItem>
          {lists.map((list) => (
            <DropdownMenuRadioItem
              className="min-h-14 gap-3 rounded-2xl px-2 py-2 pr-10 text-base"
              value={list.id}
              key={list.id}
              disabled={moving}
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-muted text-muted-foreground" aria-hidden="true">
                <ListPlus className="size-6" />
              </span>
              <span className="min-w-0 flex-1 truncate">{list.title}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function EducationSectionHeader({ title, titleId, selectedList, onAdd, onEditList }) {
  return (
    <header className="flex min-h-12 w-full items-center justify-center">
      <h2 className="sr-only" id={titleId}>{title}</h2>
      <div className="page-actions wishes-page__hero-actions" role="group" aria-label={`Действия раздела «${title}»`}>
        {selectedList && (
          <Button
            className="h-12 px-5 text-base max-[560px]:flex-1"
            variant="outline"
            shape="pill"
            type="button"
            onClick={() => onEditList(selectedList)}
          >
            Настройки списка
          </Button>
        )}
        <Button
          className="h-12 min-w-[180px] px-6 text-base max-[560px]:min-w-0"
          shape="pill"
          type="button"
          onClick={onAdd}
        >
          Добавить
        </Button>
      </div>
    </header>
  );
}

export function EducationListNavigation({
  items,
  lists,
  selectedListId,
  unlistedTitle = "Не отсортированные",
  ariaLabel,
  onCreateList,
  onSelectList,
}) {
  const unlistedCount = educationListItemCount(items, UNLISTED_EDUCATION_LIST_ID);
  const showUnlisted = unlistedCount > 0 || lists.length === 0;
  return (
    <div className="min-w-0" data-group-navigation>
      <div className="list-tabs mb-0">
        <div className="flex w-max min-w-full flex-none items-stretch justify-center gap-1.5">
          <ToggleGroup
            className="contents"
            value={[selectedListId]}
            onValueChange={(values) => values[0] && onSelectList(values[0])}
            aria-label={ariaLabel}
          >
            {showUnlisted && (
              <ToggleGroupItem
                style={LIST_TILE_STYLE}
                value={UNLISTED_EDUCATION_LIST_ID}
                aria-label={`${unlistedTitle}, ${unlistedCount}`}
              >
                <ListTileContent title={unlistedTitle} count={unlistedCount} />
              </ToggleGroupItem>
            )}
            {lists.map((list) => {
              const count = educationListItemCount(items, list.id);
              return (
                <ToggleGroupItem
                  style={LIST_TILE_STYLE}
                  value={list.id}
                  key={list.id}
                  aria-label={`${list.title}, ${count}`}
                >
                  <ListTileContent title={list.title} count={count} />
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
          <Button
            variant="ghost"
            size="icon"
            className="list-tabs__add"
            aria-label="Новый список"
            title="Новый список"
            type="button"
            onClick={onCreateList}
          >
            <Plus size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function EducationListDrawer({
  list,
  open,
  section,
  itemPlural,
  onDeleted,
  onOpenChange,
  onSaved,
}) {
  const isMobile = useIsMobile();
  const titleId = useId();
  const descriptionId = useId();
  const editing = Boolean(list?.id);
  const [form, setForm] = useState({ title: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm({ title: list?.title || "", description: list?.description || "" });
    setSaving(false);
    setDeleting(false);
    setDeleteOpen(false);
    setError("");
  }, [list, open]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = editing
        ? await api.patch(`/education/lists/${encodeURIComponent(list.id)}`, form)
        : await api.post("/education/lists", { ...form, section });
      onSaved(result.list);
      onOpenChange(false);
    } catch (requestError) {
      setError(requestError.message);
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing || deleting) return;
    setDeleting(true);
    setError("");
    try {
      const result = await api.delete(`/education/lists/${encodeURIComponent(list.id)}`);
      setDeleteOpen(false);
      onDeleted(result);
      onOpenChange(false);
    } catch (requestError) {
      setDeleteOpen(false);
      setError(requestError.message);
      setDeleting(false);
    }
  }

  return (
    <>
      <Drawer
        open={open}
        showSwipeHandle
        swipeDirection={isMobile ? "down" : "right"}
        onOpenChange={(nextOpen) => !saving && !deleting && onOpenChange(nextOpen)}
      >
        <DrawerContent
          className="rollapp-body"
          style={isMobile ? undefined : { "--drawer-content-width": "min(34rem, calc(100vw - 2rem))" }}
        >
          <DrawerClose
            render={<Button className="absolute top-2 right-2 z-10 size-12" variant="ghost" size="icon" type="button" disabled={saving || deleting} />}
            aria-label="Закрыть настройки списка"
          >
            <X aria-hidden="true" />
          </DrawerClose>
          <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
            <DrawerHeader className="pr-16 text-left!">
              <DrawerTitle>{editing ? "Изменить список" : "Создать список"}</DrawerTitle>
              <DrawerDescription>
                {editing ? "Измените название и описание списка." : `Соберите связанные ${itemPlural} в отдельный список.`}
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>Не удалось сохранить список</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor={titleId}>Название</FieldLabel>
                  <Input
                    className="min-h-12 text-base"
                    id={titleId}
                    autoFocus
                    required
                    maxLength={80}
                    placeholder="Например, На этот год"
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={descriptionId}>Описание</FieldLabel>
                  <Textarea
                    className="min-h-24 text-base"
                    id={descriptionId}
                    rows={4}
                    maxLength={300}
                    placeholder="Коротко опишите назначение списка"
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  />
                </Field>
              </FieldGroup>
              {editing && (
                <div className="mt-auto flex items-center justify-between gap-4 border-t pt-4">
                  <div className="min-w-0">
                    <strong className="block text-sm font-medium">Удалить список</strong>
                    <span className="text-sm text-muted-foreground">Все записи останутся в разделе без списка.</span>
                  </div>
                  <Button type="button" variant="destructive" disabled={deleting} onClick={() => setDeleteOpen(true)}>
                    <Trash2 data-icon="inline-start" aria-hidden="true" />
                    Удалить
                  </Button>
                </div>
              )}
            </div>
            <DrawerFooter className="border-t bg-popover pt-4 sm:flex-row sm:justify-end">
              <DrawerClose render={<Button className="min-h-12 px-4 text-base" variant="outline" type="button" disabled={saving || deleting} />}>
                Отмена
              </DrawerClose>
              <Button className="min-h-12 px-4 text-base" type="submit" disabled={saving || deleting}>
                {saving && <Spinner aria-hidden="true" />}
                {saving ? "Сохраняем" : editing ? "Сохранить изменения" : "Создать список"}
              </Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
      {deleteOpen && (
        <AlertDialog open={deleteOpen} onOpenChange={(nextOpen) => !deleting && setDeleteOpen(nextOpen)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить «{list?.title}»?</AlertDialogTitle>
              <AlertDialogDescription>
                Все записи останутся в разделе и перейдут в «Не отсортированные». Отменить удаление списка не получится.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={deleting} onClick={remove}>
                {deleting ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}
                Удалить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
