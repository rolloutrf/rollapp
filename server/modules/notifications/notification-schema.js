export const notificationSchema = `
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  time_zone TEXT NOT NULL,
  medication_reminders BOOLEAN NOT NULL,
  daily_overview BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE IF NOT EXISTS notification_reminders (
  id UUID NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  start_on DATE NOT NULL,
  remind_at TIME NOT NULL,
  repeats_daily BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS notification_reminders_owner ON notification_reminders (user_id, remind_at, start_on);
CREATE TABLE IF NOT EXISTS user_notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('medication', 'daily_overview', 'custom')),
  source_id TEXT NOT NULL DEFAULT '',
  title TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  local_day DATE NOT NULL,
  local_time TIME NOT NULL,
  read_at TIMESTAMPTZ,
  UNIQUE (user_id, kind, source_id, local_day, local_time)
);
CREATE INDEX IF NOT EXISTS user_notifications_inbox
  ON user_notifications (user_id, scheduled_at DESC, id DESC);
`;

// Use the same SELECT for read-only production preflight and reminder delivery.
export const dueNotifications = `
WITH clock AS (
  SELECT generate_series(
    date_trunc('minute', statement_timestamp()) - interval '4 minutes',
    date_trunc('minute', statement_timestamp()), interval '1 minute'
  ) AS scheduled_at
), slots AS (
  SELECT p.user_id, p.medication_reminders AND EXISTS (
    SELECT 1 FROM default_follow_targets f WHERE f.user_id = p.user_id
  ) AS medication_reminders,
    p.daily_overview, p.updated_at, c.scheduled_at,
    c.scheduled_at AT TIME ZONE p.time_zone AS local_at
  FROM notification_preferences p CROSS JOIN clock c
  WHERE p.medication_reminders OR p.daily_overview OR EXISTS (
    SELECT 1 FROM notification_reminders r WHERE r.user_id = p.user_id
      AND (r.repeats_daily OR r.start_on >= (c.scheduled_at AT TIME ZONE p.time_zone)::date)
  )
), due AS (
  SELECT s.user_id, 'medication' AS kind, '' AS source_id, NULL::text AS title, s.scheduled_at,
    s.local_at::date AS local_day, s.local_at::time AS local_time
  FROM slots s
  WHERE s.medication_reminders AND s.scheduled_at >= s.updated_at AND EXISTS (
    SELECT 1 FROM health_medications m
    WHERE m.user_id = s.user_id AND m.status = 'active'
      AND m.updated_at <= s.scheduled_at
      AND (m.start_on IS NULL OR m.start_on <= s.local_at::date)
      AND (m.end_on IS NULL OR m.end_on >= s.local_at::date)
      AND (m.frequency IN ('once_daily', 'twice_daily', 'three_times_daily')
        OR (m.frequency = 'weekly' AND m.start_on IS NOT NULL
          AND (s.local_at::date - m.start_on) % 7 = 0))
      AND CASE WHEN m.schedule_times_json IS JSON ARRAY
        THEN m.schedule_times_json::jsonb ? to_char(s.local_at, 'HH24:MI') ELSE false END
  )
  UNION ALL
  SELECT user_id, 'daily_overview', '', NULL, scheduled_at, local_at::date, local_at::time
  FROM slots WHERE daily_overview AND scheduled_at >= updated_at AND local_at::time = time '08:00'
  UNION ALL
  SELECT s.user_id, 'custom', r.id::text, r.title, s.scheduled_at, s.local_at::date, s.local_at::time
  FROM slots s JOIN notification_reminders r ON r.user_id=s.user_id
    AND r.remind_at=s.local_at::time AND r.updated_at<=s.scheduled_at
    AND (r.start_on=s.local_at::date OR (r.repeats_daily AND r.start_on<s.local_at::date))
)
`;

export async function verifyNotificationSchema(client) {
  await client.query(`${dueNotifications} SELECT 1 FROM due LIMIT 0`);
  await client.query(`SELECT id, user_id, kind, source_id, title, scheduled_at, local_day, local_time, read_at
    FROM user_notifications LIMIT 0`);
}
