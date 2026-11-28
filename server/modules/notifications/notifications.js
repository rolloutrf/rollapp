import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { dueNotifications } from './notification-schema.js';
import { readAssistantPlanningContext } from '../assistant/messenger-assistant.js';
import { browserPushEndpoint, deliverNotificationOutbox, notificationDeliveryConfig } from './notification-delivery.js';

const timeZoneInput = z.string().min(1).max(100).refine(value => {
  try { new Intl.DateTimeFormat('ru-RU', { timeZone: value }); return true; }
  catch { return false; }
});
const preferencesInput = z.object({
  timeZone: timeZoneInput,
  medicationReminders: z.boolean(),
  dailyOverview: z.boolean(),
  bookingEmail: z.boolean().optional(),
  bookingPush: z.boolean().optional(),
}).strict();
const reminderInput = z.object({
  title: z.string().trim().min(1).max(160),
  startOn: z.iso.date(),
  remindAt: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  repeatsDaily: z.boolean(),
}).strict();
const newReminderInput = reminderInput.extend({ id: z.uuid(), timeZone: timeZoneInput });
const readInput = z.object({ ids: z.array(z.string().regex(/^[1-9][0-9]{0,18}$/)
  .refine(id => id.length < 19 || id <= '9223372036854775807')).min(1).max(30) }).strict();
const pushEndpointInput = z.string().transform((value, context) => {
  const endpoint = browserPushEndpoint(value);
  if (endpoint) return endpoint;
  context.addIssue({ code: 'custom', message: 'Неподдерживаемый push-сервис' });
  return z.NEVER;
});
const pushSubscriptionInput = z.object({
  endpoint: pushEndpointInput,
  keys: z.object({
    p256dh: z.string().min(40).max(256).regex(/^[A-Za-z0-9_-]+={0,2}$/),
    auth: z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+={0,2}$/),
  }).strict(),
}).strict();
const pushDeviceInput = z.object({ endpoint: pushEndpointInput }).strict();
const inboxQuery = `SELECT n.id::text,n.kind,n.source_id LIKE 'friend-map:%' AS "nearbyFriend",n.title,
    n.action_path AS "actionPath",n.scheduled_at AS "scheduledAt",b.status AS "bookingStatus",
    CASE WHEN n.kind='booking_request' THEN n.source_id END AS "bookingId",
    to_char(n.local_day, 'YYYY-MM-DD') AS "localDay",to_char(n.local_time, 'HH24:MI') AS "localTime",n.read_at IS NOT NULL AS read
  FROM user_notifications n
  LEFT JOIN profile_session_bookings b ON n.kind='booking_request' AND b.id::text=n.source_id
  WHERE n.user_id=$1 AND (n.kind <> 'medication' OR $2::boolean)
  ORDER BY n.scheduled_at DESC,n.id DESC LIMIT 30`;
const preferencesQuery = `SELECT time_zone AS "timeZone", medication_reminders AS "medicationReminders",
    daily_overview AS "dailyOverview",booking_email AS "bookingEmail",booking_push AS "bookingPush"
    FROM notification_preferences WHERE user_id=$1`;
const reminderFields = `r.id, r.title, to_char(r.start_on, 'YYYY-MM-DD') AS "startOn",
  to_char(r.remind_at, 'HH24:MI') AS "remindAt", r.repeats_daily AS "repeatsDaily"`;
const activeReminders = `FROM notification_reminders r JOIN notification_preferences p ON p.user_id=r.user_id
  WHERE r.user_id=$1 AND (r.repeats_daily OR r.start_on+r.remind_at >=
    date_trunc('minute', statement_timestamp() AT TIME ZONE p.time_zone)-interval '4 minutes')`;
const flushQuery = `${dueNotifications}
  INSERT INTO user_notifications (user_id, kind, source_id, title, scheduled_at, local_day, local_time)
  SELECT user_id, kind, source_id, title, scheduled_at, local_day, local_time
  FROM due ORDER BY scheduled_at, user_id, kind, source_id
  ON CONFLICT (user_id, kind, source_id, local_day, local_time) DO NOTHING`;

function digest(value) {
  return createHash('sha256').update(value).digest();
}

