import { AddFab } from "@/components/add-fab";
import { useId, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, Megaphone, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import { PageActionButton } from "@/components/page-action-button";
import { ProfileBookingCalendar } from "@/components/profile-booking-calendar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/api";
import { publicProfilePath, publicBookingPath } from "../../shared/profile-links.js";

const sections = {
  calendar: { title: "Календарь", icon: CalendarDays },
  announcements: { title: "Доска объявлений", icon: Megaphone },
};
const dateFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "full" });

export function ProfilePublicationLinks({ activeSection, toSection, state }) {
  return Object.entries(sections).map(([section, { title, icon: Icon }]) => (
    <Link key={section} to={toSection(section)} state={state}
      className={buttonVariants({ variant: activeSection === section ? "default" : "outline", size: "icon" })}
      data-control-icon aria-label={title} aria-current={activeSection === section ? "page" : undefined} title={title}>
      <Icon aria-hidden="true" />
    </Link>
  ));
}

function AnnouncementForm({ item, busy, error, onSave }) {
  const formId = useId();
  const requestId = useRef(null);
  const [title, setTitle] = useState(item?.title || "");
  const [body, setBody] = useState(item?.body || "");

  function submit(event) {
    event.preventDefault();
    if (busy) return;
    const values = { title: title.trim(), body: body.trim() };
    if (!item) values.id = requestId.current ??= crypto.randomUUID();
    onSave(values, item);
  }

  return <form className="form-surface flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit} aria-busy={busy || undefined}>
    <div className="app-drawer-body flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-(--layout-page-inset) py-5 md:px-6">
      <Field>
        <FieldLabel htmlFor={`${formId}-title`}>Заголовок объявления</FieldLabel>
        <Input id={`${formId}-title`} value={title} onChange={event => setTitle(event.target.value)} maxLength={160} required disabled={busy} />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${formId}-body`}>Текст объявления</FieldLabel>
        <Textarea id={`${formId}-body`} className="min-w-0" value={body} onChange={event => setBody(event.target.value)} rows={5} maxLength={4000} required disabled={busy} />
      </Field>
      {error && <p role="alert" className="wrap-anywhere text-destructive">{error}</p>}
    </div>
    <DrawerFooter>
      <Button type="submit" disabled={busy || !title.trim() || !body.trim()}>{item ? "Сохранить" : "Опубликовать"}</Button>
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
      <AnnouncementForm item={form.item} busy={busy} error={error} onSave={onSave} />
    </DrawerContent>
  </Drawer>;
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

export function ProfilePublications({ section, endpoint, username, user, data, loading, error, reload, returnTo, showIntro = true }) {
  const calendar = section === "calendar";
  const { title, icon: Icon } = sections[section];
  const profile = data?.profile;
  const owner = Boolean(user && data?.isOwner);
  const [form, setForm] = useState(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const mutation = useRef(false);
  const [booked, setBooked] = useState(null);
  const formOpener = useRef(null);
  const profilePath = publicProfilePath(profile?.username || username);
  const sharePath = publicBookingPath(profile?.username || username);
  const loginPath = (slot, zone) => `/login?next=${encodeURIComponent(`${sharePath}?${new URLSearchParams({ slot, zone })}`)}`;
  const Heading = returnTo ? "h2" : "h1";

  const refresh = () => reload({ background: true }).catch(() => {});
  const mutate = async (write, message, onSaved) => {
    if (mutation.current) return;
    mutation.current = true;
    setPending(true);
    setNotice(null);
    try {
      const result = await write();
      if (message) setNotice({ message });
      onSaved?.(result);
      await refresh();
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
    formOpener.current = opener;
    opener?.focus({ preventScroll: true });
    setForm({ item, open: true });
  };
  const dismissForm = () => setForm(current => ({ ...current, open: false }));
  const closeAnnouncement = () => {
    if (mutation.current) return;
    setNotice(null);
    dismissForm();
  };
  const save = (values, item) => mutate(
    () => item ? api.patch(`${endpoint}/${item.id}`, values) : api.post(endpoint, values),
    item ? "Объявление обновлено" : "Объявление опубликовано",
    dismissForm,
  );
  const askToRemove = (item) => {
    if (!calendar) {
      setConfirmation({ title: "Удалить объявление?", description: "Оно исчезнет с вашей доски.", action: "Удалить", path: `${endpoint}/${item.id}`, message: "Объявление удалено" });
    } else if (item.bookingId) {
      setConfirmation({ title: "Отменить запись?", description: "Слот снова станет доступен для записи.", action: "Отменить запись", path: `${endpoint}/${item.id}/bookings/${item.bookingId}`, message: "Запись отменена", slotId: item.id });
    } else {
      setConfirmation({ title: "Убрать слот?", description: "Это время исчезнет из календаря записи.", action: "Убрать слот", path: `${endpoint}/${item.id}`, message: "Слот удалён" });
    }
  };

  return <div className={returnTo ? "page-stack" : "app-page page-stack"}>
    {!returnTo && <div className="app-shell-chrome-spacer" aria-hidden="true" />}
    <article aria-label={showIntro ? undefined : title}
      className={`page-stack mx-auto w-full typeset typeset-rollapp typeset-document ${calendar ? "max-w-(--layout-collection-width)" : "max-w-(--layout-text-width)"}`}>
      {showIntro && <>
        <div className="not-typeset flex flex-wrap gap-2">
          <PageActionButton nativeButton={false} role="link" variant="outline" render={<Link to={returnTo || profilePath} />}>
            <ArrowLeft className="size-5" aria-hidden="true" />{returnTo ? "К Вишлисту" : "К профилю"}
          </PageActionButton>
        </div>
        <header className="min-w-0 wrap-anywhere" data-typeset-group>
          {profile && !calendar && !returnTo && <div data-typography="label" className="text-muted-foreground">{profile.name}</div>}
          <Heading className="flex items-baseline gap-3"><Icon className="size-6 shrink-0 self-center text-primary" aria-hidden="true" />{title}</Heading>
        </header>
      </>}
      {loading && <p role="status">Загрузка…</p>}
      {error && <div className="grid gap-2" data-typeset-group>
        <p role="alert">{error.message}</p>
        <div className="not-typeset"><PageActionButton type="button" variant="outline" onClick={refresh}>Повторить</PageActionButton></div>
      </div>}
      {data && (calendar
        ? <ProfileBookingCalendar profile={profile} slots={data.slots} owner={owner} user={user} busy={pending}
          notice={notice} loginPath={loginPath} sharePath={sharePath} onRemove={askToRemove} booked={booked}
          clearNotice={() => setNotice(null)}
          onPublish={(slots, onSaved) => mutate(
            () => api.post(endpoint, { slots }),
            slots.length === 1 ? "Слот опубликован" : "Слоты опубликованы",
            onSaved,
          )}
          onBook={slot => mutate(
            () => api.post(`${endpoint}/${slot.id}/book`, {}),
            null,
            ({ bookingId }) => setBooked({ ...slot, bookingId, bookedByMe: true }),
          )} />
        : <>
          {notice && (!notice.error || !form?.open) &&
            <p role={notice.error ? "alert" : "status"} className={notice.error ? "text-destructive" : undefined}>{notice.message}</p>}
          {owner && <AddFab actions={[{ label: "Добавить объявление", disabled: pending, onSelect: () => openForm(null, document.activeElement) }]} />}
          <Announcements announcements={data.announcements} owner={owner} busy={pending} onEdit={openForm} onRemove={askToRemove} />
        </>)}
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
            const { path, message, slotId } = confirmation;
            setConfirmation(null);
            mutate(() => api.delete(path), message, () => {
              if (booked?.id === slotId) setBooked(null);
            });
          }}>{confirmation.action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>}
    </AlertDialog>
  </div>;
}
