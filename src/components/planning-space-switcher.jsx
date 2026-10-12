import { useId, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, Check, ChevronDown, Columns3, Plus } from "lucide-react";
import { api } from "@/api";
import { usePlanningSpaces } from "@/hooks/use-planning-spaces";
import { PlanningDatePicker } from "@/components/planning-date-picker";
import { dateFromKey } from "../../shared/planning-calendar.js";
import { isPlanningDate, localDateKey } from "../../shared/planning.js";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function PlanningSpaceSwitcher() {
  const [search, setSearch] = useSearchParams();
  const tab = search.get("tab");
  if (tab === "todo") {
    const selected = isPlanningDate(search.get("date")) ? search.get("date") : localDateKey(new Date());
    const month = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(dateFromKey(selected));
    const compactMonth = new Intl.DateTimeFormat("ru-RU", { month: "2-digit", year: "numeric" }).format(dateFromKey(selected)).replace(/\s*г\.$/, "");
    return <PlanningDatePicker value={selected} label="Выбрать дату" className="space-select global-service-select planning-date-select rounded-full" onChange={(date) => {
      setSearch((current) => { const next = new URLSearchParams(current); next.set("date", date); return next; });
    }}><CalendarDays aria-hidden="true" className="max-[360px]:hidden" /><span className="space-select__label hidden sm:inline">{month.charAt(0).toUpperCase() + month.slice(1)}</span><span className="space-select__label sm:hidden">{compactMonth}</span><ChevronDown aria-hidden="true" className="max-[360px]:hidden" /></PlanningDatePicker>;
  }
  const kind = tab === "calendar" ? "calendar" : "kanban";
  // A tool change also resets any pending fetch or creation form.
  return <SpaceSwitcher key={kind} kind={kind} selected={search.get("space") || "main"} onSelect={(id) => {
    setSearch((current) => { const next = new URLSearchParams(current); if (id === "main") next.delete("space"); else next.set("space", id); return next; });
  }} />;
}

function SpaceSwitcher({ kind, selected, onSelect }) {
  const calendar = kind === "calendar";
  const Icon = calendar ? CalendarDays : Columns3;
  const { spaces, setSpaces, loading, error, reload } = usePlanningSpaces(kind);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const inputId = useId();
  const selectedSpace = spaces.find((space) => space.id === selected);
  const label = selectedSpace?.title || (loading ? "Загрузка…" : calendar ? "Выберите календарь" : "Выберите доску");
  const createLabel = calendar ? "Создать календарь" : "Создать доску";
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="space-select global-service-select rounded-full" aria-label={calendar ? "Выбрать календарь" : "Выбрать доску задач"} />}>
        <Icon aria-hidden="true" /><span className="space-select__label">{label}</span><ChevronDown aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="rollapp-body global-service-select__content w-max min-w-(--anchor-width) max-w-(--available-width)" align="center">
        {spaces.map((space) => <DropdownMenuItem key={space.id} onClick={() => onSelect(space.id)} aria-current={selected === space.id ? "true" : undefined}>
          <Icon aria-hidden="true" /><span className="flex-1">{space.title}</span>{selected === space.id && <Check aria-hidden="true" />}
        </DropdownMenuItem>)}
        {loading && <DropdownMenuItem disabled>Загрузка…</DropdownMenuItem>}
        {error && <><p className="px-3 py-2 text-destructive" role="alert">{error}</p><DropdownMenuItem onClick={reload}>Повторить загрузку</DropdownMenuItem></>}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={loading || Boolean(error)} onClick={() => { setTitle(""); setSaveError(""); setCreating(true); }}><Plus aria-hidden="true" />{createLabel}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Drawer open={creating} onOpenChange={(open) => { if (!busy) setCreating(open); }}>
      <DrawerContent className="rollapp-body">
        <DrawerHeader><DrawerTitle>{calendar ? "Новый календарь" : "Новая доска"}</DrawerTitle><DrawerDescription>{calendar ? "Отдельный календарь для ваших событий." : "Отдельная доска со своими списками и карточками."}</DrawerDescription></DrawerHeader>
        <form className="flex flex-col gap-4 px-4" onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !title.trim()) return;
          setBusy(true); setSaveError("");
          try {
            const { space } = await api.post("/planning/spaces", { kind, title: title.trim() });
            setSpaces((current) => [...current, space]); setCreating(false); onSelect(space.id);
          } catch (cause) { setSaveError(cause.message); }
          finally { setBusy(false); }
        }}>
          <Field><FieldLabel htmlFor={inputId}>Название</FieldLabel><Input id={inputId} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={calendar ? "Например, Работа" : "Например, Личные проекты"} required maxLength={100} disabled={busy} /></Field>
          {saveError && <p role="alert" className="text-destructive">{saveError}</p>}
          <DrawerFooter className="px-0"><Button type="submit" disabled={busy || !title.trim()}>{busy ? "Создаём…" : createLabel}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setCreating(false)}>Отмена</Button></DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  </>;
}
