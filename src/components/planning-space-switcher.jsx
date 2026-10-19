import { useId, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, Check, ChevronDown, Columns3, ListTodo, Plus } from "lucide-react";
import { api } from "@/api";
import { usePlanningSpaces } from "@/hooks/use-planning-spaces";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function PlanningSpaceSwitcher() {
  const [search, setSearch] = useSearchParams();
  const tab = search.get("tab");
  const kind = tab === "todo" ? "todo" : tab === "calendar" ? "calendar" : "kanban";
  // A tool change also resets any pending fetch or creation form.
  return <SpaceSwitcher key={kind} kind={kind} selected={search.get("space") || "main"} onSelect={(id, options) => {
    setSearch((current) => { const next = new URLSearchParams(current); if (id === "main") next.delete("space"); else next.set("space", id); if (options?.replace) next.delete("formScreen"); return next; }, options);
  }} />;
}

function SpaceSwitcher({ kind, selected, onSelect }) {
  const state = usePlanningSpaces(kind);
  return <PlanningSpaceMenu {...state} kind={kind} selected={selected} onSelect={onSelect} createSpace={async (title) => {
    const { space } = await api.post("/planning/spaces", { kind, title });
    return space;
  }} />;
}

export function PlanningSpaceMenu({ kind, selected, onSelect, spaces, setSpaces, loading, error, reload, createSpace }) {
  const mobile = useIsMobile();
  const calendar = kind === "calendar", todo = kind === "todo";
  const Icon = calendar ? CalendarDays : todo ? ListTodo : Columns3;
  const [creating, setCreating] = useState(false);
  const selectedSpace = spaces.find((space) => space.id === selected);
  const label = selectedSpace?.title || (loading ? "Загрузка…" : calendar ? "Выберите календарь" : todo ? "Выберите To Do-лист" : "Выберите доску");
  const createLabel = calendar ? "Создать календарь" : todo ? "Создать To Do-лист" : "Создать доску";
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="space-select global-service-select rounded-full" aria-label={calendar ? "Выбрать календарь" : todo ? "Выбрать To Do-лист" : "Выбрать доску задач"} />}>
        <Icon aria-hidden="true" /><span className="space-select__label">{label}</span><ChevronDown aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="rollapp-body global-service-select__content app-navigation-popup w-max min-w-(--anchor-width) max-w-(--available-width)" align="center" side={mobile ? "top" : "bottom"}>
        {spaces.map((space) => <DropdownMenuItem key={space.id} onClick={() => onSelect(space.id)} aria-current={selected === space.id ? "true" : undefined}>
          <Icon aria-hidden="true" /><span className="flex-1">{space.title}</span>{selected === space.id && <Check aria-hidden="true" />}
        </DropdownMenuItem>)}
        {loading && <DropdownMenuItem disabled>Загрузка…</DropdownMenuItem>}
        {error && <><p className="px-3 py-2 text-destructive" role="alert">{error}</p><DropdownMenuItem onClick={reload}>Повторить загрузку</DropdownMenuItem></>}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={loading || Boolean(error)} onClick={() => setCreating(true)}><Plus aria-hidden="true" />{createLabel}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {creating && <PlanningSpaceCreator kind={kind} onClose={() => setCreating(false)} onCreate={async (title) => {
      const space = await createSpace(title);
      setSpaces((current) => [...current, space]); setCreating(false); onSelect(space.id, { replace: true });
    }} />}
  </>;
}

export function PlanningSpaceCreator({ kind, onClose, onCreate }) {
  const mobile = useIsMobile();
  const calendar = kind === "calendar", todo = kind === "todo";
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const inputId = useId();
  const createLabel = calendar ? "Создать календарь" : todo ? "Создать To Do-лист" : "Создать доску";
  return <Drawer open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DrawerContent className="rollapp-body">
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !title.trim()) return;
          setBusy(true); setSaveError("");
          try { await onCreate(title.trim()); onClose(); }
          catch (cause) { setSaveError(cause.message); }
          finally { setBusy(false); }
        }}>
          <DrawerHeader><DrawerTitle>{calendar ? "Новый календарь" : todo ? "Новый To Do-лист" : "Новая доска"}</DrawerTitle><DrawerDescription>{calendar ? "Отдельный календарь для ваших событий." : todo ? "Отдельный список со своими задачами." : "Отдельная доска со своими списками и карточками."}</DrawerDescription></DrawerHeader>
          <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <Field><FieldLabel htmlFor={inputId}>Название</FieldLabel><Input id={inputId} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={calendar ? "Например, Работа" : todo ? "Например, Личные дела" : "Например, Личные проекты"} required maxLength={100} disabled={busy} /></Field>
            {saveError && <p role="alert" className="text-destructive">{saveError}</p>}
          </div>
          <DrawerFooter><Button type="submit" disabled={busy || !title.trim()}>{busy ? "Создаём…" : createLabel}</Button>{!mobile && <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Отмена</Button>}</DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>;
}
