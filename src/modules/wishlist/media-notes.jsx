import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, NotebookText, Quote, Sparkles } from "lucide-react";
import { api } from "../runtime/api.js";
import { createLatestSaveQueue } from "../rich-documents/latest-save-queue.js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "../shell/toast.jsx";

const EMPTY_MEDIA_NOTE = Object.freeze({
  summary: "",
  keyIdeas: "",
  quotes: "",
  applications: "",
});

const mediaNoteHasContent = (note) => Object.keys(EMPTY_MEDIA_NOTE)
  .some((key) => String(note?.[key] || "").trim());

export function MediaNotesPanel({ wish }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(EMPTY_MEDIA_NOTE);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [savedAt, setSavedAt] = useState(null);
  const formRef = useRef(form);
  const saveRequestRef = useRef(0);
  const saveQueue = useMemo(
    () => createLatestSaveQueue((draft) => api.patch(`/wishes/${wish.id}/media-note`, draft)),
    [wish.id],
  );

  useEffect(() => {
    setOpen(false);
    setLoaded(false);
    setLoading(false);
    setForm(EMPTY_MEDIA_NOTE);
    formRef.current = EMPTY_MEDIA_NOTE;
    setDirty(false);
    setSaving(false);
    setLoadError("");
    setSavedAt(null);
    saveRequestRef.current += 1;
    return () => { saveRequestRef.current += 1; };
  }, [wish.id]);

  const loadNote = useCallback(async () => {
    if (loaded || loading) return;
    setLoading(true);
    setLoadError("");
    try {
      const result = await api.get(`/wishes/${wish.id}/media-note`);
      const note = { ...EMPTY_MEDIA_NOTE, ...result.note };
      setForm(note);
      formRef.current = note;
      setSavedAt(result.note?.updatedAt || null);
      setLoaded(true);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }, [loaded, loading, wish.id]);

  const saveNote = useCallback(async (candidate = formRef.current, { announce = false } = {}) => {
    if (!loaded) return false;
    const requestId = saveRequestRef.current + 1;
    saveRequestRef.current = requestId;
    setSaving(true);
    try {
      const { value: savedDraft, result } = await saveQueue(candidate);
      if (requestId !== saveRequestRef.current) return false;
      setSavedAt(result.note?.updatedAt || new Date().toISOString());
      const unchanged = Object.keys(EMPTY_MEDIA_NOTE).every((key) => formRef.current[key] === savedDraft[key]);
      if (unchanged) setDirty(false);
      if (announce) toast("Конспект сохранён");
      return true;
    } catch (error) {
      if (requestId === saveRequestRef.current) {
        setDirty(true);
        toast(error.message, "error");
      }
      return false;
    } finally {
      if (requestId === saveRequestRef.current) setSaving(false);
    }
  }, [loaded, saveQueue, toast]);

  useEffect(() => {
    if (!loaded || !dirty) return undefined;
    const timeoutId = window.setTimeout(() => saveNote(), 800);
    return () => window.clearTimeout(timeoutId);
  }, [dirty, form, loaded, saveNote]);

  const toggleOpen = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) loadNote();
  };
  const updateField = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      formRef.current = next;
      return next;
    });
    setDirty(true);
  };
  const hasContent = mediaNoteHasContent(form);
  const saveStatus = saving
    ? "Сохраняем…"
    : dirty
      ? "Есть изменения"
      : savedAt
        ? "Сохранено"
        : hasContent
          ? "Есть записи"
          : "Личный конспект";

  return <section className="mx-auto w-full max-w-(--layout-compact-width) overflow-hidden rounded-2xl border bg-card" aria-label="Конспект медиа-айтема">
    <ShadcnButton data-content-control="" type="button" variant="ghost" className="h-auto min-h-16 w-full justify-start gap-3 rounded-none px-4 py-3 text-left" aria-expanded={open} onClick={toggleOpen}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><NotebookText className="size-5" /></span>
      <span className="min-w-0 flex-1">
        <strong className="block text-base font-semibold">Конспект</strong>
        <small className="block truncate text-sm text-muted-foreground">{saveStatus}</small>
      </span>
      <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
    </ShadcnButton>
    {open && <div className="grid gap-4 border-t p-4">
      {loading && <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-muted-foreground"><Spinner /> Загружаем конспект…</div>}
      {!loading && loadError && <Alert variant="destructive"><AlertTitle>Не удалось открыть конспект</AlertTitle><AlertDescription className="grid gap-3">{loadError}<ShadcnButton variant="outline" size="sm" onClick={loadNote}>Повторить</ShadcnButton></AlertDescription></Alert>}
      {!loading && loaded && <>
        <label className="grid gap-2 text-sm font-medium">
          <span className="flex items-center gap-2"><NotebookText className="size-4 text-muted-foreground" />Краткое резюме</span>
          <Textarea rows={4} maxLength={12000} value={form.summary} placeholder="О чём материал и какой главный вывод" onChange={(event) => updateField("summary", event.target.value)} onBlur={() => dirty && saveNote()} />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          <span className="flex items-center gap-2"><Sparkles className="size-4 text-muted-foreground" />Ключевые идеи</span>
          <Textarea rows={5} maxLength={40000} value={form.keyIdeas} placeholder="Одна важная мысль с новой строки" onChange={(event) => updateField("keyIdeas", event.target.value)} onBlur={() => dirty && saveNote()} />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          <span className="flex items-center gap-2"><Quote className="size-4 text-muted-foreground" />Цитаты и фрагменты</span>
          <Textarea rows={5} maxLength={40000} value={form.quotes} placeholder="Цитата, страница, глава или таймкод" onChange={(event) => updateField("quotes", event.target.value)} onBlur={() => dirty && saveNote()} />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          <span className="flex items-center gap-2"><Check className="size-4 text-muted-foreground" />Как применить</span>
          <Textarea rows={4} maxLength={40000} value={form.applications} placeholder="Что попробую сделать после изучения материала" onChange={(event) => updateField("applications", event.target.value)} onBlur={() => dirty && saveNote()} />
        </label>
        <div className="flex items-center justify-between gap-3">
          <small className="text-muted-foreground">Конспект виден только вам</small>
          <ShadcnButton size="sm" disabled={!dirty || saving} aria-busy={saving || undefined} onClick={() => saveNote(formRef.current, { announce: true })}>Сохранить</ShadcnButton>
        </div>
      </>}
    </div>}
  </section>;
}
