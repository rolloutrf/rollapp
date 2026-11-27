import { useEffect, useRef, useState } from 'react';
import { Bell, CalendarDays, CheckCheck, MapPin, Pill } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MessageDrawer, MessageDrawerHeading } from '@/components/messenger';
import { Button } from '@/components/ui/button';
import { DrawerFooter } from '@/components/form-surface';
import { Switch } from '@/components/ui/switch';
import { api } from '@/modules/runtime/api.js';
import { ReminderEditor } from './reminder-editor.jsx';

const path = '/notifications';
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const formatDay = day => dateFormat.format(new Date(`${day}T00:00:00Z`));

export function NotificationDrawer({ open, onOpenChange, canAccessHealth }) {
  const heading = useRef(null);
  const nextEditor = useRef(null);
  const [editor, setEditor] = useState(null);
  const [inbox, setInbox] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const notifications = inbox?.notifications ?? [];
  const unread = notifications.filter(notice => !notice.read);
  const preferences = inbox?.preferences ?? {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, medicationReminders: false, dailyOverview: false,
  };
  const reminders = inbox?.reminders ?? [];

  function editReminder(reminder) {
    nextEditor.current = { reminder, timeZone: preferences.timeZone };
    onOpenChange(false);
  }

  useEffect(() => {
    if (busy) return;
    const request = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const data = await api.get(open ? `${path}?preview=1` : path, { signal: request.signal });
        if (!request.signal.aborted) { setInbox(data); setError(''); }
      } catch (err) {
        if (!request.signal.aborted) setError(err.message);
      } finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      request.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [open, busy, reload]);

  async function savePreference(key, value) {
    setBusy(true);
    setError('');
    try {
      const data = await api.patch(`${path}/preferences`, {
        ...preferences, medicationReminders: canAccessHealth && preferences.medicationReminders, [key]: value,
      });
      setInbox(current => ({ ...current, preferences: data.preferences }));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function markRead() {
    setBusy(true);
    setError('');
    try {
      const ids = unread.map(notice => notice.id);
      await api.post(`${path}/read`, { ids });
      setInbox(current => ({ ...current, notifications: current.notifications.map(notice =>
        ids.includes(notice.id) ? { ...notice, read: true } : notice) }));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <><MessageDrawer open={open} onOpenChange={onOpenChange} icon={Bell} title="Оповещения"
    triggerLabel={unread.length ? 'Оповещения, есть непрочитанные' : 'Оповещения'}
    hasUnread={Boolean(unread.length)} triggerClassName="notification-fab" initialFocus={heading} onAfterClose={() => {
      if (!nextEditor.current) return;
      setEditor(nextEditor.current);
      nextEditor.current = null;
    }}>
    <section className="messenger-directory">
      <MessageDrawerHeading heading={heading} title="Оповещения" closeLabel="Закрыть оповещения" />
      <div className="messenger-directory-scroll flex flex-col gap-6 p-4">
        {error && <p role="alert">{error}</p>}
        {!inbox && !error && <p role="status">Загружаем оповещения…</p>}
        {inbox && <>
          {Boolean(reminders.length) && <section className="grid gap-3" aria-label="Мои напоминания">
            <ul className="grid gap-2">
              {reminders.map(reminder => <li key={reminder.id} className="min-w-0">
                <Button type="button" variant="outline" className="h-auto min-h-12 w-full items-center justify-between gap-3 rounded-xl p-3 text-left whitespace-normal"
                  onClick={() => editReminder(reminder)} aria-label={`Редактировать напоминание ${reminder.title}`}>
                  <span className="grid min-w-0 gap-1">
                    <span className="wrap-anywhere font-medium">{reminder.title}</span>
                    <span className="text-xs text-muted-foreground">{reminder.repeatsDaily ? 'Каждый день' : formatDay(reminder.startOn)}, {reminder.remindAt}</span>
                  </span>
                </Button>
              </li>)}
            </ul>
          </section>}
          <section className="grid gap-4 border-b pb-4" aria-label="Настройки оповещений">
            {canAccessHealth && <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
              <span className="grid min-w-0 gap-1">
                <span>Напоминать о приёме препаратов</span>
                <small className="text-xs text-muted-foreground">По времени приёма в разделе «Здоровье».</small>
              </span>
              <Switch checked={preferences.medicationReminders} disabled={busy}
                onCheckedChange={value => void savePreference('medicationReminders', value)} />
            </label>}
            <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
              <span className="grid min-w-0 gap-1">
                <span>Утренний обзор</span>
                <small className="text-xs text-muted-foreground">Задачи и встречи на день в 08:00.</small>
              </span>
              <Switch checked={preferences.dailyOverview} disabled={busy}
                onCheckedChange={value => void savePreference('dailyOverview', value)} />
            </label>
            <p className="text-xs text-muted-foreground">Часовой пояс: {preferences.timeZone}</p>
          </section>
          {!notifications.length && <p>Оповещений пока нет.</p>}
          <ul className="grid gap-2">
            {notifications.map(notice => <NotificationRow key={notice.id} notice={notice} onSelect={() => onOpenChange(false)} />)}
          </ul>
        </>}
      </div>
      {(inbox || error) && <DrawerFooter>
        {inbox ? <>
          <Button type="button" onClick={() => editReminder(null)}>Новое напоминание</Button>
          {Boolean(unread.length) && <Button data-control-icon type="button" variant="outline" size="icon" disabled={busy}
            aria-label="Отметить все прочитанными" title="Отметить все прочитанными" onClick={() => void markRead()}>
            <CheckCheck aria-hidden="true" />
          </Button>}
        </> : <Button type="button" variant="outline" onClick={() => setReload(value => value + 1)}>Повторить</Button>}
      </DrawerFooter>}
    </section>
  </MessageDrawer>
  {editor && <ReminderEditor {...editor} onAfterClose={() => {
    setEditor(null);
    setReload(value => value + 1);
    onOpenChange(true);
  }} />}
  </>;
}

function NotificationRow({ notice, onSelect }) {
  const medication = notice.kind === 'medication';
  const custom = notice.kind === 'custom';
  const nearbyFriend = custom && notice.nearbyFriend === true;
  const Icon = nearbyFriend ? MapPin : custom ? Bell : medication ? Pill : CalendarDays;
  const title = custom ? notice.title : medication ? 'Напоминание о приёме препаратов' : 'Утренний обзор';
  const destination = nearbyFriend ? '/app/friends/map' : medication ? '/app/spheres/health?tab=medications' : `/app/planning?tab=todo&date=${notice.localDay}`;
  const className = 'flex min-h-12 items-start gap-3 rounded-xl border p-3';
  const content = <>
      <Icon className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="wrap-anywhere font-medium">{title}</span>
        <time className="text-xs text-muted-foreground" dateTime={notice.scheduledAt}>
          {formatDay(notice.localDay)}, {notice.localTime}
        </time>
        {notice.preview && <span>{notice.preview}</span>}
      </span>
      {!notice.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary"><span className="sr-only">Непрочитанное</span></span>}
  </>;
  return <li className="min-w-0">{custom && !nearbyFriend ? <div className={className}>{content}</div> :
    <Link to={destination} onClick={onSelect} className={`${className} hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring`}>{content}</Link>}
  </li>;
}
