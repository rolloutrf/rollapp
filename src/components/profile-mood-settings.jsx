import { useEffect, useRef, useState } from "react";
import { api } from "@/api.js";
import { DrawerFooter } from "@/components/form-surface";
import { Avatar } from "@/components/profile-avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import { MOOD_LEVELS, moodAt } from "../../shared/profile-mood.js";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });
const spectrum = `linear-gradient(to right, ${MOOD_LEVELS.map((mood) => mood.color).join(", ")})`;
const moodApi = {
  read: (before) => api.get(`/me/mood${before ? `?before=${encodeURIComponent(before)}` : ""}`),
  save: (payload) => api.patch("/me/mood", payload),
};

export function ProfileMoodSettings({ user, onSaved, onBusyChange, transport = moodApi }) {
  const isMobile = useIsMobile();
  const Body = isMobile ? "div" : ScrollArea;
  const [journal, setJournal] = useState(null);
  const [level, setLevel] = useState(null);
  const [published, setPublished] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("");
  const inFlight = useRef(false);
  const pending = useRef(null);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    let active = true;
    transport.read().then((result) => {
      if (!active) return;
      setJournal(result);
      setPublished(result.published);
    }).catch((failure) => {
      if (active) setError({ message: failure.message || "Не удалось открыть журнал." });
    });
    return () => { active = false; alive.current = false; };
  }, [retry, transport]);

  const preview = moodAt(level ?? journal?.level);
  const changed = journal && (level !== null || journal.published !== published);
  const submit = async (event) => {
    event.preventDefault();
    if (!changed || inFlight.current) return;
    inFlight.current = true;
    onBusyChange?.(true);
    setBusy("save");
    setError(null);
    setStatus("");
    try {
      const intent = `${level}:${published}`;
      if (pending.current?.intent !== intent) pending.current = { intent, requestId: level === null ? null : crypto.randomUUID() };
      const result = await transport.save({ published, ...(level === null ? {} : { entry: { level, requestId: pending.current.requestId } }) });
      if (!alive.current) return;
      pending.current = null;
      setJournal(result);
      setLevel(null);
      setPublished(result.published);
      setStatus(level === null ? "Видимость обновлена" : "Отметка добавлена в журнал");
      onSaved?.(result);
    } catch (failure) {
      if (alive.current) setError({ operation: "save", message: failure.message || "Не удалось сохранить отметку. Попробуйте снова." });
    } finally {
      inFlight.current = false;
      if (alive.current) {
        setBusy(null);
        onBusyChange?.(false);
      }
    }
  };

  const loadMore = async () => {
    if (inFlight.current || !journal?.nextBefore) return;
    inFlight.current = true;
    setBusy("more");
    setError(null);
    try {
      const page = await transport.read(journal.nextBefore);
      if (alive.current) setJournal((current) => ({ ...current, entries: [...current.entries, ...page.entries], nextBefore: page.nextBefore }));
    } catch (failure) {
      if (alive.current) setError({ operation: "more", message: failure.message || "Не удалось загрузить предыдущие отметки." });
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(null);
    }
  };

  return <form className="rollapp-body flex min-h-0 flex-1 flex-col" onSubmit={submit}>
    <Body className="mx-auto min-h-0 w-full max-w-full flex-1">
      <div className="grid gap-6 px-4 pt-4 pb-6">
        {!journal ? error ? <div className="grid gap-2">
          <Alert variant="destructive"><AlertDescription>{error.message}</AlertDescription></Alert>
          <Button type="button" variant="outline" onClick={() => { setError(null); setRetry((value) => value + 1); }}>Повторить</Button>
        </div> : <p className="flex items-center gap-2" role="status"><Spinner aria-hidden="true" />Загружаем настроение…</p> : <>
          <section className="grid gap-4" aria-labelledby="profile-mood-question">
            <div className="mood-settings__preview" style={preview ? { "--profile-mood-color": preview.color } : undefined}>
              <Avatar user={user} moodLevel={preview?.level ?? null} size="lg" className="mood-settings__portrait !size-16" aria-hidden="true" />
              <div className="grid min-w-0 gap-1">
                <h2 id="profile-mood-question" className="font-heading text-xl font-semibold">Как вы сейчас?</h2>
                <p className="text-xs text-muted-foreground" aria-live="polite">{level !== null ? `Новая отметка: ${preview.label.toLocaleLowerCase("ru-RU")}` : preview ? `Последняя отметка: ${preview.label.toLocaleLowerCase("ru-RU")}` : "Выберите отметку на шкале"}</p>
              </div>
            </div>
            <div className="grid gap-1">
              <RadioGroup aria-label="Шкала настроения" value={level === null ? "" : String(level)} onValueChange={(value) => { setLevel(Number(value)); setStatus(""); }} className="mood-settings__scale" style={{ "--mood-spectrum": spectrum }} disabled={!!busy}>
                {MOOD_LEVELS.map((mood) => <RadioGroupItem
                  key={mood.level}
                  value={String(mood.level)}
                  aria-label={mood.label}
                  title={mood.label}
                  style={{ "--profile-mood-color": mood.color }}
                />)}
              </RadioGroup>
              <div className="flex justify-between gap-2 text-xs text-muted-foreground" aria-hidden="true">
                <span>Очень плохо</span><span>Отлично</span>
              </div>
            </div>
            <div className="grid gap-1 rounded-xl border p-3">
              <label className="flex min-h-(--layout-control-size) cursor-pointer items-center justify-between gap-2">
                <span>Показывать посетителям профиля</span>
                <Switch checked={published} onCheckedChange={(checked) => { setPublished(checked); setStatus(""); }} aria-describedby="profile-mood-visibility" disabled={!!busy || (!preview && !published)} />
              </label>
              <p id="profile-mood-visibility" className="text-xs text-muted-foreground">Вы всегда видите свою последнюю отметку. Если включить настройку, посетители увидят её по цвету аватара и подписи. Журнал доступен только вам.</p>
            </div>
            {error?.operation === "save" && <Alert variant="destructive"><AlertDescription>{error.message}</AlertDescription></Alert>}
            <div className="sr-only" role="status">{status}</div>
          </section>
          <section className="grid gap-2 border-t pt-4" aria-labelledby="profile-mood-journal">
            <h2 id="profile-mood-journal" className="font-heading text-xl font-semibold">Журнал настроения</h2>
            {journal.entries.length === 0 ? <p className="text-muted-foreground">Здесь появятся ваши отметки с датой и временем.</p> : <ol className="mood-settings__history grid list-none p-0" aria-label="Отметки настроения">
              {journal.entries.map((entry) => {
                const mood = moodAt(entry.level);
                return <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2" key={entry.id}>
                  <span className="inline-flex items-center gap-2" style={{ "--profile-mood-color": mood.color }}><span className="profile-mood-dot" aria-hidden="true" />{mood.label}</span>
                  <time className="text-xs text-muted-foreground" dateTime={entry.recordedAt}>{dateFormat.format(new Date(entry.recordedAt))}</time>
                </li>;
              })}
            </ol>}
            {journal.nextBefore && <Button type="button" variant="outline" disabled={!!busy} aria-busy={busy === "more" || undefined} onClick={loadMore}>
              {busy === "more" && <Spinner />}Показать предыдущие
            </Button>}
            {error?.operation === "more" && <Alert variant="destructive"><AlertDescription>{error.message}</AlertDescription></Alert>}
          </section>
        </>}
      </div>
    </Body>
    <DrawerFooter className="mx-auto mt-0 mb-0 w-full max-w-full">
      <Button type="submit" className="h-12 w-full" disabled={!changed || !!busy} aria-busy={busy === "save" || undefined}>
        {busy === "save" && <Spinner />}Сохранить настроение
      </Button>
    </DrawerFooter>
  </form>;
}
