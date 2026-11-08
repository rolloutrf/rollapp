import { useId, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, Megaphone, Plus, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import { PageActionButton } from "@/components/page-action-button";
import { PlanningDatePicker } from "@/components/planning-date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/api";
import { cn } from "@/lib/utils";
import { localDateKey } from "../../shared/planning.js";
import { publicProfilePath, publicPublicationPath } from "../../shared/profile-links.js";

const sections = {
  calendar: { title: "Календарь", icon: CalendarDays },
  announcements: { title: "Доска объявлений", icon: Megaphone },
};
const dateFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "full" });
const timeFormat = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });

export function ProfilePublicationLinks({ username, className }) {
  return <nav aria-label="Календарь и объявления профиля" className={cn("flex flex-wrap justify-center gap-2", className)}>
    {Object.entries(sections).map(([section, { title, icon: Icon }]) => (
      <PageActionButton key={section} variant="outline" nativeButton={false} role="link" render={<Link to={publicPublicationPath(username, section)} />}>
        <Icon className="size-5" aria-hidden="true" />{title}
      </PageActionButton>
    ))}
  </nav>;
}

function PublicationForm({ calendar, item, busy, error, onSave, onClose }) {
  const formId = useId();
  const requestId = useRef(null);
  const [title, setTitle] = useState(item?.title || "");
  const [body, setBody] = useState(item?.body || "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState("60");
  const [dateError, setDateError] = useState("");

  function submit(event) {
    event.preventDefault();
    if (busy) return;
    const values = { title: title.trim() };
    if (calendar) {
      const starts = new Date(`${date}T${time}:00`);
      if (!Number.isFinite(starts.getTime()) || localDateKey(starts) !== date ||
          `${String(starts.getHours()).padStart(2, "0")}:${String(starts.getMinutes()).padStart(2, "0")}` !== time) {
        setDateError("Выберите дату и действительное время в вашем часовом поясе");
        return;
      }
      values.startsAt = starts.toISOString();
      values.duration = Number(duration);
    } else {
      values.body = body.trim();
    }
    if (!item) values.id = requestId.current ??= crypto.randomUUID();
    setDateError("");
    onSave(values, item);
  }

  const submitLabel = item ? "Сохранить" : "Опубликовать";
  const submitDisabled = busy || !title.trim() || (calendar ? !date : !body.trim());
  const fields = <>
    <Field>
      <FieldLabel htmlFor={`${formId}-title`}>{calendar ? "Название сессии" : "Заголовок объявления"}</FieldLabel>
      <Input id={`${formId}-title`} value={title} onChange={event => setTitle(event.target.value)} maxLength={160} required disabled={busy} />
    </Field>
    {calendar ? <div className="grid gap-4 sm:grid-cols-3">
      <Field>
        <FieldLabel htmlFor={`${formId}-date`}>Дата</FieldLabel>
        <div inert={busy || undefined}>
          <PlanningDatePicker id={`${formId}-date`} label="Дата сессии" value={date} onChange={setDate} className="w-full justify-between" />
        </div>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${formId}-time`}>Начало</FieldLabel>
        <Input id={`${formId}-time`} type="time" value={time} onChange={event => setTime(event.target.value)} required disabled={busy} />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${formId}-duration`}>Длительность, мин</FieldLabel>
        <Input id={`${formId}-duration`} type="number" value={duration} onChange={event => setDuration(event.target.value)} min={15} max={480} required disabled={busy} />
      </Field>
    </div> : <Field>
      <FieldLabel htmlFor={`${formId}-body`}>Текст объявления</FieldLabel>
      <Textarea id={`${formId}-body`} className="min-w-0" value={body} onChange={event => setBody(event.target.value)} rows={5} maxLength={4000} required disabled={busy} />
    </Field>}
    {dateError && <p role="alert" className="text-destructive">{dateError}</p>}
  </>;

  return calendar
    ? <form className="not-typeset rollapp-body flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-6" onSubmit={submit}>
      {fields}
      <div className="flex flex-wrap gap-2">
        <PageActionButton type="submit" disabled={submitDisabled}>{submitLabel}</PageActionButton>
        <PageActionButton type="button" variant="outline" disabled={busy} onClick={onClose}>Отмена</PageActionButton>
      </div>
    </form>
    : <form className="form-surface flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit} aria-busy={busy || undefined}>
      <div className="app-drawer-body flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-(--layout-page-inset) py-5 md:px-6">
        {fields}
        {error && <p role="alert" className="wrap-anywhere text-destructive">{error}</p>}
      </div>
      <DrawerFooter>
        <Button type="submit" disabled={submitDisabled}>{submitLabel}</Button>
      </DrawerFooter>
    </form>;
}

