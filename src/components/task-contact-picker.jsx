import { useEffect, useId, useState } from "react";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function TaskContactPicker({ value, contacts = [], onChange, disabled = false, searchContacts = (search) => api.get(`/contacts?search=${encodeURIComponent(search)}`) }) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [known, setKnown] = useState(() => new Map(contacts.map((contact) => [contact.id, contact])));
  const [status, setStatus] = useState("");
  const [retry, setRetry] = useState(0);
  // Search only after input; opening a task never needs a second API request.
  useEffect(() => {
    if (!search.trim()) { setResults([]); setStatus(""); return; }
    let current = true;
    setStatus("Загружаем контакты…");
    const timer = setTimeout(async () => {
      try {
        const data = await searchContacts(search.trim());
        if (!current) return;
        const found = data.contacts || [];
        setResults(found);
        setKnown((previous) => new Map([...previous, ...found.map((contact) => [contact.id, contact])]));
        setStatus(found.length ? "" : "Контакты не найдены.");
      } catch (error) {
        if (current) { setResults([]); setStatus(error.message); }
      }
    }, 300);
    return () => { current = false; clearTimeout(timer); };
    // The transport is stable for the lifetime of the task form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, retry]);
  return <Field>
    <FieldLabel htmlFor={id}>Участники встречи</FieldLabel>
    <FieldDescription>Описание и заметки встречи появятся в карточках выбранных контактов.</FieldDescription>
    {value.length > 0 && <div className="flex min-w-0 flex-col gap-2" aria-label="Выбранные участники">
      {value.map((contactId) => <div key={contactId} className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 break-words">{known.get(contactId)?.name || "Недоступный контакт"}</span>
        <Button type="button" variant="destructive" disabled={disabled} onClick={() => onChange(value.filter((item) => item !== contactId))} aria-label={`Убрать участника ${known.get(contactId)?.name || "Недоступный контакт"}`}>Убрать</Button>
      </div>)}
    </div>}
    <Input id={id} value={search} disabled={disabled || value.length >= 50} placeholder="Найти контакт по имени или компании" onChange={(event) => { setSearch(event.target.value); setResults([]); }} />
    {status && <p role="status" className="text-muted-foreground">{status}</p>}
    {search.trim() && status && status !== "Загружаем контакты…" && status !== "Контакты не найдены." && <Button type="button" variant="outline" disabled={disabled} onClick={() => setRetry((current) => current + 1)}>Повторить поиск</Button>}
    {results.some((contact) => !value.includes(contact.id)) && <div className="flex min-w-0 flex-col gap-2" aria-label="Результаты поиска контактов">
      {results.filter((contact) => !value.includes(contact.id)).map((contact) => <Button key={contact.id} type="button" variant="outline" className="h-auto justify-start whitespace-normal text-left" disabled={disabled || value.length >= 50} onClick={() => { onChange([...value, contact.id]); setSearch(""); }}>
        <span className="min-w-0 break-words">{contact.name}{contact.company ? ` · ${contact.company}` : ""}</span>
      </Button>)}
    </div>}
  </Field>;
}
