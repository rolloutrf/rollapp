import { createContext, useContext, useEffect, useId, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { CalendarDays, Check, ChevronDown, Columns3, FileText, ListTodo } from "lucide-react";
import { api } from "@/api";
import { usePlanningSpaces } from "@/hooks/use-planning-spaces";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const PlanningSpacesContext = createContext(null);
const SPACE_COPY = {
  calendar: { icon: CalendarDays, create: "Создать календарь", title: "Новый календарь", description: "Отдельный календарь для ваших событий.", example: "Работа" },
  todo: { icon: ListTodo, create: "Создать To Do-лист", title: "Новый To Do-лист", description: "Отдельный список со своими задачами.", example: "Личные дела" },
  kanban: { icon: Columns3, create: "Создать доску", title: "Новая доска", description: "Отдельная доска со своими списками и карточками.", example: "Личные проекты" },
  column: { create: "Добавить список", title: "Новый список на доске", description: "Список для карточек на этой доске.", example: "В работе" },
};

export function PlanningSpacesProvider({ children, enabled = true }) {
  const { pathname, search } = useLocation();
  const params = new URLSearchParams(search);
  const tab = params.get("tab");
  let kind = null;
  if (enabled && pathname === "/app/planning" && tab !== "notes") {
    if (tab === "calendar") kind = params.get("spaceKind") === "todo" ? "todo" : "calendar";
    else kind = tab === "todo" ? "todo" : "kanban";
  }
  return <PlanningSpacesState kind={kind}>{children}</PlanningSpacesState>;
}

function PlanningSpacesState({ kind, children }) {
  const [search, setSearch] = useSearchParams();
  const state = usePlanningSpaces(kind);
  const [creatingKind, setCreatingKind] = useState(null);
  useEffect(() => setCreatingKind(null), [kind]);
  const select = (id, options) => {
    setSearch((current) => {
      const next = new URLSearchParams(current);
      if (id === "main") next.delete("space"); else next.set("space", id);
      if (options?.replace) next.delete("formScreen");
      return next;
    }, options);
  };
  const value = kind ? { ...state, kind, selected: search.get("space") || "main", onSelect: select,
    createAction: { label: SPACE_COPY[kind].create, icon: SPACE_COPY[kind].icon, disabled: state.loading || Boolean(state.error), onSelect: () => setCreatingKind(kind) } } : null;
  return <PlanningSpacesContext.Provider value={value}>
    {children}
    {kind && creatingKind === kind && <PlanningSpaceCreator kind={kind} onClose={() => setCreatingKind(null)} onCreate={async (title) => {
      const { space } = await api.post("/planning/spaces", { kind, title });
      state.setSpaces((current) => [...current, space]);
      setCreatingKind(null);
      select(space.id, { replace: true });
    }} />}
  </PlanningSpacesContext.Provider>;
}

export function usePlanningSpaceSelection() {
  return useContext(PlanningSpacesContext);
}

export function PlanningSpaceSwitcher() {
  const state = usePlanningSpaceSelection();
  const [search] = useSearchParams();
  if (search.get("tab") === "notes") return <Link to="?tab=notes" className={cn(buttonVariants({ variant: "outline" }), "space-select global-service-select rounded-full")} aria-label="К списку заметок"><FileText aria-hidden="true" /><span className="space-select__label">Заметки</span></Link>;
  return state && <PlanningSpaceMenu {...state} />;
}

export function PlanningSpaceMenu({ kind, selected, onSelect, spaces, loading, error, reload }) {
  const mobile = useIsMobile();
  const calendar = kind === "calendar", todo = kind === "todo";
  const { icon: Icon } = SPACE_COPY[kind];
  const selectedSpace = spaces.find((space) => space.id === selected);
  const label = selectedSpace?.title || (loading ? "Загрузка…" : calendar ? "Выберите календарь" : todo ? "Выберите To Do-лист" : "Выберите доску");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="space-select global-service-select rounded-full" aria-label={calendar ? "Выбрать календарь" : todo ? "Выбрать To Do-лист" : "Выбрать доску задач"} />}>
        <Icon aria-hidden="true" /><span className="space-select__label">{label}</span><ChevronDown aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="rollapp-body global-service-select__content app-navigation-popup w-max min-w-(--anchor-width) max-w-(--available-width)" align="center" side={mobile ? "top" : "bottom"}>
        {spaces.map((space) => <DropdownMenuItem key={space.id} onClick={() => onSelect(space.id)} aria-current={selected === space.id ? "true" : undefined}>
          <Icon aria-hidden="true" /><span className="flex-1">{space.title}</span>{selected === space.id && <Check aria-hidden="true" />}
        </DropdownMenuItem>)}
        {loading && <DropdownMenuItem disabled>Загрузка…</DropdownMenuItem>}
        {kind === "kanban" && !loading && !error && !spaces.length && <DropdownMenuItem disabled>Нет досок</DropdownMenuItem>}
        {error && <><p className="px-3 py-2 text-destructive" role="alert">{error}</p><DropdownMenuItem onClick={reload}>Повторить загрузку</DropdownMenuItem></>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PlanningSpaceCreator({ kind, onClose, onCreate }) {
  const mobile = useIsMobile();
  const { create: createLabel, title: heading, description, example } = SPACE_COPY[kind];
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const inputId = useId();
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
          <DrawerHeader><DrawerTitle>{heading}</DrawerTitle><DrawerDescription>{description}</DrawerDescription></DrawerHeader>
          <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <Field><FieldLabel htmlFor={inputId}>Название</FieldLabel><Input id={inputId} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`Например, ${example}`} required maxLength={100} disabled={busy} /></Field>
            {saveError && <p role="alert" className="text-destructive">{saveError}</p>}
          </div>
          <DrawerFooter><Button type="submit" disabled={busy || !title.trim()}>{busy ? "Создаём…" : createLabel}</Button>{!mobile && <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Отмена</Button>}</DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>;
}