function AnnouncementEditor({ form, busy, error, opener, onSave, onClose, onAfterClose }) {
  const heading = form.item ? "Редактировать объявление" : "Добавить объявление";
  const headingRef = useRef(null);
  const headingId = useId();
  return <Drawer open={form.open} onAfterClose={onAfterClose} onOpenChange={(open, details) => {
    if (open) return;
    details?.cancel();
    onClose();
  }}>
    <DrawerContent className="app-drawer--form rollapp-body" data-profile-announcement-editor=""
      aria-labelledby={headingId} initialFocus={headingRef} finalFocus={opener}>
      <DrawerHeader className="flex-row items-center justify-between gap-2 px-(--layout-page-inset) md:px-6">
        <DrawerTitle id={headingId} ref={headingRef} tabIndex={-1}>{heading}</DrawerTitle>
        <DrawerClose render={<Button type="button" variant="outline" size="icon" disabled={busy} />} aria-label="Закрыть форму объявления">
          <X aria-hidden="true" />
        </DrawerClose>
      </DrawerHeader>
      <PublicationForm item={form.item} busy={busy} error={error} onSave={onSave} />
    </DrawerContent>
  </Drawer>;
}

function slotDays(slots) {
  const days = new Map();
  for (const slot of slots) {
    const day = dateFormat.format(new Date(slot.startsAt));
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(slot);
  }
  return [...days];
}

function CalendarSlots({ slots, owner, signedIn, loginPath, busy, onBook, onRemove }) {
  if (!slots.length) return <p>{owner ? "Опубликуйте первый слот, чтобы участники могли записаться на сессию." : "Сейчас нет доступных слотов."}</p>;
  return <div className="grid gap-(--layout-page-gap)">
    {slotDays(slots).map(([day, entries]) => <section data-typeset-group key={day}>
      <h2 className="first-letter:uppercase">{day}</h2>
      <div className="grid gap-2">
        {entries.map(slot => {
          const start = new Date(slot.startsAt);
          const end = new Date(slot.endsAt);
          const endLabel = localDateKey(start) === localDateKey(end) ? timeFormat.format(end) : `${dateFormat.format(end)}, ${timeFormat.format(end)}`;
          const action = slot.bookingId ? "Отменить запись" : "Убрать слот";
          return <article key={slot.id} className="typeset-document grid min-w-0 gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0 wrap-anywhere" data-typeset-group>
              <div data-typography="label">
                <time dateTime={slot.startsAt}>{timeFormat.format(start)}</time>
                {" – "}<time dateTime={slot.endsAt}>{endLabel}</time>
              </div>
              <h3>{slot.title}</h3>
              {slot.bookingId && <p>{slot.bookedByMe ? "Вы записаны" : `Записался участник: ${slot.guestName}`}</p>}
            </div>
            <div className="not-typeset flex flex-wrap gap-2">
              {owner || slot.bookedByMe
                ? <PageActionButton type="button" variant="destructive" disabled={busy} aria-label={`${action}: ${slot.title}, ${day}, ${timeFormat.format(start)}`} onClick={() => onRemove(slot)}>{action}</PageActionButton>
                : signedIn
                  ? <PageActionButton type="button" disabled={busy} aria-label={`Записаться: ${slot.title}, ${day}, ${timeFormat.format(start)}`} onClick={() => onBook(slot)}>Записаться</PageActionButton>
                  : <PageActionButton variant="outline" nativeButton={false} role="link" render={<Link to={loginPath} />}
                    aria-label={`Войти для записи: ${slot.title}, ${day}, ${timeFormat.format(start)}`}>Войти для записи</PageActionButton>}
            </div>
          </article>;
        })}
      </div>
    </section>)}
  </div>;
}

function Announcements({ announcements, owner, busy, onEdit, onRemove }) {
  if (!announcements.length) return <p>{owner ? "Здесь появятся ваши опубликованные объявления." : "Объявлений пока нет."}</p>;
  return <div className="grid gap-3">
    {announcements.map(item => <article key={item.id} className="typeset-document min-w-0 wrap-anywhere rounded-2xl border bg-card p-4 sm:p-6">
      <time data-typography="label" dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time>
      <h2>{item.title}</h2>
      <p className="whitespace-pre-wrap">{item.body}</p>
      {owner && <div className="not-typeset mt-4 flex flex-wrap gap-2">
        <PageActionButton type="button" variant="outline" disabled={busy} aria-label={`Редактировать: ${item.title}`} onClick={event => onEdit(item, event.currentTarget)}>Редактировать</PageActionButton>
        <PageActionButton type="button" variant="destructive" disabled={busy} aria-label={`Удалить объявление: ${item.title}`} onClick={() => onRemove(item)}>Удалить</PageActionButton>
      </div>}
    </article>)}
  </div>;
}

