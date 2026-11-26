import { useEffect, useId, useRef, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { api } from "@/api";
import { ControlBar } from "@/components/control-bar";
import { PageActionButton } from "@/components/page-action-button";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { maxWishParticipants } from "../../shared/wish-participants.js";

export function WishParticipantField({ participants, onChange, spaceLabel, disabled }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState(null);
  const addButtonRef = useRef(null);
  const term = search.trim().replace(/^@/, "").toLowerCase();

  useEffect(() => {
    if (!open || term.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { people } = await api.get(`/people?search=${encodeURIComponent(term)}`);
        if (!cancelled) setResult({ term, people });
      } catch (error) {
        if (!cancelled) setResult({ term, error: error.message });
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, term]);

  const selectedIds = new Set(participants.map((person) => person.id));
  const currentResult = term.length >= 2 && result?.term === term ? result : null;
  const matches = currentResult?.people?.filter((person) => !selectedIds.has(person.id)) ?? [];
  matches.sort((a, b) => Number(b.username === term) - Number(a.username === term));
  const atLimit = participants.length >= maxWishParticipants;

  return <fieldset className="grid min-w-0 gap-2" disabled={disabled}>
    <legend className="text-xs font-semibold uppercase tracking-[0.08em]">Совместное желание</legend>
    <FieldDescription className="text-xs">После сохранения участники увидят эту карточку в пространстве «{spaceLabel}» на своей доске.</FieldDescription>
    {participants.length > 0 && <ul className="grid gap-2" aria-label="Участники желания">
      {participants.map((person) => <li key={person.id} className="flex min-w-0 items-center gap-2 rounded-xl bg-muted px-3">
        <div className="min-w-0 flex-1">
          <span className="block break-words">{person.name}</span>
          <span className="block break-words text-xs text-muted-foreground">@{person.username}</span>
        </div>
        <ControlBar>
          <Button data-control-icon type="button" variant="destructive" size="icon" aria-label={`Убрать участника ${person.name}`} onClick={() => {
            onChange(participants.filter((item) => item.id !== person.id));
            addButtonRef.current?.focus();
          }}>
            <X aria-hidden="true" />
          </Button>
        </ControlBar>
      </li>)}
    </ul>}
    <PageActionButton ref={addButtonRef} type="button" variant="outline" className="w-fit max-w-full" aria-expanded={open} aria-controls={open ? id : undefined} disabled={atLimit || disabled} onClick={() => setOpen(!open)}>
      <UserPlus aria-hidden="true" /> Добавить участника
    </PageActionButton>
    {open && !atLimit && <Field id={id} className="gap-2">
      <FieldLabel htmlFor={`${id}-search`}>Имя или @username</FieldLabel>
      <Input id={`${id}-search`} value={search} autoComplete="off" maxLength={80}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) event.preventDefault(); }}
        onChange={(event) => setSearch(event.target.value)} />
      {term.length >= 2 && <FieldDescription role="status">
        {!currentResult ? "Ищем пользователей…" : currentResult.error || (!matches.length ? "Никого не нашли" : "")}
      </FieldDescription>}
      {matches.length > 0 && <ul className="grid gap-2" aria-label="Результаты поиска">
        {matches.slice(0, 8).map((person) => <li key={person.id} className="min-w-0">
          <Button type="button" variant="outline" className="h-auto min-h-12 w-full min-w-0 justify-start whitespace-normal px-3 py-2 text-left" onClick={() => {
            onChange([...participants, person]);
            setOpen(false);
            setSearch("");
            setResult(null);
            addButtonRef.current?.focus();
          }}>
            <span className="min-w-0 break-words">{person.name} <span className="text-xs text-muted-foreground">@{person.username}</span></span>
          </Button>
        </li>)}
      </ul>}
    </Field>}
  </fieldset>;
}
