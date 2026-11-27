import { randomUUID } from "node:crypto";
import webPush from "web-push";
import { getEmailConfig, sendNotificationEmail } from "../auth/email.js";

const bookingKinds = new Set(["booking_request", "booking_confirmed", "booking_declined", "booking_cancelled"]);

function appOrigin(environment) {
  try {
    const origin = new URL(String(environment.PUBLIC_APP_URL || ""));
    return new Set(["http:", "https:"]).has(origin.protocol) ? origin.origin : "";
  } catch {
    return "";
  }
}

export function notificationDeliveryConfig(environment = process.env) {
  const origin = appOrigin(environment);
  const publicKey = String(environment.WEB_PUSH_VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(environment.WEB_PUSH_VAPID_PRIVATE_KEY || "").trim();
  const subject = String(environment.WEB_PUSH_VAPID_SUBJECT || (origin ? `mailto:notifications@${new URL(origin).hostname}` : "")).trim();
  const pushRequested = environment.ROLLAPP_WEB_PUSH_ENABLED === "true";
  const pushEnabled = Boolean(pushRequested && origin && publicKey && privateKey && /^(?:mailto:|https:)/.test(subject));
  if (pushRequested && !pushEnabled) throw new Error("Invalid web push VAPID configuration");
  if (pushEnabled) {
    try {
      webPush.setVapidDetails(subject, publicKey, privateKey);
    } catch (cause) {
      throw new Error("Invalid web push VAPID configuration", { cause });
    }
  }
  return {
    origin,
    emailEnabled: Boolean(origin && getEmailConfig(environment).enabled),
    pushEnabled,
    pushPublicKey: pushEnabled ? publicKey : "",
    pushPrivateKey: pushEnabled ? privateKey : "",
    pushSubject: pushEnabled ? subject : "",
  };
}

function eventCopy(kind, payload) {
  const time = new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "long", timeStyle: "short", timeZone: payload.timeZone || "Europe/Moscow",
  }).format(new Date(payload.startsAt));
  if (kind === "booking_request") return {
    subject: `Новый запрос на встречу: ${payload.slotTitle}`,
    text: `${payload.actorName} хочет записаться на «${payload.slotTitle}» — ${time}. Подтвердите или отклоните запрос в Rollapp.`,
    pushTitle: "Новый запрос на встречу",
    pushBody: `${payload.actorName} · ${payload.slotTitle} · ${time}`,
  };
  if (kind === "booking_confirmed") return {
    subject: `Запись подтверждена: ${payload.slotTitle}`,
    text: `${payload.actorName} подтвердил запись на «${payload.slotTitle}» — ${time}.`,
    pushTitle: "Запись подтверждена",
    pushBody: `${payload.slotTitle} · ${time}`,
  };
  if (kind === "booking_declined") return {
    subject: `Запрос на встречу отклонён: ${payload.slotTitle}`,
    text: `${payload.actorName} отклонил запрос на «${payload.slotTitle}» — ${time}. Слот снова доступен для записи.`,
    pushTitle: "Запрос на встречу отклонён",
    pushBody: `${payload.slotTitle} · ${time}`,
  };
  return {
    subject: `Запись отменена: ${payload.slotTitle}`,
    text: `${payload.actorName} отменил запись на «${payload.slotTitle}» — ${time}.`,
    pushTitle: "Запись отменена",
    pushBody: `${payload.slotTitle} · ${time}`,
  };
}

export async function queueBookingNotification(client, event, config = notificationDeliveryConfig()) {
  if (!bookingKinds.has(event.kind)) throw new Error("Unsupported booking notification kind");
  const actionPath = String(event.actionPath || "");
  const payload = {
    slotTitle: String(event.slotTitle || "Встреча"),
    actorName: String(event.actorName || "Участник Rollapp"),
    startsAt: new Date(event.startsAt).toISOString(),
    timeZone: String(event.timeZone || "Europe/Moscow"),
    actionPath,
  };
  const { rows: [recipient] } = await client.query(
    `SELECT u.email,COALESCE(p.time_zone,'Europe/Moscow') AS time_zone,
            COALESCE(p.booking_email,true) AS booking_email,
            COALESCE(p.booking_push,false) AS booking_push
     FROM users u LEFT JOIN notification_preferences p ON p.user_id=u.id WHERE u.id=$1`,
    [event.recipientId],
  );
  if (!recipient) return;
  payload.timeZone = recipient.time_zone;
  const copy = eventCopy(event.kind, payload);
  const { rows: [notice] } = await client.query(
    `INSERT INTO user_notifications (user_id,kind,source_id,title,action_path,scheduled_at,local_day,local_time)
     VALUES ($1,$2,$3,$4,$5,statement_timestamp(),
       (statement_timestamp() AT TIME ZONE $6)::date,(statement_timestamp() AT TIME ZONE $6)::time)
     ON CONFLICT (user_id,kind,source_id,local_day,local_time) DO UPDATE SET title=EXCLUDED.title,action_path=EXCLUDED.action_path
     RETURNING id::text`,
    [event.recipientId, event.kind, event.bookingId, copy.subject, actionPath, payload.timeZone],
  );
  const channels = [];
  if (config.emailEnabled && recipient.booking_email && recipient.email) channels.push("email");
  if (config.pushEnabled && recipient.booking_push) {
    const { rowCount } = await client.query("SELECT 1 FROM notification_push_subscriptions WHERE user_id=$1 LIMIT 1", [event.recipientId]);
    if (rowCount) channels.push("push");
  }
  if (!channels.length) return notice;
  await client.query(
    `INSERT INTO notification_delivery_outbox
       (id,user_id,notification_id,kind,source_id,channel,payload_json)
     SELECT gen_random_uuid(),$1,$2::bigint,$3,$4,channel,$5::jsonb
     FROM unnest($6::text[]) AS channel
     ON CONFLICT (user_id,kind,source_id,channel) DO NOTHING`,
    [event.recipientId, notice.id, event.kind, event.bookingId, JSON.stringify({ ...payload, ...copy, kind: event.kind }), channels],
  );
  return notice;
}

