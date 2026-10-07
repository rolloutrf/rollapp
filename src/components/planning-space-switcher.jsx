import { useEffect, useId, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, Check, ChevronDown, Columns3, Plus } from "lucide-react";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function PlanningSpaceSwitcher() {
  const [search, setSearch] = useSearchParams();
  const kind = search.get("tab") === "calendar" ? "calendar" : "kanban";
  // A tool change also resets any pending fetch or creation form.
  return <SpaceSwitcher key={kind} kind={kind} selected={search.get("space") || "main"} onSelect={(id) => {
    setSearch((current) => { const next = new URLSearchParams(current); if (id === "main") next.delete("space"); else next.set("space", id); return next; });
  }} />;
}

function SpaceSwitcher({ kind, selected, onSelect }) {
  const calendar = kind === "calendar";
  const Icon = calendar ? CalendarDays : Columns3;
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const inputId = useId();
  useEffect(() => {
    let current = true;
    setLoading(true); setError("");
    api.get(`/planning/spaces?kind=${kind}`).then(({ spaces: loaded }) => { if (current) setSpaces(loaded); })
      .catch((cause) => { if (current) setError(cause.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [kind, retry]);
  const selectedSpace = spaces.find((space) => space.id === selected);
  const label = selectedSpace?.title || (loading ? "Загрузка…" : "Выберите вариант");
  const createLabel = calendar ? "Создать календарь" : "Создать доску";
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="space-select global-service-select rounded-full" aria-label={calendar ? "Выбрать календарь" : "Выбрать доску"} />}>
        <Icon aria-hidden="true" /><span className="space-select__label">{label}</span><ChevronDown aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="rollapp-body global-service-select__content w-max min-w-(--anchor-width) max-w-(--available-width)" align="center">
        {spaces.map((space) => <DropdownMenuItem key={space.id} onClick={() => onSelect(space.id)} aria-current={selected === space.id ? "true" : undefined}>
          <Icon aria-hidden="true" /><span className="flex-1">{space.title}</span>{selected === space.id && <Check aria-hidden="true" />}
        </DropdownMenuItem>)}
        {loading && <DropdownMenuItem disabled>Загрузка…</DropdownMenuItem>}
        {error && <><p className="px-3 py-2 text-destructive" role="alert">{error}</p><DropdownMenuItem onClick={() => setRetry((value) => value + 1)}>Повторить загрузку</DropdownMenuItem></>}
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
