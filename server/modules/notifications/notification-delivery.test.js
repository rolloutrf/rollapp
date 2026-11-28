import assert from "node:assert/strict";
import test from "node:test";
import webPush from "web-push";
import { browserPushEndpoint, deliverNotificationOutbox, notificationDeliveryConfig, queueBookingNotification } from "./notification-delivery.js";

test("browser push uses HTTPS endpoints from the supported delivery services", () => {
  for (const endpoint of [
    "https://fcm.googleapis.com/fcm/send/test", "https://updates.push.services.mozilla.com/wpush/v2/test",
    "https://web.push.apple.com/test", "https://wns2-par02p.notify.windows.com/test",
  ]) assert.equal(browserPushEndpoint(endpoint), endpoint);
  for (const endpoint of [
    "https://push.example/subscription", "http://fcm.googleapis.com/fcm/send/test",
    "https://web.push.apple.com:9443/test", "https://fcm.googleapis.com/token",
  ]) assert.equal(browserPushEndpoint(endpoint), null);
});

test("booking delivery capabilities fail closed and expose only the public VAPID key", () => {
  assert.deepEqual(notificationDeliveryConfig({}), {
    origin: "", emailEnabled: false, pushEnabled: false, pushPublicKey: "", pushPrivateKey: "", pushSubject: "",
  });
  const keys = webPush.generateVAPIDKeys();
  const config = notificationDeliveryConfig({
    PUBLIC_APP_URL: "https://rollapp.example",
    EMAIL_PROVIDER: "yandex", EMAIL_FROM: "noreply@rollapp.example",
    ROLLAPP_WEB_PUSH_ENABLED: "true",
    WEB_PUSH_VAPID_PUBLIC_KEY: keys.publicKey, WEB_PUSH_VAPID_PRIVATE_KEY: keys.privateKey,
    WEB_PUSH_VAPID_SUBJECT: "mailto:notifications@rollapp.example",
  });
  assert.equal(config.emailEnabled, true);
  assert.equal(config.pushEnabled, true);
  assert.equal(config.pushPublicKey, keys.publicKey);
  assert.equal(config.pushPrivateKey, keys.privateKey);
  assert.throws(() => notificationDeliveryConfig({
    PUBLIC_APP_URL: "https://rollapp.example", ROLLAPP_WEB_PUSH_ENABLED: "true",
    WEB_PUSH_VAPID_PUBLIC_KEY: "invalid", WEB_PUSH_VAPID_PRIVATE_KEY: "invalid",
    WEB_PUSH_VAPID_SUBJECT: "mailto:notifications@rollapp.example",
  }), /Invalid web push VAPID configuration/);
});

test("a booking request creates the private inbox item and queues opted-in email and push once", async () => {
  const calls = [];
  const client = { query: async (sql, args) => {
    calls.push({ sql, args });
    if (sql.includes("FROM users u LEFT JOIN notification_preferences")) return { rows: [{
      email: "host@example.com", time_zone: "Europe/Moscow", booking_email: true, booking_push: true,
    }] };
    if (sql.includes("INSERT INTO user_notifications")) return { rows: [{ id: "42" }] };
    if (sql.includes("FROM notification_push_subscriptions")) return { rows: [{ ready: 1 }], rowCount: 1 };
    return { rows: [], rowCount: 2 };
  } };
  await queueBookingNotification(client, {
    kind: "booking_request", recipientId: "host", bookingId: "booking-id", slotTitle: "Консультация",
    actorName: "Анна", startsAt: "2030-01-02T08:00:00.000Z", actionPath: "/app/planning?tab=calendar&space=booking",
  }, { origin: "https://rollapp.example", emailEnabled: true, pushEnabled: true });
  const inbox = calls.find(call => call.sql.includes("INSERT INTO user_notifications"));
  assert.deepEqual(inbox.args.slice(0, 5), ["host", "booking_request", "booking-id", "Новый запрос на встречу: Консультация", "/app/planning?tab=calendar&space=booking"]);
  const outbox = calls.find(call => call.sql.includes("INSERT INTO notification_delivery_outbox"));
  assert.deepEqual(outbox.args[5], ["email", "push"]);
  const payload = JSON.parse(outbox.args[4]);
  assert.equal(payload.kind, "booking_request");
  assert.match(payload.text, /Анна/);
  assert.doesNotMatch(JSON.stringify(payload), /host@example\.com/);
});

test("the delivery worker leases and sends a queued push before marking it sent", async () => {
  const keys = webPush.generateVAPIDKeys();
  const updates = [];
  const sent = [];
  const delivery = {
    id: "0df74d94-7994-4d32-9e08-87ae80ab673f", userId: "host", channel: "push", attempts: 1,
    lease: "3b5f52b6-57c4-4c25-a8fd-bd01a94bccdc",
    payload: {
      kind: "booking_request", actionPath: "/app/planning?tab=calendar&space=booking&booking=request",
      pushTitle: "Новый запрос на встречу", pushBody: "Анна · Консультация",
    },
  };
  const transaction = callback => callback({ query: async (sql) => {
    assert.match(sql, /FOR UPDATE SKIP LOCKED/);
    return { rows: [delivery] };
  } });
  const query = async (sql, args) => {
    if (sql.includes("FROM notification_push_subscriptions")) return { rows: [
      { endpoint: "https://push.example/subscription", p256dh: "A".repeat(64), auth: "B".repeat(16) },
      { endpoint: "https://fcm.googleapis.com/fcm/send/test", p256dh: "A".repeat(64), auth: "B".repeat(16) },
    ] };
    updates.push({ sql, args });
    return { rows: [] };
  };
  const count = await deliverNotificationOutbox({
    transaction, query,
    config: {
      origin: "https://rollapp.example", pushEnabled: true,
      pushPublicKey: keys.publicKey, pushPrivateKey: keys.privateKey,
      pushSubject: "mailto:notifications@rollapp.example",
    },
    sendNotification: async (subscription, message) => sent.push({ subscription, message: JSON.parse(message) }),
  });
  assert.equal(count, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subscription.endpoint, "https://fcm.googleapis.com/fcm/send/test");
  assert.equal(sent[0].message.url, "https://rollapp.example/app/planning?tab=calendar&space=booking&booking=request");
  assert.match(updates[0].sql, /status='sent'/);
  assert.equal(updates[0].args[0], delivery.id);
  assert.match(updates[0].args[1], /^[0-9a-f-]{36}$/);
});