async function claimDeliveries(transaction, limit = 20) {
  const lease = randomUUID();
  return transaction(async client => {
    const { rows } = await client.query(
      `WITH ready AS (
         SELECT id FROM notification_delivery_outbox
         WHERE (status='pending' AND available_at<=statement_timestamp())
            OR (status='processing' AND updated_at<statement_timestamp()-interval '10 minutes')
         ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT $1
       )
       UPDATE notification_delivery_outbox d
       SET status='processing',lease_token=$2,attempts=d.attempts+1,updated_at=statement_timestamp()
       FROM ready WHERE d.id=ready.id
       RETURNING d.id,d.user_id AS "userId",d.channel,d.payload_json AS payload,d.attempts`,
      [limit, lease],
    );
    return rows.map(row => ({ ...row, lease }));
  });
}

async function sendPushDelivery(query, delivery, config, sendNotification) {
  const { rows: subscriptions } = await query(
    `SELECT endpoint,p256dh,auth FROM notification_push_subscriptions WHERE user_id=$1 ORDER BY created_at`,
    [delivery.userId],
  );
  if (!subscriptions.length) return null;
  webPush.setVapidDetails(config.pushSubject, config.pushPublicKey, config.pushPrivateKey);
  const target = new URL(delivery.payload.actionPath || "/", config.origin).toString();
  const message = JSON.stringify({
    title: delivery.payload.pushTitle,
    body: delivery.payload.pushBody,
    url: target,
    tag: `rollapp:${delivery.id}`,
    actions: [{ action: "open", title: delivery.payload.kind === "booking_request" ? "Ответить" : "Открыть" }],
  });
  let delivered = 0;
  for (const subscription of subscriptions) {
    try {
      await sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, message);
      delivered += 1;
    } catch (error) {
      if ([404, 410].includes(error?.statusCode)) {
        await query("DELETE FROM notification_push_subscriptions WHERE user_id=$1 AND endpoint=$2", [delivery.userId, subscription.endpoint]);
      } else {
        throw error;
      }
    }
  }
  return delivered ? `web-push-${delivered}` : null;
}

export async function deliverNotificationOutbox({ transaction, query, config = notificationDeliveryConfig(), sendNotification = webPush.sendNotification }) {
  const deliveries = await claimDeliveries(transaction);
  for (const delivery of deliveries) {
    try {
      let providerMessageId = null;
      if (delivery.channel === "email") {
        const { rows: [user] } = await query("SELECT email FROM users WHERE id=$1", [delivery.userId]);
        if (!user?.email || !config.origin) throw new Error("Notification email recipient is unavailable");
        const actionUrl = new URL(delivery.payload.actionPath || "/", config.origin).toString();
        const result = await sendNotificationEmail({
          to: user.email, actionUrl, requestId: delivery.id,
          subject: delivery.payload.subject, text: delivery.payload.text,
        });
        providerMessageId = result?.providerMessageId || null;
      } else if (delivery.channel === "push" && config.pushEnabled) {
        providerMessageId = await sendPushDelivery(query, delivery, config, sendNotification);
      } else {
        throw new Error("Notification delivery channel is unavailable");
      }
      await query(
        `UPDATE notification_delivery_outbox SET status='sent',provider_message_id=$3,sent_at=statement_timestamp(),
           lease_token=NULL,last_error=NULL,updated_at=statement_timestamp() WHERE id=$1 AND lease_token=$2`,
        [delivery.id, delivery.lease, providerMessageId],
      );
    } catch (error) {
      const failed = delivery.attempts >= 5;
      const message = String(error?.message || "Notification delivery failed").slice(0, 500);
      await query(
        `UPDATE notification_delivery_outbox SET status=$3,lease_token=NULL,last_error=$4,
           available_at=statement_timestamp()+make_interval(mins=>$5),updated_at=statement_timestamp()
         WHERE id=$1 AND lease_token=$2`,
        [delivery.id, delivery.lease, failed ? "failed" : "pending", message, Math.min(60, 2 ** delivery.attempts)],
      );
    }
  }
  return deliveries.length;
}