export function ProfilePublications({ section, endpoint, username, user, data, loading, error, reload }) {
  const calendar = section === "calendar";
  const { title, icon: Icon } = sections[section];
  const profile = data?.profile;
  const owner = Boolean(user && data?.isOwner);
  const [form, setForm] = useState(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const mutation = useRef(false);
  const formArea = useRef(null);
  const formOpener = useRef(null);
  const profilePath = publicProfilePath(profile?.username || username);
  const loginPath = `/login?next=${encodeURIComponent(publicPublicationPath(profile?.username || username, section))}`;

  const refresh = () => reload({ background: true }).catch(() => {});
  const mutate = async (write, message, onSaved) => {
    if (mutation.current) return;
    mutation.current = true;
    setPending(true);
    setNotice(null);
    try {
      await write();
      setNotice({ message });
      await refresh();
      onSaved?.();
    } catch (failure) {
      setNotice({ message: failure.message, error: true });
      if (failure.status === 409 || failure.status === 404) await refresh();
    } finally {
      mutation.current = false;
      setPending(false);
    }
  };

  const openForm = (item = null, opener) => {
    if (form || mutation.current) return;
    setNotice(null);
    if (calendar) formArea.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
    else {
      formOpener.current = opener;
      opener?.focus({ preventScroll: true });
    }
    setForm({ item, open: true });
  };
  const dismissForm = () => {
    if (calendar) setForm(null);
    else setForm(current => ({ ...current, open: false }));
  };
  const closeAnnouncement = () => {
    if (mutation.current) return;
    setNotice(null);
    dismissForm();
  };
  const save = (values, item) => mutate(
    () => item ? api.patch(`${endpoint}/${item.id}`, values) : api.post(endpoint, values),
    item ? "Объявление обновлено" : calendar ? "Слот опубликован" : "Объявление опубликовано",
    dismissForm,
  );
  const askToRemove = (item) => {
    if (!calendar) {
      setConfirmation({ title: "Удалить объявление?", description: "Оно исчезнет с вашей доски.", action: "Удалить", path: `${endpoint}/${item.id}`, message: "Объявление удалено" });
    } else if (item.bookingId) {
      setConfirmation({ title: "Отменить запись?", description: "Слот снова станет доступен для записи.", action: "Отменить запись", path: `${endpoint}/${item.id}/bookings/${item.bookingId}`, message: "Запись отменена" });
    } else {
      setConfirmation({ title: "Убрать слот?", description: "Это время исчезнет из календаря записи.", action: "Убрать слот", path: `${endpoint}/${item.id}`, message: "Слот удалён" });
    }
  };

  return <div className="app-page page-stack">
    <div className="app-shell-chrome-spacer" aria-hidden="true" />
    <article className="page-stack mx-auto w-full max-w-(--layout-text-width) typeset typeset-rollapp typeset-document">
      <div className="not-typeset flex flex-wrap gap-2">
        <PageActionButton nativeButton={false} role="link" variant="outline" render={<Link to={profilePath} />}>
          <ArrowLeft className="size-5" aria-hidden="true" />К профилю
        </PageActionButton>
      </div>
      <header className="min-w-0 wrap-anywhere" data-typeset-group>
        {profile && <div data-typography="label" className="text-muted-foreground">{profile.name}</div>}
        <h1 className="flex items-baseline gap-3"><Icon className="size-6 shrink-0 self-center text-primary" aria-hidden="true" />{title}</h1>
        {data && calendar && <p>Запись на сессии · время в вашем часовом поясе ({timeFormat.resolvedOptions().timeZone})</p>}
      </header>
      {loading && <p role="status">Загрузка…</p>}
      {error && <div className="grid gap-2" data-typeset-group>
        <p role="alert">{error.message}</p>
        <div className="not-typeset"><PageActionButton type="button" variant="outline" onClick={refresh}>Повторить</PageActionButton></div>
      </div>}
      {data && <>
        {notice && (!notice.error || calendar || !form?.open) &&
          <p role={notice.error ? "alert" : "status"} className={notice.error ? "text-destructive" : undefined}>{notice.message}</p>}
        {owner && <div ref={formArea} className="not-typeset scroll-mt-24">
          {calendar && form
            ? <PublicationForm calendar item={form.item} busy={pending} onSave={save} onClose={dismissForm} />
            : <PageActionButton type="button" disabled={pending} onClick={event => openForm(null, event.currentTarget)}>
              <Plus className="size-5" aria-hidden="true" />{calendar ? "Добавить слот" : "Добавить объявление"}
            </PageActionButton>}
        </div>}
        {calendar
          ? <CalendarSlots slots={data.slots} owner={owner} signedIn={Boolean(user)} loginPath={loginPath} busy={pending} onRemove={askToRemove}
            onBook={slot => mutate(() => api.post(`${endpoint}/${slot.id}/book`, {}), "Вы записаны на сессию")} />
          : <Announcements announcements={data.announcements} owner={owner} busy={pending} onEdit={openForm} onRemove={askToRemove} />}
      </>}
    </article>
    {owner && !calendar && form && <AnnouncementEditor form={form} busy={pending}
      error={notice?.error ? notice.message : undefined} opener={formOpener}
      onSave={save} onClose={closeAnnouncement} onAfterClose={() => setForm(null)} />}
    <AlertDialog open={Boolean(confirmation)} onOpenChange={open => { if (!open) setConfirmation(null); }}>
      {confirmation && <AlertDialogContent className="not-typeset rollapp-body max-w-[calc(100%-2rem)] sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmation.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirmation.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-12 rounded-full">Назад</AlertDialogCancel>
          <AlertDialogAction variant="destructive" className="min-h-12 rounded-full" onClick={() => {
            const { path, message } = confirmation;
            setConfirmation(null);
            mutate(() => api.delete(path), message);
          }}>{confirmation.action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>}
    </AlertDialog>
  </div>;
}