export function registerNotificationRoutes(app, {
  requireAuth, asyncRoute, query, transaction, secret,
  deliveryConfig = notificationDeliveryConfig(), sendPushNotification,
}) {
  const base = '/api/notifications';
  const secretHash = secret?.length >= 32 ? digest(`Bearer ${secret}`) : null;
  let lastDelivery = 0;
  function privateInbox(_req, res, next) {
    res.set('Cache-Control', 'no-store');
    if (!secretHash) return res.status(503).json({ error: 'Оповещения ещё не подключены' });
    return next();
  }

  app.get(base, requireAuth, privateInbox, asyncRoute(async (req, res) => {
    const [inbox, preferences, reminders] = await Promise.all([
      query(inboxQuery, [req.user.id, req.user.can_discover_spheres === true]), query(preferencesQuery, [req.user.id]),
      query(`SELECT ${reminderFields} ${activeReminders} ORDER BY r.start_on, r.remind_at, r.id LIMIT 50`, [req.user.id]),
    ]);
    const settings = preferences.rows[0] ?? null;
    const latestOverview = inbox.rows.find(notice => notice.kind === 'daily_overview');
    if (req.query.preview === '1' && latestOverview && settings) {
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: settings.timeZone, dateStyle: 'short' }).format(new Date());
      if (latestOverview.localDay === today) {
        const { entries, truncated } = await readAssistantPlanningContext(query, req.user.id, today);
        const titles = entries.filter(entry => entry.dueOn === today).slice(0, 3).map(entry => entry.title);
        latestOverview.preview = titles.length ? titles.join(' · ') : truncated ? '' : 'В плане нет задач и встреч на сегодня.';
      }
    }
    res.json({
      notifications: inbox.rows, preferences: settings, reminders: reminders.rows,
      delivery: {
        emailEnabled: deliveryConfig.emailEnabled,
        pushEnabled: deliveryConfig.pushEnabled,
        pushPublicKey: deliveryConfig.pushPublicKey,
      },
    });
  }));

  app.patch(`${base}/preferences`, requireAuth, privateInbox, asyncRoute(async (req, res) => {
    const parsed = preferencesInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Проверьте настройки оповещений' });
    const { timeZone, medicationReminders, dailyOverview, bookingEmail, bookingPush } = parsed.data;
    if (medicationReminders && req.user.can_discover_spheres !== true) {
      return res.status(403).json({ error: 'Раздел «Здоровье» доступен только владельцу профиля' });
    }
    const { rows } = await query(`
      INSERT INTO notification_preferences (user_id,time_zone,medication_reminders,daily_overview,booking_email,booking_push)
      SELECT $1,name,$3,$4,COALESCE($5,true),COALESCE($6,false) FROM pg_timezone_names WHERE name=$2
      ON CONFLICT (user_id) DO UPDATE SET time_zone=EXCLUDED.time_zone,
        medication_reminders=EXCLUDED.medication_reminders, daily_overview=EXCLUDED.daily_overview,
        booking_email=COALESCE($5,notification_preferences.booking_email),
        booking_push=COALESCE($6,notification_preferences.booking_push),
        updated_at=CASE WHEN (notification_preferences.time_zone, notification_preferences.medication_reminders,
          notification_preferences.daily_overview,notification_preferences.booking_email,notification_preferences.booking_push)
          IS DISTINCT FROM (EXCLUDED.time_zone,EXCLUDED.medication_reminders,EXCLUDED.daily_overview,
          COALESCE($5,notification_preferences.booking_email),COALESCE($6,notification_preferences.booking_push))
          THEN statement_timestamp() ELSE notification_preferences.updated_at END
      RETURNING time_zone AS "timeZone",medication_reminders AS "medicationReminders",daily_overview AS "dailyOverview",
        booking_email AS "bookingEmail",booking_push AS "bookingPush"`,
    [req.user.id, timeZone, medicationReminders, dailyOverview, bookingEmail ?? null, bookingPush ?? null]);
    if (!rows.length) return res.status(400).json({ error: 'Этот часовой пояс не поддерживается' });
    res.json({ preferences: rows[0] });
  }));

  app.post(`${base}/push-subscriptions`, requireAuth, privateInbox, asyncRoute(async (req, res) => {
    if (!deliveryConfig.pushEnabled) return res.status(503).json({ error: 'Push-оповещения ещё не подключены' });
    const parsed = pushSubscriptionInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Браузер передал некорректную push-подписку' });
    const { endpoint, keys } = parsed.data;
    await transaction(async client => {
      await client.query('DELETE FROM notification_push_subscriptions WHERE endpoint=$1 AND user_id<>$2', [endpoint, req.user.id]);
      await client.query(
        `INSERT INTO notification_push_subscriptions (endpoint,user_id,p256dh,auth)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,
           updated_at=statement_timestamp()`,
        [endpoint, req.user.id, keys.p256dh, keys.auth],
      );
    });
    res.status(201).json({ ok: true });
  }));

  app.post(`${base}/push-subscriptions/status`, requireAuth, privateInbox, asyncRoute(async (req, res) => {
    const parsed = pushDeviceInput.safeParse(req.body);
    if (!parsed.success || !deliveryConfig.pushEnabled) return res.json({ subscribed: false });
    const { rowCount } = await query('SELECT 1 FROM notification_push_subscriptions WHERE endpoint=$1 AND user_id=$2',
      [parsed.data.endpoint, req.user.id]);
    return res.json({ subscribed: Boolean(rowCount) });
  }));

  app.delete(`${base}/push-subscriptions`, requireAuth, privateInbox, asyncRoute(async (req, res) => {
    const parsed = pushDeviceInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Push-подписка недоступна' });
    await query('DELETE FROM notification_push_subscriptions WHERE endpoint=$1 AND user_id=$2', [parsed.data.endpoint, req.user.id]);
    res.status(204).end();
  }));

  app.post(`${base}/read`, requireAuth, privateInbox, asyncRoute(async (req, res) => {
    const parsed = readInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Проверьте список оповещений' });
    await query(`UPDATE user_notifications SET read_at=statement_timestamp()
      WHERE user_id=$1 AND id=ANY($2::bigint[]) AND read_at IS NULL`, [req.user.id, parsed.data.ids]);
    res.status(204).end();
  }));

  app.post(`${base}/reminders`, requireAuth, privateInbox, asyncRoute(async (req, res) => {
    const parsed = newReminderInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Проверьте тему, дату и время напоминания' });
    const { id, title, startOn, remindAt, repeatsDaily, timeZone } = parsed.data;
    const outcome = await transaction(async client => {
      const zone = await client.query(`INSERT INTO notification_preferences (user_id, time_zone, medication_reminders, daily_overview)
        SELECT $1, name, false, false FROM pg_timezone_names WHERE name=$2
        ON CONFLICT (user_id) DO UPDATE SET time_zone=notification_preferences.time_zone RETURNING time_zone`, [req.user.id, timeZone]);
      if (!zone.rows.length) return { error: 'Этот часовой пояс не поддерживается' };
      const existing = await client.query(`SELECT ${reminderFields} FROM notification_reminders r
        WHERE r.id=$1 AND r.user_id=$2`, [id, req.user.id]);
      const prior = existing.rows[0];
      if (prior) {
        if (prior.title === title && prior.startOn === startOn && prior.remindAt === remindAt && prior.repeatsDaily === repeatsDaily) {
          return { reminder: prior };
        }
        return { error: 'Напоминание уже сохранено. Откройте его для редактирования' };
      }
      const { rows: [count] } = await client.query(`SELECT count(*)::int AS used ${activeReminders}`, [req.user.id]);
      if (count.used >= 50) return { error: 'Можно создать до 50 активных напоминаний' };
      const { rows } = await client.query(`INSERT INTO notification_reminders AS r (id,user_id,title,start_on,remind_at,repeats_daily)
        SELECT $1::uuid,$2,$3,$4::date,$5::time,$6::boolean
        WHERE $6::boolean OR $4::date+$5::time > statement_timestamp() AT TIME ZONE $7
        RETURNING ${reminderFields}`, [id, req.user.id, title, startOn, remindAt, repeatsDaily, zone.rows[0].time_zone]);
      return rows.length ? { reminder: rows[0] } : { error: 'Выберите время в будущем для разового напоминания' };
    });
    res.status(outcome.error ? 400 : 201).json(outcome);
  }));

  app.patch(`${base}/reminders/:id`, requireAuth, privateInbox, asyncRoute(async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    const parsed = reminderInput.safeParse(req.body);
    if (!id.success || !parsed.success) return res.status(400).json({ error: 'Проверьте тему, дату и время напоминания' });
    const { title, startOn, remindAt, repeatsDaily } = parsed.data;
    const { rows } = await query(`UPDATE notification_reminders r SET title=$3,start_on=$4,remind_at=$5,repeats_daily=$6,
      updated_at=CASE WHEN (r.title,r.start_on,r.remind_at,r.repeats_daily) IS DISTINCT FROM
        ($3::text,$4::date,$5::time,$6::boolean) THEN statement_timestamp() ELSE r.updated_at END FROM notification_preferences p
      WHERE r.id=$1 AND r.user_id=$2 AND p.user_id=r.user_id
        AND ($6::boolean OR $4::date+$5::time > statement_timestamp() AT TIME ZONE p.time_zone)
      RETURNING ${reminderFields}`, [id.data, req.user.id, title, startOn, remindAt, repeatsDaily]);
    if (!rows.length) return res.status(400).json({ error: 'Напоминание недоступно. Для разового напоминания выберите время в будущем' });
    res.json({ reminder: rows[0] });
  }));

  app.delete(`${base}/reminders/:id`, requireAuth, privateInbox, asyncRoute(async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: 'Напоминание недоступно' });
    await query('DELETE FROM notification_reminders WHERE id=$1 AND user_id=$2', [id.data, req.user.id]);
    res.status(204).end();
  }));

  app.post('/api/internal/eve/notifications', asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!secretHash || !timingSafeEqual(secretHash, digest(req.get('authorization') || ''))) {
      return res.sendStatus(404);
    }
    await query(flushQuery);
    await deliverNotificationOutbox({
      transaction, query, config: deliveryConfig,
      ...(sendPushNotification ? { sendNotification: sendPushNotification } : {}),
    });
    lastDelivery = Date.now();
    res.status(204).end();
  }));

  return () => Boolean(lastDelivery && Date.now() - lastDelivery <= 180_000);
}
