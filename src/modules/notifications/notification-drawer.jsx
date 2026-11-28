import { useEffect, useRef, useState } from 'react';
import { AlarmClock, Bell, CalendarCheck, CalendarDays, Mail, MapPin, Pill, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MessageDrawer, MessageDrawerHeading } from '@/components/messenger';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DrawerFooter } from '@/components/form-surface';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/modules/shell/page-feedback.jsx';
import { api } from '@/modules/runtime/api.js';
import { ReminderEditor } from './reminder-editor.jsx';

const path = '/notifications';
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const formatDay = day => dateFormat.format(new Date(`${day}T00:00:00Z`));

function applicationServerKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const bytes = atob((value + padding).replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(bytes, character => character.charCodeAt(0));
}

export function NotificationDrawer({ open, onOpenChange, canAccessHealth }) {
  const heading = useRef(null);
  const nextEditor = useRef(null);
  const [section, setSection] = useState('inbox');
  const [editor, setEditor] = useState(null);
  const [inbox, setInbox] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [pushRegistration, setPushRegistration] = useState(null);
  const [devicePushEnabled, setDevicePushEnabled] = useState(false);
  const notifications = inbox?.notifications ?? [];
  const unread = notifications.filter(notice => !notice.read);
  const preferences = inbox?.preferences ?? {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, medicationReminders: false, dailyOverview: false,
    bookingEmail: true, bookingPush: false,
  };
  const reminders = inbox?.reminders ?? [];
  const delivery = inbox?.delivery ?? {};
  const pushAvailable = Boolean(delivery.pushEnabled && delivery.pushPublicKey && 'serviceWorker' in navigator
    && 'PushManager' in window && 'Notification' in window);

  function editReminder(reminder) {
    setSection('reminders');
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

  useEffect(() => {
    if (!open || section !== 'settings' || !pushAvailable) return;
    let current = true;
    setPushRegistration(null);
    async function preparePush() {
      try {
        const registered = await navigator.serviceWorker.register('/rollapp-notifications-sw.js', { scope: '/' });
        const ready = registered.active ? registered : await navigator.serviceWorker.ready;
        const subscription = await ready.pushManager.getSubscription();
        const status = subscription ? await api.post(`${path}/push-subscriptions/status`, { endpoint: subscription.endpoint }) : null;
        if (current) {
          setDevicePushEnabled(status?.subscribed === true);
          setPushRegistration(ready);
        }
      } catch {
        if (current) setError('Не удалось подготовить push-оповещения');
      }
    }
    void preparePush();
    return () => { current = false; };
  }, [open, section, pushAvailable]);

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

  async function savePushPreference(value) {
    setBusy(true);
    setError('');
    try {
      if (!pushAvailable || !pushRegistration) {
        throw new Error('Push-оповещения не поддерживаются на этом устройстве');
      }
      const manager = pushRegistration.pushManager;
      if (value) {
        if (Notification.permission === 'denied') throw new Error('Разрешите push-оповещения в настройках браузера');
        // Calling subscribe directly in the toggle gesture lets the browser request permission.
        const subscription = await manager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(delivery.pushPublicKey),
        });
        const serialized = subscription.toJSON();
        await api.post(`${path}/push-subscriptions`, { endpoint: serialized.endpoint, keys: serialized.keys });
        if (!preferences.bookingPush) {
          const data = await api.patch(`${path}/preferences`, {
            ...preferences, medicationReminders: canAccessHealth && preferences.medicationReminders, bookingPush: true,
          });
          setInbox(current => ({ ...current, preferences: data.preferences }));
        }
        setDevicePushEnabled(true);
      } else {
        const subscription = await manager.getSubscription();
        if (subscription) await api.delete(`${path}/push-subscriptions`, { endpoint: subscription.endpoint });
        setDevicePushEnabled(false);
        if (subscription) await subscription.unsubscribe();
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function respondToBooking(notice, decision) {
    setBusy(true);
    setError('');
    try {
      const data = await api.patch(`/profile-bookings/${encodeURIComponent(notice.bookingId)}`, { decision });
      setInbox(current => ({ ...current, notifications: current.notifications.map(item => item.id === notice.id
        ? { ...item, bookingStatus: data.bookingStatus, read: true }
        : item) }));
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
      <Tabs value={section} onValueChange={setSection} className="min-h-0 flex-1 gap-0">
        <div className="shrink-0 px-4 pt-4">
          <TabsList className="grid h-auto min-h-12 w-full grid-cols-3" aria-label="Разделы оповещений">
            <TabsTrigger value="inbox" className="min-h-10 min-w-0 px-1">Входящие</TabsTrigger>
            <TabsTrigger value="reminders" className="min-h-10 min-w-0 px-1">Активные</TabsTrigger>
            <TabsTrigger value="settings" className="min-h-10 min-w-0 px-1">Настройки</TabsTrigger>
          </TabsList>
        </div>
        <div className="messenger-directory-scroll flex flex-col gap-4 p-4">
          {error && <p role="alert" className="text-destructive">{error}</p>}
          {!inbox && !error && <p role="status">Загружаем оповещения…</p>}
          {inbox && <>
            <TabsContent value="inbox" className="grid min-w-0 flex-none gap-4">
              <header className="grid gap-1">
                <h3 className="text-lg font-semibold">Входящие</h3>
                <p className="text-muted-foreground">Здесь появляются сработавшие напоминания и события из Rollapp.</p>
              </header>
              {!notifications.length ? <EmptyState compact icon={Bell} title="Пока тихо"
                text="Новые события появятся здесь, а непрочитанные будут отмечены на колокольчике." /> :
                <ul className="grid gap-2">
                  {notifications.map(notice => <NotificationRow key={notice.id} notice={notice} busy={busy}
                    onBookingResponse={respondToBooking} onSelect={() => onOpenChange(false)} />)}
                </ul>}
            </TabsContent>
            <TabsContent value="reminders" className="grid min-w-0 flex-none gap-4">
              <header className="grid gap-1">
                <h3 className="text-lg font-semibold">Активные напоминания</h3>
                <p className="text-muted-foreground">Это расписания будущих напоминаний. Уже сработавшие остаются во «Входящих».</p>
              </header>
              {!reminders.length ? <EmptyState compact icon={AlarmClock} title="Нет активных напоминаний"
                text="Добавьте разовое напоминание или расписание на каждый день." /> :
                <ul className="grid gap-2">
                  {reminders.map(reminder => <li key={reminder.id} className="min-w-0">
                    <Button data-content-control="" type="button" variant="outline" className="h-auto min-h-12 w-full justify-start gap-3 rounded-xl p-3 text-left whitespace-normal"
                      onClick={() => editReminder(reminder)} aria-label={`Редактировать напоминание ${reminder.title}`}>
                      <AlarmClock className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="grid min-w-0 flex-1 gap-1">
                        <span className="wrap-anywhere font-medium">{reminder.title}</span>
                        <span className="text-xs text-muted-foreground">{formatReminderSchedule(reminder)}</span>
                      </span>
                      <Badge variant={reminder.repeatsDaily ? 'secondary' : 'outline'}>
                        {reminder.repeatsDaily ? 'Ежедневно' : 'Один раз'}
                      </Badge>
                    </Button>
                  </li>)}
                </ul>}
            </TabsContent>
            <TabsContent value="settings" className="grid min-w-0 flex-none gap-6">
              <section className="grid gap-4" aria-labelledby="notification-schedules-heading">
                <header className="grid gap-1">
                  <h3 id="notification-schedules-heading" className="text-lg font-semibold">Автоматические напоминания</h3>
                  <p className="text-muted-foreground">Rollapp создаёт их по данным из ваших разделов.</p>
                </header>
                {canAccessHealth && <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
                  <span className="grid min-w-0 gap-1">
                    <span>Приём препаратов</span>
                    <small className="text-xs text-muted-foreground">По расписанию активных препаратов в «Здоровье».</small>
                  </span>
                  <Switch checked={preferences.medicationReminders} disabled={busy}
                    onCheckedChange={value => void savePreference('medicationReminders', value)} />
                </label>}
                <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
                  <span className="grid min-w-0 gap-1">
                    <span>Утренний обзор</span>
                    <small className="text-xs text-muted-foreground">Задачи и встречи на текущий день в 08:00.</small>
                  </span>
                  <Switch checked={preferences.dailyOverview} disabled={busy}
                    onCheckedChange={value => void savePreference('dailyOverview', value)} />
                </label>
              </section>
              <section className="grid gap-4 border-t pt-5" aria-labelledby="notification-delivery-heading">
                <header className="grid gap-1">
                  <h3 id="notification-delivery-heading" className="text-lg font-semibold">Записи на услуги</h3>
                  <p className="text-muted-foreground">Выберите, как получать запросы и ответы по опубликованным слотам.</p>
                </header>
                <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
                  <span className="grid min-w-0 gap-1">
                    <span className="flex items-center gap-2"><Mail className="size-4" aria-hidden="true" />Email</span>
                    <small className="text-xs text-muted-foreground">Письма о новых запросах и изменениях записи.</small>
                  </span>
                  <Switch checked={delivery.emailEnabled && preferences.bookingEmail} disabled={busy || !delivery.emailEnabled}
                    onCheckedChange={value => void savePreference('bookingEmail', value)} />
                </label>
                <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
                  <span className="grid min-w-0 gap-1">
                    <span className="flex items-center gap-2"><Smartphone className="size-4" aria-hidden="true" />Push</span>
                    <small className="text-xs text-muted-foreground">Системное оповещение на этом устройстве.</small>
                  </span>
                  <Switch checked={pushAvailable && devicePushEnabled && preferences.bookingPush}
                    disabled={busy || !pushAvailable || !pushRegistration} onCheckedChange={value => void savePushPreference(value)} />
                </label>
              </section>
              <p className="text-xs text-muted-foreground">Время рассчитывается по часовому поясу {preferences.timeZone}.</p>
            </TabsContent>
          </>}
        </div>
      </Tabs>
      {error && !inbox ? <DrawerFooter>
        <Button type="button" variant="outline" onClick={() => setReload(value => value + 1)}>Повторить</Button>
      </DrawerFooter> : inbox && section === 'reminders' ? <DrawerFooter>
        <Button type="button" onClick={() => editReminder(null)}>Добавить напоминание</Button>
      </DrawerFooter> : inbox && section === 'inbox' && Boolean(unread.length) ? <DrawerFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void markRead()}>Прочитать всё</Button>
      </DrawerFooter> : null}
    </section>
  </MessageDrawer>
  {editor && <ReminderEditor {...editor} onAfterClose={() => {
    setEditor(null);
    setReload(value => value + 1);
    onOpenChange(true);
  }} />}
  </>;
}

function formatReminderSchedule(reminder) {
  return reminder.repeatsDaily
    ? `Каждый день с ${formatDay(reminder.startOn)} в ${reminder.remindAt}`
    : `${formatDay(reminder.startOn)} в ${reminder.remindAt}`;
}

function NotificationRow({ notice, busy, onBookingResponse, onSelect }) {
  const medication = notice.kind === 'medication';
  const custom = notice.kind === 'custom';
  const booking = notice.kind.startsWith('booking_');
  const bookingRequest = notice.kind === 'booking_request';
  const nearbyFriend = custom && notice.nearbyFriend === true;
  const Icon = booking ? CalendarCheck : nearbyFriend ? MapPin : custom ? Bell : medication ? Pill : CalendarDays;
  const title = booking ? notice.title : custom ? notice.title : medication ? 'Напоминание о приёме препаратов' : 'Утренний обзор';
  const category = booking ? 'Запись' : nearbyFriend ? 'Друзья' : custom ? 'Напоминание' : medication ? 'Здоровье' : 'Обзор дня';
  const destination = nearbyFriend ? '/app/friends/map' : medication ? '/app/spheres/health?tab=medications' : `/app/planning?tab=todo&date=${notice.localDay}`;
  const className = `flex min-h-12 items-start gap-3 rounded-xl border p-3 ${notice.read ? '' : 'bg-muted/40'}`;
  const responseLabel = bookingRequest && notice.bookingStatus !== 'pending'
    ? notice.bookingStatus === 'confirmed' ? 'Запрос подтверждён' : notice.bookingStatus === 'declined' ? 'Запрос отклонён' : 'Запрос закрыт'
    : '';
  const content = <>
      <Icon className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="grid min-w-0 flex-1 gap-1">
        <Badge variant="outline">{category}</Badge>
        <span className="wrap-anywhere font-medium">{title}</span>
        <time className="text-xs text-muted-foreground" dateTime={notice.scheduledAt}>
          {formatDay(notice.localDay)}, {notice.localTime}
        </time>
        {notice.preview && <span>{notice.preview}</span>}
        {responseLabel && <span className="text-xs text-muted-foreground">{responseLabel}</span>}
      </span>
      {!notice.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary"><span className="sr-only">Непрочитанное</span></span>}
  </>;
  if (bookingRequest) return <li className="min-w-0"><div className={`${className} flex-wrap`}>
    {content}
    {notice.bookingStatus === 'pending' && <div className="flex w-full flex-wrap gap-2 pl-8">
      <Button type="button" disabled={busy} onClick={() => void onBookingResponse(notice, 'confirm')}>Подтвердить</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={() => void onBookingResponse(notice, 'decline')}>Отклонить</Button>
    </div>}
  </div></li>;
  const bookingDestination = booking && notice.actionPath ? notice.actionPath : destination;
  return <li className="min-w-0">{custom && !nearbyFriend ? <div className={className}>{content}</div> :
    <Link to={bookingDestination} onClick={onSelect} className={`${className} hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring`}>{content}</Link>}
  </li>;
}
