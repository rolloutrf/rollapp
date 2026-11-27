import { notificationSchema, dueNotifications, verifyNotificationSchema } from '../server/modules/notifications/notification-schema.js';
import { productionRollsDatabase } from './rolls-database.mjs';

const db = await productionRollsDatabase();
try {
  console.log(JSON.stringify({ target: db.target, migration: 'notifications-v1' }));
  if (process.argv.includes('--apply')) {
    if (!process.argv.includes(`--database=${db.target.database}`)) {
      throw new Error('Передайте точное имя проверенной БД через --database=…');
    }
    await db.transaction(async client => {
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='30s'");
      await client.query(notificationSchema);
      await verifyNotificationSchema(client);
    });
  } else {
    await db.transaction(async client => {
      await client.query('SET TRANSACTION READ ONLY');
      const { rows: [schema] } = await client.query(`SELECT
        to_regclass('notification_preferences')::text AS preferences,
        to_regclass('notification_reminders')::text AS reminders,
        to_regclass('user_notifications')::text AS notifications,
        to_regclass('notification_push_subscriptions')::text AS push_subscriptions,
        to_regclass('notification_delivery_outbox')::text AS delivery_outbox`);
      await client.query(`SELECT user_id, status, updated_at, start_on, end_on, frequency, schedule_times_json
        FROM health_medications LIMIT 0`);
      if (schema.preferences && schema.reminders && schema.notifications && schema.push_subscriptions && schema.delivery_outbox) {
        await verifyNotificationSchema(client);
      } else {
        const existingColumns = `notification_preferences AS (
          SELECT id AS user_id, 'UTC'::text AS time_zone, false AS medication_reminders,
            false AS daily_overview, statement_timestamp() AS updated_at FROM users LIMIT 0
        ), notification_reminders AS (
          SELECT gen_random_uuid() AS id, id AS user_id, ''::text AS title, current_date AS start_on,
            localtime AS remind_at, false AS repeats_daily, statement_timestamp() AS updated_at FROM users LIMIT 0
        ),`;
        await client.query(`${dueNotifications.replace('WITH clock', `WITH ${existingColumns} clock`)} SELECT 1 FROM due LIMIT 0`);
      }
      console.log(JSON.stringify({ schema, applied: false }));
    });
  }
} finally {
  await db.pool.end();
}
