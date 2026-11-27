import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { dueNotifications } from './notification-schema.js';
import { readAssistantPlanningContext } from '../assistant/messenger-assistant.js';

const timeZoneInput = z.string().min(1).max(100).refine(value => {
  try { new Intl.DateTimeFormat('ru-RU', { timeZone: value }); return true; }
  catch { return false; }
});
const preferencesInput = z.object({
  timeZone: timeZoneInput,
  medicationReminders: z.boolean(),
  dailyOverview: z.boolean(),
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
const inboxQuery = `SELECT id::text, kind, source_id LIKE 'friend-map:%' AS "nearbyFriend", title, scheduled_at AS "scheduledAt",
    to_char(local_day, 'YYYY-MM-DD') AS "localDay", to_char(local_time, 'HH24:MI') AS "localTime", read_at IS NOT NULL AS read
  FROM user_notifications WHERE user_id=$1 AND (kind <> 'medication' OR $2::boolean)
  ORDER BY scheduled_at DESC, id DESC LIMIT 30`;
const preferencesQuery = `SELECT time_zone AS "timeZone", medication_reminders AS "medicationReminders",
    daily_overview AS "dailyOverview" FROM notification_preferences WHERE user_id=$1`;
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

export function registerNotificationRoutes(app, { requireAuth, asyncRoute, query, transaction, secret }) {
  const base = '/api/notifications';
  const secretHash = secret?.length >= 32 ? digest(`Bearer ${secret}`) : null;
  let lastDelivery = 0;
  function privateInbox(_req, res, next) {
    res.set('Cache-Control', 'no-store');
    if (!secretHash) return res.status(503).json({ error: 'Оповещения ещё не подключены' });
    next();
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
    res.json({ notifications: inbox.rows, preferences: settings, reminders: reminders.rows });
  }));

  app.patch(`${base}/preferences`, requireAuth, privateInbox, asyncRoute(async (req, res) => {
    const parsed = preferencesInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Проверьте настройки оповещений' });
    const { timeZone, medicationReminders, dailyOverview } = parsed.data;
    if (medicationReminders && req.user.can_discover_spheres !== true) {
      return res.status(403).json({ error: 'Раздел «Здоровье» доступен только владельцу профиля' });
    }
    const { rows } = await query(`
      INSERT INTO notification_preferences (user_id, time_zone, medication_reminders, daily_overview)
      SELECT $1, name, $3, $4 FROM pg_timezone_names WHERE name=$2
      ON CONFLICT (user_id) DO UPDATE SET time_zone=EXCLUDED.time_zone,
        medication_reminders=EXCLUDED.medication_reminders, daily_overview=EXCLUDED.daily_overview,
        updated_at=CASE WHEN (notification_preferences.time_zone, notification_preferences.medication_reminders,
          notification_preferences.daily_overview) IS DISTINCT FROM (EXCLUDED.time_zone,
          EXCLUDED.medication_reminders, EXCLUDED.daily_overview)
          THEN statement_timestamp() ELSE notification_preferences.updated_at END
      RETURNING time_zone AS "timeZone", medication_reminders AS "medicationReminders", daily_overview AS "dailyOverview"`,
    [req.user.id, timeZone, medicationReminders, dailyOverview]);
    if (!rows.length) return res.status(400).json({ error: 'Этот часовой пояс не поддерживается' });
    res.json({ preferences: rows[0] });
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
    lastDelivery = Date.now();
    res.status(204).end();
  }));

  return () => Boolean(lastDelivery && Date.now() - lastDelivery <= 180_000);
}
